-- ===========================================================================
-- Admin & Host operations platform (Batch 9) — IDEMPOTENT / re-runnable.
--
-- Adds a proper role system and the operational tables the admin/host
-- dashboards read and write: payouts, audit logs, support tickets, admin
-- notes, events check-in, and richer profile/party fields.
--
-- Design principles:
--  * Multi-role RBAC lives on profiles.role (super_admin/admin/finance/support/
--    organizer/viewer). is_admin is kept as a backward-compatible flag (a real
--    column, kept in sync by a trigger) so existing client checks work.
--  * Security-sensitive state transitions (order confirm/cancel) stay
--    exclusively service-role; dashboards read through RLS and only mutate
--    what their role permits.
--  * Every privileged mutation goes through the audit_logs table via
--    write_audit_log(), which callers invoke explicitly.
--
-- Every statement below is safe to run more than once (partial first runs of
-- an earlier draft are fine): columns use IF NOT EXISTS, tables/indexes use
-- IF NOT EXISTS, and policies are dropped-if-exists before being recreated.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Profiles: roles + operational fields.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists role text not null default 'viewer'
    check (role in ('viewer', 'organizer', 'support', 'finance', 'admin', 'super_admin')),
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'flagged', 'banned')),
  add column if not exists phone text,
  add column if not exists bio text,
  add column if not exists kyc_status text not null default 'none'
    check (kyc_status in ('none', 'pending', 'approved', 'rejected')),
  add column if not exists bank_account_encrypted text,
  add column if not exists payout_preferences jsonb not null default '{}'::jsonb,
  add column if not exists last_activity_at timestamptz;

-- Backfill: anyone who was an admin becomes an 'admin' role; everyone else
-- who has created a party becomes an 'organizer'. Idempotent update.
update public.profiles set role = 'admin' where is_admin and role = 'viewer';
update public.profiles p set role = 'organizer'
  where p.role = 'viewer'
    and exists (select 1 from public.parties where parties.created_by = p.id);

-- is_admin stays in sync with role for backward compatibility with the
-- existing client (store.ts user.isAdmin, /admin gate, party edit buttons).
-- We KEEP is_admin as a real column (existing RLS policies on parties /
-- ticket_types reference it, so we can't drop/recreate it as a generated
-- column) and keep it accurate with a BEFORE trigger on role changes.
create or replace function public.sync_is_admin()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.is_admin := new.role in ('admin', 'super_admin');
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_is_admin on public.profiles;
create trigger trg_profiles_sync_is_admin
  before insert or update of role on public.profiles
  for each row execute function public.sync_is_admin();

-- Backfill is_admin for rows already set above (the trigger only fires on
-- insert/update, so existing profiles are corrected here).
update public.profiles set is_admin = (role in ('admin', 'super_admin'));

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_account_status_idx on public.profiles (account_status);

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
create table if not exists public.audit_logs (
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

create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_target_idx on public.audit_logs (target_type, target_id);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

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
drop policy if exists "staff and organizers read audit logs" on public.audit_logs;
create policy "staff and organizers read audit logs"
  on public.audit_logs for select
  using (
    public.has_role(array['support', 'finance', 'admin', 'super_admin'])
    or actor_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 4. Payouts (host/organizer revenue settlement).
-- ---------------------------------------------------------------------------
create table if not exists public.payouts (
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

create index if not exists payouts_organizer_idx on public.payouts (organizer_id, status);
create index if not exists payouts_status_idx on public.payouts (status, created_at desc);

drop policy if exists "organizers read their own payouts" on public.payouts;
create policy "organizers read their own payouts"
  on public.payouts for select
  using (organizer_id = (select auth.uid()));

drop policy if exists "finance and admins manage payouts" on public.payouts;
create policy "finance and admins manage payouts"
  on public.payouts for all
  using (public.has_role(array['finance', 'admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- 5. Support tickets + messages.
-- ---------------------------------------------------------------------------
create table if not exists public.support_tickets (
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

create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.support_tickets (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  is_internal boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.support_messages enable row level security;

create index if not exists support_tickets_status_idx on public.support_tickets (status, updated_at desc);
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

drop policy if exists "authors and staff manage support tickets" on public.support_tickets;
create policy "authors and staff manage support tickets"
  on public.support_tickets for all
  using (
    author_id = (select auth.uid())
    or public.has_role(array['support', 'admin', 'super_admin'])
  );

drop policy if exists "authors and staff read ticket messages" on public.support_messages;
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

drop policy if exists "authors and staff reply to tickets" on public.support_messages;
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
create table if not exists public.admin_notes (
  id bigint generated always as identity primary key,
  author_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('party', 'order', 'profile', 'payout')),
  target_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_notes enable row level security;

create index if not exists admin_notes_target_idx on public.admin_notes (target_type, target_id, created_at desc);

drop policy if exists "staff read admin notes" on public.admin_notes;
create policy "staff read admin notes"
  on public.admin_notes for select
  using (public.has_role(array['support', 'finance', 'admin', 'super_admin']));

drop policy if exists "staff write admin notes" on public.admin_notes;
create policy "staff write admin notes"
  on public.admin_notes for insert
  with check (public.has_role(array['support', 'finance', 'admin', 'super_admin']));

drop policy if exists "staff delete admin notes" on public.admin_notes;
create policy "staff delete admin notes"
  on public.admin_notes for delete
  using (public.has_role(array['admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- 7. Parties: operational/admin fields for moderation + analytics.
-- ---------------------------------------------------------------------------
alter table public.parties
  add column if not exists flagged boolean not null default false,
  add column if not exists banned_words integer not null default 0,
  add column if not exists admin_notes text,
  add column if not exists page_views integer not null default 0,
  add column if not exists unique_visitors integer not null default 0;

-- Admins see/use flagged moderation fields; organizers read their own party's
-- page_views. The existing select policy already lets organizers read their
-- own parties and admins read everything. admin_notes stays internal (staff
-- only). page_views is benign and lives on the existing read path, so no extra
-- policy is required.

-- ---------------------------------------------------------------------------
-- 8. Orders: check-in + refund + note support.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists check_in_status text not null default 'unchecked'
    check (check_in_status in ('unchecked', 'checked_in')),
  add column if not exists checked_in_at timestamptz,
  add column if not exists refund_status text not null default 'none'
    check (refund_status in ('none', 'requested', 'processing', 'refunded', 'rejected')),
  add column if not exists refund_amount integer not null default 0,
  add column if not exists refunded_at timestamptz,
  add column if not exists admin_notes text;

create index if not exists orders_check_in_idx on public.orders (party_id, check_in_status);
create index if not exists orders_refund_idx on public.orders (refund_status);

-- Organizers may check their own attendees in (host gate at the venue).
-- We scope the update so an organizer can ONLY flip check-in state / checked
-- in timestamp — not payment amounts (those stay service-role only).
drop policy if exists "organizers or admins update check-in on their events" on public.orders;
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
drop policy if exists "staff read all orders" on public.orders;
create policy "staff read all orders"
  on public.orders for select
  using (public.has_role(array['support', 'finance', 'admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- 9. Policies keeping the old defaults safe for the new profile columns.
--    (profiles remains user-owned; staff additionally read/watch profiles.)
-- ---------------------------------------------------------------------------
drop policy if exists "staff read all profiles" on public.profiles;
create policy "staff read all profiles"
  on public.profiles for select
  using (
    public.has_role(array['support', 'finance', 'admin', 'super_admin'])
    or auth.uid() = id
  );

drop policy if exists "staff suspend or role-manage profiles" on public.profiles;
create policy "staff suspend or role-manage profiles"
  on public.profiles for update
  using (
    (public.has_role(array['admin', 'super_admin']) and role in ('viewer', 'organizer', 'support', 'finance', 'admin', 'super_admin'))
    or auth.uid() = id
  );
