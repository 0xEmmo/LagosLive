-- ===========================================================================
-- 00035 — Part 1: profile privilege lockdown
-- ===========================================================================
-- Forward-only. Nothing in 00001-00034 is modified; migrations that may already
-- be applied in production are left untouched.
--
-- THE VULNERABILITY (reproduced with real RLS, see
-- scripts/tests/profiles-rls.test.ts)
-- ---------------------------------------------------------------------------
-- 00001 created "users update their own profile" as
--     for update using (auth.uid() = id)
-- with NO with check clause, so its WITH CHECK implicitly reuses USING and
-- constrains nothing but row identity. 00004 re-created that same policy and
-- NO later migration ever dropped it.
--
-- 00013/00016/00024 each added a *better* UPDATE policy, but PostgreSQL
-- combines PERMISSIVE policies with OR. The permissive 00004 policy therefore
-- OR-ed away every WITH CHECK added afterwards, including the 00024 guard that
-- pinned `role`. The result, verified against a live database:
--
--   update profiles set is_admin         = true   where id = auth.uid();  -- ok
--   update profiles set role             = 'admin' where id = auth.uid();  -- ok
--   update profiles set account_status   = 'active' where id = auth.uid(); -- ok
--   update profiles set kyc_status       = 'approved' where id = auth.uid();
--   update profiles set bank_account_encrypted = '...';
--   update profiles set payout_preferences = '{...}';
--   update profiles set host_verification_status = 'verified';
--
-- is_admin is not cosmetic: 00007's "approved parties are publicly readable"
-- policy still reads it, so a self-promoted user could read every event
-- including drafts and rejected ones.
--
-- THE FIX
-- ---------------------------------------------------------------------------
-- 1. Drop the unqualified self-update policy and every other broad profile
--    UPDATE policy, so exactly one policy governs the table.
-- 2. Column-level privileges: revoke table-wide UPDATE from anon/authenticated
--    and grant UPDATE only on the safe self-service columns. Even if a future
--    policy is written too loosely, a raw PostgREST PATCH naming a privileged
--    column is refused by the grant layer, not by policy logic alone.
-- 3. A BEFORE UPDATE guard trigger as defence in depth: any change to a
--    privileged column is rejected unless the caller holds staff.permissions or
--    is service_role. This survives future policy edits and covers writes that
--    do not come through a user-facing policy at all.
-- 4. A whitelisted SECURITY DEFINER RPC, update_my_profile(), as the supported
--    self-service write path.
-- 5. Super-admin invariants: the last super_admin cannot be demoted or
--    suspended, and a user cannot demote themselves.
-- 6. write_audit_log is no longer callable over PostgREST by end users, which
--    closes audit-row forgery (it records actor_id = auth.uid()).
-- 7. user_has_permission()/user_permissions() no longer answer questions about
--    *other* users for callers without staff.permissions.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Remove the broad self-update policies
-- ---------------------------------------------------------------------------
-- 00001:63 / 00004:9-10 -- the unqualified one, with no WITH CHECK.
drop policy if exists "users update their own profile" on public.profiles;
-- 00013:343 -- "has_role(admin) or auth.uid() = id", no WITH CHECK.
drop policy if exists "staff suspend or role-manage profiles" on public.profiles;
-- 00016:142 -- first revision, superseded by 00024 but drop defensively.
drop policy if exists "staff manage roles" on public.profiles;

-- ---------------------------------------------------------------------------
-- 2. Column-level UPDATE privileges
-- ---------------------------------------------------------------------------
-- Supabase grants ALL on every table in public to anon/authenticated, so RLS
-- is the only barrier. Narrow the grant itself to the columns a user may
-- legitimately change about themselves.
--
-- Deliberately NOT granted: role, account_status and every other privileged
-- column. Those are only reachable through the audited SECURITY DEFINER
-- functions (set_user_role, set_user_account_status, set_user_roles,
-- set_host_verification_status), so a role or suspension change always carries
-- the permission check and the audit row that the product requires.
revoke update on public.profiles from anon, authenticated;

grant update (
  name,
  phone,
  bio,
  push_enabled,
  last_activity_at
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Single UPDATE policy
-- ---------------------------------------------------------------------------
-- Only ONE policy may govern this table: PostgreSQL ORs permissive policies
-- together, so a second, looser policy silently voids a stricter WITH CHECK.
-- The privileged columns are not re-checked here because comparing them to
-- their previous values requires reading public.profiles from inside its own
-- policy, which PostgreSQL rejects as infinite recursion. Those columns are
-- already unreachable at the grant layer (section 2) and re-validated by the
-- guard trigger (section 4), so the layering is grant -> trigger -> policy.
drop policy if exists "staff manage roles; users edit own profile" on public.profiles;

create policy "staff manage roles; users edit own profile"
  on public.profiles
  for update
  using (
    public.user_has_permission((select auth.uid()), 'staff.permissions')
    or (select auth.uid()) = id
  )
  with check (
    (
      public.user_has_permission((select auth.uid()), 'staff.permissions')
      and role in ('admin', 'finance', 'support', 'organizer', 'viewer')
    )
    or
    -- self-edit must not change role (no privilege escalation)
    ((select auth.uid()) = id and role = public.current_role())
  );

-- ---------------------------------------------------------------------------
-- 4. Guard trigger: privileged columns are staff/service only
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- is_admin is a mirror of role, never an independent input. Deriving it here
  -- means it cannot diverge no matter who performs the write, including the
  -- staff branch below and the owner/legacy sync_is_admin trigger.
  new.is_admin := (new.role in ('admin', 'super_admin'));

  -- This guard exists to constrain the PostgREST/REST surface. Anything reached
  -- through the API carries an anon/authenticated/service_role JWT, so those
  -- three are the only roles worth constraining. A direct SQL session (a
  -- migration, a psql superuser, a SECURITY DEFINER function running as the
  -- owner) presents no API role and is deliberately not restricted here.
  if auth.role() not in ('anon', 'authenticated') then
    return new;
  end if;

  if public.user_has_permission((select auth.uid()), 'staff.permissions') then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_admin is distinct from old.is_admin
     or new.account_status is distinct from old.account_status
     or new.kyc_status is distinct from old.kyc_status
     or new.bank_account_encrypted is distinct from old.bank_account_encrypted
     or new.payout_preferences is distinct from old.payout_preferences
     or new.host_verification_status is distinct from old.host_verification_status
     or new.host_verification_requested_at is distinct from old.host_verification_requested_at
     or new.host_verification_reviewed_at is distinct from old.host_verification_reviewed_at
     or new.host_verification_reviewed_by is distinct from old.host_verification_reviewed_by
     or new.host_verification_reason is distinct from old.host_verification_reason
     or new.business_name is distinct from old.business_name then
    raise exception 'Privileged profile fields can only be changed by staff'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_privileged on public.profiles;
create trigger trg_profiles_guard_privileged
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- 5. Super-admin invariants
-- ---------------------------------------------------------------------------
create or replace function public.guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  -- Same reasoning as guard_profile_privileged_columns(): only API sessions are
  -- constrained, so platform operations and migrations still work.
  if auth.role() not in ('anon', 'authenticated') then
    return new;
  end if;

  -- Only relevant when this row is (or was) a super admin.
  if old.role is distinct from 'super_admin' and new.role is distinct from 'super_admin' then
    return new;
  end if;

  if new.role = 'super_admin'
     and new.account_status = 'active'
     and old.role = 'super_admin'
     and old.account_status = 'active' then
    return new;  -- unchanged
  end if;

  if new.id = (select auth.uid())
     and (new.role is distinct from old.role or new.account_status is distinct from old.account_status) then
    raise exception 'You cannot change your own role or account status'
      using errcode = '42501';
  end if;

  select count(*) into v_remaining
  from public.profiles
  where role = 'super_admin'
    and account_status = 'active'
    and id <> old.id;

  if v_remaining = 0 then
    raise exception 'The last active super admin cannot be demoted or suspended'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_last_super_admin on public.profiles;
create trigger trg_profiles_guard_last_super_admin
  before update of role, account_status on public.profiles
  for each row execute function public.guard_last_super_admin();

-- ---------------------------------------------------------------------------
-- 6. Whitelisted self-service RPC
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is required so the write is not blocked by the narrowed
-- column grant above, and so the field list lives in exactly one place. The
-- function never reads role/is_admin/account_status from its arguments.
create or replace function public.update_my_profile(
  p_name text default null,
  p_phone text default null,
  p_bio text default null,
  p_push_enabled boolean default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.profiles
     set name = coalesce(p_name, name),
         phone = coalesce(p_phone, phone),
         bio = coalesce(p_bio, bio),
         push_enabled = coalesce(p_push_enabled, push_enabled),
         last_activity_at = now()
   where id = v_uid
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  perform public.write_audit_log(
    'profile_self_update',
    'profile',
    v_uid::text,
    jsonb_build_object('fields', (
      select coalesce(jsonb_agg(f), '[]'::jsonb)
      from unnest(array['name','phone','bio','push_enabled']) as f
      where f in (
        case when p_name        is not null then 'name'        end,
        case when p_phone       is not null then 'phone'       end,
        case when p_bio         is not null then 'bio'         end,
        case when p_push_enabled is not null then 'push_enabled' end
      )
    ))
  );

  return v_row;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, boolean) from public, anon;
grant execute on function public.update_my_profile(text, text, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Audit-log forgery
-- ---------------------------------------------------------------------------
-- write_audit_log is SECURITY DEFINER and stamps actor_id = auth.uid(), so
-- leaving it executable over PostgREST let any signed-in user fabricate audit
-- rows attributed to themselves. Internal callers are SECURITY DEFINER
-- functions running as the owner, and the service-role API route keeps access.
revoke all on function public.write_audit_log(text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.write_audit_log(text, text, text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Permission probing
-- ---------------------------------------------------------------------------
-- user_has_permission()/user_permissions() accepted an arbitrary user id, so
-- any authenticated user could enumerate everyone else's grants. Restrict the
-- answer to the caller unless they hold staff.permissions. Returning false
-- rather than raising keeps RLS policies from turning into query errors.
create or replace function public.user_has_permission(
  p_user_id uuid,
  p_permission_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is distinct from (select auth.uid())
     and not public.user_has_permission((select auth.uid()), 'staff.permissions') then
    return false;
  end if;

  return public.user_has_permission_unchecked(p_user_id, p_permission_name);
end;
$$;

create or replace function public.user_has_permission_unchecked(p_user_id uuid, p_permission_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
      and r.name = 'super_admin'
  ) or exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = p_user_id
      and p.name = p_permission_name
  );
$$;

revoke all on function public.user_has_permission_unchecked(uuid, text) from public, anon, authenticated;
grant execute on function public.user_has_permission_unchecked(uuid, text) to service_role;

grant execute on function public.user_has_permission(uuid, text) to authenticated, service_role;

create or replace function public.user_permissions(p_user_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is distinct from auth.uid()
     and not public.user_has_permission(auth.uid(), 'staff.permissions') then
    return array[]::text[];
  end if;

  return public.user_permissions_unchecked(p_user_id);
end;
$$;

create or replace function public.user_permissions_unchecked(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.name), array[]::text[])
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where ur.user_id = p_user_id;
$$;

revoke all on function public.user_permissions_unchecked(uuid) from public, anon, authenticated;
grant execute on function public.user_permissions_unchecked(uuid) to service_role;

grant execute on function public.user_permissions(uuid) to authenticated, service_role;
