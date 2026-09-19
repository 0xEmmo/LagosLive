-- Hosts may hard-delete their OWN events.
--
-- This is the missing half of the host edit "Delete Event" button. Previously
-- only two delete paths existed on public.parties, both narrow:
--   * admin deletes any party   (00009, 00024 — unchanged here)
--   * (nothing else)
-- So a signed-in host's delete was filtered out by RLS: supabase-js returns
-- 0 rows with NO error, the client treated it as success, redirected to
-- /host, but the event stayed. That's the "nothing happens" bug.
--
-- This policy grants ONLY event owners (created_by = auth.uid()) the ability
-- to delete, on top of the two admin paths. It is deliberately NOT a
-- catch-all: ownership is asserted on the server by RLS, nobody can delete
-- someone else's event, and no permission/billing capability is weakened.
--
-- Financial history stays safe automatically: public.orders references
-- public.parties (id) on delete RESTRICT (00001), so an event that already
-- has ticket orders/payments cannot be hard-deleted — the FK rejects it and
-- the host edit page already catches that and tells the host to Suspend
-- instead. This matches the existing admin flow (00009_admin_delete_party).
drop policy if exists "hosts delete own party"
  on public.parties;

create policy "hosts delete own party"
  on public.parties for delete
  using (public.parties.created_by = (select auth.uid()));
