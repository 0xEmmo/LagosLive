// Client-safe helper for the Telegram event-lifecycle notifications. The actual
// claim/send happens server-side in /api/telegram/notify (which re-verifies the
// event's DB state and dedupes), so this never throws and never blocks the
// caller's UI — it is a best-effort "event X just transitioned" ping.
export type TelegramEventType = 'event_created' | 'event_approved' | 'event_published';

export async function notifyTelegramEvent(eventId: number, type: TelegramEventType): Promise<void> {
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