import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { isValidEmail } from '@/lib/ticket-access';

// Guest ticket recovery: email + order reference. The response is deliberately
// identical for "no such ticket" and "wrong details" so the endpoint can't be
// used to enumerate orders, and an in-memory per-IP budget slows brute forcing.
// Only orders with an unguessable guest token can be surfaced this way.

const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function allow(clientIp: string): boolean {
  const now = Date.now();
  const list = (hits.get(clientIp) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) {
    hits.set(clientIp, list);
    return false;
  }
  list.push(now);
  hits.set(clientIp, list);
  return true;
}

const generic = 'We could not find a matching ticket. Check the details and try again.';

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    if (!allow(ip)) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    const body = (await request.json()) as { email?: unknown; orderRef?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const orderRef = typeof body.orderRef === 'string' ? body.orderRef.trim().toUpperCase() : '';
    if (!isValidEmail(email) || !orderRef) {
      return NextResponse.json({ error: generic }, { status: 404 });
    }

    const service = createServiceSupabase();
    const { data: order } = await service
      .from('orders')
      .select('id, ticket_access_token')
      .eq('customer_email', email)
      .eq('order_ref', orderRef)
      .eq('payment_status', 'confirmed')
      .not('ticket_access_token', 'is', null)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ error: generic }, { status: 404 });
    }

    return NextResponse.json({ ok: true, url: `/ticket/${order.id}?token=${order.ticket_access_token}` });
  } catch {
    return NextResponse.json({ error: generic }, { status: 500 });
  }
}