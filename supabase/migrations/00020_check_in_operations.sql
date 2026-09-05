-- ===========================================================================
-- Phase 2 — Fast QR check-in (IDEMPOTENT).
--
-- Reuses the existing orders.check_in_status / checked_in_at lifecycle — no new
-- ticket tables, no duplicate status systems. Adds a minimal audit trail (who
-- checked the guest in + which gate) and one SECURITY DEFINER function,
-- staff_check_in(), that performs an ATOMIC, re-validated check-in inside a
-- single transaction:
--
--   select ... for update  (row lock)
--   -> order exists?                else 'invalid'
--   -> order belongs to p_party_id? else 'wrong_event'
--   -> not refunded?                else 'refunded'
--   -> payment confirmed?           else 'not_confirmed'
--   -> not already checked in?      else 'already_checked_in'
--   -> set check_in_status = 'checked_in'  (+ who / gate)
--
-- Two door devices scanning the same ticket in parallel can never both succeed:
-- the second writer waits on the row lock, then re-evaluates the guard against
-- the freshly-committed row and returns 'already_checked_in'.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Minimal columns: who checked the guest in + which gate (nullable).
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists checked_in_by uuid references auth.users (id) on delete set null,
  add column if not exists checked_in_gate text;

-- Order refs are the QR payload + manual lookup key; ensure a fast lookup path.
create index if not exists orders_order_ref_idx on public.orders (order_ref);

-- ---------------------------------------------------------------------------
-- 2. Atomic, server-validated check-in.
-- ---------------------------------------------------------------------------
create or replace function public.staff_check_in(p_party_id bigint, p_order_ref text, p_gate text default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_party public.parties%rowtype;
  v_order public.orders%rowtype;
  v_type_name text;
  v_at timestamptz := now();
begin
  -- Authorization: event owner OR staff allowed to run the door (finance /
  -- admin / super_admin — the exact set allowed by the existing check-in RLS).
  if v_uid is null then
    return jsonb_build_object('code', 'unauthorized');
  end if;

  select * into v_party from public.parties where id = p_party_id;
  if not found then
    return jsonb_build_object('code', 'invalid');
  end if;

  if v_party.created_by <> v_uid
     and not public.has_role(array['finance', 'admin', 'super_admin']) then
    return jsonb_build_object('code', 'unauthorized');
  end if;

  -- Event eligibility.
  if v_party.status <> 'approved' then
    return jsonb_build_object('code', 'event_not_live');
  end if;
  if v_party.cancelled_at is not null then
    return jsonb_build_object('code', 'cancelled_event');
  end if;

  -- The whole decision is atomic: lock the order row, then re-validate.
  select * into v_order from public.orders where order_ref = p_order_ref for update;
  if not found then
    return jsonb_build_object('code', 'invalid');
  end if;

  if v_order.party_id <> p_party_id then
    return jsonb_build_object('code', 'wrong_event');
  end if;
  if v_order.refund_status <> 'none'
     or v_order.refunded_at is not null
     or v_order.cancellation_reason is not null then
    return jsonb_build_object('code', 'refunded');
  end if;
  if v_order.payment_status <> 'confirmed' then
    return jsonb_build_object(
      'code', 'not_confirmed',
      'payment', v_order.payment_status,
      'message', 'Ticket payment is not confirmed.'
    );
  end if;
  if v_order.check_in_status = 'checked_in' then
    return jsonb_build_object(
      'code', 'already_checked_in',
      'checked_in_at', v_order.checked_in_at,
      'gate', v_order.checked_in_gate,
      'checked_in_by', v_order.checked_in_by
    );
  end if;

  update public.orders
     set check_in_status = 'checked_in',
         checked_in_at = v_at,
         checked_in_by = v_uid,
         checked_in_gate = p_gate
   where id = v_order.id;

  select tt.name into v_type_name
    from public.ticket_types tt
   where tt.id = v_order.ticket_type_id;

  perform public.write_audit_log(
    'ticket_checked_in',
    'order',
    v_order.id::text,
    jsonb_build_object('party_id', p_party_id, 'order_ref', v_order.order_ref, 'gate', p_gate)
  );

  return jsonb_build_object(
    'code', 'ok',
    'order_id', v_order.id,
    'order_ref', v_order.order_ref,
    'party_id', p_party_id,
    'guest_email', v_order.customer_email,
    'quantity', v_order.quantity,
    'ticket_type', coalesce(v_type_name, 'General Entry'),
    'checked_in_at', v_at,
    'gate', p_gate
  );
end;
$$;

-- Only signed-in users can call it; never anon / public / service clients.
revoke execute on function public.staff_check_in(bigint, text, text) from public, anon;
grant execute on function public.staff_check_in(bigint, text, text) to authenticated;