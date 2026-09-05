import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { sendEventChangeEmail } from '@/lib/resend';

// Host-triggered event change notice (Phase 5). Called by the host event editor
// after a successful save that changed venue/date/time details. The host is
// verified via RLS (only the organiser/staff can fetch an approved party in the
// first place); we then best-effort email everyone who cares about the event —
// confirmed un-refunded buyers, savers and reminder-bell users — gated by their
// event-change preference (guests default to on) and deduped once per event via
// record_notification_send(). The email links back to the event page rather than
// embedding the diff, so the host's latest details are always authoritative.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as { partyId?: unknown; changes?: unknown };
    const partyId = Number(body.partyId);
    const changes =
      Array.isArray(body.changes)
        ? body.changes.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).slice(0, 12)
        : [];
    if (!Number.isInteger(partyId) || partyId <= 0 || changes.length === 0) {
      return NextResponse.json({ error: 'Missing partyId or changes' }, { status: 400 });
    }

    // RLS guarantees only the organiser (or staff) can read an approved party:
    // a non-organiser gets zero rows here and throws later.
    const { data: party } = await supabase
      .from('parties')
      .select('id, title')
      .eq('id', partyId)
      .maybeSingle();

    if (!party) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    void party;
    const service = createServiceSupabase();

    const { data: partyRow, error: partyError } = await service
      .from('parties')
      .select('id, title, status, cancelled_at')
      .eq('id', partyId)
      .single();
    if (partyError) {
      console.error('[events/notify-changes] party query error', partyError);
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
    }
    // Change notice only makes sense for a live, upcoming event; anything else
    // was already covered by its own cancellation/announcement email.
    if (partyRow.status !== 'approved' || partyRow.cancelled_at) {
      return NextResponse.json({ okay: true, sent: 0, skipped: 0 });
    }

    const recipients = new Map<string, { user_id: string | null; email: string; name: string }>();

    const { data: orders } = await service
      .from('orders')
      .select('id, user_id, customer_email')
      .eq('party_id', partyId)
      .eq('payment_status', 'confirmed')
      .eq('refund_status', 'none')
      .is('cancellation_reason', null);
    for (const order of orders ?? []) {
      if (!order.customer_email) continue;
      const key = order.customer_email.toLowerCase();
      if (!recipients.has(key)) {
        recipients.set(key, {
          user_id: order.user_id,
          email: order.customer_email,
          name: order.customer_email.split('@')[0] || 'there',
        });
      }
    }

    const { data: supporters } = await service
      .from('saved_parties')
      .select('user_id')
      .eq('party_id', partyId);
    const { data: reminders } = await service.from('reminders').select('user_id').eq('party_id', partyId);
    const relevantUserIds = [
      ...new Set([...(supporters ?? []).map((s) => s.user_id), ...(reminders ?? []).map((r) => r.user_id)].filter(Boolean)),
    ];

    if (relevantUserIds.length > 0) {
      const { data: profiles } = await service
        .from('profiles')
        .select('id, name, email')
        .in('id', relevantUserIds);
      for (const profile of profiles ?? []) {
        if (!profile.email) continue;
        const key = profile.email.toLowerCase();
        if (!recipients.has(key)) {
          recipients.set(key, {
            user_id: profile.id,
            email: profile.email,
            name: profile.name || profile.email.split('@')[0] || 'there',
          });
        }
      }
    }

    const prefMap = new Map<string, { email_enabled: boolean; event_changes_enabled: boolean }>();
    const authedIds = [...new Set([...recipients.values()].map((r) => r.user_id).filter((id): id is string => !!id))];
    if (authedIds.length > 0) {
      const { data: prefs } = await service
        .from('notification_preferences')
        .select('user_id, email_enabled, event_changes_enabled')
        .in('user_id', authedIds);
      for (const row of prefs ?? []) prefMap.set(row.user_id, row);
    }

    let sent = 0;
    let skipped = 0;
    for (const recipient of recipients.values()) {
      if (recipient.user_id) {
        const pref = prefMap.get(recipient.user_id);
        if (pref && (!pref.email_enabled || !pref.event_changes_enabled)) {
          skipped += 1;
          continue;
        }
      }
      const claimed = await service.rpc('record_notification_send', {
        p_user_id: recipient.user_id,
        p_email: recipient.email,
        p_channel: 'email',
        p_type: 'event_change',
        p_ref_id: String(partyId),
      });
      if (claimed.data !== true) {
        skipped += 1;
        continue;
      }
      const accepted = await sendEventChangeEmail({
        to: recipient.email,
        guestName: recipient.name,
        partyTitle: partyRow.title,
        changes,
        partyUrl: `${APP_URL}/party/${partyId}`,
      });
      if (accepted) sent += 1;
      else skipped += 1;
    }

    return NextResponse.json({ okay: true, sent, skipped });
  } catch (err) {
    console.error('[events/notify-changes] failed', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}