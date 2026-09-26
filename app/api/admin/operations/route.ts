import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { sendRefundProcessedEmail, sendTicketConfirmation } from '@/lib/resend';
import { claimNotification, recordNotificationOutcome } from '@/lib/notify';
import { buildTicketUrl } from '@/lib/ticket-access';
import { paystackRefundTransaction } from '@/lib/paystack-server';

type Op =
  | { action: 'set_refund'; orderId: string; refundStatus: string; refundAmount: number }
  | { action: 'issue_refund'; orderId: string }
  | { action: 'resend_email'; orderId: string }
  | { action: 'set_role'; targetUserId: string; role: string }
  | { action: 'audit'; targetType: string; targetId: string; logAction: string; details?: Record<string, unknown> };

// Tells the guest their money is on its way after a refund actually went out
// (a successful issue_refund, recorded against a provider refund id). Deduped
// per order id so a re-issue cannot double-email; best-effort so a missing
// email/party never fails the refund itself.
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
      // Records a finance decision that moves no money: a refund was declined,
      // or parked as awaiting review.
      //
      // It deliberately does NOT accept refundStatus/refundAmount from the
      // request body to write onto the order. The previous version did exactly
      // that, which let any caller with the refund permission mark an arbitrary
      // order refunded for any amount while moving no money - the order looked
      // paid back, the host's revenue was released, and the guest had none of
      // their money.
      //
      // The remaining states are not decisions anyone may make by hand:
      // 'refunded' can only come from complete_order_refund() with a provider
      // refund id, because it is a claim about Paystack rather than a call
      // about a person. See 'issue_refund' below.
      const op = body as Extract<Op, { action: 'set_refund' }>;
      if (!(await permOk(supabase, user.id, 'orders.refund'))) {
        return NextResponse.json({ error: 'You need refund permission to do this.' }, { status: 403 });
      }

      if (op.refundStatus !== 'requested' && op.refundStatus !== 'rejected') {
        return NextResponse.json(
          {
            error:
              'Only a refund decision can be recorded here. To return money, issue a real refund so Paystack moves it and the ledger records it.',
          },
          { status: 400 }
        );
      }

      const { error: decisionError } = await service.rpc('record_refund_decision', {
        p_order_id: op.orderId,
        p_decision: op.refundStatus,
        p_reason: 'Recorded by finance from the admin order page',
        p_actor: user.id,
      });
      if (decisionError) {
        return NextResponse.json({ error: decisionError.message }, { status: 400 });
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

      // 1. Ledger row first, committed. From here the attempt is findable even
      //    if the process dies mid-request.
      //
      //    No idempotency key on purpose: a genuinely new attempt must be able
      //    to create a new row, because mark_refund_submitted() will not reopen
      //    a `failed` one. A fixed key would pin every future retry to the first
      //    failed row forever. Double-clicks are already covered by the
      //    one-open-refund-per-order index, which hands back the row that won.
      const { data: created, error: createError } = await service.rpc('create_order_refund', {
        p_order_id: op.orderId,
        p_amount: order.total,
        p_reason: 'Refund retried by finance',
        p_actor: user.id,
      });
      if (createError || !created) {
        return NextResponse.json(
          { error: createError?.message ?? 'Could not start the refund.' },
          { status: 409 }
        );
      }
      const refund = created as { id: string; status: string };

      if (refund.status === 'refunded') {
        // A replay of a refund that already succeeded.
        return NextResponse.json({ ok: true, already_refunded: true });
      }

      // 2. Committed as submitted, then Paystack is called.
      const { error: submitError } = await service.rpc('mark_refund_submitted', {
        p_refund_id: refund.id,
      });
      if (submitError) {
        // A refund already handed to Paystack is not ours to restart: calling
        // again risks paying the guest twice. Say so plainly instead of
        // implying the attempt failed.
        const { data: current } = await service
          .from('refunds')
          .select('status')
          .eq('id', refund.id)
          .maybeSingle();
        const inFlight = current?.status === 'submitted' || current?.status === 'processing';
        return NextResponse.json(
          {
            error: inFlight
              ? 'This refund is already with Paystack and its outcome is not yet known. Check the Paystack dashboard before retrying.'
              : submitError.message,
            needs_reconciliation: inFlight,
          },
          { status: 409 }
        );
      }

      // 3. The provider decides, and only a provider refund id counts as success.
      const result = await paystackRefundTransaction(order.payment_ref ?? '', order.total);
      const { error: completeError } = await service.rpc('complete_order_refund', {
        p_refund_id: refund.id,
        p_outcome: result.outcome,
        p_provider_refund_id: result.providerRefundId,
        p_provider_status: result.providerStatus,
        p_failure_reason: result.message,
      });
      if (completeError) {
        console.error('[admin] could not record refund outcome', completeError.message);
      }

      if (result.outcome === 'unknown') {
        // Not a failure we can safely retry, and not a success we can claim.
        return NextResponse.json(
          {
            error:
              'Paystack did not give a clear answer, so the refund has been left open for reconciliation rather than retried. Check the Paystack dashboard before trying again.',
            needs_reconciliation: true,
          },
          { status: 502 }
        );
      }
      if (result.outcome === 'failed') {
        return NextResponse.json(
          { error: result.message || 'Paystack did not accept the refund. Please try again.' },
          { status: 502 }
        );
      }

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
