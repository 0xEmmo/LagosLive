-- ===========================================================================
-- 00041 - Refund ledger and server-authoritative refunds
-- ===========================================================================
-- Before this migration a refund was three unrelated things that happened to
-- share a column: an HTTP call to Paystack, a hopeful read of the response
-- text, and a direct UPDATE of orders.refund_status. That had three failure
-- modes, all of them expensive:
--
--   1. `paystack.message.includes('refund')` was treated as proof of success.
--      Paystack's own copy for a rejected refund contains the word "refund",
--      so a refusal could be recorded as money returned to the guest.
--   2. Nothing was written before the provider call. A timeout, a 500, or a
--      process crash mid-request left no record that a refund had been
--      attempted, so the same order could be refunded again on retry.
--   3. Inventory was never returned. spots_left was decremented on order
--      INSERT and ticket_types.sold on confirmation; a cancelled event left
--      both numbers permanently consumed.
--
-- The fix is a ledger. A refund row is created and committed BEFORE Paystack
-- is called, transitions to `submitted` before the call, and only
-- complete_order_refund() may mark it `refunded` and release inventory.
--
-- On Paystack idempotency, deliberately: POST /refund has no documented
-- idempotency key, so no client-supplied key can make the provider call
-- itself safe to replay. The guarantee therefore comes from our side of the
-- boundary. A row in `submitted` means "we called the provider and do not
-- know the answer yet", and that state is never retried automatically -
-- it waits for a human to reconcile against the Paystack dashboard. Guessing
-- would risk paying the guest twice, which is the one failure this whole
-- migration exists to prevent.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. public.refunds - the ledger
-- ---------------------------------------------------------------------------
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null references public.orders(id) on delete cascade,
  party_id bigint not null references public.parties(id) on delete cascade,

  -- The approved amount. Never derived from a client request at call time.
  amount integer not null check (amount > 0),
  currency text not null default 'NGN',

  status text not null default 'requested'
    check (status in (
      'requested',   -- row exists, provider not called yet
      'submitted',   -- provider called, outcome unknown -> reconcile by hand
      'processing',  -- provider confirmed it is working on it
      'refunded',    -- money returned. Terminal.
      'failed',      -- provider definitively refused. Retryable.
      'rejected',    -- we declined to refund. Terminal, no money moved.
      'reversed'     -- provider took the refund back. Needs a human.
    )),

  reason text,
  idempotency_key text not null,

  provider text not null default 'paystack',
  provider_refund_id text,
  provider_status text,
  provider_message text,

  requested_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,

  -- The one piece of bookkeeping that must never run twice. Set in the same
  -- statement that flips the row to `refunded`, and checked before the
  -- release, so a retry of complete_order_refund() cannot double-restock.
  inventory_released_at timestamptz,

  submitted_at timestamptz,
  completed_at timestamptz,
  reversed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.refunds is
  'Append-in-place ledger of every refund attempt. One row is created and committed before Paystack is called, so a crash mid-request leaves evidence instead of a silent gap. inventory_released_at makes restocking exactly-once.';

comment on column public.refunds.inventory_released_at is
  'Set in the same transaction that marks the refund refunded. Non-null means inventory for this row has already been returned to the event; never release a second time.';

comment on column public.refunds.idempotency_key is
  'Caller-supplied key for staff refunds, derived deterministically for event cancellations. Replaying a request with the same key returns the original row instead of creating a second one.';

-- A given order may have several historical refunds (one failed attempt, then a
-- successful retry) but never two in flight at once. This index - not
-- application logic - is what makes a concurrent double-refund impossible.
create unique index if not exists refunds_one_open_per_order_idx
  on public.refunds (order_id)
  where status in ('requested', 'submitted', 'processing');

create unique index if not exists refunds_idempotency_key_idx
  on public.refunds (idempotency_key);

-- A provider refund id identifies exactly one refund of ours. This is the
-- backstop that stops a replayed webhook from booking the same provider
-- refund against a second order.
create unique index if not exists refunds_provider_refund_idx
  on public.refunds (provider, provider_refund_id)
  where provider_refund_id is not null;

create index if not exists refunds_order_idx
  on public.refunds (order_id, created_at desc);

create index if not exists refunds_party_idx
  on public.refunds (party_id, created_at desc);

-- Anything not terminal, for the finance reconciliation queue.
create index if not exists refunds_open_idx
  on public.refunds (status, created_at)
  where status in ('requested', 'submitted', 'processing');

create index if not exists refunds_created_idx
  on public.refunds (created_at desc);

alter table public.refunds enable row level security;

-- No policy on purpose. Refunds are money movement: the only way to read or
-- write one is through the service-role functions below, which authorize an
-- explicit actor. A host can see their own refund on their order (denormalized
-- into orders.refund_status) without ever touching this table.
revoke all on public.refunds from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. release_order_inventory - the single place inventory comes back
-- ---------------------------------------------------------------------------
-- Two different triggers consumed the two numbers, which is why the old
-- cancellation path could not undo them consistently:
--
--   parties.spots_left   - decremented on order INSERT (00005)
--   ticket_types.sold    - incremented on order CONFIRMATION (00025)
--
-- settle_order_payment() only restores spots_left, and that is CORRECT: a
-- pending order that is cancelled or fails was never confirmed, so `sold` was
-- never touched. A refund is the other case - the order was confirmed, so both
-- numbers were consumed and both must be returned.
create or replace function public.release_order_inventory(
  p_order_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Release quantity must be positive' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- least()/greatest() so a double call is a no-op rather than an oversell in
  -- the other direction. The refunds table is the real exactly-once guard;
  -- these clamps are the second line of defence.
  update public.parties
     set spots_left = least(capacity, spots_left + p_quantity)
   where id = v_order.party_id;

  if v_order.ticket_type_id is not null then
    update public.ticket_types
       set sold = greatest(0, sold - p_quantity),
           updated_at = now()
     where id = v_order.ticket_type_id;
  end if;
end;
$$;

revoke execute on function public.release_order_inventory(uuid, integer) from public, anon, authenticated;
grant execute on function public.release_order_inventory(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. create_order_refund - staff-initiated, amount-bounded, idempotent
-- ---------------------------------------------------------------------------
-- Authorization happens here, in the database, against an explicit actor
-- supplied by the service-role caller. Using user_has_permission_unchecked()
-- rather than user_has_permission() is deliberate: the latter resolves
-- auth.uid(), which is null on a service-role connection, so it would reject
-- every legitimate staff refund. The actor is recorded in the ledger either
-- way, so the audit trail does not depend on the transport.
create or replace function public.create_order_refund(
  p_order_id uuid,
  p_amount integer,
  p_reason text,
  p_actor uuid,
  p_idempotency_key text default null
)
returns public.refunds
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_refund public.refunds%rowtype;
  v_actor uuid := coalesce(p_actor, auth.uid());
  v_key text;
  v_committed integer;
  v_replay public.refunds%rowtype;
begin
  perform public.assert_service_role();

  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.user_has_permission_unchecked(v_actor, 'transactions.refund') then
    raise exception 'Forbidden: refunds require finance permission'
      using errcode = '42501';
  end if;

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then
    v_key := 'refund:' || gen_random_uuid()::text;
  end if;

  -- Replay: the caller is retrying, not issuing a new refund.
  select * into v_refund from public.refunds where idempotency_key = v_key;
  if found then
    return v_refund;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund amount must be a positive number of naira'
      using errcode = 'P0001';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A refund needs a reason' using errcode = 'P0001';
  end if;

  -- FOR UPDATE serialises two concurrent refunds of the same order so the
  -- committed total below cannot be read stale by both.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.payment_status <> 'confirmed' then
    raise exception 'Only a confirmed order can be refunded' using errcode = 'P0001';
  end if;

  -- Counts refunded AND in-flight money, so a partial refund already in
  -- progress cannot be topped up past the order total by a second request.
  select coalesce(sum(amount), 0)::integer
    into v_committed
    from public.refunds
   where order_id = p_order_id
     and status in ('refunded', 'requested', 'submitted', 'processing');

  if v_committed + p_amount > v_order.total then
    raise exception
      'Refund exceeds the amount still refundable on this order'
      using errcode = 'P0001';
  end if;

  insert into public.refunds (
    order_id, party_id, amount, reason, idempotency_key, requested_by, status
  )
  values (
    v_order.id, v_order.party_id, p_amount, btrim(p_reason), v_key, v_actor, 'requested'
  )
  returning * into v_refund;

  update public.orders
     set refund_status = 'requested',
         refund_amount = v_committed + p_amount
   where id = v_order.id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details, status)
  values (
    v_actor, 'refund_requested', 'order', v_order.id::text,
    jsonb_build_object(
      'refund_id', v_refund.id, 'amount', p_amount,
      'currency', v_refund.currency, 'reason', p_reason,
      'idempotency_key', v_key
    ),
    'success'
  );

  return v_refund;
exception
  -- Two requests raced past the sum check and the partial unique index refused
  -- the second. Two different things can land here, and they mean different
  -- things to the caller:
  --
  --  1. The same idempotency key is already in the table. That is one request
  --     being retried, so returning the original row is the correct answer.
  --
  --  2. A different key, which means a genuinely new attempt on an order that
  --     already has one in flight - a double-click, or two admins at once. The
  --     index has done its job and this must fail.
  --
  -- Case 2 must NOT quietly hand back the open row. The caller would believe it
  -- had just created a refund, then drive mark_refund_submitted() and a
  -- Paystack call against a refund that was already submitted - which is how
  -- one guest gets paid back twice. So it is refused, with a message worth
  -- reading instead of the driver's raw index violation.
  when unique_violation then
    select * into v_replay from public.refunds where idempotency_key = v_key;
    if found then
      return v_replay;
    end if;
    -- The errcode stays 23505 so callers can still branch on "one open refund
    -- per order" the way they branch on it for the sum check; only the human
    -- text improves.
    raise exception
      'A refund for this order is already in progress. Wait for it to resolve before issuing another.'
      using errcode = 'unique_violation';
end;
$$;

revoke execute on function public.create_order_refund(uuid, integer, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_order_refund(uuid, integer, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. mark_refund_submitted - the commit point before the provider call
-- ---------------------------------------------------------------------------
-- Called, and committed, BEFORE Paystack is contacted. After this returns the
-- row is `submitted`, and `submitted` is not a state anything retries.
create or replace function public.mark_refund_submitted(p_refund_id uuid)
returns public.refunds
language plpgsql
security definer set search_path = public
as $$
declare
  v_refund public.refunds%rowtype;
begin
  perform public.assert_service_role();

  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;

  -- Already submitted: idempotent, so a retried request does not restart it.
  if v_refund.status = 'submitted' then
    return v_refund;
  end if;

  if v_refund.status <> 'requested' then
    raise exception 'Refund is not awaiting submission' using errcode = 'P0001';
  end if;

  update public.refunds
     set status = 'submitted',
         submitted_at = now(),
         updated_at = now()
   where id = p_refund_id
   returning * into v_refund;

  update public.orders
     set refund_status = 'processing'
   where id = v_refund.order_id;

  return v_refund;
end;
$$;

revoke execute on function public.mark_refund_submitted(uuid) from public, anon, authenticated;
grant execute on function public.mark_refund_submitted(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. complete_order_refund - the only writer of `refunded`
-- ---------------------------------------------------------------------------
-- p_outcome is deliberately a closed set, and 'unknown' is one of its values:
--
--   'refunded'  provider confirmed the money went back. Releases inventory.
--   'failed'    provider definitively refused. No money moved, retryable.
--   'unknown'   timeout, 5xx, unparseable body. Stays in flight for a human.
--
-- There is no 'maybe refunded' path that marks the order refunded, because we
-- cannot tell those apart and guessing wrong pays a guest twice.
create or replace function public.complete_order_refund(
  p_refund_id uuid,
  p_outcome text,
  p_provider_refund_id text default null,
  p_provider_status text default null,
  p_failure_reason text default null
)
returns public.refunds
language plpgsql
security definer set search_path = public
as $$
declare
  v_refund public.refunds%rowtype;
  v_order public.orders%rowtype;
  v_needs_release boolean;
  v_refunded_total integer;
begin
  perform public.assert_service_role();

  if p_outcome not in ('refunded', 'failed', 'unknown') then
    raise exception 'Invalid refund outcome' using errcode = 'P0001';
  end if;

  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;

  -- Replayed completion. `refunded` is terminal and already released
  -- inventory, so return it untouched rather than restocking a second time.
  if v_refund.status = 'refunded' then
    return v_refund;
  end if;

  if v_refund.status not in ('requested', 'submitted', 'processing') then
    raise exception 'Refund cannot be completed from this state' using errcode = 'P0001';
  end if;

  if p_outcome = 'unknown' then
    -- Nothing is decided. The row stays in flight, which is precisely what
    -- tells finance this needs a human rather than a retry.
    update public.refunds
       set status = 'processing',
           provider_status = nullif(btrim(coalesce(p_provider_status, '')), ''),
           provider_message = nullif(btrim(coalesce(p_failure_reason, '')), ''),
           updated_at = now()
     where id = p_refund_id
     returning * into v_refund;

    return v_refund;
  end if;

  if p_outcome = 'failed' then
    update public.refunds
       set status = 'failed',
           provider_status = nullif(btrim(coalesce(p_provider_status, '')), ''),
           provider_message = nullif(btrim(coalesce(p_failure_reason, '')), ''),
           completed_at = now(),
           updated_at = now()
     where id = p_refund_id
     returning * into v_refund;

    update public.orders
       set refund_status = 'failed',
           refunded_at = null
     where id = v_refund.order_id;

    insert into public.audit_logs (actor_id, action, target_type, target_id, details, status)
    values (
      v_refund.requested_by, 'refund_failed', 'order', v_refund.order_id::text,
      jsonb_build_object(
        'refund_id', v_refund.id, 'amount', v_refund.amount,
        'provider_status', p_provider_status, 'reason', p_failure_reason
      ),
      'failed'
    );

    return v_refund;
  end if;

  -- p_outcome = 'refunded'
  -- Without a provider id we cannot reconcile this later, and a refund we
  -- cannot find in the Paystack dashboard is the worst outcome available.
  if btrim(coalesce(p_provider_refund_id, '')) = '' then
    raise exception 'A successful refund requires a provider refund id'
      using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = v_refund.order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- Read before the write: this row is locked, so the flag can only be set by
  -- the transition happening exactly once.
  v_needs_release := v_refund.inventory_released_at is null;

  update public.refunds
     set status = 'refunded',
         provider_refund_id = btrim(p_provider_refund_id),
         provider_status = nullif(btrim(coalesce(p_provider_status, '')), ''),
         completed_at = now(),
         inventory_released_at = now(),
         updated_at = now()
   where id = p_refund_id
   returning * into v_refund;

  if v_needs_release then
    perform public.release_order_inventory(v_refund.order_id, v_order.quantity);
  end if;

  select coalesce(sum(amount), 0)::integer
    into v_refunded_total
    from public.refunds
   where order_id = v_refund.order_id
     and status = 'refunded';

  update public.orders
     set refund_status = 'refunded',
         refund_amount = v_refunded_total,
         refunded_at = now()
   where id = v_refund.order_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details, status)
  values (
    v_refund.requested_by, 'refund_completed', 'order', v_refund.order_id::text,
    jsonb_build_object(
      'refund_id', v_refund.id, 'amount', v_refund.amount,
      'provider_refund_id', btrim(p_provider_refund_id),
      'order_quantity', v_order.quantity, 'inventory_released', v_needs_release
    ),
    'success'
  );

  return v_refund;
end;
$$;

revoke execute on function public.complete_order_refund(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_order_refund(uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. begin_event_cancellation - stop the doors, then queue the refunds
-- ---------------------------------------------------------------------------
-- Ordering is the whole point. The old route refunded orders one at a time and
-- set parties.cancelled_at at the very end, so for the length of the refund
-- loop a sold-out, already-cancelled event was still accepting new orders.
--
-- This function is one transaction:
--   1. take the party row lock
--   2. set cancelled_at FIRST - enforce_order_availability() then rejects
--      every new order for this event, with no window in between
--   3. create a refund row per confirmed order, idempotently
--
-- It returns the work list. Paystack is still called by the server afterwards,
-- one row at a time, because a network call does not belong in a transaction
-- that holds a lock on the event.
create or replace function public.begin_event_cancellation(
  p_party_id bigint,
  p_reason text,
  p_actor uuid
)
returns setof jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor uuid := coalesce(p_actor, auth.uid());
  v_party public.parties%rowtype;
  v_order public.orders%rowtype;
  v_refund public.refunds%rowtype;
  v_locked integer;
  v_remaining integer;
  v_key text;
begin
  perform public.assert_service_role();

  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A cancellation reason is required' using errcode = 'P0001';
  end if;

  select * into v_party from public.parties where id = p_party_id for update;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  -- A host may cancel their own event. Anyone else needs the platform-wide
  -- moderation permission. The old route hardcoded 'support' into this
  -- decision, which is how a support agent ended up able to cancel live
  -- events and move money.
  if v_party.created_by is null or v_party.created_by <> v_actor then
    if not public.user_has_permission_unchecked(v_actor, 'events.cancel') then
      raise exception 'Only the host of this event can cancel it'
        using errcode = '42501';
    end if;
  end if;

  -- Idempotent: cancelling twice does not move cancelled_at forward, so the
  -- event keeps its original cancellation time.
  update public.parties
     set cancelled_at = coalesce(cancelled_at, now()),
         cancellation_reason = coalesce(cancellation_reason, btrim(p_reason))
   where id = p_party_id;

  for v_order in
    select *
      from public.orders
     where party_id = p_party_id
       and payment_status = 'confirmed'
     order by id
     for update
  loop
    select coalesce(sum(amount), 0)::integer
      into v_locked
      from public.refunds
     where order_id = v_order.id
       and status in ('refunded', 'requested', 'submitted', 'processing');

    v_remaining := v_order.total - v_locked;

    if v_remaining > 0 then
      -- Deterministic per event+order, so a retried cancellation re-attaches
      -- to the existing row instead of queuing the guest a second refund.
      v_key := 'cancel:' || p_party_id::text || ':' || v_order.id::text;

      select * into v_refund from public.refunds where idempotency_key = v_key;

      if not found then
        insert into public.refunds (
          order_id, party_id, amount, reason, idempotency_key, requested_by, status
        )
        values (
          v_order.id, v_order.party_id, v_remaining,
          'Event cancelled: ' || btrim(p_reason), v_key, v_actor, 'requested'
        )
        returning * into v_refund;

        update public.orders
           set refund_status = 'requested',
               refund_amount = v_locked + v_remaining,
               cancellation_reason = btrim(p_reason)
         where id = v_order.id;
      end if;
    else
      v_refund := null;
    end if;

    return next jsonb_build_object(
      'order_id', v_order.id,
      'order_ref', v_order.order_ref,
      'refund_id', v_refund.id,
      'amount', v_remaining,
      'quantity', v_order.quantity,
      'customer_email', v_order.customer_email,
      'guest_name', v_order.guest_name,
      'needs_refund', v_refund.id is not null
    );
  end loop;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details, status)
  values (
    v_actor, 'event_cancellation_started', 'party', p_party_id::text,
    jsonb_build_object('reason', btrim(p_reason)), 'success'
  );

  return;
end;
$$;

revoke execute on function public.begin_event_cancellation(bigint, text, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_event_cancellation(bigint, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. record_refund_decision - the only hand-settable refund states
-- ---------------------------------------------------------------------------
-- Finance still needs to answer a refund request without moving money: decline
-- it, or park it as awaiting review. The admin screen used to do this by
-- writing refund_status straight onto the order, which also offered 'refunded'
-- as a button - one click, no Paystack call, and the order looked paid back
-- while the guest had none of their money.
--
-- So this function takes only the two decisions that move no money, and there
-- is deliberately no path here to 'refunded'. That state is reachable only
-- through complete_order_refund() with a provider refund id, because it is a
-- claim about Paystack rather than a decision about a person.
--
-- Neither decision touches inventory or payout_items:
--   rejected  - the guest keeps their ticket, so the host is owed the revenue
--               and the money is released for payout.
--   requested - parked pending review. Payout stays blocked while it is open.
create or replace function public.record_refund_decision(
  p_order_id uuid,
  p_decision text,
  p_reason text,
  p_actor uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor uuid := coalesce(p_actor, auth.uid());
  v_order public.orders%rowtype;
  v_refund public.refunds%rowtype;
  v_key text;
  v_refunded integer;
begin
  perform public.assert_service_role();

  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.user_has_permission_unchecked(v_actor, 'orders.refund') then
    raise exception 'Forbidden: recording a refund decision requires refund permission'
      using errcode = '42501';
  end if;

  if p_decision not in ('requested', 'rejected') then
    -- 'refunded' is not a decision anyone may make by hand. It is a fact about
    -- Paystack, and only complete_order_refund() may assert it.
    raise exception
      'A refund can only be marked refunded by completing a real Paystack refund'
      using errcode = 'P0001';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A refund decision needs a reason' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- A refund that actually moved money is a fact about the past and cannot be
  -- relabelled by hand afterwards.
  if v_order.refund_status = 'refunded' then
    raise exception 'This order has already been refunded' using errcode = 'P0001';
  end if;

  update public.orders
     set refund_status = p_decision
   where id = p_order_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details, status)
  values (
    v_actor, 'refund_' || p_decision, 'order', p_order_id::text,
    jsonb_build_object('reason', btrim(p_reason), 'previous_status', v_order.refund_status),
    'success'
  );
end;
$$;

revoke execute on function public.record_refund_decision(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_refund_decision(uuid, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. request_payout - exclude every state where money may be coming back
-- ---------------------------------------------------------------------------
-- The old predicate was `refund_status <> 'refunded'`, which meant a FAILED
-- refund and an in-flight one both paid out. A guest whose refund is queued,
-- processing, or even failed would have been paid the same money twice. Only
-- 'none' and 'rejected' (we declined, nothing is owed) release revenue.
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
     and coalesce(o.refund_status, 'none') in ('none', 'rejected')
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
       and coalesce(o.refund_status, 'none') in ('none', 'rejected')
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
-- 8. Client writes to money columns are refused
-- ---------------------------------------------------------------------------
-- orders.refund_status / refund_amount / refunded_at are a denormalized view of
-- the ledger, and the admin route used to write them straight from the request
-- body. It is the only thing that made refund state client-settable. Reads are
-- untouched - hosts and admins still read these columns for the UI.
create or replace function public.guard_order_refund_columns()
returns trigger
language plpgsql
security invoker set search_path = public
as $$
begin
  -- SECURITY INVOKER is load-bearing. current_user is only the caller's role
  -- while this function runs as the invoker. Declared SECURITY DEFINER - which
  -- is what 00039/00040 did for guard_payout_money_columns - current_user is the
  -- function owner for every request, so the comparison below is always true
  -- and the guard silently never fires.
  --
  -- As an invoker it now means exactly the right thing:
  --   direct client UPDATE   -> current_user = 'authenticated' -> refused
  --   UPDATE inside a trusted SECURITY DEFINER function (create_order_refund,
  --     complete_order_refund) -> current_user = that function's owner -> allowed
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.refund_status, 'none') <> 'none'
       or coalesce(new.refund_amount, 0) <> 0
       or new.refunded_at is not null then
      raise exception
        'Refund status and amounts are recorded by the server.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.refund_status is distinct from old.refund_status
     or new.refund_amount is distinct from old.refund_amount
     or new.refunded_at is distinct from old.refunded_at then
    raise exception
      'Refund status and amounts are recorded by the server and cannot be edited.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_guard_refund_columns on public.orders;
create trigger trg_orders_guard_refund_columns
  before insert or update on public.orders
  for each row execute function public.guard_order_refund_columns();

revoke execute on function public.guard_order_refund_columns() from public, anon, authenticated, service_role;

-- parties.cancelled_at / cancellation_reason must only move through
-- begin_event_cancellation(), which sets them before it queues any refunds.
--
-- Deliberately NOT guarded: spots_left and capacity. lib/queries.ts recomputes
-- spots_left from live reservations when a host edits their event, over the
-- browser client, so blocking it would break a working feature. Those columns
-- are instead protected by the order triggers that maintain them.
create or replace function public.guard_party_cancellation_columns()
returns trigger
language plpgsql
security invoker set search_path = public
as $$
begin
  -- See guard_order_refund_columns(): this has to be an invoker for
  -- current_user to describe who issued the statement.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.cancelled_at is distinct from old.cancelled_at
     or new.cancellation_reason is distinct from old.cancellation_reason then
    raise exception
      'Cancelling an event is done by the server so every guest is refunded.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_parties_guard_cancellation on public.parties;
create trigger trg_parties_guard_cancellation
  before update on public.parties
  for each row execute function public.guard_party_cancellation_columns();

revoke execute on function public.guard_party_cancellation_columns() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Repair guard_payout_money_columns, which never actually fired
-- ---------------------------------------------------------------------------
-- 00039 and 00040 both define this trigger function with
--
--   if current_user not in ('anon', 'authenticated') then return new; end if;
--
-- and that condition is always true when the function runs. The function was
-- declared SECURITY DEFINER, so current_user was the migration role for every
-- API request and the function returned new before comparing a single column.
-- The payout columns were protected only by `revoke update on public.payouts`,
-- which is why the existing regression test still passed.
--
-- The one-word fix is SECURITY INVOKER, which is what makes current_user mean
-- "who issued this statement" instead of "who owns this function":
--
--   direct client UPDATE              -> authenticated -> refused
--   UPDATE inside a trusted function  -> the definer's owner -> allowed
--
-- auth.role() is not usable here. It reports the role the request arrived as,
-- so a finance user calling resolve_payout_reversal() over RPC would have
-- auth.role() = 'authenticated' and be blocked from the transfer bookkeeping
-- they are entitled to perform.
--
-- It is redefined here rather than edited in place: 00039 and 00040 have
-- already been applied in deployed environments, and migrations only ever move
-- forward. The duplicated 00039 copy keeps its original text for the same
-- reason - the next migration is what makes the live schema correct.
create or replace function public.guard_payout_money_columns()
returns trigger
language plpgsql
security invoker set search_path = public
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

  return new;
end;
$$;

revoke execute on function public.guard_payout_money_columns() from public, anon, authenticated, service_role;
