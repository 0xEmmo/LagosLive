-- ==========================================================================
-- 00048 - Customer wallet checkout and split-tender refunds
-- Wallet funds are server-reserved, Paystack is charged only the remainder,
-- and the existing order/refund ledgers remain the source of truth.
-- ==========================================================================

-- Preserve the full order value in orders.total. These fields describe tender,
-- not a reduced ticket price. paystack_paid is generated to prevent drift.
alter table public.orders
  add column if not exists wallet_paid integer not null default 0;
alter table public.orders
  add column if not exists paystack_paid integer generated always as (total - wallet_paid) stored;
alter table public.orders drop constraint if exists orders_wallet_paid_bounds;
alter table public.orders add constraint orders_wallet_paid_bounds
  check (wallet_paid >= 0 and wallet_paid <= total);
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method is null or payment_method in ('card','transfer','wallet','mixed'));

-- Keep old refund rows as provider-funded refunds; future rows persist the
-- split before any network call so a retry cannot change the tender allocation.
alter table public.refunds
  add column if not exists wallet_amount integer not null default 0,
  add column if not exists paystack_amount integer not null default 0;
update public.refunds
   set paystack_amount = amount
 where paystack_amount = 0 and wallet_amount = 0;
alter table public.refunds drop constraint if exists refunds_tender_split_nonnegative;
alter table public.refunds add constraint refunds_tender_split_nonnegative
  check (wallet_amount >= 0 and paystack_amount >= 0 and wallet_amount + paystack_amount <= amount);

-- A wallet deduction made for a pending checkout is held as a balance debit.
-- Confirmation consumes the hold; failed/cancelled groups release it exactly once.
create table if not exists public.wallet_reservations (
  payment_ref text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  status text not null default 'reserved' check (status in ('reserved','consumed','released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wallet_reservations enable row level security;
revoke all on public.wallet_reservations from public, anon, authenticated;

alter table public.wallet_ledger drop constraint if exists wallet_ledger_kind_check;
alter table public.wallet_ledger add constraint wallet_ledger_kind_check
  check (kind in (
    'admin_credit','admin_debit','offline_credit','deal_adjustment',
    'gift_ticket_reserve','gift_ticket_release',
    'checkout_reserve','checkout_release','refund_credit'
  ));
create unique index if not exists wallet_ledger_idempotent_reference_idx
  on public.wallet_ledger(reference, kind)
  where reference is not null and kind in ('checkout_reserve','checkout_release','refund_credit');

-- Reserve as much available balance as possible, and allocate it deterministically
-- across the server-created order lines. The browser never supplies the amount.
create or replace function public.reserve_wallet_for_payment(
  p_payment_ref text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_total integer;
  v_wallet_balance integer;
  v_wallet_amount integer := 0;
  v_remaining integer := 0;
  v_order record;
  v_reservation public.wallet_reservations%rowtype;
begin
  perform public.assert_service_role();
  if nullif(btrim(coalesce(p_payment_ref,'')), '') is null then
    raise exception 'Payment reference required' using errcode = '22023';
  end if;

  perform 1 from public.orders where payment_ref = p_payment_ref order by id for update;
  select coalesce(sum(total),0)::integer into v_total
    from public.orders where payment_ref = p_payment_ref;
  if not exists (select 1 from public.orders where payment_ref = p_payment_ref) then
    raise exception 'Order group not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.orders
     where payment_ref = p_payment_ref
       and (payment_status <> 'pending' or user_id is distinct from p_user_id)
  ) then
    raise exception 'Order group is not eligible for wallet checkout' using errcode = 'P0001';
  end if;

  select * into v_reservation
    from public.wallet_reservations where payment_ref = p_payment_ref for update;
  if found then
    if v_reservation.user_id <> p_user_id or v_reservation.status <> 'reserved' then
      raise exception 'Wallet reservation is not reusable' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'wallet_amount', v_reservation.amount,
      'paystack_amount', v_total - v_reservation.amount
    );
  end if;

  if p_user_id is not null and v_total > 0 then
    insert into public.wallets(user_id) values (p_user_id) on conflict (user_id) do nothing;
    select balance into v_wallet_balance from public.wallets where user_id = p_user_id for update;
    v_wallet_amount := least(coalesce(v_wallet_balance,0), v_total);
  end if;

  if v_wallet_amount > 0 then
    update public.wallets
       set balance = balance - v_wallet_amount, updated_at = now()
     where user_id = p_user_id
     returning balance into v_wallet_balance;
    insert into public.wallet_reservations(payment_ref,user_id,amount,status)
      values (p_payment_ref,p_user_id,v_wallet_amount,'reserved');
    insert into public.wallet_ledger(user_id,amount,balance_after,kind,note,reference,actor_id)
      values (p_user_id,-v_wallet_amount,v_wallet_balance,'checkout_reserve',
        'Wallet credit reserved for ticket checkout',p_payment_ref,p_user_id);
  end if;

  v_remaining := v_wallet_amount;
  for v_order in
    select id,total from public.orders where payment_ref = p_payment_ref order by id for update
  loop
    update public.orders
       set wallet_paid = least(v_remaining, v_order.total),
           payment_method = case
             when least(v_remaining,v_order.total) = 0 then 'card'
             when least(v_remaining,v_order.total) = v_order.total then 'wallet'
             else 'mixed'
           end
     where id = v_order.id;
    v_remaining := greatest(0, v_remaining - v_order.total);
  end loop;

  return jsonb_build_object(
    'wallet_amount', v_wallet_amount,
    'paystack_amount', v_total - v_wallet_amount
  );
end;
$$;
revoke all on function public.reserve_wallet_for_payment(text,uuid) from public, anon, authenticated;
grant execute on function public.reserve_wallet_for_payment(text,uuid) to service_role;

create or replace function public.release_wallet_reservation(p_payment_ref text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_reservation public.wallet_reservations%rowtype;
  v_balance integer;
begin
  perform public.assert_service_role();
  select * into v_reservation from public.wallet_reservations
   where payment_ref = p_payment_ref for update;
  if not found or v_reservation.status <> 'reserved' then
    return false;
  end if;
  update public.wallets
     set balance = balance + v_reservation.amount, updated_at = now()
   where user_id = v_reservation.user_id
   returning balance into v_balance;
  if not found then
    raise exception 'Wallet account not found for reservation' using errcode = 'P0001';
  end if;
  insert into public.wallet_ledger(user_id,amount,balance_after,kind,note,reference,actor_id)
    values (v_reservation.user_id,v_reservation.amount,v_balance,'checkout_release',
      'Wallet reservation released after checkout did not complete',p_payment_ref,null);
  update public.wallet_reservations set status='released',updated_at=now()
   where payment_ref=p_payment_ref;
  perform public.write_audit_log('wallet_checkout_released','payment',p_payment_ref,
    jsonb_build_object('user_id',v_reservation.user_id,'amount',v_reservation.amount));
  return true;
end;
$$;
revoke all on function public.release_wallet_reservation(text) from public, anon, authenticated;
grant execute on function public.release_wallet_reservation(text) to service_role;

-- Settle the entire basket in one DB transaction; the existing per-order RPC
-- still owns inventory restoration, while this wrapper makes wallet release atomic.
create or replace function public.settle_order_group_payment(
  p_payment_ref text,
  p_payment_status text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare v_order record;
begin
  perform public.assert_service_role();
  if p_payment_status not in ('cancelled','failed') then
    raise exception 'Invalid settlement status' using errcode = '22023';
  end if;
  for v_order in
    select id from public.orders
     where payment_ref=p_payment_ref and payment_status='pending'
     order by id for update
  loop
    perform public.settle_order_payment(v_order.id,p_payment_status);
  end loop;
  perform public.release_wallet_reservation(p_payment_ref);
end;
$$;
revoke all on function public.settle_order_group_payment(text,text) from public, anon, authenticated;
grant execute on function public.settle_order_group_payment(text,text) to service_role;

-- Confirmation checks that any wallet tender is actually reserved, then marks
-- the reservation consumed in the same transaction that confirms the tickets.
create or replace function public.confirm_order_group(p_payment_ref text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order record;
  v_wallet_total integer;
  v_total integer;
  v_new_orders integer := 0;
  v_reservation public.wallet_reservations%rowtype;
begin
  perform public.assert_service_role();
  if nullif(btrim(coalesce(p_payment_ref,'')), '') is null then
    raise exception 'Payment reference required' using errcode = 'P0001';
  end if;

  perform 1 from public.orders where payment_ref=p_payment_ref order by id for update;
  if not exists (select 1 from public.orders where payment_ref=p_payment_ref) then
    raise exception 'Order group not found' using errcode = 'P0002';
  end if;
  select coalesce(sum(wallet_paid),0)::integer, coalesce(sum(total),0)::integer
    into v_wallet_total,v_total
    from public.orders where payment_ref=p_payment_ref;
  if v_wallet_total > 0 then
    select * into v_reservation from public.wallet_reservations
     where payment_ref=p_payment_ref for update;
    if not found or v_reservation.status <> 'reserved'
       or v_reservation.amount <> v_wallet_total then
      raise exception 'Wallet funds are not reserved for this order' using errcode = 'P0001';
    end if;
  elsif exists (select 1 from public.wallet_reservations where payment_ref=p_payment_ref and amount>0) then
    raise exception 'Wallet reservation does not match the order' using errcode = 'P0001';
  end if;

  for v_order in
    select id,payment_status,ticket_type_id,quantity
      from public.orders where payment_ref=p_payment_ref order by id for update
  loop
    if v_order.payment_status='confirmed' then continue; end if;
    if v_order.payment_status <> 'pending' then
      raise exception 'Order is not awaiting payment' using errcode = 'P0001';
    end if;
    if v_order.ticket_type_id is not null then
      update public.ticket_types tt
         set sold=sold+v_order.quantity, updated_at=now()
       where tt.id=v_order.ticket_type_id
         and (tt.quantity-tt.sold)>=v_order.quantity;
      if not found then
        raise exception 'Not enough tickets left for this ticket type' using errcode = 'P0001';
      end if;
    end if;
    update public.orders set payment_status='confirmed',status='confirmed',fulfilled_at=now()
     where id=v_order.id;
    v_new_orders := v_new_orders + 1;
  end loop;

  if v_new_orders=0 then return; end if;
  if v_wallet_total>0 then
    update public.wallet_reservations set status='consumed',updated_at=now()
     where payment_ref=p_payment_ref and status='reserved';
  end if;
  update public.promos set uses=uses+1,updated_at=now()
   where code=(select promo_code from public.orders where payment_ref=p_payment_ref and promo_code is not null limit 1)
     and exists(select 1 from public.orders where payment_ref=p_payment_ref and promo_code is not null);
end;
$$;
revoke all on function public.confirm_order_group(text) from public, anon, authenticated;
grant execute on function public.confirm_order_group(text) to service_role;

-- Allocate partial refunds pro-rata to the original tender, with deterministic
-- integer rounding and remainder assigned to the other tender. Full refunds
-- therefore restore both original payment channels exactly.
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
  v_actor uuid := coalesce(p_actor,auth.uid());
  v_key text;
  v_committed integer;
  v_committed_wallet integer;
  v_committed_paystack integer;
  v_wallet_remaining integer;
  v_paystack_remaining integer;
  v_wallet_refund integer;
  v_paystack_refund integer;
  v_replay public.refunds%rowtype;
begin
  perform public.assert_service_role();
  if v_actor is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if not public.user_has_permission_unchecked(v_actor,'transactions.refund') then
    raise exception 'Forbidden: refunds require finance permission' using errcode='42501';
  end if;
  v_key := nullif(btrim(coalesce(p_idempotency_key,'')), '');
  if v_key is null then v_key := 'refund:'||gen_random_uuid()::text; end if;
  select * into v_refund from public.refunds where idempotency_key=v_key;
  if found then return v_refund; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Refund amount must be a positive number of naira' using errcode='P0001'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'A refund needs a reason' using errcode='P0001'; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found' using errcode='P0002'; end if;
  if v_order.payment_status<>'confirmed' then raise exception 'Only a confirmed order can be refunded' using errcode='P0001'; end if;

  select coalesce(sum(amount),0)::integer,coalesce(sum(wallet_amount),0)::integer,
         coalesce(sum(paystack_amount),0)::integer
    into v_committed,v_committed_wallet,v_committed_paystack
    from public.refunds where order_id=p_order_id
     and status in ('refunded','requested','submitted','processing');
  if v_committed+p_amount>v_order.total then
    raise exception 'Refund exceeds the amount still refundable on this order' using errcode='P0001';
  end if;
  v_wallet_remaining := greatest(0,v_order.wallet_paid-v_committed_wallet);
  v_paystack_remaining := greatest(0,v_order.paystack_paid-v_committed_paystack);
  if v_order.total=0 then raise exception 'This order has no refundable payment' using errcode='P0001'; end if;
  v_wallet_refund := least(v_wallet_remaining, floor((p_amount::numeric*v_order.wallet_paid::numeric)/v_order.total)::integer);
  v_paystack_refund := p_amount-v_wallet_refund;
  if v_paystack_refund>v_paystack_remaining then
    v_paystack_refund := v_paystack_remaining;
    v_wallet_refund := p_amount-v_paystack_refund;
  end if;
  if v_wallet_refund>v_wallet_remaining or v_wallet_refund+v_paystack_refund<>p_amount then
    raise exception 'Refund tender allocation exceeds the remaining paid amounts' using errcode='P0001';
  end if;

  insert into public.refunds(order_id,party_id,amount,wallet_amount,paystack_amount,reason,idempotency_key,requested_by,status)
  values(v_order.id,v_order.party_id,p_amount,v_wallet_refund,v_paystack_refund,btrim(p_reason),v_key,v_actor,'requested')
  returning * into v_refund;
  update public.orders set refund_status='requested',refund_amount=v_committed+p_amount where id=v_order.id;
  insert into public.audit_logs(actor_id,action,target_type,target_id,details,status)
  values(v_actor,'refund_requested','order',v_order.id::text,
    jsonb_build_object('refund_id',v_refund.id,'amount',p_amount,'wallet_amount',v_wallet_refund,
      'paystack_amount',v_paystack_refund,'currency',v_refund.currency,'reason',p_reason,'idempotency_key',v_key),'success');
  return v_refund;
exception when unique_violation then
  select * into v_replay from public.refunds where idempotency_key=v_key;
  if found then return v_replay; end if;
  raise exception 'A refund for this order is already in progress. Wait for it to resolve before issuing another.' using errcode='23505';
end;
$$;
revoke all on function public.create_order_refund(uuid,integer,text,uuid,text) from public, anon, authenticated;
grant execute on function public.create_order_refund(uuid,integer,text,uuid,text) to service_role;

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
  v_wallet_balance integer;
  v_needs_release boolean;
  v_refunded_total integer;
begin
  perform public.assert_service_role();
  if p_outcome not in ('refunded','failed','unknown') then raise exception 'Invalid refund outcome' using errcode='P0001'; end if;
  select * into v_refund from public.refunds where id=p_refund_id for update;
  if not found then raise exception 'Refund not found' using errcode='P0002'; end if;
  if v_refund.status='refunded' then return v_refund; end if;
  if v_refund.status not in ('requested','submitted','processing') then
    raise exception 'Refund cannot be completed from this state' using errcode='P0001';
  end if;
  if p_outcome='unknown' then
    update public.refunds set status='processing',provider_status=nullif(btrim(coalesce(p_provider_status,'')),''),
      provider_message=nullif(btrim(coalesce(p_failure_reason,'')),''),updated_at=now()
     where id=p_refund_id returning * into v_refund;
    return v_refund;
  end if;
  if p_outcome='failed' then
    update public.refunds set status='failed',provider_status=nullif(btrim(coalesce(p_provider_status,'')),''),
      provider_message=nullif(btrim(coalesce(p_failure_reason,'')),''),completed_at=now(),updated_at=now()
     where id=p_refund_id returning * into v_refund;
    update public.orders set refund_status='failed',refunded_at=null where id=v_refund.order_id;
    insert into public.audit_logs(actor_id,action,target_type,target_id,details,status)
    values(v_refund.requested_by,'refund_failed','order',v_refund.order_id::text,
      jsonb_build_object('refund_id',v_refund.id,'amount',v_refund.amount,'wallet_amount',v_refund.wallet_amount,
        'paystack_amount',v_refund.paystack_amount,'provider_status',p_provider_status,'reason',p_failure_reason),'failed');
    return v_refund;
  end if;

  if v_refund.paystack_amount>0 and btrim(coalesce(p_provider_refund_id,''))='' then
    raise exception 'A provider refund id is required for the Paystack refund portion' using errcode='P0001';
  end if;
  select * into v_order from public.orders where id=v_refund.order_id for update;
  if not found then raise exception 'Order not found' using errcode='P0002'; end if;
  v_needs_release := v_refund.inventory_released_at is null;

  if v_refund.wallet_amount>0 then
    if v_order.user_id is null then raise exception 'A guest order cannot receive a wallet refund' using errcode='P0001'; end if;
    insert into public.wallets(user_id) values(v_order.user_id) on conflict(user_id) do nothing;
    update public.wallets set balance=balance+v_refund.wallet_amount,updated_at=now()
     where user_id=v_order.user_id returning balance into v_wallet_balance;
    insert into public.wallet_ledger(user_id,amount,balance_after,kind,note,reference,actor_id)
    values(v_order.user_id,v_refund.wallet_amount,v_wallet_balance,'refund_credit',
      'Wallet portion returned for order refund',v_refund.id::text,v_refund.requested_by);
  end if;

  update public.refunds set status='refunded',
    provider_refund_id=nullif(btrim(coalesce(p_provider_refund_id,'')),''),
    provider_status=coalesce(nullif(btrim(coalesce(p_provider_status,'')),''),case when v_refund.paystack_amount=0 then 'wallet_only' end),
    completed_at=now(),inventory_released_at=now(),updated_at=now()
   where id=p_refund_id returning * into v_refund;
  if v_needs_release then perform public.release_order_inventory(v_refund.order_id,v_order.quantity); end if;
  select coalesce(sum(amount),0)::integer into v_refunded_total
    from public.refunds where order_id=v_refund.order_id and status='refunded';
  update public.orders set refund_status='refunded',refund_amount=v_refunded_total,refunded_at=now()
   where id=v_order.id;
  insert into public.audit_logs(actor_id,action,target_type,target_id,details,status)
  values(v_refund.requested_by,'refund_completed','order',v_order.id::text,
    jsonb_build_object('refund_id',v_refund.id,'amount',v_refund.amount,'wallet_amount',v_refund.wallet_amount,
      'paystack_amount',v_refund.paystack_amount,'provider_refund_id',v_refund.provider_refund_id,
      'order_quantity',v_order.quantity,'inventory_released',v_needs_release),'success');
  return v_refund;
end;
$$;
revoke all on function public.complete_order_refund(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_order_refund(uuid,text,text,text,text) to service_role;

-- Event cancellation queues split-tender refunds through the same ledger.
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
  v_actor uuid := coalesce(p_actor,auth.uid());
  v_party public.parties%rowtype;
  v_order public.orders%rowtype;
  v_refund public.refunds%rowtype;
  v_locked integer;
  v_locked_wallet integer;
  v_locked_paystack integer;
  v_remaining integer;
  v_wallet_remaining integer;
  v_paystack_remaining integer;
  v_wallet_refund integer;
  v_paystack_refund integer;
  v_key text;
begin
  perform public.assert_service_role();
  if v_actor is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'A cancellation reason is required' using errcode='P0001'; end if;
  select * into v_party from public.parties where id=p_party_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if v_party.created_by is null or v_party.created_by<>v_actor then
    if not public.user_has_permission_unchecked(v_actor,'events.cancel') then
      raise exception 'Only the host of this event can cancel it' using errcode='42501';
    end if;
  end if;
  update public.parties set cancelled_at=coalesce(cancelled_at,now()),
    cancellation_reason=coalesce(cancellation_reason,btrim(p_reason)) where id=p_party_id;
  for v_order in
    select * from public.orders where party_id=p_party_id and payment_status='confirmed' order by id for update
  loop
    select coalesce(sum(amount),0)::integer,coalesce(sum(wallet_amount),0)::integer,
      coalesce(sum(paystack_amount),0)::integer into v_locked,v_locked_wallet,v_locked_paystack
      from public.refunds where order_id=v_order.id and status in ('refunded','requested','submitted','processing');
    v_remaining := v_order.total-v_locked;
    if v_remaining>0 then
      v_key := 'cancel:'||p_party_id::text||':'||v_order.id::text;
      select * into v_refund from public.refunds where idempotency_key=v_key;
      if not found then
        v_wallet_remaining := greatest(0,v_order.wallet_paid-v_locked_wallet);
        v_paystack_remaining := greatest(0,v_order.paystack_paid-v_locked_paystack);
        if v_order.total>0 then
          v_wallet_refund := least(v_wallet_remaining,floor((v_remaining::numeric*v_order.wallet_paid::numeric)/v_order.total)::integer);
        else v_wallet_refund:=0; end if;
        v_paystack_refund := v_remaining-v_wallet_refund;
        if v_paystack_refund>v_paystack_remaining then
          v_paystack_refund:=v_paystack_remaining;
          v_wallet_refund:=v_remaining-v_paystack_refund;
        end if;
        if v_wallet_refund>v_wallet_remaining then
          raise exception 'Could not split cancellation refund by original tender' using errcode='P0001';
        end if;
        insert into public.refunds(order_id,party_id,amount,wallet_amount,paystack_amount,reason,idempotency_key,requested_by,status)
        values(v_order.id,v_order.party_id,v_remaining,v_wallet_refund,v_paystack_refund,
          'Event cancelled: '||btrim(p_reason),v_key,v_actor,'requested') returning * into v_refund;
        update public.orders set refund_status='requested',refund_amount=v_locked+v_remaining,
          cancellation_reason=btrim(p_reason) where id=v_order.id;
      end if;
    else
      v_refund:=null;
    end if;
    return next jsonb_build_object('order_id',v_order.id,'order_ref',v_order.order_ref,
      'refund_id',v_refund.id,'amount',v_remaining,'wallet_amount',v_refund.wallet_amount,
      'paystack_amount',v_refund.paystack_amount,'quantity',v_order.quantity,
      'customer_email',v_order.customer_email,'guest_name',v_order.guest_name,'needs_refund',v_refund.id is not null);
  end loop;
  insert into public.audit_logs(actor_id,action,target_type,target_id,details,status)
  values(v_actor,'event_cancellation_started','party',p_party_id::text,
    jsonb_build_object('reason',btrim(p_reason)),'success');
  return;
end;
$$;
revoke all on function public.begin_event_cancellation(bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.begin_event_cancellation(bigint,text,uuid) to service_role;
