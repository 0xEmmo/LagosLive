-- ===========================================================================
-- Promo codes + guest details (Batch 25) — IDEMPOTENT / re-runnable.
--
-- Adds:
--   * public.promos            — discount codes (percent off ticket subtotal).
--     Staff manage them through the permission-gated RPCs (promos.create/
--     edit/delete, seeded in Batch 24); buyers never read the table directly —
--     checkout validates codes through the API (service role).
--   * orders.guest_name / guest_phone / promo_code / promo_discount
--     — buyer details captured at checkout. promo_code is the redeemed code
--     (shared across every line of a multi-line group), promo_discount is that
--     line's discount in naira. Line totals are stored NET of the discount so
--     the existing confirm/verify amount checks keep working unchanged.
--   * confirm_order_group() is re-created to count one promo use per confirmed
--     group. Codes are validated at checkout; a confirmation never fails over
--     promo accounting (a paid guest must stay confirmed even if a code is
--     meanwhile maxed out).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Promos table.
-- ---------------------------------------------------------------------------
create table if not exists public.promos (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$'),
  discount_percent integer not null check (discount_percent between 1 and 100),
  description text,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.promos enable row level security;

-- Staff (and super_admin / service role) read promos. Buyers never need the
-- raw table: checkout validates codes through the API.
drop policy if exists "staff read promos" on public.promos;
create policy "staff read promos"
  on public.promos for select
  using (public.check_permission('promos.view'));

drop policy if exists "staff create promos" on public.promos;
create policy "staff create promos"
  on public.promos for insert
  with check (public.check_permission('promos.create'));

drop policy if exists "staff update promos" on public.promos;
create policy "staff update promos"
  on public.promos for update
  using (public.check_permission('promos.edit'));

drop policy if exists "staff delete promos" on public.promos;
create policy "staff delete promos"
  on public.promos for delete
  using (public.check_permission('promos.delete'));

create index if not exists promos_active_idx on public.promos (active);

-- ---------------------------------------------------------------------------
-- 2. Orders — buyer details + promo accounting.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists guest_name text,
  add column if not exists guest_phone text,
  add column if not exists promo_code text,
  add column if not exists promo_discount integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_promo_discount_non_negative'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_promo_discount_non_negative check (promo_discount is null or promo_discount >= 0);
  end if;
end;
$$;

create index if not exists orders_promo_code_idx on public.orders (promo_code);

-- ---------------------------------------------------------------------------
-- 3. confirm_order_group() — same behavior as Batch 23, plus one promo use per
--    confirmed group so single-use/exhaustible codes stay honest. A payment is
--    NEVER blocked here: the code was validated at checkout, and if the promo
--    was meanwhile exhausted the guest still gets their (already purchased)
--    tickets.
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

  update public.promos
     set uses = uses + 1,
         updated_at = now()
   where code = (
     select promo_code
       from public.orders
      where payment_ref = p_payment_ref
        and promo_code is not null
      limit 1
   )
     and exists (
       select 1
         from public.orders
        where payment_ref = p_payment_ref
          and promo_code is not null
     );
end;
$$;

revoke execute on function public.confirm_order_group(text) from public, anon, authenticated;
grant execute on function public.confirm_order_group(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Admin promo RPCs — permission-gated, audit-logged. The UI only ever talks
--    to these, so promo rows can never be written by a raw insert.
-- ---------------------------------------------------------------------------
create or replace function public.create_promo(
  p_code text,
  p_discount_percent integer,
  p_description text default null,
  p_max_uses integer default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.check_permission('promos.create') then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  if p_discount_percent is null or p_discount_percent < 1 or p_discount_percent > 100 then
    raise exception 'Discount must be between 1 and 100 percent' using errcode = 'P0001';
  end if;
  if p_max_uses is not null and p_max_uses < 1 then
    raise exception 'Maximum uses must be at least 1' using errcode = 'P0001';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_starts_at > p_ends_at then
    raise exception 'Start time must be before end time' using errcode = 'P0001';
  end if;

  insert into public.promos (code, discount_percent, description, max_uses, starts_at, ends_at)
  values (
    upper(trim(p_code)),
    p_discount_percent,
    nullif(trim(coalesce(p_description, '')), ''),
    p_max_uses,
    p_starts_at,
    p_ends_at
  )
  returning id into v_id;

  perform public.write_audit_log('promo_created', 'promo', v_id::text,
    jsonb_build_object('code', upper(trim(p_code)), 'discount_percent', p_discount_percent,
                       'max_uses', p_max_uses, 'starts_at', p_starts_at, 'ends_at', p_ends_at));

  return v_id;
end;
$$;

create or replace function public.update_promo(
  p_promo_id uuid,
  p_code text,
  p_discount_percent integer,
  p_description text,
  p_max_uses integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_active boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_prev record;
begin
  if not public.check_permission('promos.edit') then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  if p_discount_percent is null or p_discount_percent < 1 or p_discount_percent > 100 then
    raise exception 'Discount must be between 1 and 100 percent' using errcode = 'P0001';
  end if;
  if p_max_uses is not null and p_max_uses < 1 then
    raise exception 'Maximum uses must be at least 1' using errcode = 'P0001';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_starts_at > p_ends_at then
    raise exception 'Start time must be before end time' using errcode = 'P0001';
  end if;

  select * into v_prev from public.promos where id = p_promo_id;
  if not found then
    raise exception 'Promo not found' using errcode = 'P0001';
  end if;

  update public.promos
     set code = upper(trim(p_code)),
         discount_percent = p_discount_percent,
         description = nullif(trim(coalesce(p_description, '')), ''),
         max_uses = p_max_uses,
         starts_at = p_starts_at,
         ends_at = p_ends_at,
         active = p_active,
         updated_at = now()
   where id = p_promo_id;

  perform public.write_audit_log('promo_updated', 'promo', p_promo_id::text,
    jsonb_build_object('code', upper(trim(p_code)), 'discount_percent', p_discount_percent,
                       'max_uses', p_max_uses, 'active', p_active, 'starts_at', p_starts_at, 'ends_at', p_ends_at,
                       'previous', jsonb_build_object('code', v_prev.code, 'discount_percent', v_prev.discount_percent)));
end;
$$;

create or replace function public.delete_promo(p_promo_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_prev record;
begin
  if not public.check_permission('promos.delete') then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  select * into v_prev from public.promos where id = p_promo_id;
  if not found then
    raise exception 'Promo not found' using errcode = 'P0001';
  end if;

  delete from public.promos where id = p_promo_id;

  perform public.write_audit_log('promo_deleted', 'promo', p_promo_id::text,
    jsonb_build_object('code', v_prev.code, 'discount_percent', v_prev.discount_percent));
end;
$$;

revoke all on function public.create_promo(text, integer, text, integer, timestamptz, timestamptz) from public, anon;
revoke all on function public.update_promo(uuid, text, integer, text, integer, timestamptz, timestamptz, boolean) from public, anon;
revoke all on function public.delete_promo(uuid) from public, anon;
grant execute on function public.create_promo(text, integer, text, integer, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.update_promo(uuid, text, integer, text, integer, timestamptz, timestamptz, boolean) to authenticated, service_role;
grant execute on function public.delete_promo(uuid) to authenticated, service_role;