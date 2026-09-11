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
  | 'check_in_summary';

export interface ClaimNotificationInput {
  userId?: string | null;
  email: string;
  type: NotificationType;
  refId: string;
}

// Atomically reserves this recipient/type/ref for delivery. Returns true for
// the caller that wins the claim (unique insert) — everyone else skips. The
// row is opened as 'pending' and flipped to sent/failed by
// recordNotificationOutcome().
export async function claimNotification(
  service: ServiceSupabase,
  { userId, email, type, refId }: ClaimNotificationInput
): Promise<boolean> {
  const { data, error } = await service.rpc('record_notification_send', {
    p_user_id: userId ?? null,
    p_email: email,
    p_channel: 'email',
    p_type: type,
    p_ref_id: refId,
    p_status: 'pending',
  });
  if (error) {
    console.warn('[notify] claim failed', { email, type, refId, error: error.message });
    return false;
  }
  return data === true;
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