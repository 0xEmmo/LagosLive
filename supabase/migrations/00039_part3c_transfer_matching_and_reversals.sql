-- ===========================================================================
-- 00039 — PART 3c: safe transfer matching, and reversals.
--
-- Two defects in the 00038 transfer flow, both about what happens when the
-- provider's answer does not look the way the code assumed.
--
-- 1. MATCHING WAS ASSUMED RATHER THAN VERIFIED.
--
--    The webhook resolved a payout by parsing `payout-<id>-<timestamp>` out of
--    the transfer reference, and `paystackInitiateTransfer` passes a reference
--    it invented. That works only as long as Paystack echoes it back verbatim.
--    It has not been observed doing so on a real transfer, and if it did not,
--    the parser would simply not match — but a weaker future change, or a
--    fallback "match by amount" someone adds under time pressure, would mark
--    the WRONG payout paid. Money already sent, against someone else's record.
--
--    Matching is now an explicit hierarchy, and anything that cannot be matched
--    is recorded as needing reconciliation instead of being guessed at.
--
-- 2. A REVERSED TRANSFER LEFT THE PAYOUT FINANCIALLY REPRESENTED AS PAID.
--
--    transfer.reversed means the money came back. Keeping the payout in 'paid'
--    was chosen to avoid silently mutating a completed financial record, which
--    is a fair instinct, but it is the wrong trade: a host who was paid and
--    then debited would show a paid payout and an inflated balance. A separate
--    state keeps the original record intact AND tells the truth about it.
--
--    The host is NOT suspended. A reversal is usually a bad account number,
--    bank downtime or a provider fault, not fraud, and suspending someone for
--    it costs them their events while the actual problem is a typo. Instead
--    their PAYOUTS are frozen until finance looks at it, which stops the
--    financial exposure without stopping them selling tickets.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. payouts: a state for "we do not know what happened"
-- ---------------------------------------------------------------------------
-- The status check is replaced rather than dropped-and-readded by hand so the
-- full set of legal values stays visible in one place.
alter table public.payouts drop constraint if exists payouts_status_check;
alter table public.payouts
  add constraint payouts_status_check
  check (status in ('pending', 'processing', 'approved', 'paid', 'rejected', 'reconciliation_required'));

comment on column public.payouts.status is
  'reconciliation_required means a transfer was sent and then reversed or could not be matched. Requires human review.';

-- The reversal's own identifiers, kept alongside the originals.
--
-- paid_at and transfer_code are deliberately NOT cleared. The payout genuinely
-- was paid on that date with that code, and a reconciliation needs both facts:
-- what we recorded at the time, and what the provider says happened after.
alter table public.payouts add column if not exists reversed_at timestamptz;
alter table public.payouts add column if not exists reversal_code text;
alter table public.payouts add column if not exists reversal_reference text;
alter table public.payouts add column if not exists reversal_reason text;

create index if not exists payouts_reconciliation_idx
  on public.payouts (created_at desc)
  where status = 'reconciliation_required';

-- ---------------------------------------------------------------------------
-- 2. payout_transfer_events: an append-only ledger of transfer deliveries
-- ---------------------------------------------------------------------------
-- Every transfer webhook delivery lands here with how it was matched. This is
-- the permanent record the reversal investigation needs, and it is also the
-- triage list: rows with payout_id NULL are deliveries LagosLive could not tie
-- to a payout, which is a signal that something is wrong upstream.
create table if not exists public.payout_transfer_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paystack',
  event text not null,
  -- Populated only when a match was found.
  payout_id bigint references public.payouts(id) on delete set null,
  -- transfer_code | reference | unmatched. Null payout_id implies 'unmatched'.
  match_method text check (match_method in ('transfer_code', 'reference', 'unmatched')),
  transfer_code text,
  reference text,
  amount integer,
  reason text,
  outcome text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

-- Idempotency. Paystack delivers the same transfer event more than once in
-- normal operation, and a replayed transfer.sent must not be mistaken for a
-- second, separate event in the ledger.
create unique index if not exists payout_transfer_events_dedupe
  on public.payout_transfer_events (provider, event, coalesce(transfer_code, ''), coalesce(reference, ''));

create index if not exists payout_transfer_events_payout_idx on public.payout_transfer_events (payout_id);
create index if not exists payout_transfer_events_unmatched_idx
  on public.payout_transfer_events (received_at desc)
  where payout_id is null;

comment on table public.payout_transfer_events is
  'Append-only ledger of transfer webhook deliveries, recording how each was matched to a payout.';

alter table public.payout_transfer_events enable row level security;
revoke all on public.payout_transfer_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. host_payout_freezes: payouts stop, the account does not
-- ---------------------------------------------------------------------------
-- A freeze blocks request_payout() for one host and nothing else. Creating and
-- selling events is untouched, because a reversed bank transfer is a payment
-- problem, not evidence of wrongdoing.
create table if not exists public.host_payout_freezes (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  payout_id bigint references public.payouts(id) on delete set null,
  reason text not null,
  -- How many times this host has had a transfer reversed, so a repeated or
  -- suspicious pattern is visible without the database acting on it.
  reversal_count integer not null default 1,
  source text not null default 'transfer_reversed',
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references public.profiles(id) on delete set null,
  release_note text
);

-- At most one active freeze per host, so a second reversal extends the existing
-- one and increments its count instead of stacking rows nobody will reconcile.
create unique index if not exists host_payout_freezes_one_active
  on public.host_payout_freezes (host_id)
  where released_at is null;

create index if not exists host_payout_freezes_active_idx
  on public.host_payout_freezes (created_at desc)
  where released_at is null;

comment on table public.host_payout_freezes is
  'Blocks a host from requesting payouts pending finance review. Does not affect event creation or selling.';

alter table public.host_payout_freezes enable row level security;
revoke all on public.host_payout_freezes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. has_active_payout_freeze
-- ---------------------------------------------------------------------------
create or replace function public.has_active_payout_freeze(p_host_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.host_payout_freezes
     where host_id = p_host_id and released_at is null
  );
$$;

revoke execute on function public.has_active_payout_freeze(uuid) from public, anon;
grant execute on function public.has_active_payout_freeze(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. request_payout respects a freeze
-- ---------------------------------------------------------------------------
-- Same signature as 00038, so this replaces it. The freeze is checked after the
-- ordinary eligibility rules so the host gets the most specific message: an
-- unverified account should hear that, not "you are frozen".
create or replace function public.request_payout()
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles;
  v_bank public.host_bank_accounts;
  v_revenue integer;
  v_fee integer;
  v_amount integer;
  v_payout_id bigint;
  v_period_start date;
  v_period_end date;
  v_min constant integer := 1000;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if v_profile.role not in ('organizer', 'finance', 'support', 'admin', 'super_admin') then
    raise exception 'Only event hosts can request payouts' using errcode = '42501';
  end if;
  if coalesce(v_profile.host_verification_status, 'unverified') <> 'verified' then
    raise exception 'Verify your host account before requesting payouts' using errcode = '42501';
  end if;
  if v_profile.account_status <> 'active' then
    raise exception 'Your account must be active to request payouts' using errcode = '42501';
  end if;

  -- Frozen after a transfer was reversed, or while finance reviews something.
  -- The host keeps their events and their tickets; they just cannot take money
  -- out until a person has looked.
  if public.has_active_payout_freeze(v_uid) then
    raise exception
      'Your payouts are on hold while we review a recent transfer. Our team will be in touch.'
      using errcode = '42501';
  end if;

  select * into v_bank
    from public.host_bank_accounts
   where user_id = v_uid and removed_at is null
   order by created_at desc
   limit 1;
  if not found then
    raise exception 'Add a verified bank account before requesting payouts' using errcode = '23514';
  end if;

  select coalesce(sum(o.total), 0)::integer,
         min(o.created_at)::date,
         max(o.created_at)::date
    into v_revenue, v_period_start, v_period_end
    from public.orders o
    join public.parties p on p.id = o.party_id
   where p.created_by = v_uid
     and o.payment_status = 'confirmed'
     and coalesce(o.refund_status, 'none') <> 'refunded'
     and not exists (
       select 1 from public.payout_items pi
        where pi.order_id = o.id and not pi.released
     );

  if coalesce(v_revenue, 0) < v_min then
    raise exception 'Payout amount is below the minimum' using errcode = 'P0001';
  end if;

  v_fee := round(v_revenue * 0.15);
  v_amount := v_revenue - v_fee;

  insert into public.payouts (
    organizer_id, bank_account_id, period_start, period_end, revenue, platform_fee,
    amount, status, bank_last4
  )
  values (
    v_uid, v_bank.id, coalesce(v_period_start, current_date), coalesce(v_period_end, current_date),
    v_revenue, v_fee, v_amount, 'pending', v_bank.account_number_last4
  )
  returning id into v_payout_id;

  begin
    insert into public.payout_items (payout_id, order_id, amount)
    select v_payout_id, o.id, o.total
      from public.orders o
      join public.parties p on p.id = o.party_id
     where p.created_by = v_uid
       and o.payment_status = 'confirmed'
       and coalesce(o.refund_status, 'none') <> 'refunded'
       and not exists (
         select 1 from public.payout_items pi
          where pi.order_id = o.id and not pi.released
       );
  exception
    when unique_violation then
      raise exception
        'A payout for this revenue is already being processed'
        using errcode = '23505';
  end;

  perform public.write_audit_log(
    'payout_requested', 'payout', v_payout_id::text,
    jsonb_build_object(
      'revenue', v_revenue, 'platform_fee', v_fee, 'amount', v_amount,
      'bank_account_id', v_bank.id, 'bank_last4', v_bank.account_number_last4
    )
  );

  return v_payout_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. record_transfer_event — the append-only write, and how a match was made
-- ---------------------------------------------------------------------------
-- The match method is a required argument, not something the caller infers. It
-- is what makes an unmatched delivery visible as unmatched in the ledger rather
-- than as a delivery that happened to have no payout.
create or replace function public.record_transfer_event(
  p_event text,
  p_payout_id bigint,
  p_match_method text,
  p_transfer_code text,
  p_reference text,
  p_amount integer,
  p_reason text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_match_method not in ('transfer_code', 'reference', 'unmatched') then
    raise exception 'Unknown match method: %', p_match_method using errcode = '22023';
  end if;
  -- 'unmatched' with a payout, or a real method with no payout, would both
  -- corrupt the triage view built on this table.
  if (p_match_method = 'unmatched') <> (p_payout_id is null) then
    raise exception 'match_method and payout_id disagree' using errcode = '22023';
  end if;

  insert into public.payout_transfer_events (
    event, payout_id, match_method, transfer_code, reference, amount, reason, payload
  )
  values (
    p_event, p_payout_id, p_match_method, p_transfer_code, p_reference,
    p_amount, p_reason, p_payload
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    -- A redelivery. Returning the existing row's absence as a null id lets the
    -- caller treat it as a no-op instead of an error.
    select e.id into v_id
      from public.payout_transfer_events e
     where e.provider = 'paystack'
       and e.event = p_event
       and coalesce(e.transfer_code, '') = coalesce(p_transfer_code, '')
       and coalesce(e.reference, '') = coalesce(p_reference, '');
    return v_id;
end;
$$;

revoke execute on function public.record_transfer_event(text, bigint, text, text, text, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_transfer_event(text, bigint, text, text, text, integer, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 7. record_payout_reversal — the money came back
-- ---------------------------------------------------------------------------
-- Service role only, called by the webhook once a delivery has been matched to
-- a specific payout by transfer code or reference. Nothing here guesses: it
-- takes a payout id, and refuses to act on a payout that is not in a state where
-- a reversal is meaningful.
--
-- What it deliberately does NOT do: touch profiles.account_status. A reversed
-- transfer is far more often a mistyped account number, a bank outage or a
-- provider fault than fraud, and suspending a host over one costs them their
-- events. Freezing payouts contains the financial exposure; account action
-- stays a human decision, informed by the reversal_count on the freeze.
create or replace function public.record_payout_reversal(
  p_payout_id bigint,
  p_reversal_reference text,
  p_reversal_code text,
  p_reason text,
  p_amount integer
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_payout public.payouts;
  v_freeze_count integer;
begin
  select * into v_payout from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;

  -- Already handled. Paystack redelivers, and acting twice would double-count
  -- the reversal and re-freeze a host finance may already have released.
  if v_payout.status = 'reconciliation_required' then
    return 'already_reconciling';
  end if;

  -- A transfer cannot be reversed before it was sent. Reaching here means the
  -- match was wrong, which is itself worth recording but not worth mutating.
  if v_payout.status <> 'paid' then
    raise exception
      'A payout in state % cannot be reversed; only a paid transfer can'
      , v_payout.status using errcode = '22023';
  end if;

  update public.payouts
     set status = 'reconciliation_required',
         reversed_at = now(),
         reversal_code = left(coalesce(p_reversal_code, ''), 120),
         reversal_reference = left(coalesce(p_reversal_reference, ''), 120),
         reversal_reason = left(coalesce(p_reason, ''), 500),
         updated_at = now()
   where id = p_payout_id;

  -- paid_at and transfer_code are left exactly as they were: the payout was
  -- paid, on that date, with that transfer. A reconciliation needs both facts.

  -- Release the order claims. The money did not arrive, so the revenue is owed
  -- again and should be claimable once the freeze is lifted — otherwise the
  -- host would be unable to be paid twice for the same sales.
  update public.payout_items set released = true where payout_id = p_payout_id;

  -- Freeze payouts for this host without touching their account.
  --
  -- The count is the number of freezes this host has ever had, so a repeated
  -- reversal is visible to a human without the database acting on it. It is
  -- derived from the freeze history rather than from the event ledger, so it
  -- does not depend on the caller having recorded the webhook row first — a
  -- count that silently read 1 forever would remove the only signal that
  -- separates a mistyped account number from a pattern.
  select count(*)::integer into v_freeze_count
    from public.host_payout_freezes
   where host_id = v_payout.organizer_id;
  v_freeze_count := v_freeze_count + 1;

  insert into public.host_payout_freezes (host_id, payout_id, reason, reversal_count, source)
  values (
    v_payout.organizer_id, p_payout_id,
    coalesce(nullif(p_reason, ''), 'A payout transfer was reversed by the bank or provider.'),
    v_freeze_count, 'transfer_reversed'
  )
  on conflict (host_id) where released_at is null do update
    set reversal_count = excluded.reversal_count,
        reason = excluded.reason,
        payout_id = excluded.payout_id;

  perform public.write_audit_log(
    'payout_transfer_reversed', 'payout', p_payout_id::text,
    jsonb_build_object(
      'reversal_reference', p_reversal_reference,
      'reversal_code', p_reversal_code,
      'reason', p_reason,
      'amount', p_amount,
      'reversal_count_for_host', v_freeze_count,
      -- The recorded facts, kept so finance can see the whole picture without
      -- reconstructing it from the ledger.
      'was_paid_at', v_payout.paid_at,
      'was_transfer_code', v_payout.transfer_code
    )
  );

  return 'reconciliation_required';
end;
$$;

revoke execute on function public.record_payout_reversal(bigint, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.record_payout_reversal(bigint, text, text, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 8. release_payout_freeze — the human decision
-- ---------------------------------------------------------------------------
-- Finance resolves the payout (approve for a retry, reject to release the
-- revenue) and then lifts the freeze. Both are required: lifting the freeze
-- while the payout sits in reconciliation_required would leave the host able to
-- request the revenue again and the reversal unreviewed.
create or replace function public.release_payout_freeze(
  p_host_id uuid,
  p_note text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not (
    public.user_has_permission((select auth.uid()), 'payouts.approve')
    or public.user_has_permission((select auth.uid()), 'payouts.process')
  ) then
    raise exception 'You are not allowed to release payout freezes' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.payouts
     where organizer_id = p_host_id
       and status = 'reconciliation_required'
  ) then
    raise exception
      'Resolve the payout awaiting reconciliation before lifting this freeze'
      using errcode = '23514';
  end if;

  update public.host_payout_freezes
     set released_at = now(),
         released_by = (select auth.uid()),
         release_note = left(coalesce(p_note, ''), 500)
   where host_id = p_host_id and released_at is null;

  if not found then
    raise exception 'No active freeze for this host' using errcode = 'P0002';
  end if;

  perform public.write_audit_log(
    'payout_freeze_released', 'host', p_host_id::text,
    jsonb_build_object('note', p_note)
  );
end;
$$;

revoke execute on function public.release_payout_freeze(uuid, text) from public, anon;
grant execute on function public.release_payout_freeze(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. transition_payout: a way out of reconciliation_required
-- ---------------------------------------------------------------------------
-- Finance resolves it by choosing: 'approved' to retry against a corrected
-- account, or 'rejected' to write the revenue off. Neither is reachable by the
-- host, and neither happens automatically.
create or replace function public.transition_payout(
  p_payout_id bigint,
  p_to_status text
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_from text;
  v_allowed boolean := false;
begin
  if not (
    public.user_has_permission((select auth.uid()), 'payouts.approve')
    or public.user_has_permission((select auth.uid()), 'payouts.process')
  ) then
    raise exception 'You are not allowed to change payout status' using errcode = '42501';
  end if;

  select status into v_from from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;

  if v_from = p_to_status then
    return v_from;
  end if;

  v_allowed := case v_from
    when 'pending'    then p_to_status in ('processing', 'rejected')
    when 'processing' then p_to_status in ('approved', 'rejected')
    when 'approved'   then p_to_status = 'rejected'
    -- Leaving here is an explicit human decision on a reversed transfer. The
    -- freeze is lifted separately, by release_payout_freeze.
    when 'reconciliation_required' then p_to_status in ('approved', 'rejected')
    else false
  end;

  if not v_allowed then
    raise exception 'Cannot move a payout from % to %', v_from, p_to_status
      using errcode = '22023';
  end if;

  update public.payouts set status = p_to_status, updated_at = now() where id = p_payout_id;

  if p_to_status = 'rejected' then
    update public.payout_items set released = true where payout_id = p_payout_id;
  end if;

  -- Retrying after a reversal must not inherit any part of the dead transfer.
  -- The code has to go so a redelivery of the original reversal cannot match the
  -- retry, and the attempt timestamp has to go with it: left in place it would
  -- block the new claim as "in progress" for its whole window and then refuse it
  -- forever as an attempt of unknown outcome, so finance would have resolved the
  -- reversal into a payout that can never be sent.
  if p_to_status = 'approved' and v_from = 'reconciliation_required' then
    update public.payouts
       set transfer_code = null,
           transfer_reference = null,
           transfer_attempted_at = null
     where id = p_payout_id;
  end if;

  perform public.write_audit_log(
    'payout_status', 'payout', p_payout_id::text,
    jsonb_build_object('from', v_from, 'to', p_to_status)
  );

  return p_to_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. A payout can only be sent once
-- ---------------------------------------------------------------------------
-- The transfer route is the one place money leaves, and until now it read the
-- payout, checked for status = 'approved', and called Paystack. Two finance
-- users clicking "Send transfer" on the same payout a second apart both saw
-- 'approved', and Paystack happily accepted two transfers for one payout. The
-- host is paid twice from a payout that was computed once.
--
-- A row check cannot fix that — the read and the Paystack call are not one
-- transaction, and cannot be. So the claim is persisted BEFORE the call: the
-- initiator takes the row lock, writes its own reference and a timestamp, and
-- commits. A second request blocks on that lock and then sees the claim, so it
-- never reaches Paystack. This is the same pattern as the payment idempotency
-- keys in 00036, applied to the outbound direction.
--
-- transfer_attempted_at is deliberately kept after the transfer completes. It is
-- the record that an attempt was made even when no code came back.
alter table public.payouts add column if not exists transfer_attempted_at timestamptz;

comment on column public.payouts.transfer_attempted_at is
  'When the last outbound transfer attempt was claimed. Persists after success so an attempt is never invisible.';

-- A Paystack transfer code identifies exactly one transfer, so it can only ever
-- belong to exactly one payout. Without this, a mis-stamped code could satisfy
-- two payouts at once and the webhook would match ambiguously.
create unique index if not exists payouts_transfer_code_unique
  on public.payouts (transfer_code)
  where transfer_code is not null;

create unique index if not exists payouts_transfer_reference_unique
  on public.payouts (transfer_reference)
  where transfer_reference is not null;

-- Claims older than this are treated as abandoned, so a process that died
-- between the claim and the Paystack call does not wedge the payout forever.
create or replace function constant_payout_claim_timeout() returns interval
language sql immutable as $$ select interval '15 minutes' $$;

-- Revoked in the same statement that creates it, not in a later migration.
--
-- PostgreSQL grants EXECUTE to PUBLIC on every new function by default, so this
-- was briefly callable by anon and by signed-in users. The value is only an
-- interval, so nothing leaked, but an internal timing constant is not part of any
-- client's API and there is no reason to publish it even briefly. Doing the
-- revoke here also removes a cross-migration dependency: 00040 hardened this
-- grant, and a 00040 that revoked a function 00039 had not yet created could not
-- be applied on its own. Revoking at creation means there is no window at all.
revoke execute on function public.constant_payout_claim_timeout() from public, anon, authenticated;
grant execute on function public.constant_payout_claim_timeout() to service_role;

-- Returns the reference the caller must use for this attempt.
--
-- Raises rather than returning a flag, because every failure here is a case the
-- caller must not proceed through: the payout is not sendable, someone else
-- already has the claim, or a previous attempt's fate is unknown.
create or replace function public.claim_payout_transfer(p_payout_id bigint)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_payout public.payouts;
  v_reference text;
begin
  -- for update is what serialises two concurrent finance requests. The second
  -- one waits here until the first has committed its claim.
  select * into v_payout from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;

  if v_payout.status = 'paid' then
    raise exception 'This payout has already been paid' using errcode = '22023';
  end if;
  -- Explicitly refused: a reversed transfer is a finance decision, not a retry.
  if v_payout.status = 'reconciliation_required' then
    raise exception
      'This payout was reversed and is awaiting review. Resolve the reconciliation before sending it again.'
      using errcode = '22023';
  end if;
  if v_payout.status <> 'approved' then
    raise exception 'A payout must be approved before it can be sent (currently %)', v_payout.status
      using errcode = '22023';
  end if;

  -- Already has a code: there is a live or completed transfer. The caller reads
  -- it back from Paystack rather than starting another.
  if v_payout.transfer_code is not null then
    raise exception 'A transfer already exists for this payout' using errcode = '23505';
  end if;

  -- A claim with no code is the dangerous state: Paystack may or may not have
  -- accepted the transfer, and nothing in this database can tell us. Creating a
  -- second one risks paying the host twice for the same payout, so the payout is
  -- parked for a human instead. Note the reference IS known, so finance can ask
  -- Paystack to look it up.
  if v_payout.transfer_attempted_at is not null
     and v_payout.transfer_attempted_at > now() - public.constant_payout_claim_timeout() then
    raise exception
      'A transfer for this payout is already in progress'
      using errcode = '23505';
  end if;

  if v_payout.transfer_attempted_at is not null then
    raise exception
      'A previous transfer attempt for this payout never reported a code, so it cannot be retried automatically. Finance must check Paystack for reference % and resolve this payout by hand.'
      , coalesce(v_payout.transfer_reference, 'unknown')
      using errcode = '23505';
  end if;

  v_reference := format('payout-%s-%s', p_payout_id, (extract(epoch from now()) * 1000)::bigint);

  update public.payouts
     set transfer_attempted_at = now(),
         transfer_reference = v_reference,
         updated_at = now()
   where id = p_payout_id;

  return v_reference;
end;
$$;

revoke execute on function public.claim_payout_transfer(bigint) from public, anon, authenticated;
grant execute on function public.claim_payout_transfer(bigint) to service_role;

-- Records the provider's code against the claim. A second call for a payout that
-- already has a code is refused, so a retried HTTP request cannot overwrite the
-- identifier of a transfer that is already in flight.
create or replace function public.stamp_payout_transfer(
  p_payout_id bigint,
  p_transfer_code text,
  p_transfer_reference text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_payout public.payouts;
begin
  if p_transfer_code is null or length(btrim(p_transfer_code)) < 4 then
    raise exception 'Paystack did not return a transfer code' using errcode = '22023';
  end if;

  select * into v_payout from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if v_payout.transfer_code is not null then
    raise exception 'This payout already has transfer code %', v_payout.transfer_code
      using errcode = '23505';
  end if;
  if v_payout.status = 'reconciliation_required' then
    raise exception 'This payout is awaiting reconciliation' using errcode = '22023';
  end if;
  -- The reference must be the one claim_payout_transfer issued. Anything else
  -- would break the webhook's tier-2 match against a value we never stored.
  if v_payout.transfer_reference is not null
     and p_transfer_reference is distinct from v_payout.transfer_reference then
    raise exception 'The transfer reference does not match the claimed reference'
      using errcode = '22023';
  end if;

  update public.payouts
     set transfer_code = left(btrim(p_transfer_code), 120),
         updated_at = now()
   where id = p_payout_id;
end;
$$;

revoke execute on function public.stamp_payout_transfer(bigint, text, text) from public, anon, authenticated;
grant execute on function public.stamp_payout_transfer(bigint, text, text) to service_role;

-- Gives the claim back when Paystack refused to start the transfer at all, so a
-- transient provider error does not cost finance fifteen minutes.
--
-- Only usable while there is no code. Once Paystack has issued a code the
-- transfer exists in the world, and the correct next step is to read it back
-- from Paystack, not to forget it happened.
create or replace function public.release_payout_transfer_claim(p_payout_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.payouts
     set transfer_attempted_at = null,
         transfer_reference = null,
         updated_at = now()
   where id = p_payout_id
     and transfer_code is null
     and status = 'approved';

  if not found then
    raise exception
      'This payout already has a transfer, so the claim cannot be released'
      using errcode = '23505';
  end if;
end;
$$;

revoke execute on function public.release_payout_transfer_claim(bigint) from public, anon, authenticated;
grant execute on function public.release_payout_transfer_claim(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 11. A reversed payout keeps its bank account
-- ---------------------------------------------------------------------------
-- restated from 00038 with 'reconciliation_required' added. The live payout is
-- the one thing that must not move: a reversal is often caused by the account
-- itself, and the host's next move is usually to add a corrected one. Being able
-- to retire the bad account while the reversal is reviewed is what makes the
-- review productive.
create or replace function public.remove_bank_account(p_bank_account_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.host_bank_accounts
     where id = p_bank_account_id
       and user_id = (select auth.uid())
       and removed_at is null
  ) then
    raise exception 'Bank account not found' using errcode = 'P0002';
  end if;

  -- A payout that has not been rejected still points at this account, and
  -- finance may be mid-transfer on it. Retiring it now would leave a payout
  -- with no reachable destination. A payout awaiting reconciliation counts: its
  -- destination is exactly what finance is about to look at.
  if exists (
    select 1 from public.payouts p
     where p.bank_account_id = p_bank_account_id
       and p.status in ('pending', 'processing', 'approved', 'reconciliation_required')
  ) then
    raise exception
      'This bank account is being used by a payout that has not been paid yet'
      using errcode = '23514';
  end if;

  update public.host_bank_accounts
     set removed_at = now(), updated_at = now()
   where id = p_bank_account_id and user_id = (select auth.uid());

  perform public.write_audit_log(
    'bank_account_removed', 'bank_account', p_bank_account_id::text, '{}'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Reconciliation queue: what finance needs to look at
-- ---------------------------------------------------------------------------
-- Two kinds of trouble in one view: payouts whose money came back, and transfer
-- deliveries LagosLive could not tie to any payout. The second is the case that
-- the old parser would have silently dropped.
--
-- Dropped rather than replaced, because CREATE OR REPLACE VIEW cannot remove a
-- column: once 00040 widens this view with the attempt history, replacing it with
-- the narrower definition below fails outright with "cannot drop columns from
-- view", and the migration becomes impossible to re-run. Dropping costs the view's
-- grants, which are re-applied immediately afterwards, so nothing is left open in
-- between.
drop view if exists public.payout_reconciliation_queue;

create or replace view public.payout_reconciliation_queue
with (security_invoker = true) as
  select
    'payout'::text as kind,
    p.id::text as reference,
    p.organizer_id as host_id,
    p.amount as amount,
    p.status,
    p.transfer_code,
    p.transfer_reference,
    coalesce(p.reversal_reference, p.reversal_code) as reversal_reference,
    p.reversal_reason as reason,
    p.reversed_at as occurred_at,
    (select count(*) from public.payout_transfer_events e where e.payout_id = p.id) as event_count
  from public.payouts p
  where p.status = 'reconciliation_required'

  union all

  select
    'unmatched_event'::text as kind,
    e.id::text as reference,
    null::uuid as host_id,
    e.amount,
    null::text as status,
    e.transfer_code,
    e.reference as transfer_reference,
    null::text as reversal_reference,
    e.reason,
    e.received_at as occurred_at,
    1 as event_count
  from public.payout_transfer_events e
  where e.payout_id is null;

comment on view public.payout_reconciliation_queue is
  'Reversed payouts and unmatched transfer deliveries, for finance review.';

-- Readable by signed-in staff only, and only rows the underlying RLS already
-- allows: a host sees their own reversals, finance sees the lot. The view is
-- security_invoker precisely so that it cannot become a back door past the
-- payout policies.
revoke all on public.payout_reconciliation_queue from anon;
grant select on public.payout_reconciliation_queue to authenticated;

-- ---------------------------------------------------------------------------
-- 13. mark_payout_paid must never resurrect a reversed payout
-- ---------------------------------------------------------------------------
-- Unchanged in substance from 00037 — it only accepts 'approved' — restated
-- here because the status set grew, and the guard is the whole reason a
-- reconciliation_required payout cannot be paid again by a stray webhook.
create or replace function public.mark_payout_paid(
  p_payout_id bigint,
  p_transfer_code text,
  p_transfer_reference text default null
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_from text;
begin
  if p_transfer_code is null or length(btrim(p_transfer_code)) < 4 then
    raise exception 'A provider transfer code is required to mark a payout paid'
      using errcode = '22023';
  end if;

  select status into v_from from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if v_from = 'paid' then
    return 'paid';
  end if;
  -- Named explicitly because it is the state most likely to be reached by a
  -- replayed or misrouted webhook.
  if v_from = 'reconciliation_required' then
    raise exception
      'This payout was reversed and is awaiting review; it cannot be marked paid'
      using errcode = '22023';
  end if;
  if v_from <> 'approved' then
    raise exception 'A payout must be approved before it can be marked paid (currently %)'
      , v_from using errcode = '22023';
  end if;

  update public.payouts
     set status = 'paid',
         paid_at = now(),
         transfer_code = left(btrim(p_transfer_code), 120),
         -- The reference claimed at initiation is what tier-2 matching compares
         -- against, so it is only ever filled in, never replaced. A delivery
         -- that arrived carrying the transfer code instead of our reference
         -- would otherwise overwrite the reference with something else and
         -- leave the next delivery with no tier-2 string to match on.
         transfer_reference = coalesce(
           nullif(left(coalesce(p_transfer_reference, ''), 120), ''),
           transfer_reference
         ),
         updated_at = now()
   where id = p_payout_id;

  perform public.write_audit_log(
    'payout_paid', 'payout', p_payout_id::text,
    jsonb_build_object('transfer_code', p_transfer_code, 'transfer_reference', p_transfer_reference)
  );

  return 'paid';
end;
$$;

revoke execute on function public.mark_payout_paid(bigint, text, text) from public, anon, authenticated;
grant execute on function public.mark_payout_paid(bigint, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 14. Frozen columns now include the destination and the reversal record
-- ---------------------------------------------------------------------------
-- transfer_code was already frozen; the reversal fields and the transfer claim
-- join it so an API-role write cannot erase the fact that money came back, or
-- silently clear the record that a transfer was attempted.
--
-- The role test is `current_user`, not `auth.role()`, and that distinction is
-- load-bearing. auth.role() reads the JWT, so inside a SECURITY DEFINER
-- function it still reports 'authenticated' even though the function is running
-- as the table owner — which meant this trigger fired on the platform's own
-- writes too. Adding the reconciliation status check exposed that immediately:
-- finance called transition_payout to resolve a reversal and was told
-- "Reconciliation states can only be set by the platform", by the platform.
-- current_user is the effective user, so a write from inside a SECURITY DEFINER
-- function is the owner and a direct client write is 'authenticated'. The
-- trigger therefore guards client writes and leaves the server's own functions
-- alone, which is exactly the boundary it exists to hold.
create or replace function public.guard_payout_money_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.organizer_id is distinct from old.organizer_id
     or new.bank_account_id is distinct from old.bank_account_id
     or new.revenue is distinct from old.revenue
     or new.platform_fee is distinct from old.platform_fee
     or new.amount is distinct from old.amount
     or new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.bank_last4 is distinct from old.bank_last4
     or new.paid_at is distinct from old.paid_at
     or new.created_at is distinct from old.created_at
     or new.transfer_code is distinct from old.transfer_code
     or new.transfer_reference is distinct from old.transfer_reference
     or new.reversed_at is distinct from old.reversed_at
     or new.reversal_code is distinct from old.reversal_code
     or new.reversal_reference is distinct from old.reversal_reference
     or new.reversal_reason is distinct from old.reversal_reason
     or new.transfer_attempted_at is distinct from old.transfer_attempted_at
  then
    raise exception
      'Payout amounts, period and beneficiary are computed by the server and cannot be edited.'
      using errcode = '42501';
  end if;

  -- Status is writable in principle, but the only legal paths are the state
  -- machine and the reversal handler. Anything else is a client inventing a
  -- financial state.
  if new.status is distinct from old.status then
    if old.status = 'reconciliation_required' or new.status = 'reconciliation_required' then
      raise exception 'Reconciliation states can only be set by the platform.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
