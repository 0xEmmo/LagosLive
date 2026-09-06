import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { generatePaymentRef, paystackInitialize } from '@/lib/paystack-server';
import { buildTicketUrl, generateTicketAccessToken, isValidEmail } from '@/lib/ticket-access';
import { sendTicketConfirmation } from '@/lib/resend';
import { lineDiscount, MAX_QTY_PER_TYPE } from '@/lib/tickets';

interface CheckoutLine {
  ticketTypeId: number | null;
  quantity: number;
}

interface ResolvedLine {
  ticketTypeId: number | null;
  ticketTypeName: string;
  quantity: number;
  unitPrice: number;
  serviceFee: number;
  total: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      partyId?: unknown;
      items?: unknown;
      ticketTypeId?: unknown;
      quantity?: unknown;
      email?: unknown;
      guestName?: unknown;
      guestPhone?: unknown;
      promoCode?: unknown;
    };

    const partyId = Number(body.partyId);
    if (!Number.isInteger(partyId) || partyId <= 0) {
      return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
    }

    // Normalize the request into one or more lines. New clients send
    // `items: [{ ticketTypeId, quantity }]`; legacy clients send a single
    // `{ ticketTypeId, quantity }` pair. ticketTypeId of null/0 means the
    // pre-tier fee-based "General Entry" purchase, which stays supported.
    let lines: CheckoutLine[];
    if (Array.isArray(body.items)) {
      lines = body.items.map((item) => {
        const it = item as { ticketTypeId?: unknown; quantity?: unknown };
        const id = it.ticketTypeId === null || it.ticketTypeId === undefined || it.ticketTypeId === '' ? null : Number(it.ticketTypeId);
        return { ticketTypeId: id, quantity: Number(it.quantity) };
      });
    } else {
      const id =
        body.ticketTypeId === null || body.ticketTypeId === undefined || body.ticketTypeId === '' ? null : Number(body.ticketTypeId);
      lines = [{ ticketTypeId: id, quantity: Number(body.quantity) }];
    }

    if (lines.length === 0 || lines.length > 12) {
      return NextResponse.json({ error: 'Pick at least one ticket.' }, { status: 400 });
    }
    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QTY_PER_TYPE) {
        return NextResponse.json({ error: `Each ticket is limited to ${MAX_QTY_PER_TYPE} per purchase.` }, { status: 400 });
      }
      if (line.ticketTypeId !== null && (!Number.isInteger(line.ticketTypeId) || line.ticketTypeId <= 0)) {
        return NextResponse.json({ error: 'Invalid ticket type.' }, { status: 400 });
      }
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Identity: signed-in buyers pay with their account email and link their
    // order to their user id. Guests (no session) must supply a valid email —
    // it is both the Paystack billing address and where their tickets land.
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

    // Buyer details: full name + phone ride onto the ticket lines (shown on the
    // e-ticket and guest list). Guests must give a name so the host has someone
    // to check in; signed-in buyers can fill them in optionally. Promo codes are
    // uppercase ledger fields — the discount itself is (re)validated below.
    const isGuest = userId === null;
    const guestName = typeof body.guestName === 'string' ? body.guestName.trim() : '';
    const guestPhone = typeof body.guestPhone === 'string' ? body.guestPhone.trim() : '';
    if (guestName.length > 80) {
      return NextResponse.json({ error: 'Full name is too long.' }, { status: 400 });
    }
    if (isGuest && guestName === '') {
      return NextResponse.json({ error: 'Enter your full name to finish checkout.' }, { status: 400 });
    }
    if (guestPhone && !/^[0-9+\-() ]{6,20}$/.test(guestPhone)) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }
    const promoCodeRaw = typeof body.promoCode === 'string' ? body.promoCode.trim().toUpperCase() : '';

    // Party is read through the user's RLS — only approved, publicly visible
    // events (or the organizer's own) can be sold.
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

    // Legacy fee-based lines (no ticket type) collapse into one General Entry
    // purchase; mixing them with typed lines is not a supported request shape.
    const hasLegacyLine = lines.some((line) => line.ticketTypeId === null);
    if (hasLegacyLine) {
      const totalQty = lines.reduce((sum, line) => sum + line.quantity, 0);
      lines = [{ ticketTypeId: null, quantity: totalQty }];
    }

    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    if (party.spots_left < totalQuantity) {
      return NextResponse.json({ error: 'Sorry, this party just sold out.' }, { status: 400 });
    }

    // Resolve each line against its ticket_type, through the buyer's RLS. The
    // server re-checks availability and the sales window — the browser only
    // says what it wants; the server decides what can be sold and at what price.
    const resolved: ResolvedLine[] = [];
    for (const line of lines) {
      if (line.ticketTypeId === null) {
        resolved.push({
          ticketTypeId: null,
          ticketTypeName: 'General Entry',
          quantity: line.quantity,
          unitPrice: party.fee_num,
          serviceFee: party.fee_num > 0 ? 500 * line.quantity : 0,
          total: party.fee_num * line.quantity + (party.fee_num > 0 ? 500 * line.quantity : 0),
        });
        continue;
      }

      const { data: ticketType } = await supabase.from('ticket_types').select('*').eq('id', line.ticketTypeId).maybeSingle();
      if (!ticketType || ticketType.party_id !== party.id) {
        return NextResponse.json({ error: 'One or more ticket types are no longer available.' }, { status: 404 });
      }
      if (ticketType.active === false) {
        return NextResponse.json({ error: `"${ticketType.name}" is paused and not on sale.` }, { status: 400 });
      }
      const now = Date.now();
      if (ticketType.sales_start_at && new Date(ticketType.sales_start_at).getTime() > now) {
        return NextResponse.json({ error: `Sales for "${ticketType.name}" haven't started yet.` }, { status: 400 });
      }
      if (ticketType.sales_end_at && new Date(ticketType.sales_end_at).getTime() < now) {
        return NextResponse.json({ error: `Sales for "${ticketType.name}" have ended.` }, { status: 400 });
      }
      const remaining = ticketType.quantity - ticketType.sold;
      if (remaining < line.quantity) {
        return NextResponse.json({ error: `Not enough "${ticketType.name}" tickets left.` }, { status: 400 });
      }
      resolved.push({
        ticketTypeId: ticketType.id,
        ticketTypeName: ticketType.name,
        quantity: line.quantity,
        unitPrice: ticketType.price,
        serviceFee: ticketType.price > 0 ? 500 * line.quantity : 0,
        total: ticketType.price * line.quantity + (ticketType.price > 0 ? 500 * line.quantity : 0),
      });
    }

    const service = createServiceSupabase();

    // Promo discount: server-authoritative. The client may preview a code, but
    // the charge is always computed here. Discounts apply to paid ticket
    // subtotals only (never the service fee) and are folded into each line's
    // stored total, so verify/confirm and the Paystack amount check keep seeing
    // exactly what was charged.
    let promoCode: string | null = null;
    let discountPercent = 0;
    const hasPaidLine = resolved.some((line) => line.unitPrice > 0);
    if (promoCodeRaw) {
      if (!hasPaidLine) {
        return NextResponse.json({ error: 'Promo codes apply to paid tickets only.' }, { status: 400 });
      }
      if (!/^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(promoCodeRaw)) {
        return NextResponse.json({ error: 'That promo code is not valid.' }, { status: 400 });
      }
      const { data: promo } = await service
        .from('promos')
        .select('code, discount_percent, active, uses, max_uses, starts_at, ends_at')
        .eq('code', promoCodeRaw)
        .maybeSingle();
      const now = Date.now();
      const promoInvalid =
        !promo ||
        !promo.active ||
        (promo.starts_at && new Date(promo.starts_at).getTime() > now) ||
        (promo.ends_at && new Date(promo.ends_at).getTime() < now) ||
        (promo.max_uses !== null && promo.uses >= promo.max_uses);
      if (promoInvalid) {
        return NextResponse.json({ error: 'That promo code is not valid for this purchase.' }, { status: 400 });
      }
      promoCode = promo!.code;
      discountPercent = promo!.discount_percent;
    }

    // Each line's total becomes its NET amount (discount removed). The gross
    // unit price and per-line discount stay on the row for reporting.
    let groupTotal = 0;
    const plans = resolved.map((line) => {
      const discount = lineDiscount(line.unitPrice, line.quantity, discountPercent);
      const netTotal = line.total - discount;
      groupTotal += netTotal;
      return { ...line, discount, netTotal };
    });

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

    // One shared payment ref binds the group together across N order rows, each
    // with its own order_ref (unique per row) and — for guests — its own
    // unguessable ticket-access token (the DB forbids sharing a token across rows).
    const reference = generatePaymentRef();
    const multiLine = resolved.length > 1;
    const rows = plans.map((line, i) => ({
      user_id: userId,
      customer_email: email,
      guest_name: guestName || null,
      guest_phone: guestPhone || null,
      ticket_access_token: userId ? null : generateTicketAccessToken(),
      party_id: party.id,
      ticket_type_id: line.ticketTypeId,
      tier: 'regular',
      quantity: line.quantity,
      unit_price: line.unitPrice,
      service_fee: line.serviceFee,
      promo_code: promoCode,
      promo_discount: line.discount > 0 ? line.discount : null,
      total: line.netTotal,
      order_ref: multiLine ? `${reference}-${i + 1}` : reference,
      payment_ref: reference,
      status: 'pending',
      payment_status: 'pending',
    }));

    const { data: orders, error: insertError } = await service
      .from('orders')
      .insert(rows)
      .select('id, order_ref, ticket_access_token');
    if (insertError || !orders || orders.length !== rows.length) {
      return NextResponse.json({ error: 'Something went wrong placing your order. Please try again.' }, { status: 500 });
    }

    // Best-effort per-line ticket emails after confirmation. A failed send must
    // never unconfirm an order — the guest can always find their tickets in the
    // confirmation screen instead.
    const sendLineEmails = async (): Promise<boolean> => {
      try {
        for (let i = 0; i < plans.length; i++) {
          await sendTicketConfirmation({
            to: email,
            guestName: guestName || undefined,
            guestPhone: guestPhone || undefined,
            partyTitle: party.title,
            partyDate: party.date,
            partyTime: party.time,
            partyLocation: party.location,
            ticketTypeName: plans[i].ticketTypeName,
            quantity: plans[i].quantity,
            total: plans[i].netTotal,
            orderRef: orders[i].order_ref,
            ticketUrl: buildTicketUrl(orders[i].id, orders[i].ticket_access_token),
            promoCode: promoCode ?? undefined,
            promoDiscount: plans[i].discount > 0 ? plans[i].discount : undefined,
          });
        }
        return true;
      } catch {
        return false;
      }
    };

    const settleGroup = async (paymentStatus: 'cancelled' | 'failed') => {
      for (const order of orders) {
        await service.rpc('settle_order_payment', { p_order_id: order.id, p_payment_status: paymentStatus });
      }
    };

    // Free orders never touch Paystack — confirm the whole group atomically,
    // server-side, then notify. All-or-nothing per payment_ref.
    if (groupTotal === 0) {
      const { error: confirmError } = await service.rpc('confirm_order_group', { p_payment_ref: reference });
      if (confirmError) {
        await settleGroup('failed');
        return NextResponse.json({ error: 'This ticket is no longer available.' }, { status: 409 });
      }
      const emailSent = await sendLineEmails();
      return NextResponse.json({
        free: true,
        reference,
        orderId: orders[0].id,
        lineTickets: orders.map((o) => ({
          orderId: o.id,
          orderRef: o.order_ref,
          ticketAccessToken: o.ticket_access_token,
        })),
        emailSent,
      });
    }

    try {
      const init = await paystackInitialize({
        email,
        amountKobo: groupTotal * 100,
        reference,
        metadata: { partyId: party.id, partyTitle: party.title, reference },
      });
      return NextResponse.json({
        reference,
        orderId: orders[0].id,
        lineTickets: orders.map((o) => ({
          orderId: o.id,
          orderRef: o.order_ref,
          ticketAccessToken: o.ticket_access_token,
        })),
        authorizationUrl: init.authorizationUrl,
        amountKobo: groupTotal * 100,
        free: false,
        promo: promoCode ? { code: promoCode, discountPercent } : undefined,
      });
    } catch (err) {
      await settleGroup('failed');
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Payment could not be started. Please try again.' },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}