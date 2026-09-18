-- ===========================================================================
-- Batch 29 — Telegram event lifecycle notifications. IDEMPOTENT.
--
-- 1. notification_sends accepts the 'telegram' channel and the three event
--    lifecycle notification types (event_created, event_approved,
--    event_published) so the existing claim/dedupe log doubles as the
--    exactly-once guard for the Telegram ops channel.
--
-- 2. A channel-scoped unique index on (channel, type, ref_id) means at most
--    one Telegram message per lifecycle transition per event, regardless of
--    which caller triggers it (host submit, admin approve, retry, refresh).
-- ===========================================================================

-- 1. Telegram channel + lifecycle types on the dedupe log.
alter table public.notification_sends drop constraint notification_sends_channel_check;
alter table public.notification_sends add constraint notification_sends_channel_check
  check (channel in ('email', 'push', 'telegram'));

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
    'check_in_summary',
    'event_created',
    'event_approved',
    'event_published'
  ));

-- 2. Exactly-once per lifecycle transition on the Telegram channel.
create unique index if not exists notification_sends_uniq_telegram
  on public.notification_sends (channel, type, ref_id) where channel = 'telegram';