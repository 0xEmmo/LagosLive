import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendAlmostSoldOutEmail } from '@/lib/resend';

// Cron (CRON_SECRET): for approved, un-cancelled, upcoming events that are
// nearly full (≤15% of capacity left and still unsold), nudges the users who
// saved the event with a "almost sold out" email. Gated by the saved-updates
// preference (a saved event is the explicit signal for wanting these), and
// claimed through record_notification_send() so one email per saved event.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceSupabase();
  const nowIso = new Date().toISOString();

  const { data: parties, error } = await service
    .from('parties')
    .select('id, title, date, time, capacity, spots_left')
    .eq('status', 'approved')
    .is('cancelled_at', null)
    .gt('starts_at', nowIso)
    .gt('capacity', 0);

  if (error) {
    console.error('[cron:saved-event-updates] parties query error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nearlyFull = (parties ?? []).filter((p) => p.spots_left > 0 && p.spots_left / p.capacity <= 0.15);

  let sent = 0;
  let skipped = 0;

  for (const party of nearlyFull) {
    const { data: savers, error: saverError } = await service
      .from('saved_parties')
      .select('user_id')
      .eq('party_id', party.id);
    if (saverError) {
      console.error('[cron:saved-event-updates] savers query error', party.id, saverError);
      skipped += 1;
      continue;
    }

    const userIds = [...new Set((savers ?? []).map((s) => s.user_id).filter(Boolean))];
    if (userIds.length === 0) continue;

    const { data: profiles } = await service.from('profiles').select('id, name, email').in('id', userIds);
    const { data: prefs } = await service
      .from('notification_preferences')
      .select('user_id, email_enabled, saved_updates_enabled')
      .in('user_id', userIds);

    const prefMap = new Map((prefs ?? []).map((p) => [p.user_id, p]));

    for (const profile of profiles ?? []) {
      if (!profile.email) continue;
      const pref = prefMap.get(profile.id);
      if (pref && (!pref.email_enabled || !pref.saved_updates_enabled)) {
        skipped += 1;
        continue;
      }
      const accepted = await sendAlmostSoldOutEmail({
        to: profile.email,
        guestName: profile.name || profile.email.split('@')[0] || 'there',
        partyTitle: party.title,
        partyDate: party.date,
        partyTime: party.time,
        partyUrl: `${APP_URL}/party/${party.id}`,
      });
      if (!accepted) {
        skipped += 1;
        continue;
      }
      const claimed = await service.rpc('record_notification_send', {
        p_user_id: profile.id,
        p_email: profile.email,
        p_channel: 'email',
        p_type: 'saved_event_update',
        p_ref_id: String(party.id),
      });
      if (claimed.data === true) sent += 1;
      else skipped += 1;
    }
  }

  return NextResponse.json({ okay: true, sent, skipped, eligible: nearlyFull.length });
}