import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { sendTicketConfirmation } from '@/lib/resend';
import { buildTicketUrl, isValidEmail } from '@/lib/ticket-access';

// Re-send the ticket confirmation email to a lost guest. Matches the same
// email + order reference as /api/tickets/find, is rate-limited per IP and
// tells the caller nothing about whether an order actually exists.

const LIMIT = 3;
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

const generic = 'We could not find a matching order. Check the details and try again.';

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

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const service = createServiceSupabase();
    const { data: order } = await service
      .from('orders')
      .select('*, parties(title, date, time, location), ticket_types(name)')
      .eq('customer_email', email)
      .eq('order_ref', orderRef)
      .eq('payment_status', 'confirmed')
      .maybeSingle();

    // Never reveal whether an order matched.
    if (!order || !order.parties) {
      return NextResponse.json({ ok: true });
    }

    // Signed-in buyers resend through their own account flow (audited); the
    // guest path requires the unguessable token, and only resends to the seat
    // the email is already attached to.
    const audience = order.ticket_access_token ? 'guest' : 'account';
    if (!order.ticket_access_token && !user) {
      return NextResponse.json({ ok: true });
    }

    const party = order.parties as { title: string; date: string; time: string; location: string };
    const sent = await sendTicketConfirmation({
      to: order.customer_email ?? '',
      partyTitle: party.title,
      partyDate: party.date,
      partyTime: party.time,
      partyLocation: party.location,
      ticketTypeName: order.ticket_types?.name ?? 'General Entry',
      quantity: order.quantity,
      total: order.total,
      orderRef: order.order_ref,
      ticketUrl: buildTicketUrl(order.id, order.ticket_access_token),
    });

    if (!sent) {
      return NextResponse.json({ error: 'Email could not be sent. Please try again.' }, { status: 502 });
    }

    try {
      await service.rpc('write_audit_log', {
        p_action: 'ticket_emailed',
        p_target_type: 'order',
        p_target_id: order.id,
        p_details: { via: audience },
      } as never);
    } catch {
      // Best-effort auditing.
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: generic }, { status: 500 });
  }
}