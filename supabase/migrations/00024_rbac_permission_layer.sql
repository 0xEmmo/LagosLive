-- ===========================================================================
-- RBAC permission layer (Batch 24) — IDEMPOTENT / re-runnable.
--
-- Adds a permission layer on top of the existing single-value roles. Roles are
-- now COMPOSED from atomic permissions (events.view, revenue.view, ...) so you
-- can hire staff with just the permissions their job needs instead of granting
-- an entire role bucket.
--
-- Model:
--   * permissions              — the atomic permission catalogue (name, resource,
--                                action, sensitive flag). Immutable built-ins.
--   * roles                    — role definitions. Built-in roles mirror the
--                                existing profiles.role values (super_admin/
--                                admin/finance/support/organizer/viewer) plus
--                                new composite roles (scanner/event_manager/
--                                content/marketing/analyst).
--   * role_permissions         — which permissions each role grants.
--   * user_roles               — which roles each user holds (multi-role). Every
--                                authenticated user is auto-synced from their
--                                profiles.role, so the permission system stays
--                                consistent with the legacy single-role value.
--   * user_has_permission()    — the enforcement function used everywhere.
--
-- Backward compatibility:
--   * profiles.role stays the source of what a user can see for existing RLS
--     policies and the client. A trigger keeps user_roles in sync with it.
--   * super_admin is handled as "all permissions" in user_has_permission so the
--     owner never needs explicit grants.
--
-- Every statement is safe to re-run (IF NOT EXISTS / create or replace / drop
-- policy if exists before recreate). Helper functions that RLS policies depend
-- on are created BEFORE the policies that reference them.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Permissions table — the atomic catalogue.
-- ---------------------------------------------------------------------------
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name ~ '^[a-z]+(\.[a-z_]+)+$'),
  resource text not null,
  action text not null,
  description text,
  sensitive boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.permissions enable row level security;

-- Permissions are immutable built-ins: readable by all authenticated users
-- (the UI needs the catalogue), writable only via service role / SQL.
drop policy if exists "everyone reads permissions" on public.permissions;
create policy "everyone reads permissions"
  on public.permissions for select
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 2. Roles table.
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_builtin boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.roles enable row level security;

-- Readable by every authenticated user so staff tooling / UIs can render the
-- role catalogue. Mutations are gated separately (see section 9).
drop policy if exists "everyone reads roles" on public.roles;
create policy "everyone reads roles"
  on public.roles for select
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 3. role_permissions — junction table.
-- ---------------------------------------------------------------------------
create table if not exists public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

alter table public.role_permissions enable row level security;

drop policy if exists "everyone reads role_permissions" on public.role_permissions;
create policy "everyone reads role_permissions"
  on public.role_permissions for select
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');

create index if not exists role_permissions_permission_idx on public.role_permissions (permission_id);

-- ---------------------------------------------------------------------------
-- 4. Permission catalogue — all built-in permissions.
-- ---------------------------------------------------------------------------
insert into public.permissions (name, resource, action, description, sensitive) values
('events.view',      'events', 'view',     'See event listings', false),
('events.create',    'events', 'create',   'Create new events', false),
('events.edit',      'events', 'edit',     'Edit any event', false),
('events.delete',    'events', 'delete',   'Delete events', false),
('events.approve',   'events', 'approve',  'Approve submitted events', false),
('events.reject',    'events', 'reject',   'Reject events', false),
('events.cancel',    'events', 'cancel',   'Cancel live events and refund guests', true),
('tickets.view',             'tickets', 'view',             'See ticket data', false),
('tickets.create',           'tickets', 'create',           'Create ticket types', false),
('tickets.edit',             'tickets', 'edit',             'Modify ticket types', false),
('tickets.manage_inventory', 'tickets', 'manage_inventory', 'Adjust ticket inventory', false),
('attendees.view',     'attendees', 'view',    'See guest lists', false),
('attendees.checkin',  'attendees', 'checkin', 'Scan QR codes (check in)', false),
('attendees.export',   'attendees', 'export',  'Download attendee data', true),
('attendees.contact',  'attendees', 'contact', 'Email guests', false),
('orders.view',           'orders', 'view',          'See order listings', false),
('orders.refund',         'orders', 'refund',        'Issue refunds', true),
('orders.cancel',         'orders', 'cancel',        'Cancel orders', false),
('orders.resend_ticket',  'orders', 'resend_ticket', 'Resend ticket email', false),
('hosts.view',     'hosts', 'view',    'See host profiles', false),
('hosts.verify',   'hosts', 'verify',  'Approve or reject host verification', false),
('hosts.suspend',  'hosts', 'suspend', 'Suspend or ban hosts', true),
('hosts.edit',     'hosts', 'edit',    'Modify host information', false),
('revenue.view',           'revenue', 'view',     'See revenue dashboards', true),
('payouts.view',           'payouts', 'view',     'See payout data', true),
('payouts.approve',        'payouts', 'approve',  'Approve payout requests', true),
('payouts.process',        'payouts', 'process',  'Mark payouts as paid', true),
('transactions.view',      'transactions', 'view',   'See payment records', true),
('transactions.refund',    'transactions', 'refund', 'Issue refunds via Paystack', true),
('finance.export',         'finance', 'export',     'Export financial reports', true),
('analytics.view',      'analytics', 'view',    'See platform analytics', false),
('analytics.events',    'analytics', 'events',  'See event performance data', false),
('analytics.revenue',   'analytics', 'revenue', 'See revenue analytics', true),
('analytics.export',    'analytics', 'export',  'Export analytics reports', false),
('staff.view',        'staff', 'view',        'See staff list', false),
('staff.create',      'staff', 'create',      'Invite staff', false),
('staff.edit',        'staff', 'edit',        'Modify staff', false),
('staff.permissions', 'staff', 'permissions', 'Assign permissions to staff', true),
('staff.suspend',     'staff', 'suspend',     'Remove staff access', true),
('settings.view',  'settings', 'view',   'See platform settings', false),
('settings.edit',  'settings', 'edit',   'Modify settings', true),
('audit.view',     'audit', 'view',      'See audit logs', true),
('support.view',   'support', 'view',    'See support area', false),
('support.reply',  'support', 'reply',   'Reply to support tickets', false),
('promos.view',    'promos', 'view',    'See discount codes', false),
('promos.create',  'promos', 'create',  'Create promo codes', false),
('promos.edit',    'promos', 'edit',    'Modify promos', false),
('promos.delete',  'promos', 'delete',  'Remove promos', false)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Built-in roles composed from permissions.
-- ---------------------------------------------------------------------------
insert into public.roles (name, description, is_builtin) values
('super_admin',    'Full platform access', true),
('admin',          'Operations and moderation (no revenue or finance)', true),
('finance',        'Revenue, payouts and financial reporting only', true),
('support',        'Customer support and ticket lookup', true),
('organizer',      'Host and manage their own events', true),
('viewer',         'Browse events and buy tickets', true),
('event_manager',  'Operate their own events (check-in, inventory)', true),
('scanner',        'QR check-in only', true),
('content',        'Event listing content and drafts', true),
('marketing',      'Promos and event analytics', true),
('analyst',        'Read-only analytics and audit', true)
on conflict (name) do nothing;

-- super_admin: every permission (idempotent cross join).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'super_admin'
on conflict (role_id, permission_id) do nothing;

-- Reusable helper to wire a role -> permission set by name (also reused by
-- future custom-role tooling). Callable by the migration owner and service role.
create or replace function public.grant_role_permissions(p_role_name text, p_permissions text[])
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  join public.permissions p on p.name = any (p_permissions)
  where r.name = p_role_name
  on conflict (role_id, permission_id) do nothing;
end;
$$;

revoke all on function public.grant_role_permissions(text, text[]) from public, anon, authenticated;
grant execute on function public.grant_role_permissions(text, text[]) to service_role;

-- ADMIN — operations and moderation. Deliberately NO revenue/payouts/
-- transactions/finance/analytics (sensitive money data stays finance-only).
select public.grant_role_permissions('admin', array[
  'events.view', 'events.create', 'events.edit', 'events.delete', 'events.approve', 'events.reject', 'events.cancel',
  'tickets.view',
  'attendees.view', 'attendees.contact',
  'orders.view', 'orders.cancel',
  'hosts.view', 'hosts.verify', 'hosts.suspend',
  'staff.view', 'staff.create', 'staff.edit', 'staff.permissions', 'staff.suspend',
  'audit.view',
  'support.view', 'support.reply',
  'settings.view'
]);

-- FINANCE — revenue and payouts only.
select public.grant_role_permissions('finance', array[
  'orders.view',
  'payouts.view', 'payouts.approve', 'payouts.process',
  'transactions.view', 'transactions.refund',
  'revenue.view',
  'analytics.revenue',
  'finance.export'
]);

-- SUPPORT — ticket support and lookup only (no refund approval).
select public.grant_role_permissions('support', array[
  'orders.view', 'orders.resend_ticket',
  'attendees.view', 'attendees.contact',
  'hosts.view',
  'support.view', 'support.reply'
]);

-- EVENT MANAGER — operate their own events. Self-scoped: no global data
-- permissions (orders.view / attendees.view / events.edit). Ownership reads
-- and writes flow through the legacy created_by = auth.uid() policies.
select public.grant_role_permissions('event_manager', array[
  'events.view',
  'tickets.view', 'tickets.manage_inventory',
  'attendees.checkin', 'attendees.export',
  'analytics.events'
]);

-- SCANNER — QR check-in only. Maximum restriction.
select public.grant_role_permissions('scanner', array[
  'events.view',
  'attendees.checkin'
]);

-- CONTENT — listings and drafts only (they create and then manage their OWN
-- drafts; they must never edit/publish another organiser's live event).
select public.grant_role_permissions('content', array[
  'events.view', 'events.create'
]);

-- MARKETING — promos and event analytics (no revenue or refunds).
select public.grant_role_permissions('marketing', array[
  'events.view',
  'promos.view', 'promos.create', 'promos.edit', 'promos.delete',
  'analytics.view', 'analytics.events'
]);

-- ANALYST — read-only: nothing they can modify (no .create/.edit/.delete/.approve).
select public.grant_role_permissions('analyst', array[
  'events.view',
  'tickets.view',
  'attendees.view',
  'orders.view',
  'analytics.view', 'analytics.events', 'analytics.revenue',
  'audit.view'
]);

-- ORGANIZER — hosts manage their OWN events (mirrors legacy behavior). Only
-- self-scoped grants: their data access rides on the ownership policies
-- (created_by = auth.uid()), so NO global data-scope perms are granted.
select public.grant_role_permissions('organizer', array[
  'events.view', 'events.create',
  'tickets.view', 'tickets.create', 'tickets.edit', 'tickets.manage_inventory',
  'attendees.checkin', 'attendees.export',
  'analytics.events'
]);

-- VIEWER — browse and buy.
select public.grant_role_permissions('viewer', array[
  'events.view',
  'tickets.view'
]);

-- ---------------------------------------------------------------------------
-- 6. Permission-checking functions.
-- ---------------------------------------------------------------------------

-- Whether the user's (multi) roles grant a specific permission. super_admin is
-- treated as "everything" so the platform owner is never locked out.
-- LANGUAGE plpgsql (not sql) so the body is validated at first call, not at
-- creation: user_roles is still created in section 7 below.
create or replace function public.user_has_permission(
  p_user_id uuid,
  p_permission_name text
)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
      and r.name = 'super_admin'
  ) then
    return true;
  end if;
  return exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = p_user_id
      and p.name = p_permission_name
  );
end;
$$;

-- All permission names a user currently holds (used by the frontend to gate
-- navigation and buttons without one RPC call per permission).
create or replace function public.user_permissions(p_user_id uuid)
returns text[]
language plpgsql
stable
security definer set search_path = public
as $$
begin
  return coalesce(
    (
      select array_agg(distinct p.name order by p.name)
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = p_user_id
    ),
    array[]::text[]
  );
end;
$$;

-- Client-friendly wrapper around user_has_permission() for the current user.
create or replace function public.check_permission(p_permission_name text)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
begin
  return public.user_has_permission((select auth.uid()), p_permission_name);
end;
$$;

grant execute on function public.user_has_permission(uuid, text) to authenticated, service_role;
grant execute on function public.user_permissions(uuid) to authenticated, service_role;
grant execute on function public.check_permission(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. user_roles — multi-role membership (created AFTER the permission-check
--    functions so the read policies can reference them).
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  assigned_by uuid references auth.users (id),
  assigned_at timestamptz not null default now(),
  reason text,
  primary key (user_id, role_id)
);

create index if not exists user_roles_role_idx on public.user_roles (role_id);
create index if not exists user_roles_user_idx on public.user_roles (user_id);

alter table public.user_roles enable row level security;

-- Users read their own memberships; staff read all memberships to render the
-- staff-management page. Mutations go through the gated functions below.
drop policy if exists "users read own roles" on public.user_roles;
create policy "users read own roles"
  on public.user_roles for select
  using (
    user_id = (select auth.uid())
    or public.user_has_permission((select auth.uid()), 'staff.permissions')
    or public.user_has_permission((select auth.uid()), 'staff.view')
  );

-- ---------------------------------------------------------------------------
-- 8. Every authenticated user is synced into user_roles from profiles.role.
--    Writes go through a SECURITY DEFINER trigger so the profile-update RLS
--    policy never has to grant direct user_roles insert access.
-- ---------------------------------------------------------------------------
create or replace function public.sync_user_profile_roles()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role_id uuid;
begin
  select id into v_role_id from public.roles where name = new.role;
  if v_role_id is not null then
    insert into public.user_roles (user_id, role_id, assigned_by, reason)
    values (new.id, v_role_id, new.id, 'Synced from profiles.role')
    on conflict (user_id, role_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_roles_sync on public.profiles;
create trigger trg_user_roles_sync
  after insert or update of role on public.profiles
  for each row execute function public.sync_user_profile_roles();

-- Backfill user_roles for every existing profile (idempotent).
insert into public.user_roles (user_id, role_id, assigned_by, reason)
select p.id, r.id, p.id, 'Backfilled from profiles.role'
from public.profiles p
join public.roles r on r.name = p.role
on conflict (user_id, role_id) do nothing;

-- ---------------------------------------------------------------------------
-- 9. Staff-driven custom-role + role-assignment functions. Everybody routes
--    through these SECURITY DEFINER functions so each mutation is gated and
--    audit-logged via the existing write_audit_log().
-- ---------------------------------------------------------------------------
create or replace function public.create_custom_role(p_name text, p_description text default null)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.check_permission('staff.permissions') then
    raise exception 'Forbidden';
  end if;
  if not (p_name ~ '^[a-z][a-z0-9_]{2,30}$') then
    raise exception 'Invalid role name';
  end if;
  if exists (select 1 from public.roles where name = p_name) then
    raise exception 'Role already exists';
  end if;
  insert into public.roles (name, description, is_builtin, created_by)
  values (p_name, p_description, false, (select auth.uid()))
  returning id into v_id;
  perform public.write_audit_log('custom_role_created', 'role', v_id::text,
    jsonb_build_object('name', p_name));
  return v_id;
end;
$$;

create or replace function public.set_role_permissions(p_role_id uuid, p_permissions text[])
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.check_permission('staff.permissions') then
    raise exception 'Forbidden';
  end if;
  -- Built-in roles are immutable from the app (prevent accidental lockouts).
  if exists (select 1 from public.roles where id = p_role_id
             and is_builtin) then
    raise exception 'Built-in roles cannot be modified';
  end if;
  delete from public.role_permissions where role_id = p_role_id;
  insert into public.role_permissions (role_id, permission_id)
  select p_role_id, id from public.permissions where name = any (p_permissions);
  perform public.write_audit_log('custom_role_permissions_set', 'role', p_role_id::text,
    jsonb_build_object('permissions', p_permissions));
end;
$$;

-- Replace a user's custom role set (always keeps their built-in sync role),
-- gated on staff.permissions and audit-logged.
create or replace function public.set_user_roles(p_user_id uuid, p_role_ids uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_target text;
  v_role_ids uuid[];
begin
  if not public.check_permission('staff.permissions') then
    raise exception 'Forbidden';
  end if;

  select role into v_target from public.profiles where id = p_user_id;
  if v_target is null then
    raise exception 'Profile not found';
  end if;
  if v_target = 'super_admin' then
    raise exception 'Cannot change the platform owner role';
  end if;

  -- Always include the user's built-in sync role; add the granted custom roles.
  select array(
    select r.id from public.roles r where r.name = v_target
  ) into v_role_ids;
  v_role_ids := v_role_ids || coalesce(p_role_ids, array[]::uuid[]);

  -- Prevent self-lockout: the acting staff member must keep staff.permissions.
  if p_user_id = (select auth.uid()) and not (
    exists (
      select 1 from public.roles r
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      where r.id = any (v_role_ids) and p.name = 'staff.permissions'
    )
  ) then
    raise exception 'You cannot remove your own staff access';
  end if;

  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role_id, assigned_by, reason)
  select distinct p_user_id, unnest(v_role_ids), (select auth.uid()),
         'Assigned via staff management';

  perform public.write_audit_log('set_user_roles', 'profile', p_user_id::text,
    jsonb_build_object('roles', v_role_ids));
end;
$$;

grant execute on function public.create_custom_role(text, text) to authenticated;
grant execute on function public.set_role_permissions(uuid, text[]) to authenticated;
grant execute on function public.set_user_roles(uuid, uuid[]) to authenticated;
revoke all on function public.create_custom_role(text, text) from public, anon;
revoke all on function public.set_role_permissions(uuid, text[]) from public, anon;
revoke all on function public.set_user_roles(uuid, uuid[]) from public, anon;

-- ---------------------------------------------------------------------------
-- 10. Roles table mutation policies (gated on staff.permissions).
-- ---------------------------------------------------------------------------
drop policy if exists "staff manage roles" on public.roles;
create policy "staff manage roles"
  on public.roles for insert
  with check (public.check_permission('staff.permissions'));

drop policy if exists "staff update roles" on public.roles;
create policy "staff update roles"
  on public.roles for update
  using (public.check_permission('staff.permissions'));

drop policy if exists "staff delete custom roles" on public.roles;
create policy "staff delete custom roles"
  on public.roles for delete
  using (
    public.check_permission('staff.permissions')
    and not is_builtin
  );

-- ---------------------------------------------------------------------------
-- 11. audit_logs records the permission each sensitive action required, so
--     you can audit "who accessed what" per permission (additive on top of
--     the existing write_audit_log signature).
-- ---------------------------------------------------------------------------
alter table public.audit_logs
  add column if not exists permission_required text;

-- ---------------------------------------------------------------------------
-- 12. Upgrade existing RLS policies from role checks to permission checks.
--     Every previously role-based gate now maps onto the permission model, so
--     the permission layer is the real server-side boundary (not just UI).
--     super_admin keeps implicit access via user_has_permission().
-- ---------------------------------------------------------------------------

-- 12a. profiles: staff read -> user data permissions; role management ->
--      staff.permissions. Self-read/edit branches are unchanged.
drop policy if exists "staff read all profiles" on public.profiles;
create policy "staff read all profiles"
  on public.profiles for select
  using (
    (select auth.uid()) = id
    or public.user_has_permission((select auth.uid()), 'attendees.view')
    or public.user_has_permission((select auth.uid()), 'hosts.view')
    or public.user_has_permission((select auth.uid()), 'staff.view')
    or public.user_has_permission((select auth.uid()), 'support.view')
  );

drop policy if exists "staff manage roles; users edit own profile" on public.profiles;
create policy "staff manage roles; users edit own profile"
  on public.profiles for update
  using (
    public.user_has_permission((select auth.uid()), 'staff.permissions')
    or (select auth.uid()) = id
  )
  with check (
    (
      -- staff.permissions holders may change any role, but 'super_admin' is
      -- owner-only and can only be granted via service role / SQL.
      public.user_has_permission((select auth.uid()), 'staff.permissions')
      and role in ('admin', 'finance', 'support', 'organizer', 'viewer')
    )
    or
    -- self-edit must not change role (no privilege escalation)
    ((select auth.uid()) = id and role = public.current_role())
  );

-- 12b. parties: admin moderation/update/delete -> events permissions.
drop policy if exists "organizers and admins update parties" on public.parties;
create policy "organizers and admins update parties"
  on public.parties for update
  using (
    (select auth.uid()) = created_by
    or public.user_has_permission((select auth.uid()), 'events.edit')
    or public.user_has_permission((select auth.uid()), 'events.approve')
  );

drop policy if exists "admins delete any party" on public.parties;
create policy "admins delete any party"
  on public.parties for delete
  using (public.user_has_permission((select auth.uid()), 'events.delete'));

-- 12c. ticket_types: visibility + management -> events/tickets permissions.
--      Management is SCOPED: the event owner manages ticket types on their own
--      party; staff ticket managers (tickets.* holder who also holds the
--      staff.view marker) may manage any party's ticket types.
drop policy if exists "ticket types of visible parties are readable" on public.ticket_types;
create policy "ticket types of visible parties are readable"
  on public.ticket_types for select
  using (
    exists (
      select 1 from public.parties
      where parties.id = ticket_types.party_id
        and (parties.status = 'approved'
             or parties.created_by = (select auth.uid())
             or public.user_has_permission((select auth.uid()), 'events.view'))
    )
  );

drop policy if exists "organizers and admins insert ticket types" on public.ticket_types;
create policy "organizers and admins insert ticket types"
  on public.ticket_types for insert
  with check (
    exists (
      select 1 from public.parties
      where parties.id = ticket_types.party_id
        and (
          parties.created_by = (select auth.uid())
          or (
            public.user_has_permission((select auth.uid()), 'tickets.create')
            and public.user_has_permission((select auth.uid()), 'staff.view')
          )
        )
    )
  );

drop policy if exists "organizers and admins update ticket types" on public.ticket_types;
create policy "organizers and admins update ticket types"
  on public.ticket_types for update
  using (
    exists (
      select 1 from public.parties
      where parties.id = ticket_types.party_id
        and (
          parties.created_by = (select auth.uid())
          or (
            public.user_has_permission((select auth.uid()), 'tickets.edit')
            and public.user_has_permission((select auth.uid()), 'staff.view')
          )
        )
    )
  );

drop policy if exists "organizers and admins delete ticket types" on public.ticket_types;
create policy "organizers and admins delete ticket types"
  on public.ticket_types for delete
  using (
    exists (
      select 1 from public.parties
      where parties.id = ticket_types.party_id
        and (
          parties.created_by = (select auth.uid())
          or (
            public.user_has_permission((select auth.uid()), 'tickets.edit')
            and public.user_has_permission((select auth.uid()), 'staff.view')
          )
        )
    )
  );

-- 12d. orders: staff-wide read -> orders.view; check-in -> attendees.checkin.
drop policy if exists "staff read all orders" on public.orders;
create policy "staff read all orders"
  on public.orders for select
  using (public.user_has_permission((select auth.uid()), 'orders.view'));

drop policy if exists "organizers or admins update check-in on their events" on public.orders;
create policy "organizers or admins update check-in on their events"
  on public.orders for update
  using (
    public.user_has_permission((select auth.uid()), 'attendees.checkin')
    or exists (
      select 1 from public.parties
      where parties.id = orders.party_id and parties.created_by = (select auth.uid())
    )
  );

-- 12e. payouts: read -> payouts.view; transitions -> payouts.approve/process.
--      (organizer self-read/request policies are unchanged.)
drop policy if exists "finance and admins manage payouts" on public.payouts;
create policy "finance reads payouts"
  on public.payouts for select
  using (public.user_has_permission((select auth.uid()), 'payouts.view'));

create policy "finance approves payouts"
  on public.payouts for update
  using (
    public.user_has_permission((select auth.uid()), 'payouts.approve')
    or public.user_has_permission((select auth.uid()), 'payouts.process')
  );

-- 12f. audit_logs: read -> audit.view (own rows still visible).
drop policy if exists "staff and organizers read audit logs" on public.audit_logs;
create policy "staff and organizers read audit logs"
  on public.audit_logs for select
  using (
    public.user_has_permission((select auth.uid()), 'audit.view')
    or actor_id = (select auth.uid())
  );

-- 12g. support tickets + messages: -> support.view / support.reply.
drop policy if exists "authors and staff manage support tickets" on public.support_tickets;
create policy "authors and staff manage support tickets"
  on public.support_tickets for all
  using (
    author_id = (select auth.uid())
    or public.user_has_permission((select auth.uid()), 'support.view')
  )
  with check (
    author_id = (select auth.uid())
    or public.user_has_permission((select auth.uid()), 'support.view')
  );

drop policy if exists "authors and staff read ticket messages" on public.support_messages;
create policy "authors and staff read ticket messages"
  on public.support_messages for select
  using (
    exists (
      select 1 from public.support_tickets
      where support_tickets.id = support_messages.ticket_id
        and (author_id = (select auth.uid())
             or public.user_has_permission((select auth.uid()), 'support.view'))
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
             or public.user_has_permission((select auth.uid()), 'support.reply'))
    )
  );

-- 12h. admin_notes: read/write for operational staff; delete for moderators.
drop policy if exists "staff read admin notes" on public.admin_notes;
create policy "staff read admin notes"
  on public.admin_notes for select
  using (
    public.user_has_permission((select auth.uid()), 'support.view')
    or public.user_has_permission((select auth.uid()), 'staff.view')
  );

drop policy if exists "staff write admin notes" on public.admin_notes;
create policy "staff write admin notes"
  on public.admin_notes for insert
  with check (
    public.user_has_permission((select auth.uid()), 'support.reply')
    or public.user_has_permission((select auth.uid()), 'staff.edit')
  );

drop policy if exists "staff delete admin notes" on public.admin_notes;
create policy "staff delete admin notes"
  on public.admin_notes for delete
  using (public.user_has_permission((select auth.uid()), 'staff.suspend'));

-- 12i. support content (canned responses + FAQs): -> support.view.
drop policy if exists "staff manage canned responses" on public.canned_responses;
create policy "staff manage canned responses"
  on public.canned_responses for all
  using (public.user_has_permission((select auth.uid()), 'support.view'))
  with check (public.user_has_permission((select auth.uid()), 'support.view'));

drop policy if exists "staff manage faqs" on public.faqs;
create policy "staff manage faqs"
  on public.faqs for all
  using (public.user_has_permission((select auth.uid()), 'support.view'))
  with check (public.user_has_permission((select auth.uid()), 'support.view'));

-- ---------------------------------------------------------------------------
-- 13. Batch-24 sweep.
--
--    * Closes self-scope leaks: organizer / event_manager / content must NOT
--      see the whole attendee/order/revenue surface, only their own data.
--    * Adds the missing newsletter.* and reviews.* permission families.
--    * Finishes the RLS conversion for storage, campaigns and reviews.
--    * Routes user-account suspension and the remaining server gates through
--      permission-checked, audit-logged functions/routes.
--
-- All statements are idempotent (delete-on-missing is a no-op, drop policy if
-- exists before recreate, create or replace for functions).
-- ---------------------------------------------------------------------------

-- 13a. Cleanup: remove the wrongly-granted global-scope permissions from
--      self-scoped roles. Harmless no-op on fresh installs; repairs databases
--      where an earlier 00024 already ran.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id and rp.permission_id = p.id
  and r.name in ('organizer', 'event_manager')
  and p.name in ('events.edit', 'orders.view', 'attendees.view');

delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id and rp.permission_id = p.id
  and r.name = 'organizer'
  and p.name = 'revenue.view';

delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id and rp.permission_id = p.id
  and r.name = 'content'
  and p.name = 'events.edit';

-- 13b. Newsletter + reviews permission families.
insert into public.permissions (name, resource, action, description, sensitive) values
('newsletter.view',     'newsletter', 'view',     'See newsletter subscriber lists', false),
('newsletter.manage',   'newsletter', 'manage',   'Create and send email campaigns', true),
('reviews.view',        'reviews',    'view',     'See all event reviews', true),
('reviews.moderate',    'reviews',    'moderate', 'Hide or remove reviews', true)
on conflict (name) do nothing;

-- super_admin is re-crossed so an already-applied 00024 still keeps the owner
-- at "everything".
select public.grant_role_permissions('super_admin', array[
  'newsletter.view', 'newsletter.manage', 'reviews.view', 'reviews.moderate'
]);
select public.grant_role_permissions('admin', array[
  'newsletter.view', 'reviews.view', 'reviews.moderate'
]);
select public.grant_role_permissions('support', array[
  'newsletter.view', 'reviews.view', 'reviews.moderate'
]);
select public.grant_role_permissions('marketing', array[
  'newsletter.view', 'newsletter.manage', 'reviews.view'
]);

-- 13c. Newsletters / campaigns -> newsletter permissions.
drop policy if exists "staff read newsletter subscribers" on public.newsletter_subscribers;
create policy "staff read newsletter subscribers"
  on public.newsletter_subscribers for select
  using (public.user_has_permission((select auth.uid()), 'newsletter.view'));

drop policy if exists "staff manage campaigns" on public.email_campaigns;
create policy "staff manage campaigns"
  on public.email_campaigns for all
  using (public.user_has_permission((select auth.uid()), 'newsletter.manage'))
  with check (public.user_has_permission((select auth.uid()), 'newsletter.manage'));

drop policy if exists "staff manage campaign sends" on public.campaign_sends;
create policy "staff manage campaign sends"
  on public.campaign_sends for all
  using (public.user_has_permission((select auth.uid()), 'newsletter.manage'))
  with check (public.user_has_permission((select auth.uid()), 'newsletter.manage'));

-- 13d. Reviews -> reviews permissions (staff read every review; the public
--      visibility branch swaps the legacy is_admin check for events.view).
drop policy if exists "reviews of visible parties are readable" on public.reviews;
create policy "reviews of visible parties are readable"
  on public.reviews for select
  using (
    reviews.moderation_status = 'visible'
    and exists (
      select 1 from public.parties
      where parties.id = reviews.party_id
        and (parties.status = 'approved'
             or parties.created_by = (select auth.uid())
             or public.user_has_permission((select auth.uid()), 'events.view'))
    )
  );

drop policy if exists "staff read all reviews" on public.reviews;
create policy "staff read all reviews"
  on public.reviews for select
  using (public.user_has_permission((select auth.uid()), 'reviews.view'));

-- 13e. Storage: staff image operations -> events.edit (organizers keep their
--      own-party upload/replace/delete policies unchanged).
drop policy if exists "Staff manage event images" on storage.objects;
create policy "Staff manage event images"
  on storage.objects for all
  using (
    bucket_id = 'event-images'
    and public.user_has_permission((select auth.uid()), 'events.edit')
  );

-- 13f. profiles: drop the legacy admin wide-open UPDATE policy. Account status
--      now goes through set_user_account_status(); role changes already go
--      through set_user_roles() / the staff-managed profile policy above.
drop policy if exists "staff suspend or role-manage profiles" on public.profiles;

create or replace function public.set_user_account_status(
  p_user_id uuid,
  p_account_status text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_target_role text;
begin
  if not public.check_permission('staff.suspend') then
    raise exception 'Forbidden';
  end if;
  if p_account_status not in ('active', 'suspended') then
    raise exception 'Invalid status';
  end if;
  select role into v_target_role from public.profiles where id = p_user_id;
  if v_target_role is null then
    raise exception 'Profile not found';
  end if;
  if v_target_role = 'super_admin' then
    raise exception 'Cannot change the platform owner account status';
  end if;
  update public.profiles
    set account_status = p_account_status
  where id = p_user_id;
  perform public.write_audit_log(
    case when p_account_status = 'suspended' then 'user_suspended' else 'user_reinstated' end,
    'profile',
    p_user_id::text,
    jsonb_build_object('account_status', p_account_status)
  );
end;
$$;

revoke all on function public.set_user_account_status(uuid, text) from public, anon;
grant execute on function public.set_user_account_status(uuid, text) to authenticated, service_role;

-- 13g. Event review status + its enforcement trigger -> events permissions.
create or replace function public.enforce_event_review_flow()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_bypass boolean;
begin
  v_bypass := coalesce(nullif(current_setting('app.bypass_event_review', true), ''), '') = 'on';

  if v_bypass or auth.role() = 'service_role'
     or public.user_has_permission((select auth.uid()), 'events.approve')
     or public.user_has_permission((select auth.uid()), 'events.reject')
     or public.user_has_permission((select auth.uid()), 'events.cancel') then
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('approved', 'rejected', 'suspended') then
      raise exception 'Only staff with event moderation permission can approve, reject or suspend an event';
    end if;
    if new.status in ('draft', 'pending') and old.created_by <> (select auth.uid()) then
      raise exception 'Only the host of this event can submit or withdraw it';
    end if;
  end if;

  if new.review_reason is distinct from old.review_reason then
    raise exception 'Review notes are written by staff';
  end if;

  return new;
end;
$$;

create or replace function public.set_event_review_status(
  p_party_id bigint,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_party public.parties%rowtype;
  v_is_staff boolean;
  v_action text;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role from public.profiles where id = v_actor;
  if v_role is null then
    raise exception 'Profile not found';
  end if;
  select * into v_party from public.parties where id = p_party_id;
  if v_party.id is null then
    raise exception 'Event not found';
  end if;

  -- Staff = anyone holding platform-wide event moderation permissions.
  v_is_staff :=
    public.user_has_permission(v_actor, 'events.approve')
    or public.user_has_permission(v_actor, 'events.reject')
    or public.user_has_permission(v_actor, 'events.cancel');

  if p_status not in ('draft', 'pending', 'approved', 'rejected', 'suspended') then
    raise exception 'Invalid status';
  end if;

  -- Staff-only terminal states.
  if p_status in ('approved', 'rejected', 'suspended') and not v_is_staff then
    raise exception 'Forbidden';
  end if;

  -- Rejections / suspensions need a reason (shown to the host + staff note).
  if p_status in ('rejected', 'suspended') and coalesce(p_reason, '') = '' then
    raise exception 'A reason is required';
  end if;

  -- Host submission rules.
  if p_status = 'pending' then
    if not v_is_staff and v_party.created_by <> v_actor then
      raise exception 'Only the host can submit their own event';
    end if;
    if not v_is_staff and v_party.status not in ('draft', 'rejected') then
      raise exception 'Only a draft or rejected event can be submitted for review';
    end if;
  end if;

  -- Host withdrawal rules.
  if p_status = 'draft' then
    if not v_is_staff and v_party.created_by <> v_actor then
      raise exception 'Only the host can withdraw their own event';
    end if;
    if not v_is_staff and v_party.status <> 'pending' then
      raise exception 'Only a pending event can be withdrawn to draft';
    end if;
  end if;

  perform set_config('app.bypass_event_review', 'on', true);
  update public.parties
    set status = p_status,
        review_reason = case
          when p_status in ('rejected', 'suspended') then coalesce(p_reason, null)
          else null
        end
    where id = p_party_id;
  perform set_config('app.bypass_event_review', 'off', true);

  -- The reason doubles as a staff-visible note scoped to this event.
  if p_reason is not null and p_reason <> '' then
    insert into public.admin_notes (author_id, target_type, target_id, body)
    values (v_actor, 'party', p_party_id::text, p_reason);
  end if;

  v_action := case p_status
    when 'draft' then 'event_withdrawn'
    when 'pending' then 'event_submitted'
    when 'approved' then 'event_approved'
    when 'rejected' then 'event_rejected'
    else 'event_disabled'
  end;

  perform public.write_audit_log(
    v_action,
    'event',
    p_party_id::text,
    jsonb_build_object('previous_status', v_party.status, 'status', p_status, 'reason', p_reason)
  );
end;
$$;

-- 13h. Host verification enforcement -> hosts.verify.
create or replace function public.enforce_host_verification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role'
     or public.user_has_permission((select auth.uid()), 'hosts.verify') then
    return new;
  end if;

  if new.host_verification_status is distinct from old.host_verification_status
    or new.host_verification_requested_at is distinct from old.host_verification_requested_at
    or new.host_verification_reviewed_at is distinct from old.host_verification_reviewed_at
    or new.host_verification_reviewed_by is distinct from old.host_verification_reviewed_by
    or new.host_verification_reason is distinct from old.host_verification_reason
    or new.business_name is distinct from old.business_name
    or new.website is distinct from old.website then
    raise exception 'Host verification details go through the review flow';
  end if;

  return new;
end;
$$;

-- party_host_verified: the staff edge now uses events.view instead of the
-- legacy role list.
create or replace function public.party_host_verified(p_party_id bigint)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select prof.host_verification_status = 'verified'
    from public.parties p
    join public.profiles prof on prof.id = p.created_by
    where p.id = p_party_id
      and prof.host_verification_status = 'verified'
      and (
        p.status = 'approved'
        or p.created_by = (select auth.uid())
        or public.user_has_permission((select auth.uid()), 'events.view')
      )
  ), false);
$$;

-- 13i. Review moderation -> reviews.moderate.
create or replace function public.moderate_review(
  p_review_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_review public.reviews%rowtype;
  v_previous text;
  v_party_id bigint;
begin
  if v_actor is null or not public.check_permission('reviews.moderate') then
    raise exception 'Forbidden' using errcode = 'P0001';
  end if;

  if p_status not in ('visible', 'hidden', 'removed') then
    raise exception 'Invalid moderation status' using errcode = 'P0001';
  end if;

  if p_status in ('hidden', 'removed') and coalesce(p_reason, '') = '' then
    raise exception 'A reason is required' using errcode = 'P0001';
  end if;

  select * into v_review from public.reviews where id = p_review_id;
  if not found then
    raise exception 'Review not found' using errcode = 'P0001';
  end if;

  v_previous := v_review.moderation_status;
  v_party_id := v_review.party_id;

  update public.reviews
    set moderation_status = p_status,
        moderated_at = now(),
        moderated_by = v_actor,
        moderation_reason = nullif(trim(p_reason), '')
    where id = p_review_id;

  update public.parties p
  set review_count = agg.cnt,
      avg_rating = round(coalesce(agg.avg_r, 0)::numeric, 2)
  from (
    select count(*)::integer as cnt, avg(rating) as avg_r
    from public.reviews
    where party_id = v_party_id
      and moderation_status = 'visible'
  ) agg
  where p.id = v_party_id;

  perform public.write_audit_log(
    'review_moderated',
    'review',
    p_review_id::text,
    jsonb_build_object('party_id', v_party_id, 'previous_status', v_previous, 'status', p_status, 'reason', p_reason)
  );
end;
$$;

-- 13j. Payout requests: keep pure ownership + verified-active-host gating
--      (drop the legacy role list; an organizer is always verified+active
--      before they can request a payout, and requests are bound to self).
drop policy if exists "organizers request their own payouts" on public.payouts;
create policy "organizers request their own payouts"
  on public.payouts for insert
  with check (
    organizer_id = (select auth.uid())
    and status = 'pending'
    and paid_at is null
    and bank_last4 is null
    and coalesce((
      select host_verification_status = 'verified' and account_status = 'active'
      from public.profiles
      where id = (select auth.uid())
    ), false)
  );