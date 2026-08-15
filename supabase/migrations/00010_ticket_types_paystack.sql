-- Real ticket types + Paystack payment tracking.
-- Backs Batch 5: events get purchasable ticket types, orders gain payment
-- state, and confirmation is exclusively a server-side (service_role) action.

-- ---------------------------------------------------------------------------
-- ticket_types: the purchasable inventory for a party. `price` is the source
-- of truth for checkout — the client is never trusted to set amounts.
-- ---------------------------------------------------------------------------
create table public.ticket_types (
  id bigint generated always as identity primary key,
  party_id bigint not null references public.parties (id) on delete cascade,
  name text not null,
  price integer not null check (price >= 0),
  quantity integer not null check (quantity >= 0),
  sold integer not null default 0 check (sold >= 0 and sold <= quantity),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ticket_types enable row level security;

create index ticket_types_party_id_idx on public.ticket_types (party_id);

-- Buyers can only see ticket types for parties they can already see
-- (approved to the public, or the organizer/admin of the event) — mirrors the
-- "approved parties are publicly readable" policy.
create policy "ticket types of visible parties are readable"
  on public.ticket_types for select
  using (
    exists (
      select 1 from public.parties
      where parties.id = ticket_types.party_id
        and (parties.status = 'approved'
             or parties.created_by = (select auth.uid())
             or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin))
    )
  );

create policy "organizers and admins insert ticket types"
  on public.ticket_types for insert
  with check (
    exists (
      select 1 from public.parties
      where parties.id = ticket_types.party_id
        and (parties.created_by = (select auth.uid())
             or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin))
    )
  );

create policy "organizers and admins update ticket types"
  on public.ticket_types for update
  using (
    exists (
      select 1 from public.parties
      where parties.id = ticket_types.party_id
        and (parties.created_by = (select auth.uid())
             or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin))
    )
  );

create policy "organizers and admins delete ticket types"
  on public.ticket_types for delete
  using (
    exists (
      select 1 from public.parties
      where parties.id = ticket_types.party_id
        and (parties.created_by = (select auth.uid())
             or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin))
    )
  );

-- ---------------------------------------------------------------------------
-- orders: payment tracking columns. ticket_type_id is nullable so legacy
-- fee-only events keep working through a safe fallback without a ticket type.
-- ---------------------------------------------------------------------------
alter table public.orders add column payment_ref text;
alter table public.orders add column payment_status text not null default 'pending'
  check (payment_status in ('pending', 'confirmed', 'failed', 'cancelled'));
alter table public.orders add column ticket_type_id bigint references public.ticket_types (id) on delete set null;

create index orders_payment_status_idx on public.orders (payment_status, user_id);

-- Existing rows were created by the old fake checkout and are genuinely
-- confirmed RSVPs — preserve them exactly, just annotate the new field.
update public.orders set payment_status = 'confirmed' where status = 'confirmed';

-- New orders must start as pending (server-verified before they become
-- confirmed); the old default silently assumed paid.
alter table public.orders alter column status set default 'pending';

-- Customers may create their own order rows, but ONLY as pending: RLS cannot
-- tell a genuine server-side confirmation from a forged one, so the "paid"
-- transition belongs exclusively to the service-role functions below.
drop policy "users create their own orders" on public.orders;
create policy "users create pending orders"
  on public.orders for insert
  with check (
    (select auth.uid()) = user_id
    and payment_status = 'pending'
    and status = 'pending'
  );

-- ---------------------------------------------------------------------------
-- Server-only payment state functions (executable by service_role only).
-- confirm_order_payment: idempotent pending -> confirmed, atomically checks
--   ticket inventory so two concurrent confirms can never oversell.
-- settle_order_payment: pending -> cancelled/failed, releases the party spots
--   that the insert trigger reserved.
-- ---------------------------------------------------------------------------
create function public.confirm_order_payment(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0001';
  end if;

  if v_order.payment_status = 'confirmed' then
    return;
  end if;

  if v_order.payment_status <> 'pending' then
    raise exception 'Order is not awaiting payment' using errcode = 'P0001';
  end if;

  if v_order.ticket_type_id is not null then
    update public.ticket_types tt
    set sold = sold + v_order.quantity,
        updated_at = now()
    where tt.id = v_order.ticket_type_id
      and (tt.quantity - tt.sold) >= v_order.quantity;

    if not found then
      raise exception 'Not enough tickets left for this ticket type' using errcode = 'P0001';
    end if;
  end if;

  update public.orders
  set payment_status = 'confirmed',
      status = 'confirmed'
  where id = p_order_id;
end;
$$;

create function public.settle_order_payment(p_order_id uuid, p_payment_status text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_payment_status not in ('cancelled', 'failed') then
    raise exception 'Invalid settlement status' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return;
  end if;

  if v_order.payment_status = 'confirmed' then
    raise exception 'Confirmed orders cannot be settled' using errcode = 'P0001';
  end if;

  if v_order.payment_status in ('cancelled', 'failed') then
    return;
  end if;

  update public.parties
  set spots_left = least(capacity, spots_left + v_order.quantity)
  where id = v_order.party_id;

  update public.orders
  set payment_status = p_payment_status,
      status = 'cancelled'
  where id = p_order_id;
end;
$$;

revoke execute on function public.confirm_order_payment(uuid) from public, anon, authenticated;
revoke execute on function public.settle_order_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid) to service_role;
grant execute on function public.settle_order_payment(uuid, text) to service_role;
