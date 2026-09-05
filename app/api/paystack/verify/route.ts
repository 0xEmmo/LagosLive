import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { paystackVerifyTransaction } from '@/lib/paystack-server';
import { buildTicketUrl } from '@/lib/ticket-access';
import { sendTicketConfirmation } from '@/lib/resend';
import type { Database } from '@/lib/supabase/database.types';

type OrderRow = Database['public']['Tables']['orders']['Row'];

// Best-effort delivery after a confirmed group payment — one email per order
// line. Needs extra reads (party, ticket type name) purely for the email; if
// anything is missing we log and skip; the confirmation already happened and
// must not be rolled back.
async function notifyConfirmedOrder(order: OrderRow): Promise<boolean> {
  const to = order.customer_email;
  if (!to) {
    console.warn('[verify] no customer_email on order', order.id, '— skipping ticket email');
    return false;
  }
  try {
    const service = createServiceSupabase();
    const [{ data: party }, tt] = await Promise.all([
      service.from('parties').select('title, date, time, location').eq('id', order.party_id).single(),
      order.ticket_type_id
        ? service.from('ticket_types').select('name').eq('id', order.ticket_type_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!party) {
      console.warn('[verify] party not found for order', order.id, '— skipping ticket email');
      return false;
    }
    return await sendTicketConfirmation({
      to,
      partyTitle: party.title,
      partyDate: party.date,
      partyTime: party.time,
      partyLocation: party.location,
      ticketTypeName: tt?.data?.name ?? 'General Entry',
      quantity: order.quantity,
      total: order.total,
      orderRef: order.order_ref,
      ticketUrl: buildTicketUrl(order.id, order.ticket_access_token),
    });
  } catch (err) {
    console.warn('[verify] could not build ticket email for order', order.id, err);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { reference?: unknown; orderId?: unknown; token?: unknown };
    const reference = typeof body.reference === 'string' ? body.reference : '';
    const orderId = typeof body.orderId === 'string' ? body.orderId : '';
    const token = typeof body.token === 'string' ? body.token : '';

    if (!reference || !orderId) {
      return NextResponse.json({ error: 'Missing payment details.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const service = createServiceSupabase();

    // Authenticated buyers only ever reach their own order through RLS. Guests
    // prove ownership with the unguessable ticket-access token stored on the
    // order — a bare order id alone is never trusted.
    let anchor: OrderRow | null = null;
    if (user) {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', user.id)
        .maybeSingle();
      anchor = data ?? null;
    } else {
      if (!token) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      }
      const { data } = await service
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('ticket_access_token', token)
        .maybeSingle();
      anchor = data ?? null;
    }
    if (!anchor) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    if (anchor.payment_ref !== reference) {
      return NextResponse.json({ error: 'Payment reference mismatch.' }, { status: 400 });
    }

    // The whole group shares one payment_ref — verify, confirm and email every
    // line together so a multi-type purchase lands (or fails) atomically.
    const { data: group, error: groupError } = await service
      .from('orders')
      .select('*')
      .eq('payment_ref', reference)
      .eq('party_id', anchor.party_id)
      .order('id');
    if (groupError || !group || group.length === 0) {
      return NextResponse.json({ error: 'Order group not found.' }, { status: 404 });
    }
    const groupTotal = group.reduce((sum, order) => sum + order.total, 0);

    // Idempotent: re-verifying an already confirmed group just reports success.
    // The emails were already attempted at confirmation time, so we don't resend.
    if (group.every((order) => order.payment_status === 'confirmed')) {
      return NextResponse.json({
        status: 'confirmed',
        emailSent: true,
        lineTickets: group.map((order) => ({
          orderId: order.id,
          orderRef: order.order_ref,
          ticketAccessToken: order.ticket_access_token,
        })),
      });
    }

    let verified;
    try {
      verified = await paystackVerifyTransaction(reference);
    } catch (err) {
      return NextResponse.json(
        { status: 'failed', error: err instanceof Error ? err.message : 'Payment could not be verified.' },
        { status: 502 }
      );
    }

    const failGroup = async (error: string) => {
      for (const order of group) {
        await service.rpc('settle_order_payment', { p_order_id: order.id, p_payment_status: 'failed' });
      }
      return NextResponse.json({ status: 'failed', error }, { status: 400 });
    };

    if (verified.status !== 'success') {
      return failGroup('Payment was not completed. No charge was made.');
    }
    if (verified.reference !== reference) {
      return failGroup('Payment verification failed.');
    }
    // The only amount we accept is the one the server computed when the group
    // was created — anything else (tampered client, wrong charge) is rejected.
    if (verified.amountKobo !== groupTotal * 100 || verified.currency !== 'NGN') {
      return failGroup('The payment amount did not match. Please contact support.');
    }

    const { error: confirmError } = await service.rpc('confirm_order_group', { p_payment_ref: reference });
    if (confirmError) {
      return failGroup('Sorry, tickets just sold out. Your payment will be refunded.');
    }

    // Notification is best-effort: a failed email never unconfirms the ticket.
    const results = await Promise.all(group.map((order) => notifyConfirmedOrder(order)));
    const emailSent = results.some(Boolean);

    return NextResponse.json({
      status: 'confirmed',
      emailSent,
      lineTickets: group.map((order) => ({
        orderId: order.id,
        orderRef: order.order_ref,
        ticketAccessToken: order.ticket_access_token,
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}