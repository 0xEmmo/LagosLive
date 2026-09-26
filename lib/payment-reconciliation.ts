// Server-only payment reconciliation.
//
// The browser's return from Paystack is a convenience, not the source of truth:
// a buyer who closes the tab, loses signal, or never returns leaves a real
// charge sitting against an unconfirmed order. This module is the single place
// that decides whether a payment reference is genuinely paid, and it is shared
// by both callers so the two can never disagree:
//
//   * POST /api/paystack/webhook  — Paystack's own signed notification
//   * POST /api/paystack/verify   — the buyer returning from the popup
//
// Both funnel into the same server-side verification against Paystack's API,
// the same amount cross-check, and the same confirmation call. The webhook is
// authoritative; the verify route is a fast path for the user in front of the
// screen.
//
// This module reads PAYSTACK_SECRET_KEY and must never be imported from a
// client component.

import { createServiceSupabase } from '@/lib/supabase/server';
import { paystackVerifyTransaction } from '@/lib/paystack-server';
import { buildTicketUrl } from '@/lib/ticket-access';
import { sendTicketConfirmation } from '@/lib/resend';
import { claimNotification, recordNotificationOutcome } from '@/lib/notify';
import type { Database } from '@/lib/supabase/database.types';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type Supabase = ReturnType<typeof createServiceSupabase>;

export type LineTicket = {
  orderId: string;
  orderRef: string;
  ticketAccessToken: string | null;
};

export type ReconcileResult =
  | { status: 'confirmed'; alreadyConfirmed: boolean; emailSent: boolean; lines: LineTicket[] }
  | { status: 'failed'; reason: string }
  | { status: 'unknown_reference' };

/**
 * Sends the buyer's ticket email for one confirmed order line.
 *
 * Best-effort by design: the money is already taken and the ticket is already
 * issued, so a failed email must never un-confirm anything. The delivery is
 * claimed against the dedupe log BEFORE the send, which is what makes this safe
 * to call from both the webhook and the verify route — whichever arrives first
 * wins, the other is a no-op, and a provider retry cannot double-email a buyer.
 */
export async function notifyConfirmedOrder(service: Supabase, order: OrderRow): Promise<boolean> {
  const to = order.customer_email;
  if (!to) {
    console.warn('[payments] no customer_email on order', order.id, '— skipping ticket email');
    return false;
  }
  try {
    const [{ data: party }, tt] = await Promise.all([
      service.from('parties').select('title, date, time, location').eq('id', order.party_id).single(),
      order.ticket_type_id
        ? service.from('ticket_types').select('name').eq('id', order.ticket_type_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!party) {
      console.warn('[payments] party not found for order', order.id, '— skipping ticket email');
      return false;
    }

    const claimed = await claimNotification(service, {
      userId: order.user_id,
      email: to,
      type: 'ticket_confirmation',
      refId: order.id,
    });
    if (!claimed) return false;

    const sent = await sendTicketConfirmation({
      to,
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
      email: to,
      type: 'ticket_confirmation',
      refId: order.id,
      status: sent ? 'sent' : 'failed',
    });
    return sent;
  } catch (err) {
    console.warn('[payments] could not build ticket email for order', order.id, err);
    return false;
  }
}

/** Loads every order line sharing a payment reference — the whole basket. */
export async function loadPaymentGroup(service: Supabase, reference: string): Promise<OrderRow[]> {
  const { data, error } = await service
    .from('orders')
    .select('*')
    .eq('payment_ref', reference)
    .order('id');
  if (error) throw error;
  return data ?? [];
}

function toLines(group: OrderRow[]): LineTicket[] {
  return group.map((o) => ({
    orderId: o.id,
    orderRef: o.order_ref,
    ticketAccessToken: o.ticket_access_token,
  }));
}

/**
 * Marks an unpaid group failed.
 *
 * Only ever moves rows that are not already confirmed, so a late
 * charge.failed for a reference that a charge.success already settled cannot
 * revoke issued tickets.
 */
export async function failPaymentGroup(
  service: Supabase,
  group: OrderRow[],
  reason: string,
): Promise<{ status: 'failed'; reason: string }> {
  for (const order of group) {
    if (order.payment_status === 'confirmed') continue;
    await service.rpc('settle_order_payment', { p_order_id: order.id, p_payment_status: 'failed' });
  }
  return { status: 'failed', reason };
}

/**
 * Decides whether a payment reference is genuinely paid, and issues the
 * tickets if it is. Server-authoritative end to end:
 *
 *   1. the group's expected total is the sum of the order rows the server
 *      itself created — nothing the browser or the webhook body can influence;
 *   2. Paystack's API is the authority on whether the money arrived, and is
 *      called even though the webhook already claimed success, because a
 *      webhook body is only as trustworthy as its signature;
 *   3. the charged amount must equal the group total exactly, in kobo, in NGN;
 *   4. only then is the group confirmed, atomically, for every line at once.
 *
 * Idempotent: a group that is already confirmed returns success without
 * re-confirming or re-notifying.
 */
export async function reconcilePaidOrderGroup(
  service: Supabase,
  reference: string,
): Promise<ReconcileResult> {
  const group = await loadPaymentGroup(service, reference);
  if (group.length === 0) return { status: 'unknown_reference' };

  if (group.every((o) => o.payment_status === 'confirmed')) {
    return { status: 'confirmed', alreadyConfirmed: true, emailSent: true, lines: toLines(group) };
  }

  const expectedKobo = group.reduce((sum, o) => sum + o.total, 0) * 100;

  let verified;
  try {
    verified = await paystackVerifyTransaction(reference);
  } catch (err) {
    // A transport or provider error is NOT evidence the payment failed. Leaving
    // the group pending keeps it reconcilable: Paystack will retry the webhook
    // and the operator can re-run this, whereas settling it here would cancel
    // a basket that may well have been paid for.
    return {
      status: 'failed',
      reason: err instanceof Error ? err.message : 'Payment could not be verified.',
    };
  }

  if (verified.status !== 'success') {
    return failPaymentGroup(service, group, 'Payment was not completed. No charge was made.');
  }
  if (verified.reference !== reference) {
    return failPaymentGroup(service, group, 'Payment verification failed.');
  }
  if (verified.amountKobo !== expectedKobo || verified.currency !== 'NGN') {
    return failPaymentGroup(service, group, 'The payment amount did not match. Please contact support.');
  }

  // All-or-nothing per payment_ref: a group that cannot be issued as a whole is
  // failed as a whole, and the buyer's money is refunded out of band.
  const { error: confirmError } = await service.rpc('confirm_order_group', { p_payment_ref: reference });
  if (confirmError) {
    return failPaymentGroup(service, group, 'Sorry, tickets just sold out. Your payment will be refunded.');
  }

  const results = await Promise.all(group.map((order) => notifyConfirmedOrder(service, order)));
  return {
    status: 'confirmed',
    alreadyConfirmed: false,
    emailSent: results.some(Boolean),
    lines: toLines(group),
  };
}
