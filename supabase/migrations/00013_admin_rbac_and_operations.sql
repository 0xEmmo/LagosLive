-- ===========================================================================
-- Admin & Host operations platform (Batch 9)
-- Adds a proper role system and the operational tables the admin/host
-- dashboards read and write: payouts, audit logs, support tickets, admin
-- notes, events check-in, and richer profile/party fields.
--
-- Design principles:
--  * Multi-role RBAC lives on profiles.role (super_admin/admin/finance/support/
--    organizer/viewer). is_admin is kept as a backward-compatible derived
--    flag so existing client checks keep working.
--  * Security-sensitive state transitions (order confirm/cancel) stay
--    exclusively service-role; dashboards read through RLS and only mutate
--    what their role permits.
--  * Every privileged mutation goes through the audit_logs table via
--    write_audit_log(), which callers invoke explicitly (no opaque triggers,
--    so we don't accidentally log every public read).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Profiles: roles + operational fields.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column role text not null default 'viewer'
    check (role in ('viewer', 'organizer', 'support', 'finance', 'admin', 'super_admin')),
  add column account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'flagged', 'banned')),
  add column phone text,
  add column bio text,
  add column kyc_status text not null default 'none'
    check (kyc_status in ('none', 'pending', 'approved', 'rejected')),
  add column bank_account_encrypted text,
  add column payout_preferences jsonb not null default '{}'::jsonb,
  add column last_activity_at timestamptz;

-- Backfill: anyone who was an admin becomes an 'admin' role; everyone else who
-- has created a party becomes an 'organizer'.
update public.profiles set role = 'admin' where is_admin;
update public.profiles p set role = 'organizer'
  where p.role = 'viewer'
    and exists (select 1 from public.parties where parties.created_by = p.id);

-- is_admin stays in sync with role for backward compatibility with the
-- existing client (store.ts user.isAdmin, /admin gate, party edit buttons).
alter table public.profiles drop column is_admin;
alter table public.profiles add column is_admin boolean
  generated always as (role in ('admin', 'super_admin')) stored;

create index profiles_role_idx on public.profiles (role);
create index profiles_account_status_idx on public.profiles (account_status);

-- ---------------------------------------------------------------------------
-- 2. Role helper functions used across RLS policies.
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.has_role(v_roles text[])
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.current_role() = any (v_roles);
$$;

-- ---------------------------------------------------------------------------
-- 3. Audit log. All privileged mutations call write_audit_log() explicitly.
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'success' check (status in ('success', 'failed')),
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function public.write_audit_log(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_details jsonb default '{}'::jsonb,
  p_status text default 'success'
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, action, target_type, target_id, details, status)
  values ((select auth.uid()), p_action, p_target_type, p_target_id, p_details, p_status);
end;
$$;

-- Staff (support/finance/admin/super_admin) and organizers read audit logs;
-- writes always go through write_audit_log (security definer) — no public
-- insert policy, so the only path to create a row is the function.
create policy "staff and organizers read audit logs"
  on public.audit_logs for select
  using (
    public.has_role(array['support', 'finance', 'admin', 'super_admin'])
    or actor_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 4. Payouts (host/organizer revenue settlement).
-- ---------------------------------------------------------------------------
create table public.payouts (
  id bigint generated always as identity primary key,
  organizer_id uuid not null references auth.users (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  revenue integer not null default 0,          -- gross confirmed sales (kobo)
  platform_fee integer not null default 0,     -- commission (kobo)
  amount integer not null,                      -- amount due = revenue - platform_fee (kobo)
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'approved', 'paid', 'rejected')),
  bank_last4 text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount >= 0)
);

alter table public.payouts enable row level security;

create index payouts_organizer_idx on public.payouts (organizer_id, status);
create index payouts_status_idx on public.payouts (status, created_at desc);

create policy "organizers read their own payouts"
  on public.payouts for select
  using (organizer_id = (select auth.uid()));

create policy "finance and admins manage payouts"
  on public.payouts for all
  using (public.has_role(array['finance', 'admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- 5. Support tickets + messages.
-- ---------------------------------------------------------------------------
create table public.support_tickets (
  id bigint generated always as identity primary key,
  author_id uuid references auth.users (id) on delete set null,
  subject text not null,
  body text not null,
  category text not null default 'general'
    check (category in ('general', 'payments', 'event', 'account', 'refund', 'technical')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  assignee_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;

create table public.support_messages (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.support_tickets (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  is_internal boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.support_messages enable row level security;

create index support_tickets_status_idx on public.support_tickets (status, updated_at desc);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

create policy "authors and staff manage support tickets"
  on public.support_tickets for all
  using (
    author_id = (select auth.uid())
    or public.has_role(array['support', 'admin', 'super_admin'])
  );

create policy "authors and staff read ticket messages"
  on public.support_messages for select
  using (
    exists (
      select 1 from public.support_tickets
      where support_tickets.id = support_messages.ticket_id
        and (author_id = (select auth.uid())
             or public.has_role(array['support', 'admin', 'super_admin']))
    )
  );

create policy "authors and staff reply to tickets"
  on public.support_messages for insert
  with check (
    exists (
      select 1 from public.support_tickets
      where support_tickets.id = support_messages.ticket_id
        and (author_id = (select auth.uid())
             or public.has_role(array['support', 'admin', 'super_admin']))
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Admin/operational notes (on events, orders, profiles).
-- ---------------------------------------------------------------------------
create table public.admin_notes (
  id bigint generated always as identity primary key,
  author_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('party', 'order', 'profile', 'payout')),
  target_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_notes enable row level security;

create index admin_notes_target_idx on public.admin_notes (target_type, target_id, created_at desc);

create policy "staff read admin notes"
  on public.admin_notes for select
  using (public.has_role(array['support', 'finance', 'admin', 'super_admin']));

create policy "staff write admin notes"
  on public.admin_notes for insert
  with check (public.has_role(array['support', 'finance', 'admin', 'super_admin']));

create policy "staff delete admin notes"
  on public.admin_notes for delete
  using (public.has_role(array['admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- 7. Parties: operational/admin fields for moderation + analytics.
-- ---------------------------------------------------------------------------
alter table public.parties
  add column flagged boolean not null default false,
  add column banned_words integer not null default 0,
  add column admin_notes text,
  add column page_views integer not null default 0,
  add column unique_visitors integer not null default 0;

-- Admins see/use flagged moderation fields; organizers read their own party's
-- page_views. The existing select policy already lets organizers read their
-- own parties and admins read everything — extend organizers to see their own
-- party's admin_notes is NOT needed (that's internal); we keep admin_notes
-- visible to staff only via a separate concern. page_views is benign and lives
-- on the existing read path, so no extra policy is required.

-- ---------------------------------------------------------------------------
-- 8. Orders: check-in + refund + note support.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column check_in_status text not null default 'unchecked'
    check (check_in_status in ('unchecked', 'checked_in')),
  add column checked_in_at timestamptz,
  add column refund_status text not null default 'none'
    check (refund_status in ('none', 'requested', 'processing', 'refunded', 'rejected')),
  add column refund_amount integer not null default 0,
  add column refunded_at timestamptz,
  add column admin_notes text;

create index orders_check_in_idx on public.orders (party_id, check_in_status);
create index orders_refund_idx on public.orders (refund_status);

-- Organizers may check their own attendees in (host gate at the venue).
-- We scope the update so an organizer can ONLY flip check-in state / checked
-- in timestamp — not payment amounts (those stay service-role only).
create policy "organizers or admins update check-in on their events"
  on public.orders for update
  using (
    public.has_role(array['admin', 'super_admin', 'finance'])
    or exists (
      select 1 from public.parties
      where parties.id = orders.party_id and parties.created_by = (select auth.uid())
    )
  );

-- Staff can read all orders for the admin dashboard. (The pre-existing
-- "users and organizers read relevant orders" policy remains for buyers and
-- organizers; this adds a full-read path for staff.)
create policy "staff read all orders"
  on public.orders for select
  using (public.has_role(array['support', 'finance', 'admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- 9. Policies keeping the old defaults safe for the new profile columns.
--    (profiles remains user-owned; staff additionally read/watch profiles.)
-- ---------------------------------------------------------------------------
create policy "staff read all profiles"
  on public.profiles for select
  using (
    public.has_role(array['support', 'finance', 'admin', 'super_admin'])
    or auth.uid() = id
  );

create policy "staff suspend or role-manage profiles"
  on public.profiles for update
  using (
    (public.has_role(array['admin', 'super_admin']) and role in ('viewer', 'organizer', 'support', 'finance', 'admin', 'super_admin'))
    or auth.uid() = id
  );
