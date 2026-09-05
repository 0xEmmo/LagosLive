import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendEventReminderEmail } from '@/lib/resend';
import { buildTicketUrl } from '@/lib/ticket-access';

// Hourly-ish cron (CRON_SECRET): sends a "happening soon" reminder email to
// everyone attending an approved, un-cancelled event that starts within the
// next 24 hours. Recipients are confirmed, un-refunded buyers plus anyone who
// toggled the reminder bell on the event page. Non-critical mail is gated by
// the recipient's notification preferences (email + reminders must both be on;
// guests with no profile default to on), and record_notification_send() claims
// each delivery so an overlapping run can never email the same person twice
// for the same event.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

type PrefsRow = {
  user_id: string;
  email_enabled: boolean;
  reminders_enabled: boolean;
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceSupabase();
  const nowIso = new Date().toISOString();
  const in24hIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: parties, error: partyError } = await service
    .from('parties')
    .select('id, title, date, time, location')
    .eq('status', 'approved')
    .is('cancelled_at', null)
    .gt('starts_at', nowIso)
    .lte('starts_at', in24hIso);

  if (partyError) {
    console.error('[cron:event-reminders] parties query error', partyError);
    return NextResponse.json({ error: partyError.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const party of parties ?? []) {
    const recipients = new Map<string, { user_id: string | null; email: string; name: string; ticketUrl?: string }>();

    // Confirmed, un-refunded buyers of this event.
    const { data: orders, error: orderError } = await service
      .from('orders')
      .select('id, user_id, customer_email')
      .eq('party_id', party.id)
      .eq('payment_status', 'confirmed')
      .eq('refund_status', 'none')
      .is('cancellation_reason', null);
    if (orderError) {
      console.error('[cron:event-reminders] orders query error', party.id, orderError);
      skipped += 1;
      continue;
    }
    for (const order of orders ?? []) {
      if (!order.customer_email) continue;
      const key = order.customer_email.toLowerCase();
      if (recipients.has(key)) continue;
      recipients.set(key, {
        user_id: order.user_id,
        email: order.customer_email,
        name: order.customer_email.split('@')[0] || 'there',
        ticketUrl: order.user_id ? buildTicketUrl(order.id) : undefined,
      });
    }

    // Users who switched the reminder bell on for this event.
    const { data: reminders, error: reminderError } = await service
      .from('reminders')
      .select('user_id')
      .eq('party_id', party.id);
    if (reminderError) {
      console.error('[cron:event-reminders] reminders query error', party.id, reminderError);
      skipped += 1;
      continue;
    }
    const reminderUserIds = [...new Set((reminders ?? []).map((r) => r.user_id).filter(Boolean))];
    if (reminderUserIds.length > 0) {
      const { data: profiles } = await service
        .from('profiles')
        .select('id, name, email')
        .in('id', reminderUserIds);
      for (const profile of profiles ?? []) {
        if (!profile.email) continue;
        const key = profile.email.toLowerCase();
        if (recipients.has(key)) continue;
        recipients.set(key, {
          user_id: profile.id,
          email: profile.email,
          name: profile.name || profile.email.split('@')[0] || 'there',
        });
      }
    }

    // Notification preferences for the authenticated recipients involved.
    const prefMap = new Map<string, PrefsRow>();
    const authedIds = [...new Set([...recipients.values()].map((r) => r.user_id).filter((id): id is string => !!id))];
    if (authedIds.length > 0) {
      const { data: prefs } = await service.from('notification_preferences').select('*').in('user_id', authedIds);
      for (const row of prefs ?? []) prefMap.set(row.user_id, row);
    }

    for (const recipient of recipients.values()) {
      // Non-critical email: both the global email switch and the reminders
      // switch must be on. Guests/users without a preference row default to on.
      if (recipient.user_id) {
        const pref = prefMap.get(recipient.user_id);
        if (pref && (!pref.email_enabled || !pref.reminders_enabled)) {
          skipped += 1;
          continue;
        }
      }

      const ticketUrl = recipient.ticketUrl ?? `${APP_URL}/party/${party.id}`;
      const accepted = await sendEventReminderEmail({
        to: recipient.email,
        guestName: recipient.name,
        partyTitle: party.title,
        partyDate: party.date,
        partyTime: party.time,
        partyLocation: party.location,
        ticketUrl,
      });
      if (!accepted) {
        skipped += 1;
        continue;
      }

      const claimed = await service.rpc('record_notification_send', {
        p_user_id: recipient.user_id,
        p_email: recipient.email,
        p_channel: 'email',
        p_type: 'event_reminder',
        p_ref_id: String(party.id),
      });
      if (claimed.data === true) sent += 1;
      else skipped += 1;
    }
  }

  return NextResponse.json({ okay: true, sent, skipped });
}