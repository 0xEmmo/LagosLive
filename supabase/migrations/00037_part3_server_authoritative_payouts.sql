-- ===========================================================================
-- 00037 — PART 3: server-authoritative payouts.
--
-- Three defects are fixed here.
--
-- 1. /api/payouts/request trusted the browser. revenue, platform_fee, amount,
--    period_start and period_end were all read from the request body and
--    inserted with the service client, so RLS never saw them. The only
--    validation was internal consistency (fee < revenue), which a caller
--    controls completely: a host could request a payout for revenue that was
--    never collected.
--
-- 2. The UPDATE policy on payouts ("finance approves payouts") has no
--    WITH CHECK, so PostgreSQL reused its USING expression, and `authenticated`
--    holds UPDATE on every column including amount, revenue and organizer_id.
--    Anyone with payouts.process could inflate a payout, rewrite the revenue it
--    was derived from, or redirect organizer_id to an account they control.
--
-- 3. Nothing marked a payout paid from a verified provider result. The admin
--    UI set status = 'paid' directly, so "paid" meant "an admin clicked a
--    button", and the platform had no record of a transfer having happened.
--
-- The design: the database computes the figures from orders that were actually
-- paid, records which orders each payout settles so the same revenue cannot be
-- claimed twice, freezes the money columns, and moves status only along an
-- audited state machine whose terminal step requires a provider transfer code.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Freeze the money columns
-- ---------------------------------------------------------------------------
-- No column-level UPDATE grant is issued to anyone: the only supported status
-- change is transition_payout(), and the only supported "paid" is
-- mark_payout_paid() with a provider transfer code.
revoke update on public.payouts from anon, authenticated;
revoke insert on public.payouts from anon, authenticated;

-- The INSERT policy that existed is dropped for clarity rather than left as a
-- second, looser door: a caller who can satisfy a policy and has no grant is
-- still refused, but leaving an insert policy that implies client-side payout
-- creation is a trap for the next person to read the schema.
drop policy if exists "organizers request their own payouts" on public.payouts;

create or replace function public.guard_payout_money_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() not in ('anon', 'authenticated') then
    return new;
  end if;

  -- An API caller may move a payout between statuses and nothing else. The
  -- permitted transitions are enforced by transition_payout(); this trigger
  -- exists so that even a direct UPDATE cannot touch the figures or the
  -- beneficiary, whatever the grants say.
  if new.organizer_id is distinct from old.organizer_id
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
  then
    raise exception
      'Payout amounts, period and beneficiary are computed by the server and cannot be edited.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_payout_money_columns on public.payouts;
create trigger guard_payout_money_columns
  before update on public.payouts
  for each row execute function public.guard_payout_money_columns();

-- ---------------------------------------------------------------------------
-- 2. Provenance: which orders a payout settles
-- ---------------------------------------------------------------------------
-- Without this, "have we already paid for this revenue?" can only be answered
-- by re-summing a host's orders, and a rejected payout would leave the same
-- orders payable again with nothing to show they had been claimed. The partial
-- unique index is what makes double-claiming impossible while still allowing a
-- rejected payout to release its orders back.
create table if not exists public.payout_items (
  id bigint generated always as identity primary key,
  payout_id bigint not null references public.payouts(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount integer not null,
  released boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists payout_items_one_active_claim
  on public.payout_items (order_id)
  where not released;

create index if not exists payout_items_payout_id_idx on public.payout_items (payout_id);

comment on table public.payout_items is
  'Orders a payout settles. The partial unique index makes each order claimable by at most one live payout.';

alter table public.payout_items enable row level security;
revoke all on public.payout_items from anon, authenticated;
grant select on public.payout_items to authenticated;

-- Provider transfer identifiers, so "paid" is a fact about a transfer rather
-- than a status an admin typed. Nullable and additive: existing rows keep
-- whatever they had and are not touched by this migration.
alter table public.payouts add column if not exists transfer_code text;
alter table public.payouts add column if not exists transfer_reference text;

-- ---------------------------------------------------------------------------
-- 3. request_payout — the server computes the figures
-- ---------------------------------------------------------------------------
-- The browser sends no numbers at all. It calls this and the database decides:
--
--   * which orders count — confirmed, on a party the caller hosts, not
--     refunded, and not already claimed by a live payout;
--   * the period covered — the span of those orders, not a client-chosen range
--     that could be trimmed to hide a refund;
--   * the fee — 15%, applied here rather than computed and sent by the caller.
create or replace function public.request_payout()
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles;
  v_revenue integer;
  v_fee integer;
  v_amount integer;
  v_payout_id bigint;
  v_period_start date;
  v_period_end date;
  v_min constant integer := 1000; -- ₦1,000
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

  -- The eligible set is the single source of truth for what this payout pays.
  -- Concurrency is settled by the partial unique index on payout_items rather
  -- than by a lock here: two simultaneous requests both compute the same
  -- revenue, and exactly one of them wins the claim insert below. Taking a lock
  -- on the orders would serialise the two requests without preventing the
  -- second from simply recomputing an empty set.
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
    organizer_id, period_start, period_end, revenue, platform_fee, amount, status
  )
  values (
    v_uid, coalesce(v_period_start, current_date), coalesce(v_period_end, current_date),
    v_revenue, v_fee, v_amount, 'pending'
  )
  returning id into v_payout_id;

  -- Claim the orders this payout covers, so the same revenue cannot be
  -- requested a second time before the first payout is resolved.
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
      -- Lost the race against a concurrent request; the payout row just
      -- created is rolled back with the raised exception, so nothing dangles.
      raise exception
        'A payout for this revenue is already being processed'
        using errcode = '23505';
  end;

  perform public.write_audit_log(
    'payout_requested', 'payout', v_payout_id::text,
    jsonb_build_object('revenue', v_revenue, 'platform_fee', v_fee, 'amount', v_amount)
  );

  return v_payout_id;
end;
$$;

revoke execute on function public.request_payout() from public, anon;
grant execute on function public.request_payout() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. transition_payout — the audited state machine
-- ---------------------------------------------------------------------------
-- The admin UI already used a linear progression (pending -> processing ->
-- approved -> paid, with a rejection from any unresolved state). Encoding it in
-- the database is what stops a payout from skipping approval, going backwards,
-- or leaving the terminal state once money has moved.
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

  -- Repeating a step that already happened is a no-op rather than an error, so
  -- a double-click or a retried request cannot fail an admin's workflow.
  if v_from = p_to_status then
    return v_from;
  end if;

  v_allowed := case v_from
    when 'pending'    then p_to_status in ('processing', 'rejected')
    when 'processing' then p_to_status in ('approved', 'rejected')
    when 'approved'   then p_to_status = 'rejected'
    else false
  end;

  -- 'paid' is deliberately absent from every branch: reaching the terminal
  -- state requires a provider transfer code via mark_payout_paid(), which is
  -- service-role only.
  if not v_allowed then
    raise exception 'Cannot move a payout from % to %', v_from, p_to_status
      using errcode = '22023';
  end if;

  update public.payouts set status = p_to_status, updated_at = now() where id = p_payout_id;

  -- A rejected payout releases its orders, so the revenue it was covering
  -- becomes claimable again instead of being stranded.
  if p_to_status = 'rejected' then
    update public.payout_items set released = true where payout_id = p_payout_id;
  end if;

  perform public.write_audit_log(
    'payout_status', 'payout', p_payout_id::text,
    jsonb_build_object('from', v_from, 'to', p_to_status)
  );

  return p_to_status;
end;
$$;

revoke execute on function public.transition_payout(bigint, text) from public, anon;
grant execute on function public.transition_payout(bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. mark_payout_paid — paid means a transfer happened
-- ---------------------------------------------------------------------------
-- service_role only, and only from 'approved'. The caller must pass the
-- transfer code Paystack returned; that code is stored, which is what lets a
-- later question ("did this host actually get paid?") be answered from the
-- database instead of from someone's memory.
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
  if v_from <> 'approved' then
    raise exception 'A payout must be approved before it can be marked paid (currently %)'
      , v_from using errcode = '22023';
  end if;

  update public.payouts
     set status = 'paid',
         paid_at = now(),
         transfer_code = left(btrim(p_transfer_code), 120),
         transfer_reference = left(coalesce(p_transfer_reference, ''), 120),
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
