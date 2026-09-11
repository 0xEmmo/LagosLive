-- ===========================================================================
-- Batch 27 — Event SEO + email delivery tracking. IDEMPOTENT.
--
-- 1. Search-engine friendly event URLs. parties gains a slug column so events
--    can live at /events/{slug} instead of /party/{id}. Slugs are generated
--    from the event title (app-side) and backfilled here for existing rows
--    with a deterministic de-dup suffix. Rows without a slug (legacy writes)
--    simply fall back to the /party/{id} URL — same page, just no pretty URL.
--
-- 2. notification_sends gains delivery tracking: status (pending/sent/failed),
--    provider_message_id (Resend id) and sent_at. The claim function can now
--    open the claim as 'pending' BEFORE the send (so overlapping runs still
--    dedupe), and a new outcome RPC records how the send actually went — the
--    public/admin logs page can then show a delivery health view.
--
-- 3. New notification types: host_payout (payout status emails) and
--    check_in_summary (end-of-event door report to the organizer).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. parties.slug — public, URL-friendly event identifier.
-- ---------------------------------------------------------------------------
alter table public.parties add column if not exists slug text;

-- Backfill existing events. Deterministic: the readable base from the title,
-- appended with a numeric suffix only when a collision would otherwise occur.
-- Newer rows that duplicate an older slug always pick up the suffix.
do $$
declare
  r record;
  base text;
  cand text;
  n integer;
begin
  for r in (select id, title from public.parties order by id) loop
    base := lower(regexp_replace(
              regexp_replace(trim(coalesce(r.title, 'event')), '[^a-zA-Z0-9]+', '-', 'g'),
              '^-+|-+$', '', 'g'));
    if base = '' then base := 'event'; end if;
    cand := base;
    n := 0;
    loop
      exit when not exists (select 1 from public.parties where slug = cand and id <> r.id);
      n := n + 1;
      cand := base || '-' || n;
    end loop;
    update public.parties set slug = cand where id = r.id;
  end loop;
end;
$$;

-- Partial to keep legacy rows without a slug legal while still guaranteeing a
-- slug, once set, is globally unambiguous.
create unique index if not exists parties_slug_key on public.parties (slug) where slug is not null;
create index if not exists parties_slug_idx on public.parties (slug) where slug is not null;

-- ---------------------------------------------------------------------------
-- 2. notification_sends — delivery tracking columns + outcome RPC.
-- ---------------------------------------------------------------------------
alter table public.notification_sends add column if not exists status text not null default 'sent'
  check (status in ('pending', 'sent', 'failed'));
alter table public.notification_sends add column if not exists provider_message_id text;
alter table public.notification_sends add column if not exists sent_at timestamptz;

-- First-timers open the claim as 'pending' so the email can be sent after the
-- dedupe happens, then update_notification_send_status() flips it to
-- sent/failed. Existing claim-after-send callers keep the default 'sent'.
drop function if exists public.record_notification_send(uuid, text, text, text, text);
create or replace function public.record_notification_send(
  p_user_id uuid,
  p_email text,
  p_channel text,
  p_type text,
  p_ref_id text,
  p_status text default 'sent'
) returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notification_sends (user_id, recipient_email, channel, type, ref_id, status)
  values (p_user_id, p_email, p_channel, p_type, p_ref_id, p_status)
  on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.record_notification_send(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_notification_send(uuid, text, text, text, text, text) to service_role;

-- Records how a claimed send actually went. Matches on the same (recipient,
-- type, ref) key the claim used, which the partial unique indexes keep unique.
-- Service-role only; this is telemetry, never a money-movement path.
create or replace function public.update_notification_send_status(
  p_email text,
  p_type text,
  p_ref_id text,
  p_status text,
  p_provider_message_id text default null
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'Invalid status' using errcode = 'P0001';
  end if;
  update public.notification_sends
  set status = p_status,
      provider_message_id = p_provider_message_id,
      sent_at = case when p_status = 'sent' then now() else sent_at end
  where recipient_email = p_email
    and type = p_type
    and ref_id = p_ref_id;
end;
$$;

revoke all on function public.update_notification_send_status(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_notification_send_status(text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. New notification types: host_payout + check_in_summary.
-- ---------------------------------------------------------------------------
alter table public.notification_sends drop constraint notification_sends_type_check;
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
    'check_in_summary'
  ));