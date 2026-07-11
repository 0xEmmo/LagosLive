'use client';

import { useEffect } from 'react';
import { useLagosLiveStore } from '@/lib/store';
import { useParties } from '@/lib/hooks/useParties';

const CHECK_INTERVAL_MS = 60_000;
const NOTIFY_WINDOW_MS = 60 * 60 * 1000; // fire once a party is within an hour of starting

// Delivers the "1 hour before" reminder as a real browser Notification while
// the app is open — polling rather than push, since that needs a service
// worker + VAPID keys + a server-side cron this MVP doesn't have yet. Each
// reminder only ever fires once (tracked via remindersNotifiedAt, persisted
// to the reminders table) even across reloads within the same hour window.
export default function ReminderScheduler() {
  const user = useLagosLiveStore((s) => s.user);
  const pushEnabled = useLagosLiveStore((s) => s.pushEnabled);
  const reminders = useLagosLiveStore((s) => s.reminders);
  const remindersNotifiedAt = useLagosLiveStore((s) => s.remindersNotifiedAt);
  const markReminderNotified = useLagosLiveStore((s) => s.markReminderNotified);
  const { parties } = useParties();

  useEffect(() => {
    if (!user || !pushEnabled) return;
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

    const check = () => {
      if (Notification.permission !== 'granted') return;
      const now = Date.now();
      for (const partyId of reminders) {
        if (remindersNotifiedAt[partyId]) continue;
        const party = parties.find((p) => p.id === partyId);
        if (!party) continue;
        const msUntilStart = new Date(party.startsAt).getTime() - now;
        if (msUntilStart > 0 && msUntilStart <= NOTIFY_WINDOW_MS) {
          markReminderNotified(partyId);
          new Notification(`Starting soon: ${party.title}`, {
            body: `${party.title} starts in about an hour at ${party.location}.`,
            tag: `party-reminder-${partyId}`,
          });
        }
      }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, pushEnabled, reminders, remindersNotifiedAt, parties, markReminderNotified]);

  return null;
}
