import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { reconcilePaidOrderGroup } from '@/lib/payment-reconciliation';
import type { Database } from '@/lib/supabase/database.types';

type OrderRow = Database['public']['Tables']['orders']['Row'];

// The buyer returning from the Paystack popup. This is a FAST PATH for the
// person in front of the screen — it is not the source of truth for whether
// money arrived. All of the actual verification lives in
// lib/payment-reconciliation.ts and is shared with the signed webhook at
// /api/paystack/webhook, so the browser can never reach a different conclusion
// than the provider did.
//
// Every payment outcome is decided server-side from Paystack's API and the
// order rows the server created: the amount charged is cross-checked against
// the group total, and the whole group is confirmed atomically or not at all.
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
    // order — a bare order id alone is never trusted. This anchoring is what
    // stops a buyer from posting someone else's reference to make the platform
    // confirm an order group they do not own.
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

    const result = await reconcilePaidOrderGroup(service, reference);

    if (result.status === 'unknown_reference') {
      return NextResponse.json({ error: 'Order group not found.' }, { status: 404 });
    }
    if (result.status === 'failed') {
      return NextResponse.json({ status: 'failed', error: result.reason }, { status: 400 });
    }

    return NextResponse.json({
      status: 'confirmed',
      emailSent: result.emailSent,
      lineTickets: result.lines,
    });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
