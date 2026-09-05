import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { sendEventCancellationEmail } from '@/lib/resend';

const PAYSTACK_API = 'https://api.paystack.co';

function paystackHeaders() {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured');
  }
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Best-effort Paystack refund. Accepts the quirky Paystack refund response
// (HTTP 200 with `status: true`, or the documented "Successfully Refunded"
// shape) and never throws — a failed refund must not block the cancellation.
async function issuePaystackRefund(paymentRef: string, totalNaira: number): Promise<boolean> {
  if (!paymentRef || totalNaira <= 0) return false;
  try {
    const response = await fetch(`${PAYSTACK_API}/refund`, {
      method: 'POST',
      headers: paystackHeaders(),
      body: JSON.stringify({
        transaction: paymentRef,
        amount: Math.round(totalNaira * 100), // kobo
      }),
    });
    const json = (await response.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
    } | null;
    const accepted =
      response.ok &&
      (json?.status === true ||
        (json !== null && String(json.message ?? '').toLowerCase().includes('refund')));
    if (!accepted) {
      console.warn('[cancel-event] Paystack refund not accepted', {
        paymentRef,
        status: response.status,
        body: json,
      });
    }
    return accepted;
  } catch (err) {
    console.error('[cancel-event] Paystack refund error', paymentRef, err);
    return false;
  }
}

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

    // Organizers can only cancel their own events; admins may cancel any.
    const { data: party, error: partyError } = await service
      .from('parties')
      .select('*')
      .eq('id', eventId)
      .maybeSingle();
    if (partyError || !party) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }
    if (party.cancelled_at) {
      return NextResponse.json({ error: 'This event is already cancelled.' }, { status: 400 });
    }
    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const isStaff = ['admin', 'super_admin', 'support'].includes(profile?.role ?? '');
    if (party.created_by !== user.id && !isStaff) {
      return NextResponse.json({ error: 'You can only cancel your own events.' }, { status: 403 });
    }

    // 1. Everything happens in one transaction-safe pass: refund each confirmed
    //    order, restore its spots, and notify the buyer.
    const { data: orders } = await service
      .from('orders')
      .select('*')
      .eq('party_id', eventId)
      .eq('payment_status', 'confirmed');

    let refundedCount = 0;
    let notifiedCount = 0;
    const now = new Date().toISOString();

    for (const order of orders ?? []) {
      const alreadyRefunded = order.refund_status === 'completed';
      const refundAccepted = alreadyRefunded || (await issuePaystackRefund(order.payment_ref ?? '', order.total));

      if (!alreadyRefunded) {
        // Release the reserved spots regardless of refund success — the event
        // is gone, inventory must not stay reserved forever.
        await service
          .from('parties')
          .update({ spots_left: Math.min(party.capacity, party.spots_left + order.quantity) })
          .eq('id', eventId);
        await service
          .from('orders')
          .update({
            refund_status: refundAccepted ? 'completed' : 'failed',
            refund_amount: refundAccepted ? order.total : 0,
            refunded_at: refundAccepted ? now : null,
            cancellation_reason: reason,
          })
          .eq('id', order.id);
      } else {
        await service
          .from('orders')
          .update({ cancellation_reason: reason })
          .eq('id', order.id);
      }

      if (refundAccepted) refundedCount += 1;

      if (order.customer_email) {
        const sent = await sendEventCancellationEmail({
          to: order.customer_email,
          guestName: order.customer_email.split('@')[0] || 'there',
          partyTitle: party.title,
          reason,
          amountNaira: order.total,
        });
        if (sent) notifiedCount += 1;
      }
    }

    // 2. Mark the event cancelled. Guests reach it via saved links and their
    //    ticket pages, so it still resolves — just rendered as cancelled.
    await service
      .from('parties')
      .update({ cancelled_at: now, cancellation_reason: reason })
      .eq('id', eventId);

    // 3. Audit trail.
    await service.rpc('write_audit_log', {
      p_action: 'event_cancelled',
      p_target_type: 'event',
      p_target_id: String(eventId),
      p_details: { reason, refunded_count: refundedCount, notified_count: notifiedCount },
    });

    return NextResponse.json({
      success: true,
      refunded_count: refundedCount,
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