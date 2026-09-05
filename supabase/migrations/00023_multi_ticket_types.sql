-- ===========================================================================
-- Multi ticket types / pricing tiers.
--
-- ticket_types was already modelled as one row per tier in Batch 5; hosts
-- just had no way to manage more than one. This migration fills in the
-- metadata that makes multiple tiers practical:
--
--   description      short blurb shown on the public page / checkout
--   sales_start_at   optional: earliest moment the tier can be bought
--   sales_end_at     optional: latest moment the tier can be bought
--   active           pause/off-sale flag (keeps sold/inventory intact)
--   sort_order       explicit ordering instead of insertion order
--
-- Orders already carry ticket_type_id + quantity, so a purchase spanning
-- several tiers is several orders rows sharing one payment_ref (one Paystack
-- charge). We add a payment_ref index so the whole group can be found in a
-- single lookup, plus confirm_order_group() that confirms every pending line
-- of a purchase atomically (all-or-nothing, like the single-order function).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend ticket_types with the new metadata.
-- ---------------------------------------------------------------------------
alter table public.ticket_types
  add column if not exists description text,
  add column if not exists sales_start_at timestamptz,
  add column if not exists sales_end_at timestamptz,
  add column if not exists active boolean not null default true,
  add column if not exists sort_order integer not null default 0;

-- A sales window must never be inverted. Both ends optional; if both are set
-- the window is only valid when start <= end.
alter table public.ticket_types
  add constraint ticket_types_sales_window_check
  check (
    sales_start_at is null
    or sales_end_at is null
    or sales_start_at <= sales_end_at
  );

-- RLS update policy already allows organizers/admins to edit their own
-- ticket_types, so the new columns are covered by existing policies — nothing
-- to relax here.

-- ---------------------------------------------------------------------------
-- 2. Fast group lookups: one purchase = several orders sharing payment_ref.
-- ---------------------------------------------------------------------------
create index if not exists orders_payment_ref_group_idx
  on public.orders (payment_ref, party_id);

-- ---------------------------------------------------------------------------
-- 3. confirm_order_group: confirms every pending order in a purchase in one
-- transaction. All-or-nothing — if any line is out of inventory the whole
-- group raises and nothing is confirmed. Idempotent per order (already
-- confirmed lines are skipped), so re-verifying a paid purchase is safe.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_order_group(p_payment_ref text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order record;
begin
  if p_payment_ref is null or p_payment_ref = '' then
    raise exception 'Payment reference required' using errcode = 'P0001';
  end if;

  for v_order in
    select id, payment_status, ticket_type_id, quantity
    from public.orders
    where payment_ref = p_payment_ref
    order by id
    for update
  loop
    if v_order.payment_status = 'confirmed' then
      continue;
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
     where id = v_order.id;
  end loop;
end;
$$;

revoke execute on function public.confirm_order_group(text) from public, anon, authenticated;
grant execute on function public.confirm_order_group(text) to service_role;