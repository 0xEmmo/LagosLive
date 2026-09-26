import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTransferStatus,
  decideClosedAttemptAction,
  decideTransferAction,
  matchTransferDelivery,
  MATCH_TIERS,
  TRANSFER_EVENTS,
} from '../../lib/payout-transfer-matching.ts';
import {
  adminClient,
  asAnon,
  asService,
  asUser,
  attempt,
  attemptValue,
  closeAdmin,
  createAuthUser,
  createOrder,
  createParty,
  registerBankAccount,
  setAccountStatus,
  setHostVerified,
  setLegacyRole,
  truncateAll,
  type TestUser,
} from './helpers.ts';

/**
 * PART 3c — transfer matching, reversals, and sending a payout only once.
 *
 * Two defects motivated this file.
 *
 * The first was matching by assumption. The webhook resolved a payout by parsing
 * an id out of a reference string it had itself constructed, on the theory that
 * Paystack would echo that string back verbatim. That is an unverified
 * assumption sitting directly in the path that marks a host paid. The tests here
 * pin the replacement: match on the provider's own code, then on our own stored
 * reference, and match nothing at all rather than guess — never on account name,
 * amount or organizer.
 *
 * The second was that a reversed transfer left the payout sitting in 'paid'. The
 * host had been paid and then debited, and the database said otherwise. The
 * tests below pin the replacement state, and pin the part that is easy to get
 * wrong in the other direction: the original paid record is preserved rather
 * than erased, and the host is NOT suspended.
 */

let host: TestUser;
let otherHost: TestUser;
let finance: TestUser;
let partyId: number;
let orderId: string;

// ---------------------------------------------------------------------------
// The rules themselves, which need no database
// ---------------------------------------------------------------------------

describe('transfer status classification', () => {
  it('treats the sent spellings Paystack actually uses as sent', () => {
    for (const status of ['success', 'sent', 'successful', 'processed', 'SUCCESS', ' Sent ']) {
      assert.equal(classifyTransferStatus(status), 'sent', `${status} should count as sent`);
    }
  });

  it('treats a transfer still in motion as in flight, not as sent and not as dead', () => {
    for (const status of ['pending', 'queued', 'processing', 'otp_required', 'requires_approval']) {
      assert.equal(classifyTransferStatus(status), 'in_flight', `${status} should be in flight`);
    }
  });

  it('treats a transfer that will never complete as dead', () => {
    for (const status of ['failed', 'reversed', 'cancelled', 'rejected']) {
      assert.equal(classifyTransferStatus(status), 'dead', `${status} should be dead`);
    }
  });

  it('refuses to guess about a status it does not recognise', () => {
    // The dangerous default here would be either optimistic ('sent', which marks
    // a payout paid on an unverified reading) or pessimistic ('dead', which
    // invites a second transfer for a transfer that may still be moving).
    for (const status of ['', '   ', 'something_new', null, undefined]) {
      assert.equal(classifyTransferStatus(status), 'unknown', `${status} should not be classified`);
    }
  });
});

describe('the matching hierarchy is code, then reference, then nothing', () => {
  it('has exactly two tiers, in the required order', () => {
    assert.deepEqual(
      MATCH_TIERS.map((t) => t.method),
      ['transfer_code', 'reference'],
    );
  });

  it('matches on stored columns only, never on a field the provider chose', () => {
    // The columns are what a delivery is compared against. A name, amount or
    // timestamp cannot be a tier, because two payouts for the same amount on the
    // same day is an ordinary day and a name is a string someone typed.
    const columns: string[] = MATCH_TIERS.map((t) => t.column);
    assert.ok(columns.includes('transfer_code'));
    assert.ok(columns.includes('transfer_reference'));
    for (const forbidden of ['amount', 'bank_account_id', 'organizer_id', 'created_at', 'account_name']) {
      assert.ok(!columns.includes(forbidden), `${forbidden} must never be a matching tier`);
    }
  });

  it('reacts only to transfer events', () => {
    assert.ok(TRANSFER_EVENTS.has('transfer.sent'));
    assert.ok(TRANSFER_EVENTS.has('transfer.failed'));
    assert.ok(TRANSFER_EVENTS.has('transfer.reversed'));
    assert.ok(TRANSFER_EVENTS.has('transfer.pending'));
    assert.ok(!TRANSFER_EVENTS.has('charge.success'));
  });
});

/**
 * The seven properties the matching tier loop has to hold, driven through the
 * real matchTransferDelivery rather than a reimplementation of it.
 *
 * The stub below stands in for the database so these run as plain unit tests.
 * The function under test is the same one the webhook calls, so a change to the
 * ordering rules that broke any of these would break them here too.
 */
describe('matching a delivery to a payout', () => {
  type Row = { id: number; status: string };

  /**
   * A database holding one payout, with the given active identifiers.
   *
   * The keys are the real column names, because the lookup receives the same
   * snake_case names MATCH_TIERS declares. A stub keyed any other way silently
   * matches nothing, and every test using it passes for the wrong reason.
   *
   * closedAttempts is keyed by the identifier the delivery carries, since that is
   * what the real query compares on, not by the attempt's own id.
   */
  function stubStore(
    rows: Row[],
    active: { transfer_code?: string | null; transfer_reference?: string | null } = {},
    closedAttempts: Record<string, { id: string; status: string; payoutId: number }> = {},
  ) {
    const calls: { column: string; value: string }[] = [];
    return {
      calls,
      lookup: async (column: string, value: string) => {
        calls.push({ column, value });
        const row = rows.find((r) => (active as Record<string, unknown>)[column] === value) ?? null;
        return { ok: true as const, row };
      },
      findClosed: async (column: string, value: string) => {
        calls.push({ column: `${column}@attempts`, value });
        return { ok: true as const, row: closedAttempts[value] ?? null };
      },
    };
  }

  const PAYOUT_A: Row = { id: 41, status: 'transfer_pending' };
  const activeWith = (transfer_code: string | null, transfer_reference: string | null) => ({
    transfer_code,
    transfer_reference,
  });

  // 1. Exact transfer_code matching works.
  it('1. matches an exact transfer_code', async () => {
    const store = stubStore([PAYOUT_A], activeWith('TRF_abc123', 'payout-41-1000'));
    const outcome = await matchTransferDelivery(
      { transferCode: 'TRF_abc123', transferReference: 'payout-41-1000' },
      store.lookup,
      store.findClosed,
    );
    assert.equal(outcome.kind, 'payout');
    assert.equal(outcome.kind === 'payout' && outcome.method, 'transfer_code');
    assert.equal(outcome.kind === 'payout' && outcome.payout.id, 41);
  });

  // 2. Exact transfer_reference matching works.
  it('2. matches an exact transfer_reference when the code is absent', async () => {
    // Paystack does not always echo the reference, and a delivery can arrive with
    // only one of the two identifiers. Tier 2 exists for exactly that.
    const store = stubStore([PAYOUT_A], activeWith(null, 'payout-41-1000'));
    const outcome = await matchTransferDelivery(
      { transferCode: null, transferReference: 'payout-41-1000' },
      store.lookup,
      store.findClosed,
    );
    assert.equal(outcome.kind, 'payout');
    assert.equal(outcome.kind === 'payout' && outcome.method, 'reference');
  });

  // 3. Unknown/mangled references do not guess-match.
  it('3. refuses to guess at a mangled reference', async () => {
    // The reference is 'payout-41-1000' and a provider mangles it into something
    // that still contains '41'. Anything that recovers the number from it would mark
    // this payout paid. Nothing may.
    const store = stubStore([PAYOUT_A], activeWith('TRF_abc123', 'payout-41-1000'));
    for (const mangled of [
      'payout-41-100',
      'PAYOUT-41-1000',
      'payout-41-1000 ',
      'payout-0041-1000',
      'x41x',
      '41',
      'payout-41-1000\r\n',
      'payout–41–1000', // en dashes, not hyphens
    ]) {
      const outcome = await matchTransferDelivery(
        { transferCode: null, transferReference: mangled },
        store.lookup,
        store.findClosed,
      );
      assert.equal(
        outcome.kind,
        'unmatched',
        `"${mangled}" was treated as a match for payout 41`,
      );
    }
  });

  it('3b. refuses a delivery carrying no identifier at all', async () => {
    const store = stubStore([PAYOUT_A], activeWith('TRF_abc123', 'payout-41-1000'));
    const outcome = await matchTransferDelivery(
      { transferCode: null, transferReference: null },
      store.lookup,
      store.findClosed,
    );
    assert.equal(outcome.kind, 'unmatched');
  });

  // 4. A redelivered transfer.sent for a reversed attempt is logged only.
  it('4. resolves a settled attempt to prior_attempt rather than to its payout', async () => {
    const store = stubStore(
      [],
      activeWith(null, null),
      { TRF_abc123: { id: 'attempt-1', status: 'reversed', payoutId: 41 } },
    );
    const outcome = await matchTransferDelivery(
      { transferCode: 'TRF_abc123', transferReference: null },
      store.lookup,
      store.findClosed,
    );
    assert.equal(outcome.kind, 'prior_attempt');
    assert.equal(outcome.kind === 'prior_attempt' && outcome.attempt.status, 'reversed');
  });

  it('4b. never pairs a prior attempt with a live payout status', async () => {
    // The two must not be returnable together. A prior_attempt result carries no
    // payout status at all, so a caller cannot read the live row and conclude the
    // payout is markable.
    const store = stubStore(
      [PAYOUT_A],
      activeWith('TRF_new999', 'payout-41-2000'),
      { TRF_abc123: { id: 'attempt-1', status: 'reversed', payoutId: 41 } },
    );
    const outcome = await matchTransferDelivery(
      { transferCode: 'TRF_abc123', transferReference: null },
      store.lookup,
      store.findClosed,
    );
    assert.equal(outcome.kind, 'prior_attempt');
    assert.equal(
      'payoutStatus' in outcome,
      false,
      'a prior_attempt match must not carry a payout status',
    );
  });

  // 6. A genuine new transfer.sent for a new attempt can still mark the payout paid.
  it('6. matches a new transfer that the payout is actually waiting for', async () => {
    // The retry case: attempt 1 was reversed, the payout was reset, and a second
    // transfer is now live with its own code and reference.
    const store = stubStore([PAYOUT_A], activeWith('TRF_new999', 'payout-41-2000'));
    const outcome = await matchTransferDelivery(
      { transferCode: 'TRF_new999', transferReference: 'payout-41-2000' },
      store.lookup,
      store.findClosed,
    );
    assert.equal(outcome.kind, 'payout');
    assert.equal(outcome.kind === 'payout' && outcome.payout.status, 'transfer_pending');
    // A genuine match never consults the history table.
    assert.equal(
      store.calls.some((c) => c.column.endsWith('@attempts')),
      false,
      'a live payout match should not have needed the attempt history',
    );
    assert.equal(decideTransferAction('transfer.sent', 'transfer_pending').action, 'mark_paid');
  });

  it('a broken lookup ends the search instead of trying a weaker tier', async () => {
    // The tier loop used to return null for both "no such row" and "the query
    // failed", so an error in tier 1 fell through to tier 2. Harmless while every
    // tier is exact, and a way to mark the wrong payout paid the moment one is
    // not. An unknown delivery must stay unknown.
    const calls: string[] = [];
    const failing = async (column: string) => {
      calls.push(column);
      return { ok: false as const, error: new Error('connection reset') };
    };
    const outcome = await matchTransferDelivery(
      { transferCode: 'TRF_abc123', transferReference: 'payout-41-1000' },
      failing,
    );
    assert.equal(outcome.kind, 'unmatched');
    assert.deepEqual(calls, ['transfer_code'], 'the search continued past a failed lookup');
  });

  it('tries the code tier first and stops as soon as it matches', async () => {
    const store = stubStore([PAYOUT_A], activeWith('TRF_abc123', 'payout-41-1000'));
    await matchTransferDelivery(
      { transferCode: 'TRF_abc123', transferReference: 'payout-41-1000' },
      store.lookup,
      store.findClosed,
    );
    assert.deepEqual(store.calls.map((c) => c.column), ['transfer_code']);
  });
});

describe('what a transfer delivery is allowed to do', () => {
  it('applies nothing at all when no payout matched', () => {
    for (const event of ['transfer.sent', 'transfer.reversed', 'transfer.failed']) {
      const decision = decideTransferAction(event, null);
      assert.equal(decision.action, 'unmatched', `${event} with no match must apply nothing`);
    }
  });

  it('marks an approved payout paid when the money is sent', () => {
    assert.equal(decideTransferAction('transfer.sent', 'approved').action, 'mark_paid');
  });

  it('does nothing when a sent delivery is a redelivery', () => {
    assert.equal(decideTransferAction('transfer.sent', 'paid').action, 'already_paid');
  });

  it('does not let a replayed transfer.sent undo a reversal', () => {
    // The order these arrive in is not guaranteed. A transfer.sent that was in
    // flight when the reversal happened can still be delivered afterwards, and
    // marking the payout paid again would hide a transfer that was undone.
    const decision = decideTransferAction('transfer.sent', 'reconciliation_required');
    assert.equal(decision.action, 'unexpected_state');
    assert.equal(decision.outcome, 'payout_awaiting_reconciliation');
  });

  it('does not let marking paid replace the claimed reference', async () => {
    // The claimed reference is the string tier-2 matching compares against. If a
    // delivery carrying only the provider code overwrote it, the next delivery
    // would have no reference left to match on and would land in the queue.
    const payoutId = await approvedPayoutWithTransfer('TRF_keepref');
    const claimed = (await payoutRow(payoutId)).transfer_reference;
    assert.ok(claimed, 'no reference was claimed');

    await asService((c) =>
      attempt(c, `select public.mark_payout_paid($1, 'TRF_keepref')`, [payoutId]),
    );
    assert.equal((await payoutRow(payoutId)).transfer_reference, claimed, 'the claimed reference was replaced');
  });

  it('never marks a payout paid before it was approved', () => {
    for (const status of ['pending', 'processing', 'rejected', 'reconciliation_required']) {
      const decision = decideTransferAction('transfer.sent', status);
      assert.notEqual(decision.action, 'mark_paid', `${status} must not be markable as paid`);
    }
  });

  it('records a reversal only for a payout that was actually paid', () => {
    assert.equal(decideTransferAction('transfer.reversed', 'paid').action, 'record_reversal');
    for (const status of ['pending', 'processing', 'approved']) {
      const decision = decideTransferAction('transfer.reversed', status);
      assert.equal(
        decision.action,
        'unexpected_state',
        `a reversal for a ${status} payout means the match is suspect`,
      );
    }
  });

  it('treats a repeated reversal as already handled', () => {
    const decision = decideTransferAction('transfer.reversed', 'reconciliation_required');
    assert.equal(decision.action, 'already_reconciling');
  });

  it('makes a failed transfer retryable rather than paid', () => {
    for (const event of ['transfer.failed', 'transfer.pending']) {
      const decision = decideTransferAction(event, 'approved');
      assert.equal(decision.action, 'reset_for_retry');
      assert.equal(decision.outcome, 'retryable');
    }
  });
});

// ---------------------------------------------------------------------------
// The database side, which needs fixtures
// ---------------------------------------------------------------------------

async function payoutRow(id: number) {
  const client = await adminClient();
  const { rows } = await client.query(`select * from public.payouts where id = $1`, [id]);
  return rows[0];
}

async function onlyPayoutId(): Promise<number> {
  const client = await adminClient();
  const { rows } = await client.query(`select id from public.payouts order by id`);
  assert.equal(rows.length, 1, 'expected exactly one payout in this fixture');
  return Number(rows[0].id);
}

async function newestPayoutId(): Promise<number> {
  const client = await adminClient();
  const { rows } = await client.query(`select id from public.payouts order by id desc limit 1`);
  assert.ok(rows.length > 0, 'no payout was created');
  return Number(rows[0].id);
}

/** A payout that has been approved, claimed and stamped, i.e. a live transfer. */
async function approvedPayoutWithTransfer(code = 'TRF_live_001'): Promise<number> {
  await setHostVerified(host.id);
  const requested = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
  assert.equal(requested.ok, true, `request_payout failed: ${requested.error}`);
  const payoutId = await newestPayoutId();
  for (const step of ['processing', 'approved']) {
    const r = await asUser(finance.id, (c) =>
      attempt(c, `select public.transition_payout($1, $2)`, [payoutId, step]),
    );
    assert.equal(r.ok, true, `transition to ${step} failed: ${r.error}`);
  }
  const reference = await asService((c) => attemptValue<string>(c, `select public.claim_payout_transfer($1)`, [payoutId]));
  assert.equal(reference.ok, true, `claim failed: ${reference.error}`);
  assert.ok(reference.value, 'the claim returned no reference to send');
  const stamp = await asService((c) =>
    attempt(c, `select public.stamp_payout_transfer($1, $2, $3)`, [payoutId, code, reference.value as string]),
  );
  assert.equal(stamp.ok, true, `stamp failed: ${stamp.error}`);
  return payoutId;
}

before(async () => {
  await truncateAll();
  host = await createAuthUser('host@example.com');
  otherHost = await createAuthUser('other-host@example.com');
  finance = await createAuthUser('finance@example.com');
  await setLegacyRole(host.id, 'organizer');
  await setLegacyRole(otherHost.id, 'organizer');
  await setLegacyRole(finance.id, 'finance');
  partyId = await createParty(host.id);
  orderId = await createOrder(partyId, { total: 11000, quantity: 2 });
  await registerBankAccount(host.id);
  await setHostVerified(host.id);
  await setAccountStatus(host.id, 'active');
});

beforeEach(async () => {
  const client = await adminClient();
  await client.query(`delete from public.payout_transfer_events`);
  await client.query(`delete from public.host_payout_freezes`);
  await client.query(`delete from public.payout_items`);
  await client.query(`delete from public.payouts`);
  await client.query(
    `update public.orders
        set payment_status = 'confirmed', status = 'confirmed', refund_status = 'none', refund_amount = 0
      where id = $1`,
    [orderId],
  );
  await client.query(`delete from public.host_payout_freezes where host_id = $1`, [host.id]);
  await setHostVerified(host.id);
  await setAccountStatus(host.id, 'active');
  await registerBankAccount(host.id);
});

after(async () => {
  await closeAdmin();
});

describe('reversing a transfer', () => {
  it('moves a paid payout to reconciliation_required', async () => {
    const payoutId = await approvedPayoutWithTransfer();
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_live_001')`, [payoutId]));

    const r = await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-1', 'TRF_live_001', 'Account closed', 935000)`, [
        payoutId,
      ]),
    );
    assert.equal(r.ok, true, `record_payout_reversal failed: ${r.error}`);

    const row = await payoutRow(payoutId);
    assert.equal(row.status, 'reconciliation_required');
    assert.equal(row.reversed_at !== null, true);
    assert.equal(row.reversal_reference, 'REV-1');
    assert.equal(row.reversal_reason, 'Account closed');
  });

  it('keeps the original paid record instead of erasing it', async () => {
    // A reconciliation is only useful if it can show what was originally
    // recorded. Clearing paid_at and the transfer code would make a reversed
    // payment look like one that was never made, which is the other half of the
    // original defect.
    const payoutId = await approvedPayoutWithTransfer('TRF_keepme');
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_keepme')`, [payoutId]));
    const before = await payoutRow(payoutId);
    assert.equal(before.paid_at !== null, true);

    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-2', 'TRF_keepme', 'Reversed', 935000)`, [payoutId]),
    );
    const after = await payoutRow(payoutId);

    assert.equal(after.paid_at?.toISOString(), before.paid_at.toISOString(), 'paid_at was cleared');
    assert.equal(after.transfer_code, 'TRF_keepme', 'the original transfer code was erased');
  });

  it('releases the order claims so the revenue becomes owed again', async () => {
    const payoutId = await approvedPayoutWithTransfer();
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_live_001')`, [payoutId]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-3', 'TRF_live_001', 'Reversed', 935000)`, [payoutId]),
    );

    const client = await adminClient();
    const { rows } = await client.query(
      `select count(*)::int as held from public.payout_items where payout_id = $1 and not released`,
      [payoutId],
    );
    assert.equal(rows[0].held, 0, 'the reversed payout still holds its orders');

    // And the money is genuinely claimable again, which is the point: the host
    // was not paid, so they are owed it.
    const { rows: active } = await client.query(
      `select count(*)::int as held from public.payout_items where not released`,
    );
    assert.equal(active[0].held, 0);
  });

  it('freezes the host`s payouts without suspending the account', async () => {
    // The distinction matters. A reversal is far more often a mistyped account
    // number, a bank outage or a provider fault than fraud, and suspending a
    // host over one costs them their events while the actual problem is a typo.
    const payoutId = await approvedPayoutWithTransfer();
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_live_001')`, [payoutId]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-4', 'TRF_live_001', 'Reversed', 935000)`, [payoutId]),
    );

    const client = await adminClient();
    const { rows } = await client.query(
      `select
         (select account_status from public.profiles where id = $1) as account_status,
         (select count(*)::int from public.host_payout_freezes
           where host_id = $1 and released_at is null) as active_freezes`,
      [host.id],
    );
    assert.equal(rows[0].account_status, 'active', 'a reversed transfer suspended the host account');
    assert.equal(rows[0].active_freezes, 1, 'no payout freeze was created');
  });

  it('refuses a new payout while the freeze is active, and allows one after release', async () => {
    // The write-off path: finance decides the reversal is not worth retrying, the
    // payout is rejected, and the host is free to request again.
    const payoutId = await approvedPayoutWithTransfer();
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_live_001')`, [payoutId]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-5', 'TRF_live_001', 'Reversed', 935000)`, [payoutId]),
    );

    const blocked = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(blocked.ok, false, 'a frozen host could request another payout');

    // Finance resolves the payout first; the freeze cannot be lifted while the
    // reversal is still unreviewed, because then the host could take the same
    // money out again with nothing watching it.
    const early = await asUser(finance.id, (c) =>
      attempt(c, `select public.release_payout_freeze($1, 'not yet')`, [host.id]),
    );
    assert.equal(early.ok, false, 'the freeze was lifted while a payout still awaited review');

    const resolved = await asUser(finance.id, (c) =>
      attempt(c, `select public.transition_payout($1, 'rejected')`, [payoutId]),
    );
    assert.equal(resolved.ok, true, `finance could not resolve the reversal: ${resolved.error}`);

    const released = await asUser(finance.id, (c) =>
      attempt(c, `select public.release_payout_freeze($1, 'Account corrected')`, [host.id]),
    );
    assert.equal(released.ok, true, `the freeze could not be released: ${released.error}`);

    const allowed = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(allowed.ok, true, `the host could not request a payout after review: ${allowed.error}`);
  });

  it('a host cannot request again while a reversed payout is being retried', async () => {
    // Resolving to 'approved' means a retry of that same payout is now live, so
    // the host must not also be able to create a second one. The money would then
    // be claimable through both at once, which is what the live-payout check is
    // for. This is the reason the retry path and the request path cannot be
    // reasoned about separately.
    const payoutId = await approvedPayoutWithTransfer();
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_live_001')`, [payoutId]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-5b', 'TRF_live_001', 'Reversed', 935000)`, [payoutId]),
    );
    const resolved = await asUser(finance.id, (c) =>
      attempt(c, `select public.transition_payout($1, 'approved')`, [payoutId]),
    );
    assert.equal(resolved.ok, true, `resolving the reversal failed: ${resolved.error}`);

    const again = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(again.ok, false, 'a second payout was created while a retry was live');
    assert.equal((await payoutRow(payoutId)).status, 'approved', 'the retry was disturbed');
  });

  it('counts repeated reversals for the same host instead of stacking freezes', async () => {
    const client = await adminClient();
    for (const code of ['TRF_r1', 'TRF_r2', 'TRF_r3']) {
      const payoutId = await approvedPayoutWithTransfer(code);
      await asService((c) => attempt(c, `select public.mark_payout_paid($1, $2)`, [payoutId, code]));
      await asService((c) =>
        attempt(c, `select public.record_payout_reversal($1, $2, $3, 'Reversed', 935000)`, [payoutId, `REV-${code}`, code]),
      );
      await asUser(finance.id, (c) => attempt(c, `select public.transition_payout($1, 'rejected')`, [payoutId]));
      await asUser(finance.id, (c) => attempt(c, `select public.release_payout_freeze($1, 'reviewed')`, [host.id]));
    }

    const { rows } = await client.query(
      `select count(*)::int as total, max(reversal_count)::int as peak
         from public.host_payout_freezes where host_id = $1`,
      [host.id],
    );
    assert.equal(rows[0].total, 3, 'the reversal history was not preserved');
    // The count is what separates a mistyped account number from a pattern, so
    // it has to actually rise rather than reading 1 forever.
    assert.equal(rows[0].peak, 3, 'the repeated-reversal count did not rise with each reversal');
  });

  it('keeps one active freeze per host and counts repeats on it', async () => {
    // A second reversal while the first is still under review must extend the
    // existing freeze rather than adding a second one, or nobody will notice
    // that a host has a pattern. The count is the signal; the freeze is the
    // control. Account suspension stays a human decision.
    const first = await approvedPayoutWithTransfer('TRF_x1');
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_x1')`, [first]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-x1', 'TRF_x1', 'Reversed', 1)`, [first]),
    );

    // Finance rejects the first reversal and clears the freeze, then the same
    // host has a second one. The history must show both.
    await asUser(finance.id, (c) => attempt(c, `select public.transition_payout($1, 'rejected')`, [first]));
    await asUser(finance.id, (c) => attempt(c, `select public.release_payout_freeze($1, 'reviewed')`, [host.id]));

    const second = await approvedPayoutWithTransfer('TRF_x2');
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_x2')`, [second]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-x2', 'TRF_x2', 'Reversed', 1)`, [second]),
    );

    const client = await adminClient();
    const { rows } = await client.query(
      `select
         (select count(*)::int from public.host_payout_freezes
           where host_id = $1 and released_at is null) as active,
         (select count(*)::int from public.host_payout_freezes where host_id = $1) as total`,
      [host.id],
    );
    assert.equal(rows[0].total, 2, 'the second reversal was not recorded');
    assert.equal(rows[0].active, 1, 'more than one freeze is active for this host');
  });

  it('is idempotent, because Paystack redelivers reversals', async () => {
    const payoutId = await approvedPayoutWithTransfer();
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_live_001')`, [payoutId]));

    const first = await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-6', 'TRF_live_001', 'Reversed', 935000)`, [payoutId]),
    );
    assert.equal(first.ok, true);
    const firstReversedAt = (await payoutRow(payoutId)).reversed_at;

    const second = await asService((c) =>
      attemptValue<string>(c, `select public.record_payout_reversal($1, 'REV-6', 'TRF_live_001', 'Reversed', 935000)`, [payoutId]),
    );
    assert.equal(second.ok, true, 'a redelivered reversal was treated as an error');
    assert.equal(second.value, 'already_reconciling');

    const row = await payoutRow(payoutId);
    assert.equal(row.reversed_at.toISOString(), firstReversedAt.toISOString(), 'the reversal was applied twice');

    const client = await adminClient();
    const { rows } = await client.query(
      `select count(*)::int as freezes from public.host_payout_freezes where released_at is null`,
    );
    assert.equal(rows[0].freezes, 1, 'a redelivered reversal froze the host a second time');
  });

  // 5. The reversed payout remains reversed, and the redelivered send changes nothing.
  it('5. a redelivered transfer.sent cannot undo a reversal', async () => {
    // The full sequence, against the database rather than a stub: the transfer goes
    // out, the money comes back, and Paystack redelivers the original confirmation
    // afterwards. The payout must still be awaiting review at the end, with one
    // reversal, one freeze, and no second audit entry.
    const payoutId = await approvedPayoutWithTransfer('TRF_seq_001');
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_seq_001')`, [payoutId]));
    const reversal = await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-SEQ', 'TRF_seq_001', 'Reversed', 935000)`, [payoutId]),
    );
    assert.equal(reversal.ok, true, `the reversal failed: ${reversal.error}`);
    const reversedAt = (await payoutRow(payoutId)).reversed_at;

    // Now the stale confirmation arrives. The webhook resolves it against the
    // closed attempt, so what reaches the database is a ledger row and nothing else.
    const redelivery = await asService((c) =>
      attemptValue<string>(
        c,
        `select public.record_transfer_event($1, $2, 'prior_attempt', 'TRF_seq_001', $3, 935000, $4, '{}'::jsonb)`,
        ['transfer.sent', payoutId, null, 'redelivered'],
      ),
    );
    assert.equal(redelivery.ok, true, `recording the redelivery failed: ${redelivery.error}`);

    const row = await payoutRow(payoutId);
    assert.equal(row.status, 'reconciliation_required', 'a redelivered send revived a reversed payout');
    assert.equal(row.reversed_at.toISOString(), reversedAt.toISOString(), 'the reversal date was rewritten');
    // paid_at is deliberately still set: the payout was genuinely paid once, and a
    // stale redelivery is no reason to pretend otherwise. What matters is that
    // nothing moved the payout out of reconciliation_required.
    assert.ok(row.paid_at, 'the original paid date was erased by a redelivery');

    const client = await adminClient();
    const { rows } = await client.query(
      `select
         (select count(*)::int from public.host_payout_freezes where released_at is null) as active,
         (select count(*)::int from public.audit_logs
           where target_type = 'payout' and target_id = $1 and action = 'payout_transfer_reversed') as reversals`,
      [String(payoutId)],
    );
    assert.equal(rows[0].active, 1, 'the redelivery changed the freeze state');
    assert.equal(rows[0].reversals, 1, 'the redelivery recorded a second reversal');
  });

  it('5b. the redelivery is still on record, with the outcome that says why it was not applied', async () => {
    const payoutId = await approvedPayoutWithTransfer('TRF_seq_002');
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_seq_002')`, [payoutId]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-SEQ2', 'TRF_seq_002', 'Reversed', 1)`, [payoutId]),
    );

    // The two steps the webhook takes for every delivery: record it, then say what
    // became of it. Both are exercised so the assertion covers the row as it is
    // actually written, not a half-finished version of it.
    const recorded = await asService((c) =>
      attemptValue<string>(
        c,
        `select public.record_transfer_event($1, $2, 'prior_attempt', 'TRF_seq_002', null, 1, null, '{}'::jsonb)`,
        ['transfer.sent', payoutId],
      ),
    );
    assert.equal(recorded.ok, true, `recording the redelivery failed: ${recorded.error}`);
    const settled = await asService((c) =>
      attempt(c, `select public.mark_transfer_event_outcome($1, $2)`, [recorded.value, 'prior_attempt_reversed']),
    );
    assert.equal(settled.ok, true, `recording the outcome failed: ${settled.error}`);

    const client = await adminClient();
    const { rows } = await client.query(
      `select event, match_method, outcome, payout_id
         from public.payout_transfer_events
        where payout_id = $1 order by received_at desc limit 1`,
      [payoutId],
    );
    assert.equal(rows[0].event, 'transfer.sent');
    assert.equal(rows[0].match_method, 'prior_attempt');
    assert.equal(rows[0].outcome, 'prior_attempt_reversed');
    // Attributed to the payout so finance can see it, which is the difference
    // between "we recognised this" and "we never heard of it".
    assert.equal(Number(rows[0].payout_id), payoutId);
  });

  it('5c. two unmatched deliveries with no identifier are both kept', async () => {
    // The old dedupe index coalesced the nullable identifier columns to '', so
    // every delivery carrying neither collapsed onto the same key and the second
    // one was discarded on insert. Money had moved and the record was gone.
    for (const [event, reason] of [
      ['transfer.sent', 'first, no code'],
      ['transfer.sent', 'second, no code'],
    ] as const) {
      const r = await asService((c) =>
        attempt(c, `select public.record_transfer_event($1, null, 'unmatched', null, null, 1, $2, '{}'::jsonb)`, [
          event,
          reason,
        ]),
      );
      assert.equal(r.ok, true, `an unmatched delivery was dropped: ${r.error}`);
    }

    const client = await adminClient();
    const { rows } = await client.query(
      `select count(*)::int as n from public.payout_transfer_events where payout_id is null`,
    );
    assert.equal(rows[0].n, 2, 'an unmatched delivery was silently discarded');
  });

  it('5d. a redelivery that does carry an identifier is still deduplicated', async () => {
    // Narrowing the index must not have cost the idempotency it was there for.
    const sql = `select public.record_transfer_event('transfer.sent', null, 'unmatched', 'TRF_some', 'ref-some', 1, null, '{}'::jsonb)`;
    await asService((c) => attempt(c, sql));
    const again = await asService((c) => attempt(c, sql));
    assert.equal(again.ok, true, `a redelivery was treated as an error: ${again.error}`);

    const client = await adminClient();
    const { rows } = await client.query(
      `select count(*)::int as n from public.payout_transfer_events where transfer_code = 'TRF_some'`,
    );
    assert.equal(rows[0].n, 1, 'a redelivery was recorded as a second event');
  });

  // 7. A duplicate genuine transfer.sent is idempotent.
  it('7. a duplicate genuine transfer.sent changes nothing the second time', async () => {
    const payoutId = await approvedPayoutWithTransfer('TRF_dupe_001');
    const first = await asService((c) =>
      attemptValue<string>(c, `select public.mark_payout_paid($1, 'TRF_dupe_001')`, [payoutId]),
    );
    assert.equal(first.ok, true, `the first confirmation failed: ${first.error}`);
    assert.equal(first.value, 'paid');
    const afterFirst = await payoutRow(payoutId);

    const second = await asService((c) =>
      attemptValue<string>(c, `select public.mark_payout_paid($1, 'TRF_dupe_001')`, [payoutId]),
    );
    assert.equal(second.ok, true, `a duplicate confirmation was refused: ${second.error}`);
    assert.equal(second.value, 'paid');

    const afterSecond = await payoutRow(payoutId);
    assert.equal(afterSecond.paid_at.toISOString(), afterFirst.paid_at.toISOString(), 'paid_at moved on redelivery');
    assert.equal(afterSecond.transfer_code, 'TRF_dupe_001');

    const client = await adminClient();
    const { rows } = await client.query(
      `select count(*)::int as paid_audits from public.audit_logs
        where target_type = 'payout' and target_id = $1 and action = 'payout_paid'`,
      [String(payoutId)],
    );
    assert.equal(rows[0].paid_audits, 1, 'a duplicate confirmation was paid twice');
  });

  it('refuses to reverse a payout that was never paid', async () => {
    const payoutId = await approvedPayoutWithTransfer();
    const r = await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-7', 'TRF_live_001', 'Reversed', 935000)`, [payoutId]),
    );
    assert.equal(r.ok, false, 'an unpaid payout was marked as reversed');
    // The claim put it in transfer_pending, and refusing the reversal must leave
    // it there: a transfer that is in flight is not a payout to write off.
    assert.equal((await payoutRow(payoutId)).status, 'transfer_pending');
  });

  it('cannot be resolved by the host', async () => {
    const payoutId = await approvedPayoutWithTransfer();
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_live_001')`, [payoutId]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-8', 'TRF_live_001', 'Reversed', 935000)`, [payoutId]),
    );

    for (const target of ['approved', 'rejected', 'paid']) {
      const r = await asUser(host.id, (c) =>
        attempt(c, `select public.transition_payout($1, $2)`, [payoutId, target]),
      );
      assert.equal(r.ok, false, `the host moved a reversed payout to ${target} themselves`);
    }
  });

  it('clears the dead transfer code when finance approves a retry', async () => {
    // Otherwise the next transfer cannot be claimed, and a redelivery of the
    // original reversal would match the retry.
    const payoutId = await approvedPayoutWithTransfer('TRF_dead');
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_dead')`, [payoutId]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-9', 'TRF_dead', 'Reversed', 935000)`, [payoutId]),
    );

    const r = await asUser(finance.id, (c) => attempt(c, `select public.transition_payout($1, 'approved')`, [payoutId]));
    assert.equal(r.ok, true, `finance could not approve a retry: ${r.error}`);

    const row = await payoutRow(payoutId);
    assert.equal(row.transfer_code, null, 'the reversed transfer code survived into the retry');
    assert.equal(row.status, 'approved');
  });

  it('cannot be marked paid again while awaiting review', async () => {
    const payoutId = await approvedPayoutWithTransfer();
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_live_001')`, [payoutId]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-10', 'TRF_live_001', 'Reversed', 935000)`, [payoutId]),
    );

    const r = await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_other')`, [payoutId]));
    assert.equal(r.ok, false, 'a reversed payout was marked paid again by a stray webhook');
    assert.equal((await payoutRow(payoutId)).status, 'reconciliation_required');
  });
});

describe('the transfer event ledger', () => {
  it('records how a delivery was matched', async () => {
    const payoutId = await approvedPayoutWithTransfer('TRF_ledger');
    const r = await asService((c) =>
      attempt(
        c,
        `select public.record_transfer_event('transfer.sent', $1, 'transfer_code', $2, 'ref', 935000, null, '{}'::jsonb)`,
        [payoutId, 'TRF_ledger'],
      ),
    );
    assert.equal(r.ok, true, `record_transfer_event failed: ${r.error}`);

    const client = await adminClient();
    const { rows } = await client.query(
      `select match_method, payout_id from public.payout_transfer_events`,
    );
    assert.equal(rows[0].match_method, 'transfer_code');
    assert.equal(Number(rows[0].payout_id), payoutId);
  });

  it('queues an unmatchable delivery without attaching it to any payout', async () => {
    const r = await asService((c) =>
      attempt(
        c,
        `select public.record_transfer_event('transfer.sent', null, 'unmatched', 'TRF_unknown', 'payout-9999-1', 935000, null, '{}'::jsonb)`,
      ),
    );
    assert.equal(r.ok, true, `record_transfer_event failed: ${r.error}`);

    const client = await adminClient();
    const { rows } = await client.query(
      `select kind, reference, amount from public.payout_reconciliation_queue where kind = 'unmatched_event'`,
    );
    assert.equal(rows.length, 1, 'an unmatchable transfer delivery did not reach the reconciliation queue');
    assert.equal(Number(rows[0].amount), 935000);
  });

  it('refuses to claim a match method that disagrees with the payout it names', async () => {
    // 'unmatched' with a payout, or a real method with no payout, would both
    // corrupt the triage list built on this table.
    const client = await adminClient();
    const mismatches: Array<[string, string]> = [
      ['unmatched', '1'],
      ['transfer_code', 'null'],
    ];
    for (const [method, id] of mismatches) {
      const r = await asService((c) =>
        attempt(
          c,
          `select public.record_transfer_event('transfer.sent', $2::bigint, $1, 'TRF_x', 'ref', 1, null, '{}'::jsonb)`,
          [method, id],
        ),
      );
      assert.equal(r.ok, false, `match_method ${method} with payout ${id} was accepted`);
    }
    void client;
  });

  it('deduplicates a redelivered event', async () => {
    const payoutId = await approvedPayoutWithTransfer('TRF_dupe');
    const sql = `select public.record_transfer_event('transfer.sent', $1, 'transfer_code', 'TRF_dupe', 'ref', 1, null, '{}'::jsonb)`;
    const first = await asService((c) => attempt(c, sql, [payoutId]));
    const second = await asService((c) => attempt(c, sql, [payoutId]));
    assert.equal(first.ok, true);
    assert.equal(second.ok, true, 'a redelivered transfer event was treated as an error');

    const client = await adminClient();
    const { rows } = await client.query(`select count(*)::int as n from public.payout_transfer_events`);
    assert.equal(rows[0].n, 1, 'the redelivery was recorded as a second event');
  });

  it('is not writable by a signed-in user', async () => {
    const r = await asUser(finance.id, (c) =>
      attempt(
        c,
        `insert into public.payout_transfer_events (event, match_method, payload)
         values ('transfer.sent', 'unmatched', '{}'::jsonb)`,
      ),
    );
    assert.equal(r.ok, false, 'a signed-in user wrote to the append-only transfer ledger');
  });

  it('is not writable by an anonymous caller', async () => {
    const r = await asAnon((c) =>
      attempt(
        c,
        `insert into public.payout_transfer_events (event, match_method, payload)
         values ('transfer.sent', 'unmatched', '{}'::jsonb)`,
      ),
    );
    assert.equal(r.ok, false, 'an anonymous caller wrote to the transfer ledger');
  });
});

describe('sending a payout only once', () => {
  it('refuses a second claim while a transfer is in flight', async () => {
    // Two finance users clicking "Send transfer" a second apart. The read and
    // the Paystack call are not one transaction, so a status check alone cannot
    // stop this: both would see 'approved' and Paystack would take two.
    await setHostVerified(host.id);
    await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    const payoutId = await onlyPayoutId();
    for (const step of ['processing', 'approved']) {
      await asUser(finance.id, (c) => attempt(c, `select public.transition_payout($1, $2)`, [payoutId, step]));
    }

    const first = await asService((c) => attempt(c, `select public.claim_payout_transfer($1)`, [payoutId]));
    assert.equal(first.ok, true, `the first claim failed: ${first.error}`);
    const second = await asService((c) => attempt(c, `select public.claim_payout_transfer($1)`, [payoutId]));
    assert.equal(second.ok, false, 'a second claim succeeded while a transfer was in flight');
  });

  it('issues a different reference for each attempt', async () => {
    await setHostVerified(host.id);
    await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    const payoutId = await onlyPayoutId();
    for (const step of ['processing', 'approved']) {
      await asUser(finance.id, (c) => attempt(c, `select public.transition_payout($1, $2)`, [payoutId, step]));
    }

    const first = await asService((c) => attemptValue<string>(c, `select public.claim_payout_transfer($1)`, [payoutId]));
    await asService((c) => attempt(c, `select public.release_payout_transfer_claim($1)`, [payoutId]));
    const second = await asService((c) => attemptValue<string>(c, `select public.claim_payout_transfer($1)`, [payoutId]));

    assert.equal(first.ok && second.ok, true, `claims failed: ${first.error} / ${second.error}`);
    // Both references name the payout, which is what makes tier-2 matching work
    // even if the provider code is somehow unavailable.
    assert.match(first.value as string, new RegExp(`^payout-${payoutId}-`));
    assert.match(second.value as string, new RegExp(`^payout-${payoutId}-`));
    assert.notEqual(first.value, second.value, 'two attempts shared a reference');
  });

  it('refuses a claim when a transfer already exists', async () => {
    const payoutId = await approvedPayoutWithTransfer('TRF_exists');
    const r = await asService((c) => attempt(c, `select public.claim_payout_transfer($1)`, [payoutId]));
    assert.equal(r.ok, false, 'a payout with a live transfer could be claimed again');
  });

  it('refuses a second stamp of the same payout', async () => {
    const payoutId = await approvedPayoutWithTransfer('TRF_first_stamp');
    const r = await asService((c) =>
      attempt(c, `select public.stamp_payout_transfer($1, 'TRF_second_stamp', 'other-ref')`, [payoutId]),
    );
    assert.equal(r.ok, false, 'a second transfer code was stamped onto a payout');
    assert.equal((await payoutRow(payoutId)).transfer_code, 'TRF_first_stamp');
  });

  it('refuses a stamp whose reference is not the one that was claimed', async () => {
    await setHostVerified(host.id);
    await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    const payoutId = await onlyPayoutId();
    for (const step of ['processing', 'approved']) {
      await asUser(finance.id, (c) => attempt(c, `select public.transition_payout($1, $2)`, [payoutId, step]));
    }
    const claim = await asService((c) => attemptValue<string>(c, `select public.claim_payout_transfer($1)`, [payoutId]));

    const r = await asService((c) =>
      attempt(c, `select public.stamp_payout_transfer($1, 'TRF_wrongref', 'a-reference-nobody-claimed')`, [payoutId]),
    );
    assert.equal(r.ok, false, 'a stamp with a mismatched reference was accepted');
    assert.equal((await payoutRow(payoutId)).transfer_reference, claim.value);
  });

  it('will not release a claim once a transfer code exists', async () => {
    // By then the transfer is real. The next step is to read it back from
    // Paystack, not to forget that it happened.
    const payoutId = await approvedPayoutWithTransfer('TRF_real');
    const r = await asService((c) => attempt(c, `select public.release_payout_transfer_claim($1)`, [payoutId]));
    assert.equal(r.ok, false, 'a live transfer claim was released, allowing a duplicate send');
  });

  it('parks a payout whose attempt never reported a code', async () => {
    // The dangerous state: Paystack may or may not have accepted the transfer
    // and nothing here can tell. A second transfer risks paying the host twice.
    await setHostVerified(host.id);
    await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    const payoutId = await onlyPayoutId();
    for (const step of ['processing', 'approved']) {
      await asUser(finance.id, (c) => attempt(c, `select public.transition_payout($1, $2)`, [payoutId, step]));
    }
    await asService((c) => attempt(c, `select public.claim_payout_transfer($1)`, [payoutId]));

    const client = await adminClient();
    // The claim has aged out of its window, so a retry is permitted to be
    // *attempted* — and then refused because the fate of the first is unknown.
    await client.query(
      `update public.payouts
          set transfer_attempted_at = transfer_attempted_at - interval '1 hour'
        where id = $1`,
      [payoutId],
    );
    const r = await asService((c) => attempt(c, `select public.claim_payout_transfer($1)`, [payoutId]));
    assert.equal(r.ok, false, 'a payout with an unknown-outcome attempt was retried automatically');
    assert.match(r.error ?? '', /never reported a code/);
  });

  it('refuses to claim a payout that is not approved', async () => {
    await setHostVerified(host.id);
    await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    const payoutId = await onlyPayoutId();
    const r = await asService((c) => attempt(c, `select public.claim_payout_transfer($1)`, [payoutId]));
    assert.equal(r.ok, false, 'a pending payout was claimed for transfer');
  });

  it('refuses to claim a payout awaiting reconciliation, and allows it after finance resolves it', async () => {
    const payoutId = await approvedPayoutWithTransfer('TRF_rev_claim');
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_rev_claim')`, [payoutId]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-claim', 'TRF_rev_claim', 'Reversed', 1)`, [payoutId]),
    );

    // While the reversal is unreviewed the money came back, so sending it again
    // without a decision would be sending it on the assumption the reversal
    // was a mistake.
    const unreviewed = await asService((c) => attempt(c, `select public.claim_payout_transfer($1)`, [payoutId]));
    assert.equal(unreviewed.ok, false, 'a reversed payout could be sent again before review');
    assert.match(unreviewed.error ?? '', /awaiting review/);

    // Once finance has explicitly resolved it, a retry is a genuine decision
    // and the payout is claimable like any other approved payout.
    const resolved = await asUser(finance.id, (c) => attempt(c, `select public.transition_payout($1, 'approved')`, [payoutId]));
    assert.equal(resolved.ok, true, `finance could not resolve the reversal: ${resolved.error}`);

    const retried = await asService((c) => attemptValue<string>(c, `select public.claim_payout_transfer($1)`, [payoutId]));
    assert.equal(retried.ok, true, `a resolved reversal could not be retried: ${retried.error}`);
  });

  it('will not let one provider code be attached to two payouts', async () => {
    // A code identifies exactly one transfer, so it can only belong to one
    // payout. Without this, a mis-stamp would make the webhook match ambiguously
    // and the wrong host's payout would be marked paid.
    await approvedPayoutWithTransfer('TRF_unique');
    const client = await adminClient();
    const { rows: banks } = await client.query(`select id from public.host_bank_accounts limit 1`);
    const r = await client
      .query(
        `insert into public.payouts
           (organizer_id, period_start, period_end, amount, bank_account_id, transfer_code)
         values ($1, current_date, current_date, 100, $2, 'TRF_unique')`,
        [otherHost.id, banks[0].id],
      )
      .then(() => ({ ok: true }))
      .catch((e: { message: string }) => ({ ok: false, message: e.message }));
    assert.equal(r.ok, false, 'a provider code was attached to a second payout');
  });
});

// ---------------------------------------------------------------------------
// PART 3d — the explicit transfer state, the history, and the privilege boundary
// ---------------------------------------------------------------------------

/** An approved payout that has not been claimed, i.e. nothing in flight. */
async function plainApprovedPayout(): Promise<number> {
  await setHostVerified(host.id);
  const requested = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
  assert.equal(requested.ok, true, `request_payout failed: ${requested.error}`);
  const payoutId = await newestPayoutId();
  for (const step of ['processing', 'approved']) {
    const r = await asUser(finance.id, (c) =>
      attempt(c, `select public.transition_payout($1, $2)`, [payoutId, step]),
    );
    assert.equal(r.ok, true, `transition to ${step} failed: ${r.error}`);
  }
  return payoutId;
}

/**
 * A payout whose transfer has been claimed but for which Paystack never returned
 * a code — the state a send that was accepted and then lost leaves behind.
 */
async function claimedButUnstampedPayout(): Promise<number> {
  const payoutId = await plainApprovedPayout();
  const r = await asService((c) => attemptValue<string>(c, `select public.claim_payout_transfer($1)`, [payoutId]));
  assert.equal(r.ok, true, `claim failed: ${r.error}`);
  return payoutId;
}

/** Claims a transfer on a fresh approved payout and returns it with its code. */
async function payoutWithClaimedTransfer(code = 'TRF_claimed_001'): Promise<{ id: number; reference: string }> {
  const payoutId = await approvedPayoutWithTransfer(code);
  const row = await payoutRow(payoutId);
  return { id: payoutId, reference: row.transfer_reference };
}

describe('a transfer in flight is its own state', () => {
  it('claiming a transfer moves the payout to transfer_pending', async () => {
    const payoutId = await approvedPayoutWithTransfer();
    const row = await payoutRow(payoutId);
    assert.equal(row.status, 'transfer_pending', 'the claim did not change the status');
    assert.ok(row.transfer_reference, 'no reference was recorded for the webhook to match');
    assert.ok(row.transfer_attempted_at, 'the attempt was not timestamped');
  });

  it('a second claim on the same payout is refused', async () => {
    await approvedPayoutWithTransfer();
    const id = await onlyPayoutId();
    const again = await asService((c) => attempt(c, `select public.claim_payout_transfer($1)`, [id]));
    assert.equal(again.ok, false, 'a second transfer was claimed for one payout');
  });

  it('a host cannot claim a transfer for themselves', async () => {
    const payoutId = await approvedPayoutWithTransfer();
    const r = await asUser(host.id, (c) => attempt(c, `select public.claim_payout_transfer($1)`, [payoutId]));
    assert.equal(r.ok, false, 'a host claimed a transfer');
  });

  it('a host cannot mark their own payout paid', async () => {
    const payoutId = await approvedPayoutWithTransfer();
    const r = await asUser(host.id, (c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_forged')`, [payoutId]));
    assert.equal(r.ok, false, 'a host marked a payout paid');
  });

  it('a host cannot put a payout into transfer_pending by hand', async () => {
    // transfer_pending asserts that money is at the bank. Only the platform knows
    // that, so a client must not be able to claim it. The fixture is a payout with
    // nothing in flight, otherwise the status would already be transfer_pending and
    // the test would prove nothing.
    const payoutId = await plainApprovedPayout();
    const r = await asUser(host.id, (c) =>
      attempt(c, `update public.payouts set status = 'transfer_pending' where id = $1`, [payoutId]),
    );
    assert.equal(r.ok, false, 'a host set transfer_pending directly');
    const row = await payoutRow(payoutId);
    assert.equal(row.status, 'approved', 'the payout was moved into transfer_pending by a client');
  });

  it('a payout awaiting the bank cannot be rejected', async () => {
    // The transfer is at the bank. Rejecting would write off revenue the host may
    // well receive, so the state machine only allows giving the claim back.
    const payoutId = await approvedPayoutWithTransfer();
    const r = await asUser(finance.id, (c) =>
      attempt(c, `select public.transition_payout($1, 'rejected')`, [payoutId]),
    );
    assert.equal(r.ok, false, 'a transfer_pending payout was rejected');
  });

  it('a claim whose transfer never went out can be given back', async () => {
    // Paystack accepted nothing and returned no code, so there is no transfer in
    // the world to be confused about and the payout is safe to try again.
    const payoutId = await claimedButUnstampedPayout();
    const r = await asService((c) => attempt(c, `select public.release_payout_transfer_claim($1)`, [payoutId]));
    assert.equal(r.ok, true, `releasing the claim failed: ${r.error}`);
    const row = await payoutRow(payoutId);
    assert.equal(row.status, 'approved');
    assert.equal(row.transfer_attempted_at, null);
    assert.equal(row.transfer_reference, null);

    const client = await adminClient();
    const { rows } = await client.query(
      `select status from public.payout_transfer_attempts where payout_id = $1`,
      [payoutId],
    );
    assert.equal(rows[0].status, 'failed', 'the abandoned attempt was left open');
  });

  it('a claim cannot be released once a code exists', async () => {
    const payoutId = await approvedPayoutWithTransfer();
    const r = await asService((c) => attempt(c, `select public.release_payout_transfer_claim($1)`, [payoutId]));
    assert.equal(r.ok, false, 'a stamped transfer had its claim released, allowing a duplicate send');
  });
});

describe('provider identifiers are written once', () => {
  it('fills an empty reference rather than inventing one', async () => {
    // The claim always records a reference, so a payout reaching mark_payout_paid
    // with none means the value was lost somewhere. It is filled from the delivery
    // if the provider echoed one.
    const payoutId = await approvedPayoutWithTransfer('TRF_ref_001');
    const r = await asService((c) =>
      attempt(c, `select public.mark_payout_paid($1, 'TRF_ref_001', 'ref-from-provider')`, [payoutId]),
    );
    assert.equal(r.ok, true, `mark_payout_paid failed: ${r.error}`);
    const row = await payoutRow(payoutId);
    assert.equal(row.status, 'paid');
    assert.ok(row.transfer_reference, 'no reference was stored');
  });

  it('leaves an existing reference exactly as claimed', async () => {
    const { id, reference } = await payoutWithClaimedTransfer('TRF_ref_002');
    const r = await asService((c) =>
      attempt(c, `select public.mark_payout_paid($1, 'TRF_ref_002', $2)`, [id, 'something-else']),
    );
    assert.equal(r.ok, true, `mark_payout_paid failed: ${r.error}`);
    const row = await payoutRow(id);
    assert.equal(
      row.transfer_reference,
      reference,
      'a delivery replaced the reference the claim had recorded',
    );
  });

  it('refuses a delivery carrying a different code for the same payout', async () => {
    // Silently accepting this would leave the payout pointing at one transfer
    // while the ledger recorded another, which is the exact failure the whole
    // chain of migrations exists to prevent.
    const payoutId = await approvedPayoutWithTransfer('TRF_real_001');
    const r = await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_impostor')`, [payoutId]));
    assert.equal(r.ok, false, 'a second, different code was accepted');
    const row = await payoutRow(payoutId);
    assert.equal(row.transfer_code, 'TRF_real_001', 'the original code was overwritten');
  });

  it('a redelivery of the same code is a no-op', async () => {
    const payoutId = await approvedPayoutWithTransfer('TRF_repeat_001');
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_repeat_001')`, [payoutId]));
    const first = await payoutRow(payoutId);
    const again = await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_repeat_001')`, [payoutId]));
    assert.equal(again.ok, true, `a redelivery of the same code was refused: ${again.error}`);
    const second = await payoutRow(payoutId);
    assert.equal(second.paid_at?.toISOString(), first.paid_at.toISOString(), 'paid_at moved on redelivery');
  });
});

describe('every transfer attempt is kept, not just the current one', () => {
  it('records an attempt when the transfer is claimed', async () => {
    const { id, reference } = await payoutWithClaimedTransfer('TRF_hist_001');
    const client = await adminClient();
    const { rows } = await client.query(
      `select attempt_number, transfer_reference, transfer_code, status
         from public.payout_transfer_attempts where payout_id = $1`,
      [id],
    );
    assert.equal(rows.length, 1, 'claiming a transfer left no history');
    assert.equal(rows[0].transfer_reference, reference);
    assert.equal(rows[0].transfer_code, 'TRF_hist_001');
    assert.equal(rows[0].status, 'claimed');
  });

  it('closes the attempt when the transfer is confirmed', async () => {
    const { id } = await payoutWithClaimedTransfer('TRF_hist_002');
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_hist_002')`, [id]));
    const client = await adminClient();
    const { rows } = await client.query(
      `select status, closed_at from public.payout_transfer_attempts where payout_id = $1`,
      [id],
    );
    assert.equal(rows[0].status, 'sent');
    assert.ok(rows[0].closed_at, 'the attempt was never closed');
  });

  it('keeps the original attempt after a reversal is resolved for a retry', async () => {
    // The defect this guards: clearing the active fields to allow a retry also
    // erased the only record that a transfer had ever been attempted.
    const payoutId = await approvedPayoutWithTransfer('TRF_erased_001');
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_erased_001')`, [payoutId]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-KEEP', 'TRF_erased_001', 'Account closed', 935000)`, [
        payoutId,
      ]),
    );
    const claimed = await payoutRow(payoutId);

    const resolve = await asUser(finance.id, (c) =>
      attempt(c, `select public.transition_payout($1, 'approved')`, [payoutId]),
    );
    assert.equal(resolve.ok, true, `resolving the reconciliation failed: ${resolve.error}`);

    const row = await payoutRow(payoutId);
    // The active fields are disposable, and must be cleared for a retry.
    assert.equal(row.transfer_code, null, 'the old code still blocks matching the next transfer');
    assert.equal(row.transfer_reference, null);
    assert.equal(row.transfer_attempted_at, null);
    // The historical facts are not disposable.
    assert.equal(row.reversed_at?.toISOString(), claimed.reversed_at.toISOString(), 'the reversal date was lost');
    assert.equal(row.reversal_code, 'TRF_erased_001');
    assert.equal(row.reversal_reference, 'REV-KEEP');
    assert.ok(row.paid_at, 'the original paid date was erased');

    const client = await adminClient();
    const { rows } = await client.query(
      `select transfer_code, status, reversal_reason
         from public.payout_transfer_attempts where payout_id = $1`,
      [payoutId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].transfer_code, 'TRF_erased_001', 'the attempt history lost the provider code');
    assert.equal(rows[0].status, 'reversed');
    assert.equal(rows[0].reversal_reason, 'Account closed', 'the reason the bank gave was discarded');
  });

  it('allows a second attempt after a reversal is resolved', async () => {
    // The regression this fixes: 00039 cleared the active fields on retry but
    // left transfer_attempted_at set, so every subsequent claim was refused with
    // "a previous attempt never reported a code" and the payout was stuck.
    const payoutId = await approvedPayoutWithTransfer('TRF_retry_001');
    await asService((c) => attempt(c, `select public.mark_payout_paid($1, 'TRF_retry_001')`, [payoutId]));
    await asService((c) =>
      attempt(c, `select public.record_payout_reversal($1, 'REV-RETRY', 'TRF_retry_001', 'Reversed', 935000)`, [
        payoutId,
      ]),
    );
    await asUser(finance.id, (c) => attempt(c, `select public.transition_payout($1, 'approved')`, [payoutId]));

    const reference = await asService((c) => attemptValue<string>(c, `select public.claim_payout_transfer($1)`, [payoutId]));
    assert.equal(reference.ok, true, `the retry could not be claimed: ${reference.error}`);

    const client = await adminClient();
    const { rows } = await client.query(
      `select attempt_number, status from public.payout_transfer_attempts where payout_id = $1 order by attempt_number`,
      [payoutId],
    );
    assert.equal(rows.length, 2, 'the retry did not open a second attempt');
    assert.equal(rows[0].status, 'reversed');
    assert.equal(rows[1].attempt_number, 2);
  });

  it('will not let one provider code appear on two attempts', async () => {
    const payoutId = await approvedPayoutWithTransfer('TRF_attempt_dup');
    const client = await adminClient();
    const r = await client
      .query(
        `insert into public.payout_transfer_attempts
           (payout_id, attempt_number, transfer_reference, amount, transfer_code)
         values ($1, 2, 'other-ref', 100, 'TRF_attempt_dup')`,
        [payoutId],
      )
      .then(() => ({ ok: true }))
      .catch((e: { message: string }) => ({ ok: false, message: e.message }));
    assert.equal(r.ok, false, 'a provider code was reused across attempts');
  });
});

describe('the platform functions are not reachable by ordinary users', () => {
  const serviceOnly: ReadonlyArray<{ fn: string; call: string }> = [
    { fn: 'mark_payout_paid', call: `select public.mark_payout_paid(1, 'TRF_x')` },
    { fn: 'record_payout_reversal', call: `select public.record_payout_reversal(1, 'R', 'C', 'r', 1)` },
    { fn: 'claim_payout_transfer', call: `select public.claim_payout_transfer(1)` },
    { fn: 'stamp_payout_transfer', call: `select public.stamp_payout_transfer(1, 'TRF_x', 'r')` },
    { fn: 'release_payout_transfer_claim', call: `select public.release_payout_transfer_claim(1)` },
    { fn: 'register_bank_account', call: `select public.register_bank_account(gen_random_uuid(), 'b', 'b', 'a', '1234', 'RCP_x')` },
  ];

  for (const { fn, call } of serviceOnly) {
    it(`a signed-in user cannot call ${fn}`, async () => {
      const r = await asUser(host.id, (c) => attempt(c, call));
      assert.equal(r.ok, false, `${fn} was executable by an ordinary user`);
    });

    it(`anonymous cannot call ${fn}`, async () => {
      const r = await asAnon((c) => attempt(c, call));
      assert.equal(r.ok, false, `${fn} was executable by anon`);
    });
  }

  it('every payout money function has a fixed search_path and a controlled owner', async () => {
    const client = await adminClient();
    // Two different jobs, two different rules.
    //
    // A function that reads or writes money on a caller's behalf must be
    // SECURITY DEFINER, or an RLS-restricted caller could not reach the row.
    //
    // A trigger guard must NOT be. It only inspects NEW and OLD, so it needs no
    // elevated rights, and SECURITY DEFINER actively breaks it: inside a
    // definer function current_user is the owner for every request, so a guard
    // written as `current_user not in ('anon','authenticated')` compares the
    // owner against the list, finds it absent, and returns NEW without checking
    // a single column. guard_payout_money_columns shipped that way in 00039 and
    // 00040 and never fired once; 00041 corrects it to SECURITY INVOKER.
    const dataFunctions = [
      'mark_payout_paid', 'record_payout_reversal', 'claim_payout_transfer',
      'stamp_payout_transfer', 'release_payout_transfer_claim',
      'transition_payout', 'request_payout', 'register_bank_account',
      'remove_bank_account', 'record_transfer_event', 'has_active_payout_freeze',
      'release_payout_freeze',
    ];
    const triggerGuards = ['guard_payout_money_columns'];

    const { rows } = await client.query(
      `select p.proname,
              p.prosecdef as is_definer,
              p.proconfig,
              pg_get_userbyid(p.proowner) as owner
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any($1::text[])`,
      [[...dataFunctions, ...triggerGuards]],
    );
    assert.equal(
      rows.length,
      dataFunctions.length + triggerGuards.length,
      'every function under test must exist',
    );

    for (const row of rows) {
      const isGuard = triggerGuards.includes(row.proname);
      assert.equal(
        row.is_definer,
        !isGuard,
        isGuard
          ? `${row.proname} is a trigger guard and must be SECURITY INVOKER, or current_user is meaningless inside it`
          : `${row.proname} is not SECURITY DEFINER`,
      );
      assert.deepEqual(
        row.proconfig,
        ['search_path=public'],
        `${row.proname} does not pin search_path`,
      );
      assert.notEqual(
        row.owner,
        'authenticated',
        `${row.proname} is owned by a role the application signs in as`,
      );
    }
  });

  it('the payout money guard actually refuses a client edit', async () => {
    // The invariant above is only worth anything if the guard runs. This is the
    // test that was missing while 00039/00040 shipped a guard that could not
    // fire: pg_proc said SECURITY DEFINER, so the shape looked right, and the
    // function silently approved every edit it was written to reject.
    const client = await adminClient();
    await setHostVerified(host.id);
    await setAccountStatus(host.id, 'active');
    await registerBankAccount(host.id);
    const payoutId = await asUser(host.id, (c) => attemptValue<number>(c, `select public.request_payout()`));
    assert.equal(payoutId.ok, true, `request_payout failed: ${payoutId.error}`);

    // A host owns their payout row, so RLS permits this UPDATE. Only the guard
    // can stop it - which is exactly why the guard has to work.
    const edit = await asUser(host.id, (c) =>
      attempt(c, `update public.payouts set amount = 5000000, revenue = 5000000 where id = $1`, [
        payoutId.value,
      ]),
    );
    assert.equal(
      edit.ok,
      false,
      'the host rewrote their own payout figures - the guard did not fire',
    );
    assert.equal(edit.errorCode, '42501');

    const after = await asUser(host.id, (c) =>
      attemptValue<number>(c, `select amount from public.payouts where id = $1`, [payoutId.value]),
    );
    assert.ok(Number(after.value) < 5_000_000, 'the payout amount is unchanged');
  });

  it('the internal timing constant is not part of the client API', async () => {
    const client = await adminClient();
    const { rows } = await client.query(
      `select has_function_privilege('anon', 'public.constant_payout_claim_timeout()', 'execute') as anon_can,
              has_function_privilege('authenticated', 'public.constant_payout_claim_timeout()', 'execute') as auth_can,
              has_function_privilege('anon', 'public.guard_payout_money_columns()', 'execute') as anon_trigger,
              has_function_privilege('service_role', 'public.assert_service_role()', 'execute') as service_can_assert`,
    );
    assert.equal(rows[0].anon_can, false, 'anon can call the claim timeout');
    assert.equal(rows[0].auth_can, false, 'a signed-in user can call the claim timeout');
    assert.equal(rows[0].anon_trigger, false, 'anon can call the money guard trigger');
    assert.equal(rows[0].service_can_assert, true, 'the service role lost the ability to assert itself');
  });
});

describe('a delivery for a settled attempt is recognised and not applied', () => {
  it('a transfer.sent for a reversed attempt is never marked paid', () => {
    // The case the separate decision function exists for: the attempt is closed
    // and reversed, and the payout may meanwhile be approved for a retry. Reading
    // the live status would return something markable, and money that came back
    // would be recorded as sent.
    const d = decideClosedAttemptAction('transfer.sent', 'reversed');
    assert.equal(d.action, 'already_handled');
    assert.equal(d.outcome, 'prior_attempt_reversed');
  });

  it('any delivery for a closed attempt is a no-op', () => {
    for (const event of ['transfer.sent', 'transfer.reversed', 'transfer.failed', 'transfer.pending']) {
      for (const status of ['sent', 'failed', 'abandoned', 'reversed']) {
        const d = decideClosedAttemptAction(event, status);
        assert.equal(d.action, 'already_handled', `${event} on a ${status} attempt was not a no-op`);
      }
    }
  });

  it('a transfer.sent for a transfer still in flight marks the payout paid', () => {
    // The ordinary asynchronous settlement. Before transfer_pending existed this
    // state was 'approved' with a recent timestamp, told apart by a convention
    // rather than by the value itself.
    const d = decideTransferAction('transfer.sent', 'transfer_pending');
    assert.equal(d.action, 'mark_paid');
  });

  it('a failed transfer in flight becomes retryable', () => {
    assert.equal(decideTransferAction('transfer.failed', 'transfer_pending').action, 'reset_for_retry');
    assert.equal(decideTransferAction('transfer.pending', 'transfer_pending').action, 'reset_for_retry');
  });

  it('a transfer cannot be reversed before it was confirmed sent', () => {
    // Forced through, this would put a payout into reconciliation_required that
    // was never actually paid out.
    const d = decideTransferAction('transfer.reversed', 'transfer_pending');
    assert.equal(d.action, 'unexpected_state');
  });

  it('a redelivered transfer.sent cannot undo a reversal', () => {
    const d = decideTransferAction('transfer.sent', 'reconciliation_required');
    assert.equal(d.action, 'unexpected_state');
  });
});
