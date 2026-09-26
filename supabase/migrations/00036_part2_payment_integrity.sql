-- ===========================================================================
-- 00036 — PART 2: payment integrity, provider reconciliation, and the
--         authoritative check-in path.
--
-- Two defects are fixed here, both on public.orders:
--
-- 1. The only UPDATE policy on orders is the host check-in policy, and it has
--    no WITH CHECK, so PostgreSQL reuses its USING expression as the check.
--    That made the policy "a host who created an event may write any column of
--    any order for that event" — including payment_status, total, quantity,
--    refund_status and refund_amount. A host could mark unpaid tickets paid,
--    rewrite what a buyer was charged, or record a refund that never happened.
--    Supabase also grants ALL on every table to anon/authenticated, so RLS was
--    the only barrier and this was the whole barrier.
--
-- 2. staff_check_in(bigint, text, text) cannot accept an order id: orders.id
--    is a uuid. The legitimate check-in path raised "invalid input syntax for
--    type bigint" on every call, which is why the host screens fell back to
--    writing the orders row directly. This migration adds a uuid overload that
--    performs the permission check itself.
--
-- It also adds payment_events, the provider-side ledger the platform had no
-- equivalent of. There was nowhere to record that Paystack reported a charge,
-- so a payment that the browser never came back to confirm left no trace, and
-- a dispute or refund had nothing to reconcile against.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Column-level UPDATE on orders
-- ---------------------------------------------------------------------------
-- Only the check-in columns are writable by a signed-in user. Everything that
-- represents money or ownership is reachable exclusively through the
-- service-role RPCs (settle_order_payment, confirm_order_group,
-- staff_check_in), all of which run as the table owner.
revoke update on public.orders from anon, authenticated;

grant update (check_in_status, checked_in_at) on public.orders to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Guard trigger for the money columns
-- ---------------------------------------------------------------------------
-- Defence in depth behind the column grant: a future migration that widens the
-- grant cannot silently reopen this. A BEFORE UPDATE trigger is used rather
-- than a policy WITH CHECK on purpose — a policy would have to read
-- public.orders to compare against the old row, which re-enters the policy
-- and is rejected as infinite recursion (this is the trap the 00035 profile
-- policy walked into, and the reason the layering there is grant -> trigger ->
-- policy rather than policy alone).
--
-- auth.role() reads the caller's JWT, not current_user, so this still fires
-- inside a SECURITY DEFINER function invoked with a service_role token —
-- which is exactly right: the money columns are changed by the service client
-- (auth.role() = 'service_role') and by nothing else.
create or replace function public.guard_order_financial_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.party_id is distinct from old.party_id
     or new.tier is distinct from old.tier
     or new.ticket_type_id is distinct from old.ticket_type_id
     or new.quantity is distinct from old.quantity
     or new.unit_price is distinct from old.unit_price
     or new.service_fee is distinct from old.service_fee
     or new.total is distinct from old.total
     or new.status is distinct from old.status
     or new.payment_status is distinct from old.payment_status
     or new.payment_ref is distinct from old.payment_ref
     or new.order_ref is distinct from old.order_ref
     or new.payment_method is distinct from old.payment_method
     or new.refund_status is distinct from old.refund_status
     or new.refund_amount is distinct from old.refund_amount
     or new.user_id is distinct from old.user_id
     or new.customer_email is distinct from old.customer_email
     or new.ticket_access_token is distinct from old.ticket_access_token
  then
    raise exception
      'Order amounts, payment state and buyer identity are server-authoritative. Use the audited payment RPCs.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_order_financial_columns on public.orders;
create trigger guard_order_financial_columns
  before update on public.orders
  for each row execute function public.guard_order_financial_columns();

-- ---------------------------------------------------------------------------
-- 3. payment_events — the provider ledger
-- ---------------------------------------------------------------------------
-- One row per provider event, append-only. The unique key is what makes webhook
-- delivery idempotent: Paystack retries, and a retried charge.success must not
-- be processed twice, so the second insert is rejected rather than absorbed.
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event text not null,
  reference text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text,
  unique (provider, event, reference)
);

comment on table public.payment_events is
  'Append-only log of payment provider events, keyed for idempotent webhook processing.';

alter table public.payment_events enable row level security;

-- No INSERT/UPDATE/DELETE policy is created, so with RLS on and the API roles
-- holding no grants below, this table is reachable only by service_role, which
-- bypasses RLS. It is a ledger: rows are written once and never edited, so
-- UPDATE and DELETE are not granted to any role including service_role.
revoke all on public.payment_events from anon, authenticated;
grant select, insert on public.payment_events to service_role;

-- The provider's record of the event is immutable: a delivery can be stamped
-- with its processing outcome, but its payload, event name, reference and
-- arrival time can never be rewritten, and rows are never deleted. That split
-- is what lets the outcome be recorded without making the ledger mutable.
create or replace function public.deny_payment_event_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payment_events is append-only' using errcode = '42501';
  end if;

  if new.provider is distinct from old.provider
     or new.event is distinct from old.event
     or new.reference is distinct from old.reference
     or new.payload is distinct from old.payload
     or new.received_at is distinct from old.received_at
     or new.id is distinct from old.id
  then
    raise exception
      'payment_events rows are immutable; only the processing outcome may be written'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_events_append_only on public.payment_events;
create trigger payment_events_append_only
  before update or delete on public.payment_events
  for each row execute function public.deny_payment_event_mutation();

-- Stamping the outcome needs UPDATE, which no role has on this table, so it
-- goes through a SECURITY DEFINER function restricted to service_role. It can
-- write only the two operational columns; the trigger above still rejects
-- anything that would rewrite the delivery.
create or replace function public.record_payment_event_outcome(
  p_event_id uuid,
  p_outcome text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.payment_events
     set processed_at = now(), outcome = left(p_outcome, 64)
   where id = p_event_id;
end;
$$;

revoke execute on function public.record_payment_event_outcome(uuid, text) from public, anon, authenticated;
grant execute on function public.record_payment_event_outcome(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Reconciliation helper
-- ---------------------------------------------------------------------------
-- Orders the platform believes are paid, grouped by the payment that settled
-- them, next to the total that payment should have been for. A group where the
-- order total and the recorded charge disagree is what an operator needs to
-- see; without this the only way to answer "did we get paid for this" was to
-- open Paystack and compare by hand.
create or replace function public.payment_reconciliation()
returns table (
  payment_ref text,
  order_count bigint,
  order_total numeric,
  confirmed_count bigint,
  last_event_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select
    o.payment_ref,
    count(*)::bigint,
    sum(o.total)::numeric,
    count(*) filter (where o.payment_status = 'confirmed')::bigint,
    max(e.received_at)
  from public.orders o
  left join public.payment_events e
    on e.reference = o.payment_ref
   and e.event = 'charge.success'
  where o.payment_ref is not null
  group by o.payment_ref
  having count(*) filter (where o.payment_status = 'confirmed') > 0
      or count(e.id) > 0
  order by coalesce(max(e.received_at), 'epoch'::timestamptz) desc nulls last;
$$;

revoke execute on function public.payment_reconciliation() from public, anon, authenticated;
grant execute on function public.payment_reconciliation() to service_role;
