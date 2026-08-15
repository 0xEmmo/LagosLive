import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// Called when the customer closes the Paystack window before paying: releases
// the spots the pending order had reserved so inventory isn't silently held.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { orderId?: unknown };
    const orderId = typeof body.orderId === 'string' ? body.orderId : '';
    if (!orderId) {
      return NextResponse.json({ error: 'Missing order.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id, payment_status')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (order.payment_status === 'pending') {
      const service = createServiceSupabase();
      await service.rpc('settle_order_payment', { p_order_id: order.id, p_payment_status: 'cancelled' });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
