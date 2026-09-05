-- ===========================================================================
-- Retention & Customer Experience (Batch 22) — IDEMPOTENT.
--
-- 1. notification_preferences — per-user opt-in/out toggle for non-critical
--    emails (reminders, event changes, almost-sold-out). Transactional emails
--    (ticket confirmation, cancellation, refund, review request, verification)
--    are never gated by these switches.
--
-- 2. notification_sends — append-only dedupe log written server-side only
--    (service_role). The unique (recipient, type, ref) keys guarantee a
--    reminder / change / update email is never sent twice to the same person
--    for the same event.
--
-- 3. Review moderation — reviews gain a moderation_status; the public read path
--    only ever returns 'visible' reviews, staff get a full read policy for the
--    moderation UI, moderate_review() is the single audited write path, and
--    add_event_review() is hardened (cancelled events and refunded orders can
--    no longer be reviewed; aggregates now sum visible reviews only).
--
-- 4. organizer_reputation — public aggregate over an organizer's completed,
--    approved, un-cancelled events (completed count, tickets sold, avg rating,
--    verified review count). Reveals only aggregate, trusted data.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Notification preferences.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_enabled boolean not null default true,
  reminders_enabled boolean not null default true,
  event_changes_enabled boolean not null default true,
  saved_updates_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "users read own notification preferences" on public.notification_preferences;
create policy "users read own notification preferences"
  on public.notification_preferences for select
  using (user_id = (select auth.uid()));

drop policy if exists "users upsert own notification preferences" on public.notification_preferences;
create policy "users upsert own notification preferences"
  on public.notification_preferences for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "users update own notification preferences" on public.notification_preferences;
create policy "users update own notification preferences"
  on public.notification_preferences for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Notification dedupe log (server writes only; no client policies).
-- ---------------------------------------------------------------------------
create table if not exists public.notification_sends (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  recipient_email text not null,
  channel text not null default 'email' check (channel in ('email', 'push')),
  type text not null check (type in (
    'event_reminder',
    'event_change',
    'event_cancellation',
    'refund_update',
    'saved_event_update',
    'ticket_confirmation',
    'review_request',
    'host_verification'
  )),
  ref_id text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists notification_sends_uniq_user on public.notification_sends
  (user_id, type, ref_id) where user_id is not null;
create unique index if not exists notification_sends_uniq_email on public.notification_sends
  (recipient_email, type, ref_id) where user_id is null;
create index if not exists notification_sends_created_idx on public.notification_sends (created_at desc);

alter table public.notification_sends enable row level security;

-- Atomically claim a notification send against the dedupe log. Returns TRUE when
-- the row was inserted (i.e. this is the first send for this recipient/type/ref),
-- FALSE when the partial unique indexes already had one. Cron jobs use this so
-- overlapping runs can never double-email. Service-role only.
create or replace function public.record_notification_send(
  p_user_id uuid,
  p_email text,
  p_channel text,
  p_type text,
  p_ref_id text
) returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notification_sends (user_id, recipient_email, channel, type, ref_id)
  values (p_user_id, p_email, p_channel, p_type, p_ref_id)
  on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.record_notification_send(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_notification_send(uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Review moderation.
-- ---------------------------------------------------------------------------
alter table public.reviews add column if not exists moderation_status text not null default 'visible'
  check (moderation_status in ('visible', 'hidden', 'removed'));
alter table public.reviews add column if not exists moderated_at timestamptz;
alter table public.reviews add column if not exists moderated_by uuid references auth.users (id) on delete set null;
alter table public.reviews add column if not exists moderation_reason text;

create index if not exists reviews_moderation_idx on public.reviews (moderation_status, party_id);

-- Public read now only surfaces VISIBLE reviews. Owner/admin arms kept for
-- ownership parity; hidden/removed rows are staff-only to the policy below.
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
             or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin))
    )
  );

-- Staff (support/admin/super_admin) read every review for the moderation UI.
drop policy if exists "staff read all reviews" on public.reviews;
create policy "staff read all reviews"
  on public.reviews for select
  using (public.has_role(array['support', 'admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- 3a. add_event_review — hardened eligibility + visible-only aggregates.
--      A cancelled event can never be reviewed, and a refunded order no longer
--      counts as an eligible ticket. Editing your own review resets its
--      moderation state (content is re-confirmed by its author).
-- ---------------------------------------------------------------------------
create or replace function public.add_event_review(p_party_id bigint, p_rating integer, p_review_text text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_party public.parties%rowtype;
  v_order_count bigint;
  v_name text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = 'P0001';
  end if;

  select * into v_party from public.parties where id = p_party_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0001';
  end if;

  if v_party.status <> 'approved' then
    raise exception 'This event is not available for review' using errcode = 'P0001';
  end if;

  if v_party.cancelled_at is not null then
    raise exception 'This event was cancelled and can no longer be reviewed' using errcode = 'P0001';
  end if;

  if v_party.starts_at >= now() then
    raise exception 'Reviews open after the event starts' using errcode = 'P0001';
  end if;

  -- A confirmed order is required, and the order must not have been refunded.
  select count(*) into v_order_count
  from public.orders
  where party_id = p_party_id
    and user_id = (select auth.uid())
    and payment_status = 'confirmed'
    and refund_status = 'none'
    and refunded_at is null
    and cancellation_reason is null;

  if v_order_count = 0 then
    raise exception 'Only ticket holders can review this event' using errcode = 'P0001';
  end if;

  select name into v_name from public.profiles where id = (select auth.uid());
  v_name := coalesce(v_name, 'Guest');

  insert into public.reviews (party_id, guest_id, guest_name, rating, review_text)
  values (p_party_id, (select auth.uid()), v_name, p_rating, nullif(trim(p_review_text), ''))
  on conflict (party_id, guest_id) do update
    set rating = excluded.rating,
        review_text = excluded.review_text,
        moderation_status = 'visible',
        moderated_at = null,
        moderated_by = null,
        moderation_reason = null,
        updated_at = now();

  update public.parties p
  set review_count = agg.cnt,
      avg_rating = round(agg.avg_r::numeric, 2)
  from (
    select count(*)::integer as cnt, avg(rating) as avg_r
    from public.reviews
    where party_id = p_party_id
      and moderation_status = 'visible'
  ) agg
  where p.id = p_party_id;
end;
$$;

revoke execute on function public.add_event_review(bigint, integer, text) from public, anon;
grant execute on function public.add_event_review(bigint, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3b. moderate_review — the single audited moderation write path (staff only).
--      Recomputes the party's aggregates from visible reviews only.
-- ---------------------------------------------------------------------------
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
  if v_actor is null or not public.has_role(array['support', 'admin', 'super_admin']) then
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

revoke all on function public.moderate_review(uuid, text, text) from public, anon;
grant execute on function public.moderate_review(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. organizer_reputation — trusted public aggregate over completed (ended),
--    approved, un-cancelled events. Subqueries avoid row multiplication between
--    the orders and reviews joins.
-- ---------------------------------------------------------------------------
create or replace function public.organizer_reputation(p_organizer_id uuid)
returns table (
  completed_events bigint,
  tickets_sold bigint,
  avg_rating numeric,
  review_count integer
)
language sql
stable
security definer set search_path = public
as $$
  select
    (
      select count(*)::bigint
      from public.parties p
      where p.created_by = p_organizer_id
        and p.status = 'approved'
        and p.cancelled_at is null
        and p.ends_at < now()
    ) as completed_events,
    (
      select coalesce(sum(o.quantity), 0)::bigint
      from public.orders o
      join public.parties p on p.id = o.party_id
      where p.created_by = p_organizer_id
        and p.status = 'approved'
        and p.cancelled_at is null
        and p.ends_at < now()
        and o.payment_status = 'confirmed'
    ) as tickets_sold,
    (
      select round(coalesce(avg(r.rating), 0)::numeric, 2)
      from public.reviews r
      join public.parties p on p.id = r.party_id
      where p.created_by = p_organizer_id
        and p.status = 'approved'
        and p.cancelled_at is null
        and p.ends_at < now()
        and r.moderation_status = 'visible'
    ) as avg_rating,
    (
      select count(*)::integer
      from public.reviews r
      join public.parties p on p.id = r.party_id
      where p.created_by = p_organizer_id
        and p.status = 'approved'
        and p.cancelled_at is null
        and p.ends_at < now()
        and r.moderation_status = 'visible'
    ) as review_count;
$$;

revoke all on function public.organizer_reputation(uuid) from public;
grant execute on function public.organizer_reputation(uuid) to anon, authenticated, service_role;