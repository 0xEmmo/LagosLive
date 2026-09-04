-- ===========================================================================
-- Role management batch (Batch 16) — IDEMPOTENT / re-runnable.
--
-- Adds the two role-management flows the platform needs but previously lacked:
--   1. Auto-promoting a first-time creator to 'organizer' when they create
--      their first event.
--   2. Staff (admin/super_admin) promoting/demoting users to the 'admin' role.
--
-- Design:
--   * Roles stay a SINGLE value on profiles.role (viewer/organizer/support/
--     finance/admin/super_admin) — the same model every RLS policy, the
--     is_admin trigger, and the whole client (User.role) already use. We
--     deliberately do NOT move to a multi-role array; that would break the
--     existing current_role()/has_role() authz everywhere.
--   * Both mutations are exposed as SECURITY DEFINER functions so they run
--     with elevated privileges (promotion must not be blocked by the profile
--     self-update rule), and EVERY change is written to audit_logs.
--   * We also close a privilege-escalation gap in the existing profiles
--     update policy: it only had USING and no WITH CHECK, so a plain user
--     could UPDATE their own row's role to 'admin'. The new WITH CHECK locks
--     self-edits to leaving role unchanged and scopes role changes to staff.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. set_user_role — staff-only role assignment (admin / super_admin).
--    Super_admin is reserved for the platform owner and cannot be assigned,
--    and a super_admin profile cannot be demoted by another admin.
-- ---------------------------------------------------------------------------
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor text;
  v_target text;
begin
  select public.current_role() into v_actor;

  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not (v_actor in ('admin', 'super_admin')) then
    raise exception 'Forbidden';
  end if;

  if p_role not in ('viewer', 'organizer', 'support', 'finance', 'admin') then
    raise exception 'Invalid role';           -- super_admin cannot be assigned
  end if;

  select role into v_target from public.profiles where id = p_user_id;
  if v_target is null then
    raise exception 'Profile not found';
  end if;

  if v_target = 'super_admin' then
    raise exception 'Cannot change the platform owner role';  -- protect the owner
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  perform public.write_audit_log(
    'set_user_role',
    'profile',
    p_user_id::text,
    jsonb_build_object('previous_role', v_target, 'new_role', p_role)
  );
end;
$$;

revoke all on function public.set_user_role(uuid, text) from public, anon, authenticated;
grant execute on function public.set_user_role(uuid, text) to service_role;
-- authenticated users call it through the staff-gated API route, not directly.

-- ---------------------------------------------------------------------------
-- 2. auto_promote_creator_to_organizer — promoted a first-time creator from
--    'viewer' to 'organizer' right after their event insert succeeds. Safe to
--    call on every event creation: it is a no-op once the caller is already
--    an organizer (or higher).
-- ---------------------------------------------------------------------------
create or replace function public.auto_promote_creator_to_organizer(p_party_id bigint)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_owns boolean;
begin
  if v_uid is null then
    return false;
  end if;

  -- Only the party's creator can trigger their own promotion, and only after
  -- the party actually exists (defence in depth: identity column must be real).
  select exists (
    select 1 from public.parties where id = p_party_id and created_by = v_uid
  ) into v_owns;

  if not v_owns then
    return false;
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then
    return false;
  end if;

  -- Already organizer/higher? No promotion needed (finish/support/admin/etc.
  -- keep their existing role — we never downgrade anyone here).
  if v_role in ('organizer', 'super_admin', 'admin', 'finance', 'support') then
    return false;
  end if;

  update public.profiles set role = 'organizer' where id = v_uid;

  perform public.write_audit_log(
    'auto_promoted_to_organizer',
    'profile',
    v_uid::text,
    jsonb_build_object('party_id', p_party_id, 'previous_role', v_role, 'new_role', 'organizer')
  );

  return true;
end;
$$;

revoke all on function public.auto_promote_creator_to_organizer(bigint) from public, anon;
grant execute on function public.auto_promote_creator_to_organizer(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Harden the profiles update policy.
--    Previously it was USING-without-WITH-CHECK, meaning a user could update
--    their own row's role (privilege escalation). Now:
--      * staff (admin/super_admin) may change a profile's role — but never to
--        'super_admin' (that is owner-only, assigned via SQL/service role).
--      * anyone may update their own row only if role stays unchanged.
-- ---------------------------------------------------------------------------
drop policy if exists "staff suspend or role-manage profiles" on public.profiles;

create policy "staff manage roles; users edit own profile"
  on public.profiles for update
  using (
    public.has_role(array['admin', 'super_admin'])
    or auth.uid() = id
  )
  with check (
    (
      -- staff may change any profile's role, but 'super_admin' is owner-only
      -- and can only be granted via service role / SQL, never through RLS.
      public.has_role(array['admin', 'super_admin'])
      and role in ('admin', 'finance', 'support', 'organizer', 'viewer')
    )
    or
    -- self-edit must not change role (no privilege escalation)
    (auth.uid() = id and role = public.current_role())
  );
