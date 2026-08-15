-- Guest checkout (Batch 8): let people buy tickets without an account.
--
-- Orders gain a nullable customer email + an unguessable ticket-access token
-- (generated server-side with crypto, never guessable) so a guest's digital
-- ticket can be delivered by email and opened through a token-gated link
-- instead of relying on a Supabase session. user_id becomes nullable for
-- guest orders; every order must still identify a human, and the paid
-- transition stays exclusively server-side (service_role).

-- ---------------------------------------------------------------------------
-- 1. user_id nullable: guest orders carry no auth.users row.
-- ---------------------------------------------------------------------------
alter table public.orders alter column user_id drop not null;

-- ---------------------------------------------------------------------------
-- 2. New columns for guest identity + secure ticket access.
-- ---------------------------------------------------------------------------
alter table public.orders add column customer_email text;
alter table public.orders add column ticket_access_token text;
alter table public.orders add column fulfilled_at timestamptz;

-- Every order must belong to either an authenticated user or a guest with a
-- valid contact email and a ticket-access token. (Authenticated orders keep
-- user_id and may also carry customer_email for receipting.)
alter table public.orders
  add constraint orders_customer_identity_check
  check (
    user_id is not null
    or (customer_email is not null and ticket_access_token is not null)
  );

-- Guests always pay with the address they supplied; server-only reads.
create index orders_guest_email_idx on public.orders (customer_email, party_id, payment_status)
  where user_id is null;

-- Unguessable per-order tokens; partial so authenticated orders (token NULL)
-- don't collide. Lookup by token is the only way a guest reaches their ticket.
create unique index orders_ticket_access_token_key
  on public.orders (ticket_access_token)
  where ticket_access_token is not null;

-- ---------------------------------------------------------------------------
-- 3. confirm_order_payment also stamps fulfilled_at (when the ticket is truly
-- issued). CREATE OR REPLACE preserves the existing service_role-only grants.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_order_payment(p_order_id uuid)
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
      status = 'confirmed',
      fulfilled_at = now()
  where id = p_order_id;
end;
$$;
