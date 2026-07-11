-- Admin moderation: organizer-submitted events now require approval before
-- they're publicly visible, and an admin can approve/reject/suspend any
-- event. Also lets organizers see the orders placed against their own events
-- (previously only the buyer could see their own order).

-- ---------------------------------------------------------------------------
-- profiles.is_admin — a single flag is proportionate at this scale; can grow
-- into a proper roles table later if there's ever more than one admin tier.
-- ---------------------------------------------------------------------------
alter table public.profiles add column is_admin boolean not null default false;

-- ---------------------------------------------------------------------------
-- parties.status — new organizer submissions default to 'pending' and stay
-- invisible to the public until an admin approves them. The 22 platform-
-- curated seed rows are backfilled as already-approved.
-- ---------------------------------------------------------------------------
alter table public.parties add column status text not null default 'pending'
  check (status in ('pending', 'approved', 'rejected', 'suspended'));

update public.parties set status = 'approved' where id between 1 and 22;

drop policy "parties are publicly readable" on public.parties;

create policy "approved parties are publicly readable"
  on public.parties for select
  using (
    status = 'approved'
    or created_by = (select auth.uid())
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin)
  );

create policy "admins manage any party"
  on public.parties for update
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin));

-- ---------------------------------------------------------------------------
-- Organizers can see orders placed on their own events (previously only the
-- buyer could see their own order row) — needed for the ticket-sales/revenue
-- stats on /host.
-- ---------------------------------------------------------------------------
create policy "organizers read orders on their own parties"
  on public.orders for select
  using (
    exists (
      select 1 from public.parties
      where parties.id = orders.party_id and parties.created_by = (select auth.uid())
    )
  );
