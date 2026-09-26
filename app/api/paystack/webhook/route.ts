import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { paystackVerifyWebhookSignature } from '@/lib/paystack-server';
import { failPaymentGroup, loadPaymentGroup, reconcilePaidOrderGroup } from '@/lib/payment-reconciliation';
import {
  decideTransferAction,
  decideClosedAttemptAction,
  matchTransferDelivery,
  TRANSFER_EVENTS,
  type MatchMethod,
  type TransferAction,
} from '@/lib/payout-transfer-matching';
import type { Json } from '@/lib/supabase/database.types';

// Paystack's server-to-server notification. This is the authoritative signal
// that money moved; the browser callback at /api/paystack/verify is only a
// faster path for the human in front of the screen. Before this route existed,
// a buyer who closed the Paystack window left a real charge against an order
// that stayed 'pending' forever, with nothing in the database recording that
// the provider had reported a payment at all.
//
// Every handler must be fast and must return 2xx for an event it has durably
// recorded: Paystack retries anything that is not, so raising on a business
// outcome turns into duplicate deliveries (which the ledger below absorbs) and
// duplicated work.

export const runtime = 'nodejs';

interface PaystackEvent {
  event?: string;
  data?: {
    reference?: string;
    amount?: number;
    currency?: string;
    status?: string;
    // Present on transfer.* deliveries. transfer_code is Paystack's identifier
    // for the transfer and is the primary matcher in handleTransferEvent.
    transfer_code?: string;
    reason?: string | null;
  };
}

// The raw body is already a JSON value, so it is stored exactly as received
// rather than reshaped into a narrower type. Narrowing it would quietly drop
// fields the ledger is supposed to keep for a later dispute investigation.
function asJsonPayload(rawBody: string): Json {
  return JSON.parse(rawBody) as Json;
}

export async function POST(request: Request) {
  // The signature covers the exact bytes Paystack sent, so the body is read as
  // text and never re-serialized before verification.
  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature');

  if (!paystackVerifyWebhookSignature(rawBody, signature)) {
    // 401 and nothing else: an unsigned or badly signed delivery is not a
    // payment, and it must not reach any write path.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  const name = typeof event.event === 'string' ? event.event : '';
  const reference = typeof event.data?.reference === 'string' ? event.data.reference : '';
  if (!name) {
    return NextResponse.json({ error: 'Missing event' }, { status: 400 });
  }

  const service = createServiceSupabase();

  // Durable, idempotent record of the delivery. The unique key on
  // (provider, event, reference) is what makes a retry a no-op instead of a
  // second confirmation: Paystack delivers the same event more than once in
  // normal operation.
  const record = await service
    .from('payment_events')
    .insert({ provider: 'paystack', event: name, reference: reference || null, payload: asJsonPayload(rawBody) })
    .select('id')
    .maybeSingle();

  if (record.error) {
    // A unique violation means this exact event was already delivered.
    if (record.error.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('[paystack webhook] could not record event', record.error);
    return NextResponse.json({ error: 'Could not record event' }, { status: 500 });
  }

  try {
    if (name === 'charge.success') {
      if (!reference) {
        return NextResponse.json({ received: true, ignored: 'no_reference' });
      }
      const result = await reconcilePaidOrderGroup(service, reference);
      if (result.status === 'unknown_reference') {
        // Money arrived for a reference the platform does not know. This is a
        // real operational problem, not a code error: record it, alert loudly,
        // and do not guess. Logged with the reference so support can trace it.
        console.error('[paystack webhook] charge.success for unknown reference', reference);
        return NextResponse.json({ received: true, unmatched: true });
      }
      await markEvent(service, record.data!.id, result.status);
      return NextResponse.json({
        received: true,
        status: result.status,
        alreadyConfirmed: result.status === 'confirmed' ? result.alreadyConfirmed : false,
      });
    }

    if (name === 'charge.failed') {
      if (!reference) {
        return NextResponse.json({ received: true, ignored: 'no_reference' });
      }
      const group = await loadPaymentGroup(service, reference);
      if (group.length === 0) {
        return NextResponse.json({ received: true, unmatched: true });
      }
      const result = await failPaymentGroup(service, group, 'Payment was not completed.');
      await markEvent(service, record.data!.id, result.status);
      return NextResponse.json({ received: true, status: result.status });
    }

    // Outbound transfers. A transfer the platform initiated carries the payout
    // reference, so this is how a payout that was still queued at the time the
    // initiating request returned gets finished.
    if (TRANSFER_EVENTS.has(name)) {
      const handled = await handleTransferEvent(service, name, event.data ?? {}, asJsonPayload(rawBody));
      return NextResponse.json({ received: true, transfer: handled });
    }

    // Every other Paystack event is recorded and deliberately not acted on.
    // The ledger exists so that when a dispute or refund question comes up,
    // the delivery is visible even though nothing was automated.
    await markEvent(service, record.data!.id, 'recorded');
    return NextResponse.json({ received: true, ignored: name });
  } catch (err) {
    console.error('[paystack webhook] processing failed for', name, reference, err);
    // 500 so Paystack retries. The event is already recorded, so the retry
    // takes the duplicate path above and re-runs nothing — reconciliation is
    // driven by the operator or the next genuine delivery, not by this call.
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

/**
 * Stamps the outcome onto a recorded event.
 *
 * Best effort by design: the delivery is already durable in payment_events, and
 * a failure to write the outcome must not turn a recorded event into a 5xx that
 * Paystack retries, because the retry would be deduplicated on the way back in
 * and the outcome would be lost again. The event row keeps the payload, so the
 * outcome can be re-derived if this write is lost.
 */
async function markEvent(
  service: Service,
  eventId: string,
  outcome: string,
): Promise<void> {
  const { error } = await service
    .from('payment_events')
    .update({ outcome, processed_at: new Date().toISOString() })
    .eq('id', eventId);
  if (error) {
    console.error('[paystack webhook] could not stamp the event outcome', eventId, error.message);
  }
}


// ---- Transfer events --------------------------------------------------------
// The matching hierarchy itself, and the state rules that decide what a
// delivery means, live in lib/payout-transfer-matching.ts as pure functions so
// every branch can be tested without a database or a signature. This section
// only does the I/O: read the state, ask the rules, apply the result.

type TransferData = {
  transfer_code?: string;
  reference?: string;
  status?: string;
  amount?: number;
  reason?: string | null;
  // Present in transfer.failed / transfer.reversed. Unused for matching: it is
  // not an identifier of anything this platform holds.
  recipient?: unknown;
  [key: string]: unknown;
};

type Service = ReturnType<typeof createServiceSupabase>;

async function handleTransferEvent(
  service: Service,
  eventName: string,
  data: TransferData,
  payload: Json,
): Promise<{ matched: string; outcome: string }> {
  const transferCode = typeof data.transfer_code === 'string' ? data.transfer_code : null;
  const transferRef = typeof data.reference === 'string' ? data.reference : null;
  const amount = typeof data.amount === 'number' ? data.amount : null;
  const reason = typeof data.reason === 'string' ? data.reason : null;

  const match = await matchTransferToPayout(service, transferCode, transferRef);

  // A closed attempt still belongs to a payout, and the ledger row should say so
  // — otherwise a redelivery of a transfer we already settled looks identical to
  // a delivery matching nothing at all, and finance cannot tell the two apart.
  // Only the payout_id is taken from the attempt; no status is read and no change
  // is applied.
  const ledgerPayoutId = match.method === 'prior_attempt' ? match.closedAttempt!.payoutId : match.payoutId;

  // The ledger row is written before anything is applied, so a delivery that
  // fails midway is still on record with a truthful match_method.
  const { data: ledgerRow, error: recordError } = await service.rpc('record_transfer_event', {
    p_event: eventName,
    p_payout_id: ledgerPayoutId,
    p_match_method: match.method,
    p_transfer_code: transferCode,
    p_reference: transferRef,
    p_amount: amount,
    p_reason: reason,
    p_payload: payload,
  });
  if (recordError) {
    console.error('[paystack webhook] could not record a transfer event', recordError);
  }
  // Null for a redelivery, which is not a failure: the row it would duplicate is
  // already on record carrying its own outcome.
  const ledgerId = (ledgerRow as string | null) ?? null;

  const settle = async (outcome: string) => {
    await service.rpc('mark_transfer_event_outcome', { p_event_id: ledgerId, p_outcome: outcome });
    return outcome;
  };

  if (match.method === 'unmatched') {
    // Nothing is applied to any payout, and nothing is guessed. The row above
    // has a null payout_id, which is what puts it in the reconciliation queue.
    console.error(
      '[paystack webhook] UNMATCHED transfer delivery — no payout touched, queued for reconciliation',
      { event: eventName, transferCode, reference: transferRef },
    );
    return { matched: 'unmatched', outcome: await settle('queued_for_reconciliation') };
  }

  if (match.method === 'prior_attempt') {
    // The attempt this delivery belongs to is closed, so it was already settled.
    // The payout is not read and not written: a transfer.sent redelivered after
    // its own reversal would otherwise find a live payout and mark it paid. The
    // row is still written and attributed, so finance can see the redelivery
    // arrived and was declined rather than having to infer it from its absence.
    const decision = decideClosedAttemptAction(eventName, match.closedAttempt!.status);
    return { matched: 'prior_attempt', outcome: await settle(decision.outcome) };
  }

  const decision = decideTransferAction(eventName, match.payoutStatus);
  // Narrowed here rather than inside applyTransferDecision: 'unmatched' is the
  // one action with no payout, and it has already returned above.
  const applied = await applyTransferDecision(service, decision.action, match.payoutId as number, {
    transferCode,
    transferRef,
    amount,
    reason,
  });

  return { matched: match.method, outcome: await settle(applied ?? decision.outcome) };
}

type MatchResult = {
  payoutId: number | null;
  method: MatchMethod;
  payoutStatus: string | null;
  /** Set only for a prior_attempt match. Never combined with payoutStatus. */
  closedAttempt: { id: string; status: string; payoutId: number } | null;
};

/**
 * Resolves a transfer delivery to exactly one payout, to a closed attempt, or
 * to none.
 *
 * Returns the status alongside the id because the caller needs to know what the
 * delivery means for this payout, and a second query would be a second chance
 * for the two to disagree.
 *
 * The three outcomes are kept distinct rather than collapsed. A delivery that
 * matched a closed attempt has a payout it belongs to, and it is tempting to
 * return that payout's live status and let the ordinary rules run. That would be
 * a way to mark a payout paid from a transfer that was already reversed and
 * retried, so the attempt result is returned with no status attached.
 */
async function matchTransferToPayout(
  service: Service,
  transferCode: string | null,
  transferRef: string | null,
): Promise<MatchResult> {
  // The tier order and the fail-closed rule live in matchTransferDelivery, so the
  // ordering is testable without a database or a signed webhook. These two
  // functions only know how to ask.
  const lookup = async (column: 'transfer_code' | 'transfer_reference', value: string) => {
    const { data, error } = await service
      .from('payouts')
      .select('id, status')
      .eq(column, value)
      .maybeSingle();
    if (error) {
      console.error(`[paystack webhook] ${column} lookup failed`, error);
      return { ok: false as const, error };
    }
    return { ok: true as const, row: (data as { id: number; status: string } | null) ?? null };
  };

  const findClosedAttempt = async (column: 'transfer_code' | 'transfer_reference', value: string) => {
    // Restricted to closed attempts. An open attempt's payout still carries the
    // code or reference, so it has already matched on a tier above; reaching this
    // point with an open attempt would mean the two tables disagree about which
    // transfer is in flight.
    const { data, error } = await service
      .from('payout_transfer_attempts')
      .select('id, status, payout_id')
      .eq(column, value)
      .neq('status', 'claimed')
      .order('attempt_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('[paystack webhook] payout_transfer_attempts lookup failed', error);
      return { ok: false as const, error };
    }
    const row = data as { id: string; status: string; payout_id: number } | null;
    return {
      ok: true as const,
      row: row ? { id: row.id, status: row.status, payoutId: row.payout_id } : null,
    };
  };

  const outcome = await matchTransferDelivery({ transferCode, transferReference: transferRef }, lookup, findClosedAttempt);

  if (outcome.kind === 'payout') {
    return {
      payoutId: outcome.payout.id,
      method: outcome.method,
      payoutStatus: outcome.payout.status,
      closedAttempt: null,
    };
  }
  if (outcome.kind === 'prior_attempt') {
    return {
      payoutId: null,
      method: 'prior_attempt',
      payoutStatus: null,
      closedAttempt: outcome.attempt,
    };
  }
  return { payoutId: null, method: 'unmatched', payoutStatus: null, closedAttempt: null };
}

/** Performs a decision. Returns null when the decision was a no-op. */
async function applyTransferDecision(
  service: Service,
  action: TransferAction,
  payoutId: number,
  info: { transferCode: string | null; transferRef: string | null; amount: number | null; reason: string | null },
): Promise<string | null> {
  if (
    action === 'unmatched' ||
    action === 'already_paid' ||
    action === 'already_reconciling' ||
    action === 'already_handled'
  ) {
    return null;
  }

  if (action === 'unexpected_state') {
    console.error('[paystack webhook] transfer delivery for a payout in an unexpected state', {
      action,
      payoutId,
    });
    return null;
  }

  if (action === 'mark_paid') {
    if (!info.transferCode) {
      // A matched reference with no provider code. mark_payout_paid requires
      // one, and fabricating a value here would put a made-up identifier into a
      // financial record — so nothing is marked and finance sees it.
      console.error(
        '[paystack webhook] transfer.sent matched a payout but carried no transfer code; not marking paid',
        payoutId,
      );
      return 'missing_transfer_code';
    }
    const { error } = await service.rpc('mark_payout_paid', {
      p_payout_id: payoutId,
      p_transfer_code: info.transferCode,
      p_transfer_reference: info.transferRef ?? info.transferCode,
    });
    if (error) {
      console.error('[paystack webhook] could not mark the payout paid', payoutId, error.message);
      return 'mark_failed';
    }
    return 'payout_paid';
  }

  if (action === 'record_reversal') {
    const { error } = await service.rpc('record_payout_reversal', {
      p_payout_id: payoutId,
      p_reversal_reference: info.transferRef ?? info.transferCode,
      p_reversal_code: info.transferCode,
      p_reason: info.reason ?? 'The bank or provider returned this transfer.',
      p_amount: info.amount,
    });
    if (error) {
      console.error('[paystack webhook] could not record the reversal', payoutId, error.message);
      return 'reversal_failed';
    }
    // The money came back. record_payout_reversal has released the order claims,
    // frozen the host's payouts and kept paid_at and the transfer code intact:
    // the payout was paid, then reversed, and finance needs both facts.
    return 'reconciliation_required';
  }

  if (action === 'reset_for_retry') {
    const { error } = await service.rpc('transition_payout', {
      p_payout_id: payoutId,
      p_to_status: 'approved',
    });
    if (error) {
      console.error('[paystack webhook] could not reset the payout for retry', payoutId, error.message);
      return 'reset_failed';
    }
    return 'retryable';
  }

  return null;
}
