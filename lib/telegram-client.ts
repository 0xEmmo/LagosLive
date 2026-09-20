// Client-safe helper for the Telegram ops-channel notifications. The actual
// claim/send happens server-side in /api/telegram/notify (which re-verifies the
// event's DB state and dedupes), so this never throws and never blocks the
// caller's UI — it is a best-effort "event X just transitioned" ping.
export type TelegramClientEventType = 'event_created' | 'event_approved' | 'event_published';

export async function notifyEventTelegram(eventId: number, type: TelegramClientEventType): Promise<void> {
  try {
    await fetch('/api/telegram/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, type }),
    });
  } catch (err) {
    console.warn('[telegram] notify request failed', { eventId, type, error: err });
  }
}

export type TelegramEventType = TelegramClientEventType;
export const notifyTelegramEvent = notifyEventTelegram;

export type TelegramHostVerificationType =
  | 'host_verification_submitted'
  | 'host_verification_approved'
  | 'host_verification_rejected';

export async function notifyHostVerificationTelegram(userId: string, type: TelegramHostVerificationType): Promise<void> {
  try {
    await fetch('/api/telegram/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, type }),
    });
  } catch (err) {
    console.warn('[telegram] host verification notify request failed', { userId, type, error: err });
  }
}
