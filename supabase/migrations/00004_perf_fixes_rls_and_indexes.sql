-- Wrap auth.uid() as (select auth.uid()) so Postgres evaluates it once per
-- query (via the initplan) instead of re-evaluating per row.

drop policy "users read their own profile" on public.profiles;
create policy "users read their own profile"
  on public.profiles for select
  using ((select auth.uid()) = id);

drop policy "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles for update
  using ((select auth.uid()) = id);

drop policy "users manage their own saved parties" on public.saved_parties;
create policy "users manage their own saved parties"
  on public.saved_parties for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy "users manage their own reminders" on public.reminders;
create policy "users manage their own reminders"
  on public.reminders for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy "users read their own orders" on public.orders;
create policy "users read their own orders"
  on public.orders for select
  using ((select auth.uid()) = user_id);

drop policy "users create their own orders" on public.orders;
create policy "users create their own orders"
  on public.orders for insert
  with check ((select auth.uid()) = user_id);

-- Covering indexes for the foreign keys flagged by the performance advisor.
create index orders_party_id_idx on public.orders (party_id);
create index orders_user_id_idx on public.orders (user_id);
create index reminders_party_id_idx on public.reminders (party_id);
create index saved_parties_party_id_idx on public.saved_parties (party_id);
