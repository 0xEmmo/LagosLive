-- ===========================================================================
-- 00040 — PART 3c + 3d, as a single standalone migration.
--
-- WHY THIS FILE NOW CONTAINS PART 3c AS WELL
--
-- Part 3d (transfer_pending, permanent attempt history, fill-once provider
-- identifiers) is written on top of Part 3c (exact transfer matching, reversals,
-- payout freezes). It revokes a grant on constant_payout_claim_timeout(), which
-- Part 3c creates, so running Part 3d on its own failed with:
--
--     ERROR: 42883: function public.constant_payout_claim_timeout() does not exist
--
-- That was not a defect in Part 3c. It was a real dependency, and the honest
-- reading of it is that a half-applied Part 3c leaves the database in a state
-- where the next step cannot be taken safely. Rather than leave that trap in
-- place, this file now applies both parts in the correct order by itself.
--
-- So: you can run THIS FILE ALONE and end up with exactly the schema you would
-- have got from running 00039 then 00040. Both parts are idempotent, so running
-- 00039 first and then this file is still correct and still safe.
--
-- Both halves of the original reasoning are preserved below, because the "why"
-- is the part that matters when someone is deciding whether an old deployment
-- has actually been fixed.
--
-- WHAT THIS FILE STILL NEEDS
--
-- Parts 1, 2, 3 and 3b (migrations 00035-00038) are NOT included. They are
-- unrelated to the transfer flow and remain their own files. Apply 00035-00038
-- first, then this one.
--
-- 00039 is left on disk, unchanged and still correct, for two reasons: a
-- migration ledger may already have a row for it, and deleting a file that a
-- ledger has recorded makes that ledger permanently unsatisfiable.
-- ===========================================================================

-- ###########################################################################
-- BLOCK 1 of 2 — PART 3c, previously migration 00039.
--
-- Section numbers restart at 1 in each block. That is deliberate: the two
-- blocks are kept verbatim so either can be compared against its original
-- migration without diff noise.
-- ###########################################################################

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
-- ###########################################################################
-- BLOCK 2 of 2 — PART 3d, the original content of this migration.
--
-- Everything above this line is Part 3c, included so that this file can be
-- applied on its own. Everything below is Part 3d.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 1. transfer_pending as a first-class status
-- ---------------------------------------------------------------------------
alter table public.payouts drop constraint if exists payouts_status_check;
alter table public.payouts
  add constraint payouts_status_check
  check (status in (
    'pending', 'processing', 'approved', 'transfer_pending', 'paid', 'rejected',
    'reconciliation_required'
  ));

comment on column public.payouts.status is
  'transfer_pending means a transfer has been claimed and sent to the provider but not yet confirmed. Only claim_payout_transfer may enter it.';

-- ---------------------------------------------------------------------------
-- 2. payout_transfer_attempts: the permanent record
-- ---------------------------------------------------------------------------
-- One row per outbound attempt, opened when the transfer is claimed and closed
-- when its outcome is known. This table is the answer to "what did we actually
-- send, and what happened to it" after the active columns on payouts have been
-- cleared for a retry.
--
-- It is deliberately NOT a matching source. The webhook looks only at
-- payouts.transfer_code and payouts.transfer_reference, because those describe
-- the attempt in flight. Matching a delivery against a closed attempt would let
-- a replayed transfer.sent for a transfer that was already reversed mark the
-- payout paid again — which is the precise scenario 00039 was written to stop.
-- A closed attempt is looked up in order to recognise a duplicate, never in
-- order to apply it. See the 'prior_attempt' match method in the webhook.
create table if not exists public.payout_transfer_attempts (
  id uuid primary key default gen_random_uuid(),
  payout_id bigint not null references public.payouts(id) on delete cascade,
  attempt_number integer not null,
  -- What was sent. The reference is ours, the code is Paystack's. Both are kept
  -- for the life of the payout even after the active columns are reset.
  transfer_reference text not null,
  transfer_code text,
  amount integer not null,
  account_last4 text,
  -- claimed: sent to the provider, outcome unknown
  -- sent: the provider confirmed the money moved
  -- failed: the provider refused or the transfer did not go out
  -- reversed: the money came back
  -- abandoned: the outcome will never be known (a claim whose stamp was lost)
  status text not null default 'claimed'
    check (status in ('claimed', 'sent', 'failed', 'reversed', 'abandoned')),
  claimed_at timestamptz not null default now(),
  closed_at timestamptz,
  closure_reason text,
  reversal_reference text,
  reversal_reason text,
  unique (payout_id, attempt_number)
);

create index if not exists payout_transfer_attempts_payout_idx
  on public.payout_transfer_attempts (payout_id, attempt_number desc);
create index if not exists payout_transfer_attempts_open_idx
  on public.payout_transfer_attempts (payout_id)
  where status = 'claimed';

-- A provider code identifies one transfer, so it can belong to only one attempt
-- across the whole platform — including attempts that have been closed.
create unique index if not exists payout_transfer_attempts_code_unique
  on public.payout_transfer_attempts (transfer_code)
  where transfer_code is not null;

comment on table public.payout_transfer_attempts is
  'Permanent history of every outbound transfer attempt. Never matched against; only the active columns on payouts are.';

alter table public.payout_transfer_attempts enable row level security;
revoke all on public.payout_transfer_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. assert_service_role
-- ---------------------------------------------------------------------------
-- A guard for the functions that are meant to be service-role only.
--
-- The temptation with these is to rely on the GRANT alone: the function is not
-- granted to `authenticated`, so it must be safe. That holds right up until a
-- later migration grants it, or a wrapper exposes it, and then the whole
-- privilege boundary is one missing keyword away. Several of these functions
-- take a caller-supplied user id (register_bank_account takes p_user_id), so
-- "the service role decides whose bank account this is" is a real assumption,
-- not a formality.
--
-- "The platform" is two different things, and both have to pass:
--
--   1. a PostgREST request carrying the service key, which auth.role() reports
--      as 'service_role'; and
--   2. a direct connection that never went through the API role layer at all —
--      the migration runner, an operator in the SQL editor, a backfill script.
--
-- The second case is why this is not simply `auth.role() = 'service_role'`. A
-- direct connection carries no JWT, so auth.role() is null, and a check written
-- that way would refuse the most privileged callers in the system while letting
-- the ones that matter pass. Superuser sessions are allowed explicitly on the
-- grounds that they can already do anything, so refusing them buys no safety.
--
-- It is written as SECURITY INVOKER on purpose. auth.role() reads the JWT, so it
-- reports who actually authenticated regardless of any SECURITY DEFINER context
-- in the caller — the same property that made it the wrong tool in the guard
-- trigger, and the right one here.
create or replace function public.assert_service_role()
returns void
language plpgsql
security invoker
as $$
begin
  if (select auth.role()) = 'service_role' then
    return;
  end if;

  if (select rolsuper from pg_roles where rolname = session_user) then
    return;
  end if;

  raise exception 'This function may only be called by the platform'
    using errcode = '42501';
end;
$$;

revoke execute on function public.assert_service_role() from public, anon, authenticated;
grant execute on function public.assert_service_role() to service_role;

-- constant_payout_claim_timeout leaked EXECUTE to public, anon and authenticated
-- in 00039. It returns only an interval, so nothing leaked, but an internal
-- timing constant is not part of any client's API.
--
-- 00039 now also revokes this at the moment it creates the function, so a fresh
-- install never has the grant in the first place. This revoke stays because any
-- environment that already applied the earlier 00039 still has the permissive
-- grant, and nothing else will take it away. Revoking twice is a no-op, which
-- makes it safe to keep both and wrong to drop this one.
revoke execute on function public.constant_payout_claim_timeout() from public, anon, authenticated;
grant execute on function public.constant_payout_claim_timeout() to service_role;

-- A trigger function has no business being callable at all; PostgreSQL refuses
-- the call anyway, but the grant should not be there to begin with.
revoke execute on function public.guard_payout_money_columns() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Claiming a transfer now enters transfer_pending
-- ---------------------------------------------------------------------------
-- The attempt row is opened in the same transaction as the claim, so a transfer
-- always has a history entry, including one that never gets a code.
create or replace function public.claim_payout_transfer(p_payout_id bigint)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_payout public.payouts;
  v_reference text;
  v_attempt integer;
begin
  perform public.assert_service_role();

  -- for update is what serialises two concurrent finance requests. The second
  -- one waits here until the first has committed its claim.
  select * into v_payout from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;

  if v_payout.status = 'paid' then
    raise exception 'This payout has already been paid' using errcode = '22023';
  end if;
  if v_payout.status = 'reconciliation_required' then
    raise exception
      'This payout was reversed and is awaiting review. Resolve the reconciliation before sending it again.'
      using errcode = '22023';
  end if;
  -- The explicit form of the check 00039 inferred from a timestamp. A payout
  -- with a transfer in flight says so, rather than looking like an ordinary
  -- approved payout with a recent timestamp on it.
  --
  -- Both sub-cases are a request to look something up rather than a bug, so the
  -- message says which. The one without a code is the one that actually needs a
  -- person: Paystack may or may not have accepted the transfer, and nothing in
  -- this database can tell us, because the only identifier we would have used to
  -- find it is the one that never came back.
  if v_payout.status = 'transfer_pending' then
    if v_payout.transfer_code is null then
      raise exception
        'A previous transfer attempt for this payout never reported a code, so it cannot be retried automatically. Finance must check Paystack for reference % and resolve this payout by hand.'
        , coalesce(v_payout.transfer_reference, 'unknown')
        using errcode = '23505';
    end if;
    raise exception 'Transfer % is already in progress for this payout'
      , v_payout.transfer_code using errcode = '23505';
  end if;
  if v_payout.status <> 'approved' then
    raise exception 'A payout must be approved before it can be sent (currently %)', v_payout.status
      using errcode = '22023';
  end if;

  if v_payout.transfer_code is not null then
    raise exception 'A transfer already exists for this payout' using errcode = '23505';
  end if;

  -- A claim with no code is the dangerous state: Paystack may or may not have
  -- accepted the transfer, and nothing in this database can tell us. The
  -- reference is known, so the attempt can be found in Paystack by a human.
  --
  -- 'transfer_pending' above now catches this in the normal case, since a claim
  -- always sets that status. This remains as a backstop for a row whose status
  -- was altered out of band, and costs one comparison.
  if v_payout.transfer_attempted_at is not null then
    raise exception
      'A previous transfer attempt for this payout never reported a code, so it cannot be retried automatically. Finance must check Paystack for reference % and resolve this payout by hand.'
      , coalesce(v_payout.transfer_reference, 'unknown')
      using errcode = '23505';
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt
    from public.payout_transfer_attempts
   where payout_id = p_payout_id;

  v_reference := format('payout-%s-%s', p_payout_id, (extract(epoch from now()) * 1000)::bigint);

  update public.payouts
     set status = 'transfer_pending',
         transfer_attempted_at = now(),
         transfer_reference = v_reference,
         updated_at = now()
   where id = p_payout_id;

  insert into public.payout_transfer_attempts (
    payout_id, attempt_number, transfer_reference, amount, account_last4, status
  )
  values (
    p_payout_id, v_attempt, v_reference, v_payout.amount, v_payout.bank_last4, 'claimed'
  );

  return v_reference;
end;
$$;

revoke execute on function public.claim_payout_transfer(bigint) from public, anon, authenticated;
grant execute on function public.claim_payout_transfer(bigint) to service_role;

-- Records the provider's code against the claim, on the payout and on the
-- attempt. Writing it in two places in one statement keeps them from drifting:
-- the payout is what the webhook matches, the attempt is what survives a reset.
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
  v_attempt_id uuid;
begin
  perform public.assert_service_role();

  if p_transfer_code is null or length(btrim(p_transfer_code)) < 4 then
    raise exception 'Paystack did not return a transfer code' using errcode = '22023';
  end if;

  select * into v_payout from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if v_payout.status <> 'transfer_pending' then
    raise exception
      'Only a payout with a transfer in flight can be stamped (currently %)'
      , v_payout.status using errcode = '22023';
  end if;
  if v_payout.transfer_code is not null then
    raise exception 'This payout already has transfer code %', v_payout.transfer_code
      using errcode = '23505';
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

  select id into v_attempt_id
    from public.payout_transfer_attempts
   where payout_id = p_payout_id and transfer_reference = v_payout.transfer_reference;

  update public.payout_transfer_attempts
     set transfer_code = left(btrim(p_transfer_code), 120)
   where id = v_attempt_id;
end;
$$;

revoke execute on function public.stamp_payout_transfer(bigint, text, text) from public, anon, authenticated;
grant execute on function public.stamp_payout_transfer(bigint, text, text) to service_role;

-- Gives the claim back when Paystack refused to start the transfer at all.
create or replace function public.release_payout_transfer_claim(p_payout_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_payout public.payouts;
begin
  perform public.assert_service_role();

  select * into v_payout from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if v_payout.transfer_code is not null then
    raise exception
      'This payout already has a transfer, so the claim cannot be released'
      using errcode = '23505';
  end if;
  if v_payout.status <> 'transfer_pending' then
    raise exception 'This payout has no transfer in flight' using errcode = '22023';
  end if;

  update public.payouts
     set status = 'approved',
         transfer_attempted_at = null,
         transfer_reference = null,
         updated_at = now()
   where id = p_payout_id;

  update public.payout_transfer_attempts
     set status = 'failed',
         closed_at = now(),
         closure_reason = 'Paystack did not accept the transfer.'
   where payout_id = p_payout_id and status = 'claimed';
end;
$$;

revoke execute on function public.release_payout_transfer_claim(bigint) from public, anon, authenticated;
grant execute on function public.release_payout_transfer_claim(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 5. mark_payout_paid: fill-once identifiers, and transfer_pending is valid
-- ---------------------------------------------------------------------------
-- Two changes, both about not destroying evidence.
--
-- The first-time path is unchanged in shape: an approved or in-flight payout
-- with a provider code becomes paid. It now also accepts 'transfer_pending',
-- which is the state a genuinely queued transfer sits in — without this, the
-- explicit status added above would have broken the ordinary asynchronous
-- settlement that the whole webhook exists to handle.
--
-- The identifiers are now immutable once written. A delivery that arrives with
-- the same code is the normal redelivery case and is fine. A delivery with a
-- DIFFERENT code for a payout that already has one is a matching failure, and
-- it is raised rather than resolved in favour of the newcomer: silently
-- replacing the code would mean the ledger recorded one transfer while the
-- payout pointed at another.
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
  v_code text;
  v_reference text;
  v_attempt_id uuid;
begin
  perform public.assert_service_role();

  if p_transfer_code is null or length(btrim(p_transfer_code)) < 4 then
    raise exception 'A provider transfer code is required to mark a payout paid'
      using errcode = '22023';
  end if;
  v_code := left(btrim(p_transfer_code), 120);
  v_reference := nullif(left(coalesce(p_transfer_reference, ''), 120), '');

  select status into v_from from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if v_from = 'paid' then
    return 'paid';
  end if;
  if v_from = 'reconciliation_required' then
    raise exception
      'This payout was reversed and is awaiting review; it cannot be marked paid'
      using errcode = '22023';
  end if;
  if v_from not in ('approved', 'transfer_pending') then
    raise exception 'A payout must be approved or awaiting transfer before it can be marked paid (currently %)'
      , v_from using errcode = '22023';
  end if;

  -- Immutable once recorded. A conflict is surfaced, not resolved.
  if exists (
    select 1 from public.payouts
     where id = p_payout_id and transfer_code is not null and transfer_code is distinct from v_code
  ) then
    raise exception
      'This payout already has a different provider transfer code recorded; the delivery was not applied'
      using errcode = '22023';
  end if;

  update public.payouts
     set status = 'paid',
         paid_at = now(),
         transfer_code = coalesce(transfer_code, v_code),
         transfer_reference = coalesce(transfer_reference, v_reference),
         updated_at = now()
   where id = p_payout_id;

  select id into v_attempt_id
    from public.payout_transfer_attempts
   where payout_id = p_payout_id and status = 'claimed'
   order by attempt_number desc
   limit 1;

  if v_attempt_id is not null then
    update public.payout_transfer_attempts
       set status = 'sent', closed_at = now(),
           transfer_code = coalesce(transfer_code, v_code)
     where id = v_attempt_id;
  end if;

  perform public.write_audit_log(
    'payout_paid', 'payout', p_payout_id::text,
    jsonb_build_object('transfer_code', v_code, 'transfer_reference', v_reference)
  );

  return 'paid';
end;
$$;

revoke execute on function public.mark_payout_paid(bigint, text, text) from public, anon, authenticated;
grant execute on function public.mark_payout_paid(bigint, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Resolving a reversal: archive, then clear
-- ---------------------------------------------------------------------------
-- The retry reset, done without losing the record of what it is resetting.
--
-- Cleared (active state for the NEXT attempt):
--   transfer_code, transfer_reference, transfer_attempted_at, reversal_reason
--
-- Preserved (facts about what already happened):
--   paid_at, reversed_at, reversal_code, reversal_reference
--
-- The previous attempt's reference and code live in payout_transfer_attempts,
-- and the reversal's reason is copied there too before it is cleared here, so
-- the "why" survives even though the active row stops carrying it.
-- Closes the current attempt, copying the payout's active fields onto it first.
--
-- It targets the most recent attempt rather than "the attempt that is still
-- claimed", and that distinction is not cosmetic. mark_payout_paid already closes
-- an attempt as 'sent' when the money moves, so a reversal arrives against a
-- 'sent' attempt — and a filter of status = 'claimed' would match nothing, leaving
-- the history claiming a returned transfer was sent and dropping the reason the
-- bank gave. A reversal always concerns the most recent attempt, because only the
-- most recent attempt can have been paid out.
create or replace function public.archive_payout_attempt(
  p_payout_id bigint,
  p_status text,
  p_closure_reason text,
  p_reversal_reference text,
  p_reversal_reason text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_payout public.payouts;
begin
  perform public.assert_service_role();

  select * into v_payout from public.payouts where id = p_payout_id;

  update public.payout_transfer_attempts
     set status = p_status,
         closed_at = coalesce(closed_at, now()),
         closure_reason = coalesce(p_closure_reason, closure_reason),
         reversal_reference = coalesce(p_reversal_reference, reversal_reference),
         reversal_reason = coalesce(p_reversal_reason, reversal_reason),
         transfer_code = coalesce(transfer_code, v_payout.transfer_code)
   where id = (
     select id
       from public.payout_transfer_attempts
      where payout_id = p_payout_id
      order by attempt_number desc
      limit 1
   );
end;
$$;

revoke execute on function public.archive_payout_attempt(bigint, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.archive_payout_attempt(bigint, text, text, text, text) to service_role;

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
  perform public.assert_service_role();

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
      'A payout in state % cannot be reversed; only a sent transfer can be reversed'
      , v_payout.status using errcode = '22023';
  end if;

  -- Archive the attempt as reversed BEFORE the payout's active columns are
  -- cleared by any later resolution, so the reason is captured while it is
  -- still on the row.
  perform public.archive_payout_attempt(
    p_payout_id, 'reversed',
    coalesce(nullif(p_reason, ''), 'The bank or provider returned this transfer.'),
    coalesce(p_reversal_reference, p_reversal_code),
    coalesce(nullif(p_reason, ''), 'The bank or provider returned this transfer.')
  );

  update public.payouts
     set status = 'reconciliation_required',
         reversed_at = now(),
         reversal_code = left(coalesce(p_reversal_code, ''), 120),
         reversal_reference = left(coalesce(p_reversal_reference, ''), 120),
         reversal_reason = left(coalesce(p_reason, ''), 500),
         updated_at = now()
   where id = p_payout_id;

  -- paid_at and transfer_code are left exactly as they were: the payout was
  -- paid, on that date, with that code.

  -- Release the order claims. The money did not arrive, so the revenue is owed
  -- again and should be claimable once the freeze is lifted.
  update public.payout_items set released = true where payout_id = p_payout_id;

  -- Freeze payouts for this host without touching their account. The count is
  -- the number of freezes this host has ever had, so a repeated reversal is
  -- visible to a human without the database acting on it.
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
-- 7. transition_payout with the corrected reset
-- ---------------------------------------------------------------------------
-- The state machine, stated in full:
--
--   pending  -> processing | rejected
--   processing -> approved | rejected
--   approved -> rejected
--   transfer_pending -> approved (the transfer did not go out; retryable)
--   reconciliation_required -> approved | rejected   (finance decided)
--   paid -> reconciliation_required                  (only via record_payout_reversal)
--
-- 'paid' and 'transfer_pending' are not reachable from this function. paid needs
-- a provider code and transfer_pending needs a claim, and both of those are
-- platform functions. Keeping them out of the table means there is exactly one
-- way into each, which is what makes the webhook's fail-closed rules hold.
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
  v_reason text;
  v_allowed boolean := false;
begin
  if not (
    public.user_has_permission((select auth.uid()), 'payouts.approve')
    or public.user_has_permission((select auth.uid()), 'payouts.process')
  ) then
    raise exception 'You are not allowed to change payout status' using errcode = '42501';
  end if;

  -- The reversal reason is read alongside the status, because the reset below
  -- overwrites the row it lives on.
  select status, reversal_reason into v_from, v_reason
    from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;

  -- Idempotent: a repeated call is a no-op, which is what makes a double-click
  -- or a retried request harmless.
  if v_from = p_to_status then
    return v_from;
  end if;

  v_allowed := case v_from
    when 'pending'    then p_to_status in ('processing', 'rejected')
    when 'processing' then p_to_status in ('approved', 'rejected')
    when 'approved'   then p_to_status = 'rejected'
    -- The transfer did not go out. Back to 'approved' so it can be retried, and
    -- the claim is released so the retry is not blocked by its own history.
    when 'transfer_pending' then p_to_status = 'approved'
    -- Leaving here is an explicit human decision on a reversed transfer.
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

  if v_from = 'transfer_pending' and p_to_status = 'approved' then
    -- The transfer was abandoned. The attempt history keeps the reference and
    -- code; the active columns are freed so a retry can be claimed.
    perform public.archive_payout_attempt(
      p_payout_id, 'abandoned',
      'The transfer was reset for a retry.', null, null
    );
    update public.payouts
       set transfer_attempted_at = null,
           transfer_reference = null
     where id = p_payout_id;
  end if;

  -- Resolving a reversal for a retry. This is the reset 00039 got wrong: it
  -- cleared the active fields but left transfer_attempted_at, which blocked the
  -- retry forever, and it cleared the reference without first preserving it
  -- anywhere. The attempt row is the archive; the reason is copied across before
  -- the active row stops carrying it.
  if v_from = 'reconciliation_required' and p_to_status = 'approved' then
    update public.payout_transfer_attempts
       set reversal_reason = coalesce(reversal_reason, v_reason)
     where payout_id = p_payout_id;

    update public.payouts
       set transfer_code = null,
           transfer_reference = null,
           transfer_attempted_at = null,
           -- No longer the live explanation for this payout: the attempt row
           -- carries it, and the reversed_at date stays as the historical fact.
           reversal_reason = null,
           updated_at = now()
     where id = p_payout_id;
  end if;

  perform public.write_audit_log(
    'payout_status', 'payout', p_payout_id::text,
    jsonb_build_object('from', v_from, 'to', p_to_status)
  );

  return p_to_status;
end;
$$;

revoke execute on function public.transition_payout(bigint, text) from public, anon;
grant execute on function public.transition_payout(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. request_payout: transfer_pending counts as in flight
-- ---------------------------------------------------------------------------
-- Same function as 00039 with the explicit status included, so a host with a
-- transfer in flight is not treated as though their previous payout had
-- finished. The order claims already prevent double-spending the same revenue;
-- this stops the confusing case where a second payout is created for genuinely
-- new revenue while the first is still at the bank.
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

  -- One live payout at a time. 'transfer_pending' is here explicitly: a transfer
  -- that has been sent but not confirmed is the payout most at risk of being
  -- duplicated by a second request.
  if exists (
    select 1 from public.payouts
     where organizer_id = v_uid
       and status in ('pending', 'processing', 'approved', 'transfer_pending')
  ) then
    raise exception
      'A payout for this revenue is already being processed'
      using errcode = '23505';
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
      -- Lost the race against a concurrent request. The exception aborts this
      -- function, so the payout row created a moment ago is rolled back with it
      -- and nothing dangles.
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
-- 9. remove_bank_account now also pins a transfer in flight
-- ---------------------------------------------------------------------------
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

  if exists (
    select 1 from public.payouts p
     where p.bank_account_id = p_bank_account_id
       and p.status in ('pending', 'processing', 'approved', 'transfer_pending', 'reconciliation_required')
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
-- 10. register_bank_account asserts the platform role itself
-- ---------------------------------------------------------------------------
-- This one takes a p_user_id and trusts it completely, which is fine while the
-- only EXECUTE holder is the service role and is a critical flaw the moment
-- that stops being true — a host would be able to register a payout account
-- against someone else's profile. The assert makes the assumption explicit and
-- enforced rather than implied by a grant.
create or replace function public.register_bank_account(
  p_user_id uuid,
  p_bank_code text,
  p_bank_name text,
  p_account_name text,
  p_account_number_last4 text,
  p_recipient_code text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.assert_service_role();

  if p_user_id is null then
    raise exception 'A user id is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if p_recipient_code is null or length(btrim(p_recipient_code)) < 4 then
    raise exception 'A verified Paystack recipient code is required' using errcode = '22023';
  end if;
  if p_account_number_last4 is null or length(btrim(p_account_number_last4)) not in (4, 6) then
    raise exception 'The account number must be reduced to its last four digits' using errcode = '22023';
  end if;

  -- One live account. A second verified account would leave finance choosing a
  -- destination at the moment of sending, which is the decision most worth
  -- removing from a human's hands.
  update public.host_bank_accounts
     set removed_at = now(), updated_at = now()
   where user_id = p_user_id and removed_at is null;

  insert into public.host_bank_accounts (
    user_id, bank_code, bank_name, account_name, account_number_last4,
    recipient_code, verification_status, verified_at
  )
  values (
    p_user_id, left(btrim(p_bank_code), 12), left(coalesce(p_bank_name, ''), 120),
    left(coalesce(p_account_name, ''), 160), right(btrim(p_account_number_last4), 4),
    btrim(p_recipient_code), 'verified', now()
  )
  returning id into v_id;

  perform public.write_audit_log(
    'bank_account_registered', 'bank_account', v_id::text,
    jsonb_build_object('bank_code', p_bank_code, 'bank_name', p_bank_name, 'account_name', p_account_name)
  );

  return v_id;
end;
$$;

revoke execute on function public.register_bank_account(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_bank_account(uuid, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 11. The guard trigger protects the new state
-- ---------------------------------------------------------------------------
-- 'transfer_pending' joins 'paid' as a state no client can invent. A client that
-- could set it would be asserting that a transfer is at the bank, which is
-- precisely the claim mark_payout_paid and the transfer route must be the only
-- ones to make.
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

  if new.status is distinct from old.status then
    -- The two states that assert something about the money outside the
    -- platform's knowledge. Everything else is a workflow label a permissioned
    -- user may set through the state machine.
    if old.status in ('reconciliation_required', 'paid', 'transfer_pending')
       or new.status in ('reconciliation_required', 'paid', 'transfer_pending') then
      raise exception 'This payout state can only be set by the platform.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. record_transfer_event learns about prior attempts
-- ---------------------------------------------------------------------------
-- 00039 defined this function with three match methods and rejected anything else.
-- 00040's webhook resolves a redelivered delivery of a settled transfer to
-- 'prior_attempt', which that check refused — and the refusal was only logged by
-- the caller, not raised, so every such delivery was recognised correctly and then
-- silently dropped from the ledger. The exact behaviour the ledger exists to
-- provide was the one case it did not cover.
--
-- 'prior_attempt' carries a payout_id, unlike 'unmatched', because the payout is
-- known: it is the one the closed attempt belongs to. What it does not carry is
-- any effect on that payout. Attributing the row is what lets finance see that the
-- redelivery arrived and was declined, rather than having to infer it from its
-- absence.
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
  perform public.assert_service_role();

  if p_match_method not in ('transfer_code', 'reference', 'prior_attempt', 'unmatched') then
    raise exception 'Unknown match method: %', p_match_method using errcode = '22023';
  end if;
  -- 'unmatched' with a payout, or a real method with no payout, would both
  -- corrupt the triage view built on this table. 'prior_attempt' requires a
  -- payout: an attempt always belongs to one.
  if (p_match_method = 'unmatched') <> (p_payout_id is null) then
    raise exception 'match_method and payout_id disagree' using errcode = '22023';
  end if;
  if p_match_method = 'prior_attempt' and p_payout_id is null then
    raise exception 'a prior attempt must name the payout it belonged to' using errcode = '22023';
  end if;

  insert into public.payout_transfer_events (
    event, payout_id, match_method, transfer_code, reference, amount, reason, payload
  )
  values (
    p_event, p_payout_id, p_match_method,
    -- nullif over left/trim, so an absent identifier stays NULL. Coalescing to ''
    -- here would defeat the narrowed dedupe index below: '' is not null, both
    -- deliveries would land inside the index, and the second would be discarded
    -- for colliding with the first on a value that means nothing.
    nullif(left(btrim(coalesce(p_transfer_code, '')), 120), ''),
    nullif(left(btrim(coalesce(p_reference, '')), 120), ''),
    p_amount, left(coalesce(p_reason, ''), 500), coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    -- A redelivery of something already in the ledger. Not an error: Paystack
    -- does this in normal operation, and the row that matters is already there.
    return null;
end;
$$;

-- The webhook records the delivery before it applies anything, then writes back
-- what it decided. Splitting it in two keeps the ledger append-only in the one
-- direction that matters — nothing is ever rewritten to look like a different
-- event — while still letting a row say what became of it.
create or replace function public.mark_transfer_event_outcome(
  p_event_id uuid,
  p_outcome text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.assert_service_role();

  if p_event_id is null then
    -- A redelivery, so the original row already carries its own outcome.
    return;
  end if;

  update public.payout_transfer_events
     set outcome = left(coalesce(p_outcome, ''), 120)
   where id = p_event_id;
end;
$$;

revoke execute on function public.mark_transfer_event_outcome(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_transfer_event_outcome(uuid, text) to service_role;

revoke execute on function public.record_transfer_event(text, bigint, text, text, text, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_transfer_event(text, bigint, text, text, text, integer, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 14. The ledger accepts the new method, and stops discarding deliveries
-- ---------------------------------------------------------------------------
-- Two things about the table itself rather than the function.
--
-- The check constraint on match_method still listed only the three values 00039
-- knew about, so a 'prior_attempt' row would have been rejected by the table even
-- with the function above accepting it.
alter table public.payout_transfer_events
  drop constraint if exists payout_transfer_events_match_method_check;
alter table public.payout_transfer_events
  add constraint payout_transfer_events_match_method_check
  check (match_method in ('transfer_code', 'reference', 'prior_attempt', 'unmatched'));

comment on column public.payout_transfer_events.match_method is
  'transfer_code | reference | prior_attempt | unmatched. Only ''unmatched'' implies a null payout_id.';

-- The idempotency index deduplicated on (provider, event, coalesce(code,''),
-- coalesce(reference,'')). Both identifiers are nullable, so a delivery carrying
-- neither collapsed into the same key as every other such delivery: a second
-- unmatched transfer, with a different amount and no code, silently vanished on
-- insert. The money had moved and the record of it was gone.
--
-- There is no honest way to tell two identifier-less deliveries apart, because
-- the provider gave us nothing to tell them apart by. So the dedupe is narrowed to
-- the rows it can actually distinguish. A redelivery of a delivery that carried an
-- identifier is still a no-op, and two deliveries that carried nothing are now two
-- rows. A duplicate line in a triage view is noise; a dropped line is a transfer
-- nobody can account for, and the trade is not close.
drop index if exists public.payout_transfer_events_dedupe;

create unique index if not exists payout_transfer_events_dedupe_idx
  on public.payout_transfer_events (provider, event, transfer_code, reference)
  where transfer_code is not null or reference is not null;
-- Finance resolving a reversal needs the whole story in one place: what was
-- sent, what came back, and what was tried before. Dropped and recreated so the
-- prior definition in 00039 is replaced cleanly.
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
    (select count(*) from public.payout_transfer_attempts a where a.payout_id = p.id) as attempt_count,
    (select string_agg(
              a.status || ' (' || coalesce(a.transfer_code, 'no code') || ')',
              ', ' order by a.attempt_number)
       from public.payout_transfer_attempts a where a.payout_id = p.id) as attempt_history
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
    0::bigint as attempt_count,
    null::text as attempt_history
  from public.payout_transfer_events e
  where e.payout_id is null;

comment on view public.payout_reconciliation_queue is
  'Reversed payouts with their full attempt history, and transfer deliveries that could not be tied to any payout.';

revoke all on public.payout_reconciliation_queue from anon;
grant select on public.payout_reconciliation_queue to authenticated;
