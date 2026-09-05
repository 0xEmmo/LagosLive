import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// Called when the customer closes the Paystack window before paying: releases
// the spots every pending order in the group had reserved so inventory isn't
// silently held. Authenticated buyers reach their own order via RLS; guests
// prove ownership with the ticket-access token issued at checkout.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { orderId?: unknown; token?: unknown };
    const orderId = typeof body.orderId === 'string' ? body.orderId : '';
    const token = typeof body.token === 'string' ? body.token : '';
    if (!orderId) {
      return NextResponse.json({ error: 'Missing order.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const service = createServiceSupabase();

    let anchor: { id: string; payment_status: string; payment_ref: string | null; party_id: number } | null = null;
    if (user) {
      const { data } = await supabase
        .from('orders')
        .select('id, payment_status, payment_ref, party_id')
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
        .select('id, payment_status, payment_ref, party_id')
        .eq('id', orderId)
        .eq('ticket_access_token', token)
        .maybeSingle();
      anchor = data ?? null;
    }
    if (!anchor) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    // Settle every still-pending line sharing this payment ref — the whole
    // group that a multi-type checkout created together.
    if (!anchor.payment_ref) {
      return NextResponse.json({ ok: true });
    }
    const { data: group } = await service
      .from('orders')
      .select('id, payment_status')
      .eq('payment_ref', anchor.payment_ref)
      .eq('party_id', anchor.party_id);
    for (const order of group ?? []) {
      if (order.payment_status === 'pending') {
        await service.rpc('settle_order_payment', { p_order_id: order.id, p_payment_status: 'cancelled' });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}