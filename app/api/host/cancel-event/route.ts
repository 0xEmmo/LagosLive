import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { sendEventCancellationEmail } from '@/lib/resend';
import { claimNotification, recordNotificationOutcome } from '@/lib/notify';
import { paystackRefundTransaction } from '@/lib/paystack-server';

/**
 * Cancelling an event is two phases, and the split is deliberate.
 *
 * Phase 1 is a single database transaction: begin_event_cancellation() takes
 * the event's row lock, sets cancelled_at, and writes one refund row per
 * confirmed order. Because cancelled_at lands in the SAME transaction, there is
 * no window in which a sold-out, already-cancelled event still accepts checkout
 * - which is exactly what the previous version did, since it refunded every
 * guest in a loop and only marked the event cancelled at the very end.
 *
 * Phase 2 is one Paystack call per refund row, outside any transaction, each one
 * bracketed by mark_refund_submitted() and complete_order_refund(). A crash
 * halfway through leaves some rows `submitted` and the rest `requested`, and
 * every one of them is findable afterwards. The old version wrote nothing before
 * calling Paystack, so a timeout mid-loop silently lost the fact that a refund
 * had been attempted and a retry would refund the same guest again.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { event_id?: unknown; reason?: unknown };
    const eventId = Number(body.event_id);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: 'Please provide a reason for cancellation.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const service = createServiceSupabase();

    const { data: party, error: partyError } = await service
      .from('parties')
      .select('id, title, capacity, spots_left, created_by, cancelled_at')
      .eq('id', eventId)
      .maybeSingle();
    if (partyError || !party) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    // Who may cancel is decided inside begin_event_cancellation(), against the
    // caller's real permissions, and nowhere else.
    //
    // There used to be a second, hand-maintained copy of that rule here: a list
    // of role strings. It drifted from the database, which is how 'support'
    // ended up able to cancel live events and move other people's money. A
    // duplicated permission check is a vulnerability waiting for a role to be
    // added, so it is gone rather than kept in sync. The function below refuses
    // with 42501, which the error handler turns into a 403.

    // ---- Phase 1: close the event and queue the refunds, atomically ----------
    const { data: queued, error: queueError } = await service.rpc('begin_event_cancellation', {
      p_party_id: eventId,
      p_reason: reason,
      p_actor: user.id,
    });
    if (queueError) {
      // 42501 is the permission failure raised by the function.
      const forbidden = queueError.code === '42501';
      console.error('[cancel-event] could not begin cancellation', queueError.code, queueError.message);
      return NextResponse.json(
        { error: forbidden ? 'You can only cancel your own events.' : 'Cancellation failed.' },
        { status: forbidden ? 403 : 500 }
      );
    }

    const workList = (queued ?? []) as Array<{
      order_id: string;
      order_ref: string;
      refund_id: string | null;
      amount: number;
      quantity: number;
      customer_email: string | null;
      guest_name: string | null;
      needs_refund: boolean;
    }>;

    // ---- Phase 2: talk to Paystack, one refund row at a time -----------------
    let refundedCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    let notifiedCount = 0;

    // The payment reference is needed to call Paystack, and the user id keys the
    // notification dedupe. Neither is returned by the function: the work list
    // stays free of anything that could leak if it were ever logged.
    const orderIds = workList.map((w) => w.order_id);
    const paymentRefs = new Map<string, string>();
    const orderOwners = new Map<string, string | null>();
    if (orderIds.length > 0) {
      const { data: refs } = await service
        .from('orders')
        .select('id, payment_ref, user_id')
        .in('id', orderIds);
      for (const row of refs ?? []) {
        if (row.payment_ref) paymentRefs.set(row.id, row.payment_ref);
        orderOwners.set(row.id, row.user_id);
      }
    }

    for (const item of workList) {
      let guestWasRefunded = false;

      if (item.needs_refund && item.refund_id) {
        const refundId = item.refund_id;
        const paymentRef = paymentRefs.get(item.order_id) ?? '';

        // Committed BEFORE the provider call. From here on the row says we asked
        // Paystack, and `submitted` is never retried automatically.
        const { error: submitError } = await service.rpc('mark_refund_submitted', {
          p_refund_id: refundId,
        });
        if (submitError) {
          // Someone already moved this refund along. Leave it exactly as it is
          // rather than calling Paystack a second time.
          console.warn('[cancel-event] refund not in a submittable state', refundId, submitError.message);
          pendingCount += 1;
        } else {
          const result = await paystackRefundTransaction(paymentRef, item.amount);
          const { error: completeError } = await service.rpc('complete_order_refund', {
            p_refund_id: refundId,
            p_outcome: result.outcome,
            p_provider_refund_id: result.providerRefundId,
            p_provider_status: result.providerStatus,
            p_failure_reason: result.message,
          });

          if (completeError) {
            // The ledger keeps the row in flight, which is the safe direction:
            // a human reconciles it rather than the guest being told their money
            // is back when we do not know.
            console.error('[cancel-event] could not record refund outcome', completeError.message);
            pendingCount += 1;
          } else if (result.outcome === 'refunded') {
            refundedCount += 1;
            guestWasRefunded = true;
          } else if (result.outcome === 'failed') {
            failedCount += 1;
            console.warn('[cancel-event] Paystack refused a refund', {
              orderRef: item.order_ref,
              status: result.providerStatus,
              message: result.message,
            });
          } else {
            pendingCount += 1;
            console.warn('[cancel-event] Paystack refund outcome unknown, needs reconciliation', {
              orderRef: item.order_ref,
              message: result.message,
            });
          }
        }
      }

      // Tell the guest what happened either way. The amount claimed is only ever
      // the amount Paystack confirmed, so the email cannot promise money that
      // did not move.
      if (item.customer_email) {
        const claimed = await claimNotification(service, {
          userId: orderOwners.get(item.order_id) ?? undefined,
          email: item.customer_email,
          type: 'event_cancellation',
          refId: item.order_id,
        });
        if (claimed) {
          const sent = await sendEventCancellationEmail({
            to: item.customer_email,
            guestName: item.guest_name || item.customer_email.split('@')[0] || 'there',
            partyTitle: party.title,
            reason,
            amountNaira: guestWasRefunded ? item.amount : 0,
          });
          if (sent) notifiedCount += 1;
          await recordNotificationOutcome(service, {
            email: item.customer_email,
            type: 'event_cancellation',
            refId: item.order_id,
            status: sent ? 'sent' : 'failed',
          });
        }
      }
    }

    await service.rpc('write_audit_log', {
      p_action: 'event_cancelled',
      p_target_type: 'event',
      p_target_id: String(eventId),
      p_details: {
        reason,
        refunded_count: refundedCount,
        failed_count: failedCount,
        pending_count: pendingCount,
        notified_count: notifiedCount,
      },
    });

    return NextResponse.json({
      success: true,
      refunded_count: refundedCount,
      failed_count: failedCount,
      // Surfaced so finance knows a reconciliation queue exists rather than
      // discovering it from a guest complaint.
      pending_count: pendingCount,
      notified_count: notifiedCount,
    });
  } catch (err) {
    console.error('[cancel-event] cancellation error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cancellation failed.' },
      { status: 500 }
    );
  }
}
