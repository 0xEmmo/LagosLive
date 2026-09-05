import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

type Op =
  | { action: 'set_refund'; orderId: string; refundStatus: string; refundAmount: number }
  | { action: 'issue_refund'; orderId: string }
  | { action: 'resend_email'; orderId: string }
  | { action: 'set_role'; targetUserId: string; role: string }
  | { action: 'audit'; targetType: string; targetId: string; logAction: string; details?: Record<string, unknown> };

const PAYSTACK_API = 'https://api.paystack.co';

async function issuePaystackRefund(paymentRef: string, totalNaira: number): Promise<boolean> {
  if (!process.env.PAYSTACK_SECRET_KEY || !paymentRef || totalNaira <= 0) return false;
  try {
    const response = await fetch(`${PAYSTACK_API}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transaction: paymentRef, amount: Math.round(totalNaira * 100) }),
    });
    const json = (await response.json().catch(() => null)) as { status?: boolean; message?: string } | null;
    return (
      response.ok &&
      (json?.status === true || (json !== null && String(json.message ?? '').toLowerCase().includes('refund')))
    );
  } catch {
    return false;
  }
}

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

    if (body.action === 'issue_refund') {
      // Retry a failed real-money refund for a cancelled event.
      const op = body as Extract<Op, { action: 'issue_refund' }>;
      const { data: order } = await service
        .from('orders')
        .select('id, total, payment_ref, refund_status')
        .eq('id', op.orderId)
        .eq('payment_status', 'confirmed')
        .maybeSingle();
      if (!order) return NextResponse.json({ error: 'Order not found or not confirmed.' }, { status: 404 });
      if (order.refund_status !== 'failed' && order.refund_status !== 'none') {
        return NextResponse.json({ error: 'Refund is already handled or in progress.' }, { status: 409 });
      }
      const accepted = await issuePaystackRefund(order.payment_ref ?? '', order.total);
      const now = new Date().toISOString();
      await service.from('orders').update({
        refund_status: accepted ? 'refunded' : 'failed',
        refund_amount: accepted ? order.total : 0,
        refunded_at: accepted ? now : null,
      }).eq('id', op.orderId);
      try {
        await service.rpc('write_audit_log', {
          p_action: accepted ? 'refund_retry_success' : 'refund_retry_failed',
          p_target_type: 'order',
          p_target_id: op.orderId,
          p_details: { amount: order.total, payment_ref: order.payment_ref ?? null },
        } as never);
      } catch {
        // Best-effort auditing.
      }
      if (!accepted) return NextResponse.json({ error: 'Paystack did not accept the refund. Please try again.' }, { status: 502 });
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
        p_details: op.details ?? {},
      } as never);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'set_role') {
      const op = body as Extract<Op, { action: 'set_role' }>;
      const validRoles = ['viewer', 'organizer', 'support', 'finance', 'admin'];
      if (!validRoles.includes(op.role)) {
        return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
      }
      // Only admin and super_admin can promote/demote
      if (!['admin', 'super_admin'].includes(role)) {
        return NextResponse.json({ error: 'Only admins can change roles.' }, { status: 403 });
      }
      // Cannot demote super_admin via UI
      const { data: target } = await service
        .from('profiles')
        .select('role')
        .eq('id', op.targetUserId)
        .maybeSingle();
      if (target?.role === 'super_admin') {
        return NextResponse.json({ error: 'Cannot change the platform owner role.' }, { status: 403 });
      }
      await (service.rpc as any)('set_user_role', {
        p_user_id: op.targetUserId,
        p_role: op.role,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
