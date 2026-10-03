-- Host trend alerts for events that reach the almost-sold-out threshold.
-- Idempotent and safe to run after the existing notification migrations.
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
    'host_almost_sold_out',
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
