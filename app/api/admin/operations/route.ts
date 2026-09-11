import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { sendRefundProcessedEmail, sendTicketConfirmation } from '@/lib/resend';
import { claimNotification, recordNotificationOutcome } from '@/lib/notify';
import { buildTicketUrl } from '@/lib/ticket-access';

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

// Tells the guest their money is on its way after a refund actually went out
// (manual set_refund to 'refunded' or a successful issue_refund retry). Deduped
// per order id so a re-set or re-issue cannot double-email; best-effort so a
// missing email/party never fails the refund itself.
async function sendRefundEmailIfDue({
  service,
  orderId,
  customerEmail,
  guestName,
  partyId,
  orderRef,
  amountNaira,
}: {
  service: ReturnType<typeof createServiceSupabase>;
  orderId: string;
  customerEmail: string | null;
  guestName?: string;
  partyId: number;
  orderRef: string;
  amountNaira: number;
}): Promise<void> {
  if (!customerEmail) {
    console.warn('[refund-email] order has no customer_email', orderId, '— skipping');
    return;
  }
  try {
    const { data: party } = await service
      .from('parties')
      .select('title')
      .eq('id', partyId)
      .single();
    if (!party) {
      console.warn('[refund-email] party not found', partyId, '— skipping');
      return;
    }
    const claimed = await claimNotification(service, {
      email: customerEmail,
      type: 'refund_update',
      refId: orderId,
    });
    if (!claimed) return;

    const sent = await sendRefundProcessedEmail({
      to: customerEmail,
      guestName: guestName ?? customerEmail.split('@')[0] ?? 'there',
      partyTitle: party.title,
      amountNaira,
      orderRef,
    });
    await recordNotificationOutcome(service, {
      email: customerEmail,
      type: 'refund_update',
      refId: orderId,
      status: sent ? 'sent' : 'failed',
    });
  } catch (err) {
    console.warn('[refund-email] could not send for order', orderId, err);
  }
}

// Permission gate: routes use the server-side permission model
// (user_has_permission) rather than the legacy single role value.
async function permOk(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  permission: string
): Promise<boolean> {
  const { data } = await supabase.rpc('user_has_permission', {
    p_user_id: userId,
    p_permission_name: permission,
  });
  return data === true;
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

    // Staff gate: any of the staff-facing read/money permissions.
    const isStaff = (
      await Promise.all(
        ['orders.view', 'support.view', 'staff.view', 'hosts.view', 'revenue.view', 'payouts.view'].map((p) =>
          permOk(supabase, user.id, p)
        )
      )
    ).some(Boolean);
    if (!isStaff) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    const body = (await request.json()) as Op;
    const service = createServiceSupabase();

    if (body.action === 'set_refund') {
      const op = body as Extract<Op, { action: 'set_refund' }>;
      if (!(await permOk(supabase, user.id, 'orders.refund'))) {
        return NextResponse.json({ error: 'You need refund permission to do this.' }, { status: 403 });
      }
      const { data: order } = await service
        .from('orders')
        .select('id, total, customer_email, guest_name, order_ref, party_id')
        .eq('id', op.orderId)
        .maybeSingle();
      if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      await service.from('orders').update({ refund_status: op.refundStatus, refund_amount: op.refundAmount }).eq('id', op.orderId);
      await service.rpc('write_audit_log', {
        p_action: `refund_${op.refundStatus}`,
        p_target_type: 'order',
        p_target_id: op.orderId,
        p_details: { refund_amount: op.refundAmount },
      } as never);

      // When a manual refund is marked as actually refunded, tell the guest.
      if (op.refundStatus === 'refunded' && op.refundAmount > 0) {
        await sendRefundEmailIfDue({
          service,
          orderId: op.orderId,
          customerEmail: order.customer_email,
          guestName: order.guest_name ?? undefined,
          partyId: order.party_id,
          orderRef: order.order_ref,
          amountNaira: op.refundAmount,
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'issue_refund') {
      // Retry a failed real-money refund for a cancelled event.
      const op = body as Extract<Op, { action: 'issue_refund' }>;
      if (!(await permOk(supabase, user.id, 'transactions.refund'))) {
        return NextResponse.json({ error: 'You need transaction refund permission to do this.' }, { status: 403 });
      }
      const { data: order } = await service
        .from('orders')
        .select('id, total, payment_ref, refund_status, customer_email, guest_name, order_ref, party_id')
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
      await sendRefundEmailIfDue({
        service,
        orderId: op.orderId,
        customerEmail: order.customer_email,
        guestName: order.guest_name ?? undefined,
        partyId: order.party_id,
        orderRef: order.order_ref,
        amountNaira: order.total,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'resend_email') {
      // Best-effort: re-run the confirmation email for a confirmed order. An
      // admin resend is allowed to bypass the original purchase time claim by
      // using a distinct dedupe key (":resend"), though repeats of the same
      // resend are still deduped.
      const op = body as Extract<Op, { action: 'resend_email' }>;
      if (!(await permOk(supabase, user.id, 'orders.resend_ticket'))) {
        return NextResponse.json({ error: 'You need resend permission to do this.' }, { status: 403 });
      }
      const { data: order } = await service
        .from('orders')
        .select(
          'id, user_id, customer_email, guest_name, guest_phone, order_ref, party_id, ticket_type_id, quantity, total, ticket_access_token, promo_code, promo_discount'
        )
        .eq('id', op.orderId)
        .eq('payment_status', 'confirmed')
        .maybeSingle();
      if (!order) return NextResponse.json({ error: 'Order not found or not confirmed.' }, { status: 404 });
      await service.rpc('write_audit_log', {
        p_action: 'resend_email',
        p_target_type: 'order',
        p_target_id: op.orderId,
      } as never);

      if (!order.customer_email) {
        return NextResponse.json({ error: 'Order has no customer email to send to.' }, { status: 400 });
      }
      const [{ data: party }, tt] = await Promise.all([
        service.from('parties').select('title, date, time, location').eq('id', order.party_id).single(),
        order.ticket_type_id
          ? service.from('ticket_types').select('name').eq('id', order.ticket_type_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!party) return NextResponse.json({ error: 'Event no longer exists.' }, { status: 404 });

      const claimed = await claimNotification(service, {
        userId: order.user_id,
        email: order.customer_email,
        type: 'ticket_confirmation',
        refId: `${order.id}:resend`,
      });
      if (!claimed) return NextResponse.json({ ok: true, deduped: true });

      const sent = await sendTicketConfirmation({
        to: order.customer_email,
        guestName: order.guest_name ?? undefined,
        guestPhone: order.guest_phone ?? undefined,
        partyTitle: party.title,
        partyDate: party.date,
        partyTime: party.time,
        partyLocation: party.location,
        ticketTypeName: tt?.data?.name ?? 'General Entry',
        quantity: order.quantity,
        total: order.total,
        orderRef: order.order_ref,
        ticketUrl: buildTicketUrl(order.id, order.ticket_access_token),
        promoCode: order.promo_code ?? undefined,
        promoDiscount: order.promo_discount ?? undefined,
      });
      await recordNotificationOutcome(service, {
        email: order.customer_email,
        type: 'ticket_confirmation',
        refId: `${order.id}:resend`,
        status: sent ? 'sent' : 'failed',
      });
      if (!sent) return NextResponse.json({ error: 'Email provider rejected the resend.' }, { status: 502 });
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
      // Only staff with staff.permissions can promote/demote
      if (!(await permOk(supabase, user.id, 'staff.permissions'))) {
        return NextResponse.json({ error: 'You need staff permission management to do this.' }, { status: 403 });
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
