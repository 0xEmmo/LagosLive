import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { generatePaymentRef, paystackInitialize } from '@/lib/paystack-server';
import { buildTicketUrl, generateTicketAccessToken, isValidEmail } from '@/lib/ticket-access';
import { sendTicketConfirmation } from '@/lib/resend';

const MAX_QTY = 6;
const SERVICE_FEE_PER_TICKET = 500;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { partyId?: unknown; ticketTypeId?: unknown; quantity?: unknown; email?: unknown };

    const partyId = Number(body.partyId);
    const ticketTypeId = body.ticketTypeId === null || body.ticketTypeId === undefined || body.ticketTypeId === '' ? null : Number(body.ticketTypeId);
    const quantity = Number(body.quantity);

    if (!Number.isInteger(partyId) || partyId <= 0) {
      return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      return NextResponse.json({ error: 'Quantity must be between 1 and 6.' }, { status: 400 });
    }
    if (ticketTypeId !== null && (!Number.isInteger(ticketTypeId) || ticketTypeId <= 0)) {
      return NextResponse.json({ error: 'Invalid ticket type.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Identity: signed-in buyers pay with their account email and link their
    // order to their user id. Guests (no session) must supply a valid email —
    // it is both the Paystack billing address and where their ticket lands.
    let email: string;
    let userId: string | null = null;
    if (user?.email) {
      email = user.email;
      userId = user.id;
    } else {
      const candidate = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!isValidEmail(candidate)) {
        return NextResponse.json({ error: 'Enter a valid email to receive your ticket.' }, { status: 400 });
      }
      email = candidate;
    }

    // Party + (optional) ticket type are read through the user's RLS — only
    // approved, publicly visible events (or the organizer's own) can be sold.
    const { data: party, error: partyError } = await supabase
      .from('parties')
      .select('*')
      .eq('id', partyId)
      .maybeSingle();
    if (partyError || !party) {
      return NextResponse.json({ error: 'This event is no longer available.' }, { status: 404 });
    }
    if (party.status !== 'approved') {
      return NextResponse.json({ error: 'This event is not open for bookings yet.' }, { status: 400 });
    }
    if (party.cancelled_at) {
      return NextResponse.json({ error: 'This event has been cancelled.' }, { status: 400 });
    }
    if (party.spots_left < quantity) {
      return NextResponse.json({ error: 'Sorry, this party just sold out.' }, { status: 400 });
    }

    let unitPrice = party.fee_num;
    let ticketTypeName = 'General Entry';
    if (ticketTypeId !== null) {
      const { data: ticketType } = await supabase.from('ticket_types').select('*').eq('id', ticketTypeId).maybeSingle();
      if (!ticketType || ticketType.party_id !== party.id) {
        return NextResponse.json({ error: 'That ticket type is no longer available.' }, { status: 404 });
      }
      const remaining = ticketType.quantity - ticketType.sold;
      if (remaining < quantity) {
        return NextResponse.json({ error: 'Not enough tickets left for that ticket type.' }, { status: 400 });
      }
      unitPrice = ticketType.price;
      ticketTypeName = ticketType.name;
    }

    // Amounts are recomputed here from DB prices — the browser only ever tells
    // us what it wants; the server decides what it costs.
    const subtotal = unitPrice * quantity;
    const serviceFee = unitPrice > 0 ? SERVICE_FEE_PER_TICKET * quantity : 0;
    const total = subtotal + serviceFee;

    const service = createServiceSupabase();

    // Release any earlier abandoned pending orders for this event — keyed on
    // the buyer's identity (user id, or guest email) so inventory reserved by
    // a closed/never-opened Paystack window doesn't accumulate.
    let staleQuery = service
      .from('orders')
      .select('id')
      .eq('party_id', party.id)
      .eq('payment_status', 'pending');
    staleQuery = userId ? staleQuery.eq('user_id', userId) : staleQuery.eq('customer_email', email);
    const { data: stale } = await staleQuery;
    for (const row of stale ?? []) {
      await service.rpc('settle_order_payment', { p_order_id: row.id, p_payment_status: 'cancelled' });
    }

    const reference = generatePaymentRef();
    const ticketAccessToken = userId ? null : generateTicketAccessToken();

    const { data: order, error: insertError } = await service
      .from('orders')
      .insert({
        user_id: userId,
        customer_email: email,
        ticket_access_token: ticketAccessToken,
        party_id: party.id,
        ticket_type_id: ticketTypeId,
        tier: 'regular',
        quantity,
        unit_price: unitPrice,
        service_fee: serviceFee,
        total,
        order_ref: reference,
        payment_ref: reference,
        status: 'pending',
        payment_status: 'pending',
      })
      .select('id')
      .single();
    if (insertError || !order) {
      return NextResponse.json({ error: 'Something went wrong placing your order. Please try again.' }, { status: 500 });
    }

    const confirmTicketAndNotify = async () => {
      const { error: confirmError } = await service.rpc('confirm_order_payment', { p_order_id: order.id });
      if (confirmError) {
        await service.rpc('settle_order_payment', { p_order_id: order.id, p_payment_status: 'failed' });
        return null;
      }
      const emailSent = await sendTicketConfirmation({
        to: email,
        partyTitle: party.title,
        partyDate: party.date,
        partyTime: party.time,
        partyLocation: party.location,
        ticketTypeName,
        quantity,
        total,
        orderRef: reference,
        ticketUrl: buildTicketUrl(order.id, ticketAccessToken),
      });
      return emailSent;
    };

    // Free orders never touch Paystack — confirm straight away, server-side,
    // then notify. The email is best-effort: a failed send must not unconfirm.
    if (total === 0) {
      const emailSent = await confirmTicketAndNotify();
      if (emailSent === null) {
        return NextResponse.json({ error: 'This ticket is no longer available.' }, { status: 409 });
      }
      return NextResponse.json({ free: true, reference, orderId: order.id, ticketAccessToken, emailSent });
    }

    try {
      const init = await paystackInitialize({
        email,
        amountKobo: total * 100,
        reference,
        metadata: { partyId: party.id, partyTitle: party.title, orderId: order.id },
      });
      return NextResponse.json({
        reference,
        orderId: order.id,
        ticketAccessToken,
        authorizationUrl: init.authorizationUrl,
        amountKobo: total * 100,
      });
    } catch (err) {
      await service.rpc('settle_order_payment', { p_order_id: order.id, p_payment_status: 'failed' });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Payment could not be started. Please try again.' },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
