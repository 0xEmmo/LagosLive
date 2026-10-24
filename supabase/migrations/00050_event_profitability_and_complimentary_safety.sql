-- ==========================================================================
-- 00050 - Accurate event gain and complimentary-ticket account binding
-- ==========================================================================

-- Complimentary issuance already creates a real order so QR/check-in work
-- unchanged. The original order constraint only admitted paid ticket tiers,
-- making the existing issuance RPC fail at INSERT; explicitly admit its
-- zero-priced accounting tier.
alter table public.orders drop constraint if exists orders_tier_check;
alter table public.orders add constraint orders_tier_check
  check (tier in ('regular', 'vip', 'complimentary'));

-- The existing service-only confirmation RPC is reused to update ticket stock
-- and issue a QR-ready comp order. Permit its narrow pending -> confirmed
-- transition only for a zero-total complimentary order and an actor with the
-- dedicated tickets.complimentary permission. All buyer, event, tier, quantity,
-- amount and reference fields must remain identical.
create or replace function public.guard_order_financial_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() not in ('anon','authenticated') then return new; end if;

  if old.tier = 'complimentary'
     and old.total = 0
     and old.payment_status = 'pending'
     and old.status = 'pending'
     and new.payment_status = 'confirmed'
     and new.status = 'confirmed'
     and public.user_has_permission((select auth.uid()), 'tickets.complimentary')
     and new.party_id is not distinct from old.party_id
     and new.tier is not distinct from old.tier
     and new.ticket_type_id is not distinct from old.ticket_type_id
     and new.quantity is not distinct from old.quantity
     and new.unit_price is not distinct from old.unit_price
     and new.service_fee is not distinct from old.service_fee
     and new.total is not distinct from old.total
     and new.payment_ref is not distinct from old.payment_ref
     and new.order_ref is not distinct from old.order_ref
     and new.payment_method is not distinct from old.payment_method
     and new.wallet_paid is not distinct from old.wallet_paid
     and new.refund_status is not distinct from old.refund_status
     and new.refund_amount is not distinct from old.refund_amount
     and new.user_id is not distinct from old.user_id
     and new.customer_email is not distinct from old.customer_email
     and new.ticket_access_token is not distinct from old.ticket_access_token
  then
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
     or new.wallet_paid is distinct from old.wallet_paid
     or new.refund_status is distinct from old.refund_status
     or new.refund_amount is distinct from old.refund_amount
     or new.user_id is distinct from old.user_id
     or new.customer_email is distinct from old.customer_email
     or new.ticket_access_token is distinct from old.ticket_access_token
  then
    raise exception 'Order amounts, payment state and buyer identity are server-authoritative. Use the audited payment RPCs.' using errcode='42501';
  end if;
  return new;
end;
$$;

-- A complimentary order remains a real confirmed order for QR/check-in, but
-- is reported separately from paid sales and never contributes to revenue.
drop function if exists public.event_profitability(bigint);
create function public.event_profitability(p_party_id bigint)
returns table(
  event_id bigint,
  gross_revenue integer,
  discounts integer,
  refunds integer,
  platform_fee integer,
  net_platform_gain integer,
  host_earnings integer,
  paid_tickets bigint,
  complimentary_tickets bigint,
  wallet_used integer,
  paystack_collected integer
)
language sql
security definer set search_path = public
as $$
  with confirmed_orders as (
    select o.id,o.party_id,o.tier,o.quantity,o.total,coalesce(o.promo_discount,0)::integer as discount,
      coalesce(o.wallet_paid,0)::integer as wallet_paid,coalesce(o.paystack_paid,o.total)::integer as paystack_paid,
      coalesce(r.refunded_total,0)::integer as refunded_total,
      coalesce(r.wallet_refunded,0)::integer as wallet_refunded,
      coalesce(r.paystack_refunded,0)::integer as paystack_refunded
    from public.orders o
    left join lateral (
      select sum(amount)::integer as refunded_total,
        sum(wallet_amount)::integer as wallet_refunded,
        sum(paystack_amount)::integer as paystack_refunded
      from public.refunds where order_id=o.id and status='refunded'
    ) r on true
    where o.party_id=p_party_id and o.payment_status='confirmed'
  ), aggregate as (
    select coalesce(sum(total+discount) filter(where tier<>'complimentary'),0)::integer as gross,
      coalesce(sum(discount) filter(where tier<>'complimentary'),0)::integer as discount_total,
      coalesce(sum(refunded_total) filter(where tier<>'complimentary'),0)::integer as refund_total,
      coalesce(sum(greatest(0,total-refunded_total)) filter(where tier<>'complimentary'),0)::integer as net_sales,
      coalesce(sum(quantity) filter(where tier<>'complimentary' and total>0 and coalesce(refunded_total,0)<total),0)::bigint as paid_count,
      coalesce(sum(quantity) filter(where tier='complimentary'),0)::bigint as comp_count,
      coalesce(sum(greatest(0,wallet_paid-wallet_refunded)) filter(where tier<>'complimentary'),0)::integer as wallet_net,
      coalesce(sum(greatest(0,paystack_paid-paystack_refunded)) filter(where tier<>'complimentary'),0)::integer as paystack_net
    from confirmed_orders
  )
  select p.id,a.gross,a.discount_total,a.refund_total,
    round(a.net_sales*0.15)::integer as calculated_fee,
    round(a.net_sales*0.15)::integer as platform_gain,
    (a.net_sales-round(a.net_sales*0.15))::integer as host_net,
    a.paid_count,a.comp_count,a.wallet_net,a.paystack_net
  from public.parties p cross join aggregate a
  where p.id=p_party_id
    and (public.user_has_permission((select auth.uid()),'analytics.revenue')
      or public.user_has_permission((select auth.uid()),'revenue.view'));
$$;
revoke all on function public.event_profitability(bigint) from public, anon;
grant execute on function public.event_profitability(bigint) to authenticated, service_role;

-- Only link a complimentary order to an account when the email used for the
-- ticket matches that account. This preserves secure signed-in ticket access
-- without silently linking the ticket to the wrong Lagos Live user.
create or replace function public.validate_complimentary_account_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.tier='complimentary' and new.user_id is not null and not exists (
    select 1 from public.profiles p
     where p.id=new.user_id and lower(btrim(p.email))=lower(btrim(coalesce(new.customer_email,'')))
  ) then
    raise exception 'The guest email must match the selected account email' using errcode='22023';
  end if;
  return new;
end;
$$;
drop trigger if exists complimentary_ticket_account_email on public.orders;
create trigger complimentary_ticket_account_email
before insert or update of user_id,customer_email,tier on public.orders
for each row execute function public.validate_complimentary_account_email();

-- Host coupons use auth.uid() and must never be executable by anonymous callers.
revoke all on function public.create_host_promo(bigint,text,integer,text,integer,timestamptz,timestamptz)
  from public, anon;
grant execute on function public.create_host_promo(bigint,text,integer,text,integer,timestamptz,timestamptz)
  to authenticated;
