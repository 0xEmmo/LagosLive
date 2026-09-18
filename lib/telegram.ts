// Server-only Telegram ops-channel bot for the event lifecycle. Fired only
// AFTER a successful server-side status transition, and each notification is
// claimed exactly once against notification_sends (channel 'telegram') so a
// retry, dashboard refresh or double-click can never double-post.
//
// Transitions:
//   draft   --host submits-->   pending   -> event_created   (🆕 / 🎉)
//   pending --admin approves--> approved  -> event_approved  (✅)
//                                          -> event_published (🚀)
//
// Lagos Live treats approval as publication (every public query filters
// status='approved'), so one admin approve emits two independent notifications.

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabase } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import { claimNotification, recordNotificationOutcome } from '@/lib/notify';
import { eventCanonicalUrl, appUrl } from '@/lib/seo';
import type { TelegramEventType } from '@/lib/telegram-client';

type ServiceSupabase = SupabaseClient<Database>;

interface PartyBasics {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  capacity: number;
  status: string;
  slug: string | null;
  created_by: string | null;
}

interface ProfileBasics {
  id: string;
  name: string;
  email: string;
  business_name: string | null;
}

export interface TelegramSendResult {
  sent: boolean;
  reason?: string;
}

// Resolves whether the caller holds any event moderation permission (the same
// set set_event_review_status() uses for approve/reject/suspend).
async function isEventModerationStaff(service: ServiceSupabase, userId: string): Promise<boolean> {
  for (const permission of ['events.approve', 'events.reject', 'events.cancel']) {
    const { data } = await service.rpc('user_has_permission', {
      p_user_id: userId,
      p_permission_name: permission,
    });
    if (data === true) return true;
  }
  return false;
}

function creatorDisplayName(profile: ProfileBasics | null): string {
  if (!profile) return 'An event creator';
  return profile.name?.trim() || profile.business_name?.trim() || profile.email?.split('@')[0] || 'An event creator';
}

const STATUS_LABEL: Record<TelegramEventType, string> = {
  event_created: 'Pending Approval',
  event_approved: 'Approved',
  event_published: 'LIVE',
};

function buildMessage(party: PartyBasics, type: TelegramEventType, firstEvent: boolean, creator: string): string {
  const heading =
    type === 'event_created' ? (firstEvent ? '🆕 FIRST EVENT CREATED' : '🎉 NEW EVENT CREATED') : type === 'event_approved' ? '✅ EVENT APPROVED' : '🚀 EVENT PUBLISHED';
  return [
    `${heading}`,
    ``,
    `${party.title}`,
    ``,
    `Created by: ${creator}`,
    `Date: ${party.date} @ ${party.time}`,
    `Venue: ${party.location}`,
    `Tickets: ${party.capacity.toLocaleString()}`,
    ``,
    `Status: ${STATUS_LABEL[type]}`,
    `Event ID: ${party.id}`,
  ].join('\n');
}

function actionButton(party: PartyBasics, type: TelegramEventType): { text: string; url: string } {
  if (type === 'event_published') {
    return { text: 'View Event', url: eventCanonicalUrl({ id: party.id, slug: party.slug }) };
  }
  return { text: type === 'event_created' ? 'Review Event' : 'Publish Event', url: `${appUrl()}/admin/events/${party.id}` };
}

// Direct Telegram Bot API call. Best-effort and never throws — the caller
// records the outcome separately.
async function sendTelegramMessage(
  text: string,
  button?: { text: string; url: string }
): Promise<{ ok: boolean; messageId?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured');
    return { ok: false };
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } } : {}),
      }),
    });
    const json = (await response.json().catch(() => null)) as { ok?: boolean; description?: string; result?: { message_id?: number } } | null;
    if (!response.ok || !json?.ok) {
      console.warn('[telegram] sendMessage failed', { status: response.status, description: json?.description });
      return { ok: false };
    }
    return { ok: true, messageId: json.result?.message_id != null ? String(json.result.message_id) : undefined };
  } catch (err) {
    console.error('[telegram] sendMessage error', err);
    return { ok: false };
  }
}

// Sends the Telegram notification for one lifecycle transition. Returns
// { sent: false, reason: 'duplicate' } when the same transition was already
// claimed for this event, and refuses to send while the event is not actually
// in the state the transition implies.
export async function sendEventTelegramNotification(
  eventId: number,
  type: TelegramEventType,
  actorUserId: string
): Promise<TelegramSendResult> {
  const service = createServiceSupabase();

  const { data: party, error: partyError } = await service
    .from('parties')
    .select('id, title, date, time, location, capacity, status, slug, created_by')
    .eq('id', eventId)
    .maybeSingle();
  if (partyError || !party) return { sent: false, reason: 'event_not_found' };

  // Only the event creator (or moderation staff) may report a creation, and
  // only moderation staff may report approvals/publications — mirroring the
  // authorization on set_event_review_status().
  const staff = await isEventModerationStaff(service, actorUserId);
  if (type === 'event_created' && party.created_by !== actorUserId && !staff) {
    return { sent: false, reason: 'forbidden' };
  }
  if (type !== 'event_created' && !staff) {
    return { sent: false, reason: 'forbidden' };
  }

  // The event must actually sit in the state this transition reports.
  const stateOk =
    (type === 'event_created' && party.status === 'pending') ||
    ((type === 'event_approved' || type === 'event_published') && party.status === 'approved');
  if (!stateOk) return { sent: false, reason: 'not_in_transition_state' };

  const { data: profile } = await service
    .from('profiles')
    .select('id, name, email, business_name')
    .eq('id', party.created_by ?? '')
    .maybeSingle();

  // Classification for wording only — it never gates the send. A first event is
  // one where the creator has no other party row.
  let firstEvent = false;
  if (party.created_by) {
    const { count } = await service.from('parties').select('id', { count: 'exact', head: true }).eq('created_by', party.created_by);
    firstEvent = (count ?? 0) <= 1;
  }

  const claimEmail = profile?.email ?? `telegram:${party.id}`;
  const claimed = await claimNotification(service, {
    userId: party.created_by ?? null,
    email: claimEmail,
    channel: 'telegram',
    type,
    refId: String(party.id),
  });
  if (!claimed) return { sent: false, reason: 'duplicate' };

  const text = buildMessage(party, type, firstEvent, creatorDisplayName(profile ?? null));
  const button = actionButton(party, type);
  const result = await sendTelegramMessage(text, button);

  await recordNotificationOutcome(service, {
    email: claimEmail,
    type,
    refId: String(party.id),
    status: result.ok ? 'sent' : 'failed',
    providerMessageId: result.messageId ?? null,
  });

  return result.ok ? { sent: true } : { sent: false, reason: 'send_failed' };
}