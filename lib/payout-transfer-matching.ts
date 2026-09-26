/**
 * What to do with a transfer delivery.
 *
 * These are the decisions that were previously buried in the webhook handler as
 * a chain of if-statements, where each branch depended on the one above it and
 * none could be checked without a database and a signed webhook. The rules are
 * financial ones — "was this money actually sent", "did it come back", "is this
 * a redelivery" — and being wrong in any direction either loses money or pays
 * it twice, so they are pulled out here as pure functions and tested as such.
 *
 * Nothing in this file touches the database or the network. The webhook supplies
 * the state it has already read; this decides what that state means.
 */

/** Paystack's status values that mean the money left the balance. */
const SENT = new Set(['success', 'sent', 'successful', 'processed']);

/** Still in flight: the money has not moved and may yet. */
const IN_FLIGHT = new Set(['pending', 'queued', 'processing', 'otp_required', 'requires_approval']);

/** Will never complete. A retry is legitimate, but it needs a clean slate. */
const DEAD = new Set(['failed', 'reversed', 'cancelled', 'canceled', 'rejected']);

export type TransferLifecycle = 'sent' | 'in_flight' | 'dead' | 'unknown';

/**
 * Classifies a provider transfer status.
 *
 * The default is 'unknown' rather than anything optimistic on purpose. A status
 * this platform has never seen must not be treated as "sent" (which marks a
 * payout paid on a guess) or as "dead" (which invites a second transfer), so it
 * surfaces for a person to look at.
 */
export function classifyTransferStatus(status: string | null | undefined): TransferLifecycle {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (!normalized) return 'unknown';
  if (SENT.has(normalized)) return 'sent';
  if (IN_FLIGHT.has(normalized)) return 'in_flight';
  if (DEAD.has(normalized)) return 'dead';
  return 'unknown';
}

export type MatchMethod = 'transfer_code' | 'reference' | 'prior_attempt' | 'unmatched';

export type TransferAction =
  /** The provider says the money left, and the payout is cleared to be paid. */
  | 'mark_paid'
  /** A redelivery of something already recorded. Nothing to do. */
  | 'already_paid'
  /** The money came back. Needs a person, not a status transition. */
  | 'record_reversal'
  /** A redelivery of a reversal already recorded. */
  | 'already_reconciling'
  /** The transfer did not go out. The payout can be tried again. */
  | 'reset_for_retry'
  /** A redelivery of a transfer that never left. */
  | 'already_retryable'
  /** The delivery is correct but the payout is not in a state to accept it. */
  | 'unexpected_state'
  /** Matched a closed attempt, so it is a redelivery of settled history. */
  | 'already_handled'
  /** No payout was matched, so nothing may be applied. */
  | 'unmatched';

export type TransferDecision = {
  action: TransferAction;
  /** Stable, greppable outcome string, written to the event ledger. */
  outcome: string;
};

/**
 * Decides what a matched-or-unmatched delivery means.
 *
 * `payoutStatus` is null when nothing matched. That case is separated out first
 * and can only ever produce 'unmatched', because the single most important rule
 * here is that an unmatchable delivery must not touch any payout at all.
 */
export function decideTransferAction(
  eventName: string,
  payoutStatus: string | null,
): TransferDecision {
  if (payoutStatus === null) {
    return { action: 'unmatched', outcome: 'queued_for_reconciliation' };
  }

  if (eventName === 'transfer.sent') {
    if (payoutStatus === 'paid') return { action: 'already_paid', outcome: 'already_paid' };
    if (payoutStatus === 'reconciliation_required') {
      // A transfer.sent redelivered from before a reversal must not undo the
      // reversal. The money came back; it does not go out again.
      return { action: 'unexpected_state', outcome: 'payout_awaiting_reconciliation' };
    }
    // 'transfer_pending' is the ordinary asynchronous case: we sent it, the bank
    // has it, and the confirmation is arriving now. Before the state existed this
    // was 'approved' with a recent transfer_attempted_at, and the two were told
    // apart by a timestamp — which is the sort of rule that gets lost the first
    // time someone adds a third path through the function.
    if (payoutStatus !== 'approved' && payoutStatus !== 'transfer_pending') {
      return { action: 'unexpected_state', outcome: `unexpected_state_${payoutStatus}` };
    }
    return { action: 'mark_paid', outcome: 'payout_paid' };
  }

  if (eventName === 'transfer.reversed') {
    if (payoutStatus === 'reconciliation_required') {
      return { action: 'already_reconciling', outcome: 'already_reconciling' };
    }
    // Only a payout that was actually paid can have been paid back. Anything
    // else means the match is suspect, and forcing it would corrupt a payout
    // that may not be the one that was reversed. A transfer still in flight
    // falls here too, and that is not a contradiction: a reversal of a transfer
    // we never saw confirmed is not a payment that came back.
    if (payoutStatus !== 'paid') {
      return { action: 'unexpected_state', outcome: `unexpected_state_${payoutStatus}` };
    }
    return { action: 'record_reversal', outcome: 'reconciliation_required' };
  }

  // transfer.failed and transfer.pending: the money has not moved.
  if (payoutStatus === 'approved') {
    // From 'approved' this is a no-op, which is exactly right as the answer to a
    // redelivery. From 'processing' it is the ordinary reset-for-retry path.
    return { action: 'reset_for_retry', outcome: 'retryable' };
  }
  if (payoutStatus === 'transfer_pending') {
    // The transfer did not go out after all, so the claim is given back and the
    // payout is worth trying again. The attempt row is closed by the server.
    return { action: 'reset_for_retry', outcome: 'retryable' };
  }
  if (payoutStatus === 'reconciliation_required') {
    return { action: 'unexpected_state', outcome: 'payout_awaiting_reconciliation' };
  }
  return { action: 'unexpected_state', outcome: `ignored_${payoutStatus}` };
}

/**
 * Decides what a delivery matched to a *closed* attempt means.
 *
 * This is a separate function on purpose. A closed attempt deliberately has no
 * payout status passed in, because combining the two is the trap: a
 * transfer.sent for an attempt that was later reversed matches the closed
 * attempt, and the payout has meanwhile been reset for a retry. Reading the
 * live status there would return something markable, and the platform would
 * conclude that money went out for a transfer that came back.
 *
 * So a closed attempt can only ever produce a no-op. It is consulted to
 * recognise a duplicate and to stop the search, never to apply a change.
 */
export function decideClosedAttemptAction(
  eventName: string,
  attemptStatus: string,
): TransferDecision {
  if (eventStatusOf(attemptStatus) === 'reversed' && eventName === 'transfer.sent') {
    // The exact scenario above: sent, then reversed, then the first delivery
    // redelivered. Recording it as sent would be the wrong answer twice over.
    return { action: 'already_handled', outcome: 'prior_attempt_reversed' };
  }
  return { action: 'already_handled', outcome: `prior_attempt_${attemptStatus}` };
}

function eventStatusOf(attemptStatus: string): string {
  return typeof attemptStatus === 'string' ? attemptStatus.trim().toLowerCase() : '';
}

/**
 * The matching hierarchy, as data.
 *
 * Tier 1 is the provider's own transfer code against the copy stored on the
 * payout at initiation. Tier 2 is the reference LagosLive put in the request
 * against the reference stored alongside it. Both are exact string comparisons
 * against a value this platform wrote itself.
 *
 * What is absent is the point. Account name, amount, organizer and timestamp are
 * all available in a transfer payload and all are unsafe: a name is a string
 * someone typed, and two payouts for the same amount on the same day is an
 * ordinary Tuesday. A wrong match here marks the wrong host's payout paid, which
 * is worse than leaving a payout unpaid because it tells finance to stop looking
 * at a transfer that may never have happened.
 *
 * A delivery that matches neither tier is then checked against
 * payout_transfer_attempts, which is a different kind of lookup and is not in
 * this list because it cannot lead to a mutation — see decideClosedAttemptAction.
 * It answers "have we already dealt with this transfer" and then stops.
 *
 * There is deliberately no tier that recovers a number from a mangled reference.
 * Such a tier would be one line of regex and it would be wrong on exactly the
 * inputs nobody anticipated. It stays absent until a real Paystack payload shows
 * a specific, documented mangled format — at which point the tier is written
 * against observed evidence rather than against a guess about one.
 */
export const MATCH_TIERS: ReadonlyArray<{
  method: Exclude<MatchMethod, 'unmatched' | 'prior_attempt'>;
  column: 'transfer_code' | 'transfer_reference';
  what: string;
}> = [
  {
    method: 'transfer_code',
    column: 'transfer_code',
    what: "the provider's transfer code, against payouts.transfer_code",
  },
  {
    method: 'reference',
    column: 'transfer_reference',
    what: 'our transfer reference, against payouts.transfer_reference',
  },
];

/** The outcome of one tier's lookup, with "no row" and "it broke" kept apart. */
export type TierLookup<T> =
  | { ok: true; row: T | null }
  | { ok: false; error: unknown };

export type MatchedPayout<T> = {
  kind: 'payout';
  method: Exclude<MatchMethod, 'unmatched' | 'prior_attempt'>;
  payout: T;
};

export type MatchedPriorAttempt = {
  kind: 'prior_attempt';
  attempt: { id: string; status: string; payoutId: number };
};

export type Unmatched<T> = { kind: 'unmatched' };

export type MatchOutcome<T> = MatchedPayout<T> | MatchedPriorAttempt | Unmatched<T>;

/**
 * Walks the matching hierarchy against an injected lookup.
 *
 * This is the tier loop lifted out of the webhook handler so the ordering rules
 * can be tested directly, rather than only asserted in a comment next to code
 * nobody runs. The webhook supplies a Supabase-backed lookup; the tests supply a
 * stub. Both exercise this function, so the behaviour that is tested is the
 * behaviour that ships.
 *
 * The rule that matters most: a lookup which ERRORS ends the search, it does not
 * continue to the next tier. A handler that cannot distinguish "no such payout"
 * from "the database did not answer" will eventually treat the second as the
 * first, and a delivery that lands in the queue is recoverable while a delivery
 * matched on a weaker signal is not. Today's tiers are all exact, so a
 * fall-through would happen to be harmless — which is precisely why it is worth
 * removing now, before anyone adds a tier for which that stops being true.
 */
export async function matchTransferDelivery<T extends { id: number; status: string }>(
  event: { transferCode: string | null; transferReference: string | null },
  lookup: (column: 'transfer_code' | 'transfer_reference', value: string) => Promise<TierLookup<T>>,
  findClosedAttempt?: (column: 'transfer_code' | 'transfer_reference', value: string) => Promise<TierLookup<MatchedPriorAttempt['attempt']>>,
): Promise<MatchOutcome<T>> {
  for (const tier of MATCH_TIERS) {
    const value = tier.method === 'transfer_code' ? event.transferCode : event.transferReference;
    if (!value) continue;

    const result = await lookup(tier.column, value);
    if (!result.ok) {
      // Reported by the caller's lookup, which has the query context. Ending the
      // search here is what keeps an unknown delivery unknown.
      return { kind: 'unmatched' };
    }
    if (result.row) {
      return { kind: 'payout', method: tier.method, payout: result.row };
    }
  }

  // Neither active field matched, which is the expected result after a reversal has
  // been resolved and the payout reset: the attempt this delivery belongs to is now
  // history. Rather than queue a redelivery of a transfer already settled, find the
  // attempt and record that it was recognised.
  if (findClosedAttempt) {
    const column = event.transferCode ? 'transfer_code' : 'transfer_reference';
    const value = column === 'transfer_code' ? event.transferCode : event.transferReference;
    if (value) {
      const attempt = await findClosedAttempt(column, value);
      if (attempt.ok && attempt.row) {
        return { kind: 'prior_attempt', attempt: attempt.row };
      }
    }
  }

  return { kind: 'unmatched' };
}

/** Paystack's own transfer event names this platform reacts to. */
export const TRANSFER_EVENTS: ReadonlySet<string> = new Set([
  'transfer.sent',
  'transfer.failed',
  'transfer.reversed',
  'transfer.pending',
]);
