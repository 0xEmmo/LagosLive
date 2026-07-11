-- Each pair below was functionally correct (policies OR together) but forced
-- Postgres to evaluate two separate permissive policies per query instead of
-- one combined check. Consolidating is a pure performance win, no behavior change.

drop policy "users read their own orders" on public.orders;
drop policy "organizers read orders on their own parties" on public.orders;
create policy "users and organizers read relevant orders"
  on public.orders for select
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.parties
      where parties.id = orders.party_id and parties.created_by = (select auth.uid())
    )
  );

drop policy "organizers update their own parties" on public.parties;
drop policy "admins manage any party" on public.parties;
create policy "organizers and admins update parties"
  on public.parties for update
  using (
    (select auth.uid()) = created_by
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin)
  );
