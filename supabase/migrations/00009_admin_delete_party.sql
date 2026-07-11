-- Admins can permanently delete a party (organizers can't — Suspend is their
-- equivalent). orders.party_id is ON DELETE RESTRICT, so this correctly fails
-- with a clear FK error if the event already has ticket orders against it —
-- the app surfaces that as "suspend it instead" rather than a raw DB error.
create policy "admins delete any party"
  on public.parties for delete
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin));
