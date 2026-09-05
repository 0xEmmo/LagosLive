-- ===========================================================================
-- Host trust batch (Phase 3) — IDEMPOTENT / re-runnable.
--
-- Adds the trust layer that lets buyers rely on who they're paying:
--   1. Host verification on profiles (unverified/pending/verified/rejected)
--      plus public business_name/website, decided by admin review — NOT KYC
--      documents, deliberately manual and lightweight.
--   2. A proper event lifecycle: new events become drafts, hosts submit them
--      for review (pending), admins approve/reject/suspend. "Cancelled" stays
--      the existing cancelled_at sentinel.
--   3. Payout protection: only verified, active hosts can request payouts.
--   4. Refund model gains a real 'failed' state so a failed Paystack refund
--      can be surfaced and retried instead of silently breaking the CHECK.
--
-- Enforcement model:
--   * RLS stays the access layer, but RLS can never compare the OLD row to
--     the NEW row, so the "host can't self-approve" rule is enforced by
--     BEFORE triggers (defense in depth) that inspect OLD vs NEW.
--   * All legitimate status transitions go through set_event_review_status(),
--     a SECURITY DEFINER RPC that does its own authorization, records the
--     reason on parties.review_reason (host-readable) and in admin_notes
--     (staff-only), and writes the audit trail. The RPC sets a transaction-
--     local config flag that the review trigger honours so it can perform
--     the same UPDATE it blocks for direct public writes.
--   * Host verification fields can only be written by staff / service role.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Profiles — host verification fields.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists host_verification_status text not null default 'unverified'
    check (host_verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  add column if not exists host_verification_requested_at timestamptz,
  add column if not exists host_verification_reviewed_at timestamptz,
  add column if not exists host_verification_reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists host_verification_reason text,
  add column if not exists business_name text,
  add column if not exists website text;

create index if not exists profiles_host_verification_status_idx
  on public.profiles (host_verification_status);

-- ---------------------------------------------------------------------------
-- 2. Parties — lifecycle gains a draft state + a host-readable review reason.
--    The 'draft' state is new; approved/pending/rejected/suspended semantics
--    are unchanged, so existing production events are untouched.
-- ---------------------------------------------------------------------------
alter table public.parties drop constraint if exists parties_status_check;
alter table public.parties
  add constraint parties_status_check
  check (status in ('draft', 'pending', 'approved', 'rejected', 'suspended'));

alter table public.parties add column if not exists review_reason text;

-- ---------------------------------------------------------------------------
-- 3. Orders — refunds gain a terminal 'failed' state so a refund that
--    Paystack rejected can be surfaced and retried instead of forcing a value
--    that violated the old CHECK.
-- ---------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_refund_status_check;
alter table public.orders
  add constraint orders_refund_status_check
  check (refund_status in ('none', 'requested', 'processing', 'refunded', 'rejected', 'failed'));

-- ---------------------------------------------------------------------------
-- 4. Event review trigger (defense in depth on top of the RLS update policy).
--    Admins may set any status; hosts may only submit their own draft/rejected
--    event to 'pending' or withdraw their own 'pending' back to 'draft'.
--    Everyone else is blocked from changing the status column, and no one may
--    rewrite review_reason except admins. service_role (API routes) bypasses
--    via auth.role(), and set_event_review_status() opts in via the
--    app.bypass_event_review transaction-local flag.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_event_review_flow()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
  v_bypass boolean;
begin
  v_role := public.current_role();
  v_bypass := coalesce(nullif(current_setting('app.bypass_event_review', true), ''), '') = 'on';

  if v_bypass or auth.role() = 'service_role' or v_role in ('admin', 'super_admin') then
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('approved', 'rejected', 'suspended') then
      raise exception 'Only an admin can approve, reject or suspend an event';
    end if;
    if new.status in ('draft', 'pending') and old.created_by <> (select auth.uid()) then
      raise exception 'Only the host of this event can submit or withdraw it';
    end if;
  end if;

  if new.review_reason is distinct from old.review_reason then
    raise exception 'Review notes are written by admins';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_parties_enforce_review_flow on public.parties;
create trigger trg_parties_enforce_review_flow
  before insert or update on public.parties
  for each row execute function public.enforce_event_review_flow();

-- ---------------------------------------------------------------------------
-- 5. Host verification trigger — a user can never set their own verification
--    fields (or business_name/website) directly; that happens only through
--    the host request flow and the admin review route, both service-role.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_host_verification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
begin
  v_role := public.current_role();

  if auth.role() = 'service_role' or v_role in ('admin', 'super_admin') then
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

drop trigger if exists trg_profiles_enforce_host_verification on public.profiles;
create trigger trg_profiles_enforce_host_verification
  before update on public.profiles
  for each row execute function public.enforce_host_verification();

-- ---------------------------------------------------------------------------
-- 6. set_event_review_status — the one legitimate path for status changes.
--    Authorization is enforced here (not just by the trigger): admins can
--    approve/reject/suspend (reject/suspend require a reason); hosts can only
--    submit their own draft/rejected event or withdraw their own pending one.
--    Every transition is audited, the reason lands on parties.review_reason
--    (visible to the host on their own event) and in admin_notes (staff only),
--    and reject/suspend clears nothing else — the event just leaves the
--    public feed the same way rejected/suspended rows always have.
-- ---------------------------------------------------------------------------
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
  v_is_staff := v_role in ('admin', 'super_admin');

  if p_status not in ('draft', 'pending', 'approved', 'rejected', 'suspended') then
    raise exception 'Invalid status';
  end if;

  select * into v_party from public.parties where id = p_party_id;
  if v_party.id is null then
    raise exception 'Event not found';
  end if;

  -- Admin-only terminal states.
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

revoke all on function public.set_event_review_status(bigint, text, text) from public, anon;
grant execute on function public.set_event_review_status(bigint, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. party_host_verified — public "Verified Host" signal. Only ever reveals a
--    boolean, and only when the party is publicly visible (approved) or the
--    caller is the owner/staff, so drafts and rejected events never leak.
-- ---------------------------------------------------------------------------
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
        or public.has_role(array['support', 'finance', 'admin', 'super_admin'])
      )
  ), false);
$$;

revoke all on function public.party_host_verified(bigint) from public;
grant execute on function public.party_host_verified(bigint) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Payout protection — hardened INSERT policy: payouts can only be requested
--    by hosts who are BOTH verified AND active. (Server-side enforcement lives
--    in /api/payouts/request; this is the RLS backstop so a direct client call
--    can never walk around it.)
-- ---------------------------------------------------------------------------
drop policy if exists "organizers request their own payouts" on public.payouts;
create policy "organizers request their own payouts"
  on public.payouts for insert
  with check (
    organizer_id = (select auth.uid())
    and status = 'pending'
    and paid_at is null
    and bank_last4 is null
    and public.has_role(array['organizer', 'admin', 'super_admin'])
    and coalesce((
      select host_verification_status = 'verified' and account_status = 'active'
      from public.profiles
      where id = (select auth.uid())
    ), false)
  );