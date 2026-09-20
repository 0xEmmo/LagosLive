// Server-only claim/outcome helpers for idempotent transactional email.
// Every email path claims its delivery against the notification_sends dedupe
// log BEFORE sending (an overlapping run can never email the same recipient
// twice for the same type/ref), then records how the send actually went so the
// admin delivery view surfaces sent/failed/pending. Best-effort throughout —
// a failed claim or outcome write is logged and never blocks the email flow.

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase/database.types';

type ServiceSupabase = SupabaseClient<Database>;

export type NotificationType =
  | 'event_reminder'
  | 'event_change'
  | 'event_cancellation'
  | 'refund_update'
  | 'saved_event_update'
  | 'ticket_confirmation'
  | 'review_request'
  | 'host_verification'
  | 'host_payout'
  | 'check_in_summary'
  | 'event_created'
  | 'event_approved'
  | 'event_published'
  | 'host_verification_submitted'
  | 'host_verification_approved'
  | 'host_verification_rejected';

export type NotificationChannel = 'email' | 'telegram';

export interface ClaimNotificationInput {
  userId?: string | null;
  email: string;
  type: NotificationType;
  refId: string;
  channel?: NotificationChannel;
}

// Atomically reserves this recipient/type/ref for delivery. Returns true for
// the caller that wins the claim (unique insert) — everyone else skips. The
// row is opened as 'pending' and flipped to sent/failed by
// recordNotificationOutcome().
export async function claimNotification(
  service: ServiceSupabase,
  { userId, email, type, refId, channel = 'email' }: ClaimNotificationInput
): Promise<boolean> {
  const claimOnce = async (includeStatus: boolean): Promise<boolean | null> => {
    const { data, error } = await service.rpc('record_notification_send', {
      p_user_id: userId ?? null,
      p_email: email,
      p_channel: channel,
      p_type: type,
      p_ref_id: refId,
      ...(includeStatus ? { p_status: 'pending' } : {}),
    });
    if (error) {
      console.warn('[notify] claim failed', { email, type, refId, includeStatus, error: error.message });
      return null;
    }
    return data === true;
  };

  // Pre-00027 databases ship a 5-arg record_notification_send (no p_status), so
  // a 6-arg call fails with a schema-cache "function not found" error. Retry the
  // 5-arg signature so a claim never blocks ticket delivery on either schema.
  const withStatus = await claimOnce(true);
  if (withStatus !== null) return withStatus;
  const withoutStatus = await claimOnce(false);
  return withoutStatus === true;
}

// Records the send outcome on the claim opened by claimNotification(). The
// status flip is best-effort: a failed telemetry write never surfaces to the
// caller.
export async function recordNotificationOutcome(
  service: ServiceSupabase,
  {
    email,
    type,
    refId,
    status,
    providerMessageId = null,
  }: {
    email: string;
    type: NotificationType;
    refId: string;
    status: 'sent' | 'failed';
    providerMessageId?: string | null;
  }
): Promise<void> {
  const { error } = await service.rpc('update_notification_send_status', {
    p_email: email,
    p_type: type,
    p_ref_id: refId,
    p_status: status,
    p_provider_message_id: providerMessageId,
  });
  if (error) {
    console.warn('[notify] outcome update failed', { email, type, refId, status, error: error.message });
  }
}