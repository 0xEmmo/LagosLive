-- ===========================================================================
-- Host Verification KYC — Batch 32. IDEMPOTENT / re-runnable.
--
-- Builds a full document-based host verification flow on top of the existing
-- lightweight `profiles.host_verification_status` gate:
--
--   * host_verifications — one row per host carrying the 5-step KYC payload
--     (business, personal/identity, document refs, bank details, OTP status).
--     The row lifecycle is UNVERIFIED -> PENDING -> VERIFIED | REJECTED, with
--     resubmission allowed from REJECTED. The existing
--     `profiles.host_verification_status` column stays the source of truth the
--     rest of the app already reads (event badges, payout gating, host_verified
--     checks), so those paths are untouched; a trigger keeps the two in sync.
--
--   * host-verifications Storage bucket (PRIVATE) + bucket-first RLS policies
--     so hosts can only touch their own documents and staff can preview them
--     via server-signed URLs (private buckets are never readable client-side,
--     which is exactly what an admin image-preview needs).
--
--   * Telegram notification_sends type CHECK widened for the new lifecycle
--     events (host_verification_submitted/approved/rejected) so the claim/dedupe
--     log can keep firing exactly once per transition.
--
-- Every statement below is safe to re-run: create-if-not-exists, add-column-if-
-- not-exists, drop-policy-if-exists before recreate, create-or-replace for the
-- helper function, and explicit grants.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. host_verifications table.
-- ---------------------------------------------------------------------------
create table if not exists public.host_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- Status machine (lowercase to match profiles.host_verification_status).
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected')),

  -- Step 1 — business.
  business_name text not null check (char_length(trim(business_name)) > 0),
  business_type text not null default 'sole_proprietor'
    check (business_type in ('sole_proprietor', 'registered_company', 'partnership')),
  cac_number text,

  -- Step 2 — personal / identity.
  legal_name text not null,
  dob date,
  phone_number text,
  phone_verified boolean not null default false,
  otp_phone_last4 text,
  id_type text not null default 'national_id'
    check (id_type in ('national_id', 'driver_license', 'passport', 'business_registration')),
  id_number text not null check (char_length(trim(id_number)) > 0),

  -- Step 3 — document storage refs (paths inside the host-verifications bucket:
  -- {user_id}/id-front, {user_id}/selfie, {user_id}/business-cert).
  id_document_url text,
  id_selfie_url text,
  business_document_url text,

  -- Step 4 — bank details (only last4 stored; full account is never kept).
  bank_name text not null,
  account_holder text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),

  -- Review trail.
  submitted_at timestamptz not null default now(),
  review_requested_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  review_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- unique per host: a host owns exactly one verification row at a time, and
-- resubmission updates it in place.
create unique index if not exists host_verifications_user_id_key
  on public.host_verifications (user_id);
create index if not exists host_verifications_status_idx
  on public.host_verifications (status);
create index if not exists host_verifications_submitted_at_idx
  on public.host_verifications (submitted_at desc);

alter table public.host_verifications enable row level security;

-- ---------------------------------------------------------------------------
-- 2. RLS policies.
-- ---------------------------------------------------------------------------

-- Everyone can read their own verification row; staff with hosts.view read all.
drop policy if exists "hosts read own verification" on public.host_verifications;
create policy "hosts read own verification"
  on public.host_verifications for select
  using (user_id = (select auth.uid()));

drop policy if exists "staff read all host verifications" on public.host_verifications;
create policy "staff read all host verifications"
  on public.host_verifications for select
  using (public.user_has_permission((select auth.uid()), 'hosts.view'));

-- A host can only submit or resubmit their own row.
drop policy if exists "hosts submit their own verification" on public.host_verifications;
create policy "hosts submit their own verification"
  on public.host_verifications for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "hosts update their own verification" on public.host_verifications;
create policy "hosts update their own verification"
  on public.host_verifications for update
  using (user_id = (select auth.uid()));

drop policy if exists "hosts delete their own verification" on public.host_verifications;
create policy "hosts delete their own verification"
  on public.host_verifications for delete
  using (user_id = (select auth.uid()) and status = 'rejected');

-- ---------------------------------------------------------------------------
-- 3. Guard trigger: hosts may only move status to 'pending' (submit/resubmit);
--    everything else (verified/rejected + review fields) is staff-only through
--    set_host_verification_status(). Mirrors the event-review trigger pattern.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_host_verification_flow()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role'
     or public.user_has_permission((select auth.uid()), 'hosts.verify') then
    return new;
  end if;

  -- Hosts may only create/update their own PENDING submission; they can never
  -- set review outcomes or review fields, and can never skip back to verified.
  if new.user_id is distinct from old.user_id then
    raise exception 'You cannot change whose verification this is';
  end if;

  if new.status is distinct from old.status then
    if not (new.status = 'pending' and old.status in ('unverified', 'rejected')) then
      raise exception 'Only staff can change verification status';
    end if;
  end if;

  if new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by
     or new.review_reason is distinct from old.review_reason
     or new.review_requested_at is distinct from old.review_requested_at then
    raise exception 'Review fields are written by staff';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_host_verifications_enforce_flow on public.host_verifications;
create trigger trg_host_verifications_enforce_flow
  before insert or update on public.host_verifications
  for each row execute function public.enforce_host_verification_flow();

-- ---------------------------------------------------------------------------
-- 4. set_host_verification_status — the ONLY path staff use to approve or
--    reject (mirrors set_event_review_status). Writes the outcome to the row,
--    syncs profiles.host_verification_status so every existing read path
--    (badges, payout gating, event approvals) stays consistent, and audits.
-- ---------------------------------------------------------------------------
create or replace function public.set_host_verification_status(
  p_user_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.host_verifications%rowtype;
  v_action text;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not public.user_has_permission(v_actor, 'hosts.verify') then
    raise exception 'Forbidden';
  end if;

  if p_status not in ('verified', 'rejected') then
    raise exception 'Invalid status';
  end if;
  if p_status = 'rejected' and coalesce(p_reason, '') = '' then
    raise exception 'A reason is required';
  end if;

  select * into v_row from public.host_verifications where user_id = p_user_id;
  if not found then
    raise exception 'No verification on file';
  end if;
  if v_row.status = 'verified' then
    raise exception 'This host is already verified';
  end if;

  update public.host_verifications
    set status = p_status,
        review_reason = case when p_status = 'rejected' then p_reason else null end,
        reviewed_at = now(),
        reviewed_by = v_actor
    where user_id = p_user_id;

  -- Keep the legacy column in sync so existing RLS/RLS-adjacent gates and the
  -- client profile view stay truthful without a second read model.
  update public.profiles
    set host_verification_status = p_status,
        host_verification_reason = case when p_status = 'rejected' then p_reason else null end,
        host_verification_reviewed_at = now(),
        host_verification_reviewed_by = v_actor
    where id = p_user_id;

  v_action := case p_status when 'verified' then 'host_verification_approved' else 'host_verification_rejected' end;
  perform public.write_audit_log(
    v_action,
    'profile',
    p_user_id::text,
    jsonb_build_object(
      'status', p_status,
      'reason', p_reason,
      'business_name', v_row.business_name,
      'legal_name', v_row.legal_name
    )
  );
end;
$$;

revoke all on function public.set_host_verification_status(uuid, text, text) from public, anon;
grant execute on function public.set_host_verification_status(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Private Storage bucket for verification documents. PRIVATE on purpose:
--    document images are sensitive, so the browser gets only server-signed
--    URLs, and bucket policies below scope hosts to their own folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'host-verifications',
  'host-verifications',
  false,
  5242880,  -- 5 MB per document
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Hosts read only their own documents.
drop policy if exists "hosts read own verification documents" on storage.objects;
create policy "hosts read own verification documents"
  on storage.objects for select
  using (
    bucket_id = 'host-verifications'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Staff preview any verification document (served via signed URLs only).
drop policy if exists "staff read host verification documents" on storage.objects;
create policy "staff read host verification documents"
  on storage.objects for select
  using (
    bucket_id = 'host-verifications'
    and public.user_has_permission((select auth.uid()), 'hosts.view')
  );

-- Hosts upload only into their own folder.
drop policy if exists "hosts upload their own verification documents" on storage.objects;
create policy "hosts upload their own verification documents"
  on storage.objects for insert
  with check (
    bucket_id = 'host-verifications'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Staff remove any document.
drop policy if exists "staff remove host verification documents" on storage.objects;
create policy "staff remove host verification documents"
  on storage.objects for delete
  using (
    bucket_id = 'host-verifications'
    and public.user_has_permission((select auth.uid()), 'hosts.view')
  );

-- ---------------------------------------------------------------------------
-- 6. Telegram notification types for the new lifecycle. The unique
--    (channel, type, ref_id) index from Batch 29 keeps these exactly-once.
-- ---------------------------------------------------------------------------
alter table public.notification_sends drop constraint if exists notification_sends_type_check;
alter table public.notification_sends add constraint notification_sends_type_check
  check (type in (
    'event_reminder',
    'event_change',
    'event_cancellation',
    'refund_update',
    'saved_event_update',
    'ticket_confirmation',
    'review_request',
    'host_verification',
    'host_payout',
    'check_in_summary',
    'event_created',
    'event_approved',
    'event_published',
    'host_verification_submitted',
    'host_verification_approved',
    'host_verification_rejected'
  ));
