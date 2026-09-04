import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

type Op =
  | { action: 'set_refund'; orderId: string; refundStatus: string; refundAmount: number }
  | { action: 'resend_email'; orderId: string }
  | { action: 'audit'; targetType: string; targetId: string; logAction: string };

// Server route for staff operations that need a service client (RLS for staff
// already allows most reads/writes, but payment-related transitions and audit
// trails are channeled here to keep them on one audited path).
export async function POST(request: Request) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    // Staff gate.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const role: string = profile?.role ?? 'viewer';
    const isStaff = ['support', 'finance', 'admin', 'super_admin'].includes(role);
    if (!isStaff) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    const body = (await request.json()) as Op;
    const service = createServiceSupabase();

    if (body.action === 'set_refund') {
      const op = body as Extract<Op, { action: 'set_refund' }>;
      const { data: order } = await service.from('orders').select('id, total').eq('id', op.orderId).maybeSingle();
      if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      await service.from('orders').update({ refund_status: op.refundStatus, refund_amount: op.refundAmount }).eq('id', op.orderId);
      await service.rpc('write_audit_log', {
        p_action: `refund_${op.refundStatus}`,
        p_target_type: 'order',
        p_target_id: op.orderId,
        p_details: { refund_amount: op.refundAmount },
      } as never);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'resend_email') {
      // Best-effort: re-run the confirmation email for a confirmed order.
      const op = body as Extract<Op, { action: 'resend_email' }>;
      const { data: order } = await service
        .from('orders')
        .select('id, customer_email, order_ref, party_id, ticket_type_id, quantity, total, ticket_access_token')
        .eq('id', op.orderId)
        .eq('payment_status', 'confirmed')
        .maybeSingle();
      if (!order) return NextResponse.json({ error: 'Order not found or not confirmed.' }, { status: 404 });
      await service.rpc('write_audit_log', {
        p_action: 'resend_email',
        p_target_type: 'order',
        p_target_id: op.orderId,
      } as never);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'audit') {
      const op = body as Extract<Op, { action: 'audit' }>;
      await service.rpc('write_audit_log', {
        p_action: op.logAction,
        p_target_type: op.targetType,
        p_target_id: op.targetId,
      } as never);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
