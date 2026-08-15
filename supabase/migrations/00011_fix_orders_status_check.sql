-- Batch 5.1: fix orders.status CHECK so pending/failed are legal alongside
-- confirmed/cancelled. Migration 00010 made 'pending' the new default but never
-- relaxed the original 00001 constraint, so every new order (and the new
-- "users create pending orders" policy) was silently rejected. This only
-- drops and recreates the one check constraint -- nothing else is touched.
alter table public.orders drop constraint orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'confirmed', 'failed', 'cancelled'));
