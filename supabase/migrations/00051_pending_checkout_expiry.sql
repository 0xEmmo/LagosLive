-- Pending checkout reservations are released by the authenticated cron sweep
-- only after it has rechecked the payment reference with Paystack. This partial
-- index keeps that sweep bounded as the orders table grows.
create index if not exists orders_pending_payment_expiry_idx
  on public.orders (created_at, payment_ref)
  where payment_status = 'pending' and payment_ref is not null;
