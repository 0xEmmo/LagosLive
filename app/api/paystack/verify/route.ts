import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { paystackVerifyTransaction } from '@/lib/paystack-server';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { reference?: unknown; orderId?: unknown };
    const reference = typeof body.reference === 'string' ? body.reference : '';
    const orderId = typeof body.orderId === 'string' ? body.orderId : '';

    if (!reference || !orderId) {
      return NextResponse.json({ error: 'Missing payment details.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    // Read through RLS so a user can only ever verify their own order.
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    if (order.payment_ref !== reference) {
      return NextResponse.json({ error: 'Payment reference mismatch.' }, { status: 400 });
    }

    // Idempotent: re-verifying an already confirmed order just reports success.
    if (order.payment_status === 'confirmed') {
      return NextResponse.json({ status: 'confirmed' });
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

    const service = createServiceSupabase();
    const failOrder = async (error: string) => {
      await service.rpc('settle_order_payment', { p_order_id: order.id, p_payment_status: 'failed' });
      return NextResponse.json({ status: 'failed', error }, { status: 400 });
    };

    if (verified.status !== 'success') {
      return failOrder('Payment was not completed. No charge was made.');
    }
    if (verified.reference !== reference) {
      return failOrder('Payment verification failed.');
    }
    // The only amount we accept is the one the server computed when the order
    // was created — anything else (tampered client, wrong charge) is rejected.
    if (verified.amountKobo !== order.total * 100 || verified.currency !== 'NGN') {
      return failOrder('The payment amount did not match. Please contact support.');
    }

    const { error: confirmError } = await service.rpc('confirm_order_payment', { p_order_id: order.id });
    if (confirmError) {
      return failOrder('Sorry, tickets just sold out. Your payment will be refunded.');
    }

    return NextResponse.json({ status: 'confirmed' });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
