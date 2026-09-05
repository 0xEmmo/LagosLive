import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendReviewRequestEmail } from '@/lib/resend';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function GET(request: Request) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceSupabase();
  const after = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Confirmed orders whose event started at least a day ago, never emailed.
  const { data: orders, error } = await service
    .from('orders')
    .select('id, customer_email, party:parties!inner(id, title)')
    .eq('payment_status', 'confirmed')
    .is('review_emailed_at', null)
    .lte('party.starts_at', after)
    .in('party.status', ['approved'])
    .is('party.cancelled_at', null);

  if (error) {
    console.error('[cron:review-requests] query error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const order of orders ?? []) {
    const party = Array.isArray(order.party) ? order.party[0] : order.party;
    if (!order.customer_email || !party) {
      skipped += 1;
      continue;
    }
    const reviewUrl = `${APP_URL}/review/${party.id}`;
    const accepted = await sendReviewRequestEmail({
      to: order.customer_email,
      guestName: order.customer_email.split('@')[0] || 'there',
      partyTitle: party.title,
      reviewUrl,
    });
    if (accepted) {
      const { error: markError } = await service
        .from('orders')
        .update({ review_emailed_at: new Date().toISOString() })
        .eq('id', order.id);
      if (markError) {
        console.error('[cron:review-requests] mark error', order.id, markError);
      } else {
        sent += 1;
        await service.rpc('write_audit_log', {
          p_action: 'review_request_sent',
          p_target_type: 'order',
          p_target_id: order.id,
        });
      }
    } else {
      skipped += 1;
    }
  }

  return NextResponse.json({ okay: true, sent, skipped });
}