import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { isValidEmail } from '@/lib/ticket-access';

// Guest → account order linking (Phase 5). When a signed-in user has guest
// orders bought earlier with the same email, this claims them: user_id is set
// and the unguessable guest token is removed (the owner's identity replaces the
// token as proof of ownership — the guest lookups in /api/tickets/find and
// /api/tickets/lookup then simply stop matching them). Bypassing RLS is required
// here because there is deliberately no user UPDATE policy on orders; the id of
// the authenticated user is the only value ever written to user_id.
//
// Idempotent: only orders whose user_id is null are ever touched.
export async function POST() {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email || !isValidEmail(user.email)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const email = user.email.trim().toLowerCase();
    const service = createServiceSupabase();

    const { data: guests } = await service
      .from('orders')
      .select('id, order_ref, party_id')
      .is('user_id', null)
      .eq('customer_email', email)
      .eq('payment_status', 'confirmed');

    const orders = guests ?? [];
    if (orders.length === 0) {
      return NextResponse.json({ linked: 0, total: 0 });
    }

    let linked = 0;
    for (const order of orders) {
      const { error } = await service
        .from('orders')
        .update({ user_id: user.id, ticket_access_token: null })
        .eq('id', order.id)
        .is('user_id', null);
      if (error) continue;
      linked += 1;
      // Best-effort audit; a failure here must not fail the whole link.
      await service.rpc('write_audit_log', {
        p_action: 'guest_order_linked',
        p_target_type: 'order',
        p_target_id: order.id,
        p_details: { order_ref: order.order_ref, party_id: order.party_id, email },
      });
    }

    return NextResponse.json({ linked, total: orders.length });
  } catch (err) {
    console.error('link-guest failed', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}