import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// Called when the customer closes the Paystack window before paying: releases
// the spots the pending order had reserved so inventory isn't silently held.
// Authenticated buyers reach their own order via RLS; guests prove ownership
// with the ticket-access token issued at checkout.
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

    let order: { id: string; payment_status: string } | null = null;
    if (user) {
      const { data } = await supabase
        .from('orders')
        .select('id, payment_status')
        .eq('id', orderId)
        .eq('user_id', user.id)
        .maybeSingle();
      order = data ?? null;
    } else {
      if (!token) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      }
      const { data } = await service
        .from('orders')
        .select('id, payment_status')
        .eq('id', orderId)
        .eq('ticket_access_token', token)
        .maybeSingle();
      order = data ?? null;
    }
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (order.payment_status === 'pending') {
      await service.rpc('settle_order_payment', { p_order_id: order.id, p_payment_status: 'cancelled' });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
