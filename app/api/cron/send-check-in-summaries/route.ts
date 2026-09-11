import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendCheckInSummaryEmail } from '@/lib/resend';
import { claimNotification, recordNotificationOutcome } from '@/lib/notify';

// Hourly-ish cron (CRON_SECRET): sends each host a door report for an approved,
// un-cancelled event that ended within the last ~3 hours. The summary is
// computed from confirmed, un-refunded orders (sold / checked-in / no-shows /
// door revenue) and is a non-critical, gated mail — it claims per party id so
// an overlapping run can never email the same host twice for one event.

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceSupabase();
  const nowIso = new Date().toISOString();
  const endedAfterIso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  const { data: parties, error: partyError } = await service
    .from('parties')
    .select('id, title, date, location, created_by, ends_at')
    .eq('status', 'approved')
    .is('cancelled_at', null)
    .gt('ends_at', endedAfterIso)
    .lte('ends_at', nowIso);

  if (partyError) {
    console.error('[cron:check-in-summaries] parties query error', partyError);
    return NextResponse.json({ error: partyError.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const party of parties ?? []) {
    if (!party.created_by) {
      skipped += 1;
      continue;
    }

    const { data: orders, error: orderError } = await service
      .from('orders')
      .select('quantity, total, refund_status, check_in_status')
      .eq('party_id', party.id)
      .eq('payment_status', 'confirmed')
      .is('cancellation_reason', null);
    if (orderError) {
      console.error('[cron:check-in-summaries] orders query error', party.id, orderError);
      skipped += 1;
      continue;
    }

    let sold = 0;
    let checkedIn = 0;
    let revenue = 0;
    for (const order of orders ?? []) {
      if (order.refund_status === 'refunded') continue;
      sold += order.quantity;
      revenue += order.total;
      if (order.check_in_status === 'checked_in') checkedIn += order.quantity;
    }
    const noShow = sold - checkedIn;

    const { data: profile, error: profileError } = await service
      .from('profiles')
      .select('id, name, email')
      .eq('id', party.created_by)
      .maybeSingle();
    if (profileError || !profile?.email) {
      skipLog(party.id, profileError ? `profile error: ${profileError.message}` : 'no host email');
      skipped += 1;
      continue;
    }

    const { data: pref } = await service
      .from('notification_preferences')
      .select('email_enabled')
      .eq('user_id', party.created_by)
      .maybeSingle();
    if (pref && pref.email_enabled !== true) {
      skipped += 1;
      continue;
    }

    const claimed = await claimNotification(service, {
      userId: party.created_by,
      email: profile.email,
      type: 'check_in_summary',
      refId: String(party.id),
    });
    if (!claimed) {
      skipped += 1;
      continue;
    }

    const delivered = await sendCheckInSummaryEmail({
      to: profile.email,
      hostName: profile.name || 'there',
      partyTitle: party.title,
      partyDate: party.date,
      partyLocation: party.location,
      sold,
      checkedIn,
      noShow,
      revenueNaira: revenue,
      dashboardUrl: `${(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')}/host/${party.id}`,
    });
    await recordNotificationOutcome(service, {
      email: profile.email,
      type: 'check_in_summary',
      refId: String(party.id),
      status: delivered ? 'sent' : 'failed',
    });
    if (delivered) sent += 1;
    else skipped += 1;
  }

  return NextResponse.json({ okay: true, sent, skipped });
}

function skipLog(partyId: number, detail: string) {
  console.warn('[cron:check-in-summaries] skipped party', { partyId, detail });
}