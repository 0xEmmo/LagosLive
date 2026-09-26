import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminClient,
  asService,
  asUser,
  attempt,
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
 * PART 3 — server-authoritative payouts.
 *
 * The request route used to insert revenue, platform_fee and amount straight
 * from the browser with the service client, so a host could ask for money they
 * had not earned. The UPDATE policy on payouts has no WITH CHECK either, which
 * meant anyone holding payouts.process could rewrite the amount or redirect
 * organizer_id. These tests pin the requirement: the server decides the
 * figures, the money columns are immutable afterwards, and status only moves
 * along the state machine.
 */

let host: TestUser;
let finance: TestUser;
let partyId: number;
let confirmedOrderId: string;
let unpaidOrderId: string;
let bankAccountId: string;

async function payoutIds(): Promise<number[]> {
  const client = await adminClient();
  const { rows } = await client.query(
    `select id from public.payouts order by id`,
  );
  return rows.map((r) => Number(r.id));
}

/**
 * Puts the shared fixtures back to their initial state between tests.
 *
 * The host's verification status is reset too: it is the one piece of state a
 * test can flip and leave behind, and a leftover "verified" from a previous test
 * would make the "unverified host" case pass for the wrong reason.
 */
async function resetPayouts() {
  const client = await adminClient();
  // payout_items only exists once the payout migration has run. Guarding the
  // cleanup on its existence keeps these tests running against the unrepaired
  // schema, so the failure they report is the vulnerability rather than an
  // unrelated "relation does not exist".
  const { rows: itemsExists } = await client.query(
    `select to_regclass('public.payout_items') is not null as present`,
  );
  if (itemsExists[0].present) {
    await client.query(`delete from public.payout_items`);
  }
  await client.query(`delete from public.payouts`);
  // One genuinely paid order worth 11000, one unpaid order worth 5500.
  await client.query(
    `update public.orders
        set payment_status = 'confirmed', status = 'confirmed', refund_status = 'none',
            refund_amount = 0, check_in_status = 'unchecked'
      where id = $1`,
    [confirmedOrderId],
  );
  await client.query(
    `update public.orders
        set payment_status = 'pending', status = 'pending', refund_status = 'none',
            refund_amount = 0
      where id = $1`,
    [unpaidOrderId],
  );
  await setHostVerified(host.id, false);
  await setAccountStatus(host.id, 'active');
  // Every test that is allowed to request a payout registers the account it
  // needs itself, so "a host with no bank account is refused" stays testable
  // alongside the tests that expect a payout to succeed.
  const client2 = await adminClient();
  await client2.query(`delete from public.host_bank_accounts`);
  bankAccountId = await registerBankAccount(host.id);
}

before(async () => {
  await truncateAll();
  host = await createAuthUser('host@example.com');
  finance = await createAuthUser('finance@example.com');
  await setLegacyRole(host.id, 'organizer');
  await setLegacyRole(finance.id, 'finance');
  partyId = await createParty(host.id);
  confirmedOrderId = await createOrder(partyId, { total: 11000, quantity: 2 });
  unpaidOrderId = await createOrder(partyId, { total: 5500, quantity: 1 });
});

beforeEach(resetPayouts);

after(async () => {
  await closeAdmin();
});

describe('payouts: the server decides the figures', () => {
  it('a verified host can request a payout for real collected revenue', async () => {
    const client = await adminClient();
    await setHostVerified(host.id);

    const result = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(result.ok, true, `request_payout failed: ${result.error}`);

    const { rows } = await client.query(
      `select revenue, platform_fee, amount, status from public.payouts`,
    );
    assert.equal(rows.length, 1);
    // ₦11,000 collected, 15% fee, ₦9,350 net — all computed in the database
    // from confirmed orders, not from anything the caller sent.
    assert.equal(Number(rows[0].revenue), 11000);
    assert.equal(Number(rows[0].platform_fee), 1650);
    assert.equal(Number(rows[0].amount), 9350);
    assert.equal(rows[0].status, 'pending');
  });

  it('records the verified bank account, never a client-supplied one', async () => {
    const client = await adminClient();
    await setHostVerified(host.id);
    const result = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(result.ok, true, `request_payout failed: ${result.error}`);

    const { rows } = await client.query(
      `select bank_account_id, bank_last4 from public.payouts`,
    );
    assert.equal(rows[0].bank_account_id, bankAccountId, 'the payout is not bound to the verified account');
    // Copied from the verified record, not supplied by the caller.
    assert.equal(rows[0].bank_last4, '0123');
  });

  it('refuses a host with no verified bank account', async () => {
    const client = await adminClient();
    await setHostVerified(host.id);
    // Clear the account that beforeEach registered.
    await client.query(`delete from public.host_bank_accounts`);

    const result = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(result.ok, false, 'a host with no verified bank account could request a payout');

    const { rows } = await client.query(`select count(*)::int as n from public.payouts`);
    assert.equal(rows[0].n, 0);
  });

  it('ignores orders that were never paid', async () => {
    const client = await adminClient();
    await setHostVerified(host.id);
    const { rows: before } = await client.query(
      `select coalesce(sum(total), 0)::int as t from public.orders where payment_status = 'confirmed'`,
    );
    assert.equal(Number(before[0].t), 11000, 'fixture should have exactly one paid order');
    // The unpaid 5500 order exists and belongs to the same host; it must not
    // reach the payout.
    const { rows: unpaid } = await client.query(`select total from public.orders where id = $1`, [
      unpaidOrderId,
    ]);
    assert.equal(Number(unpaid[0].total), 5500);

    const result = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(result.ok, true, `request_payout failed: ${result.error}`);
    const { rows } = await client.query(`select revenue from public.payouts`);
    assert.equal(Number(rows[0].revenue), 11000, 'an unpaid order was counted as revenue');
  });

  it('excludes revenue that was refunded', async () => {
    const client = await adminClient();
    await setHostVerified(host.id);
    await client.query(
      `update public.orders set refund_status = 'refunded', refund_amount = 11000 where id = $1`,
      [confirmedOrderId],
    );
    const result = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(result.ok, false, 'a fully refunded host could still request a payout');
    const { rows } = await client.query(`select count(*)::int as n from public.payouts`);
    assert.equal(rows[0].n, 0);
  });

  it('will not pay the same revenue out twice', async () => {
    const client = await adminClient();
    await setHostVerified(host.id);
    const first = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(first.ok, true, `first request failed: ${first.error}`);

    const second = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(second.ok, false, 'the same revenue was paid out twice');

    const { rows } = await client.query(`select count(*)::int as n from public.payouts`);
    assert.equal(rows[0].n, 1);
  });

  it('refuses a host who is not verified or not active', async () => {
    const unverified = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(unverified.ok, false, 'an unverified host could request a payout');

    await setHostVerified(host.id);
    await setAccountStatus(host.id, 'suspended');
    const suspended = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(suspended.ok, false, 'a suspended host could request a payout');
    await setAccountStatus(host.id, 'active');
  });

  it("cannot claim another host's revenue", async () => {
    const client = await adminClient();
    const other = await createAuthUser('other-host@example.com');
    await setLegacyRole(other.id, 'organizer');
    await setHostVerified(other.id);

    // `other` is fully verified and eligible in every respect except that they
    // host no orders. The ₦11,000 belongs to `host`, so `other` must be able to
    // call the function and still be refused: revenue is derived from the
    // caller's own parties, never from anything the caller can name.
    const result = await asUser(other.id, (c) =>
      attempt(c, `select public.request_payout()`),
    );
    assert.equal(result.ok, false, "a host with no orders was paid out of another host's revenue");

    const { rows } = await client.query(`select organizer_id from public.payouts`);
    assert.equal(rows.length, 0, 'a payout was created for a host who has no revenue');
  });

  it('an anonymous caller cannot request a payout', async () => {
    const { asAnon } = await import('./helpers.ts');
    const result = await asAnon((c) => attempt(c, `select public.request_payout()`));
    assert.equal(result.ok, false, 'an anonymous caller could create a payout');
  });
});

describe('payouts: the money columns are immutable', () => {
  beforeEach(async () => {
    await setHostVerified(host.id);
    await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
  });

  it('finance cannot inflate the amount', async () => {
    const [payoutId] = await payoutIds();
    const result = await asUser(finance.id, (c) =>
      attempt(c, `update public.payouts set amount = 99999999 where id = $1`, [payoutId]),
    );
    assert.equal(result.ok, false, 'a finance user inflated a payout amount');
    const client = await adminClient();
    const { rows } = await client.query(`select amount from public.payouts where id = $1`, [payoutId]);
    assert.equal(Number(rows[0].amount), 9350);
  });

  it('finance cannot redirect a payout to another account', async () => {
    const [payoutId] = await payoutIds();
    const result = await asUser(finance.id, (c) =>
      attempt(c, `update public.payouts set organizer_id = $2 where id = $1`, [payoutId, finance.id]),
    );
    assert.equal(result.ok, false, 'a payout was redirected to another account');
    const client = await adminClient();
    const { rows } = await client.query(`select organizer_id from public.payouts where id = $1`, [payoutId]);
    assert.equal(rows[0].organizer_id, host.id);
  });

  it('the host cannot rewrite their own payout figures', async () => {
    const [payoutId] = await payoutIds();
    const result = await asUser(host.id, (c) =>
      attempt(c, `update public.payouts set amount = 500000, revenue = 500000 where id = $1`, [
        payoutId,
      ]),
    );
    assert.equal(result.ok, false, 'a host rewrote their own payout');
  });
});

describe('payouts: status follows a state machine', () => {
  beforeEach(async () => {
    await setHostVerified(host.id);
    await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
  });

  async function status(): Promise<string> {
    const client = await adminClient();
    const { rows } = await client.query(`select status from public.payouts limit 1`);
    return rows[0].status;
  }

  it('walks pending -> processing -> approved', async () => {
    const [payoutId] = await payoutIds();
    for (const step of ['processing', 'approved']) {
      const r = await asUser(finance.id, (c) =>
        attempt(c, `select public.transition_payout($1, $2)`, [payoutId, step]),
      );
      assert.equal(r.ok, true, `transition to ${step} failed: ${r.error}`);
      assert.equal(await status(), step);
    }
  });

  it('refuses to skip straight from pending to paid', async () => {
    const [payoutId] = await payoutIds();
    const r = await asUser(finance.id, (c) =>
      attempt(c, `select public.transition_payout($1, 'paid')`, [payoutId]),
    );
    assert.equal(r.ok, false, 'a payout was marked paid without approval');
    assert.equal(await status(), 'pending');
  });

  it('refuses to move a paid payout back', async () => {
    const [payoutId] = await payoutIds();
    for (const step of ['processing', 'approved']) {
      await asUser(finance.id, (c) =>
        attempt(c, `select public.transition_payout($1, $2)`, [payoutId, step]),
      );
    }
    // Marking paid requires a verified provider result, so there is no way for
    // finance to reach the terminal state directly.
    const back = await asUser(finance.id, (c) =>
      attempt(c, `select public.transition_payout($1, 'processing')`, [payoutId]),
    );
    assert.equal(back.ok, false, 'a payout moved backwards after being approved');
  });

  it('cannot be transitioned by a user without the payout permission', async () => {
    const [payoutId] = await payoutIds();
    const r = await asUser(host.id, (c) =>
      attempt(c, `select public.transition_payout($1, 'processing')`, [payoutId]),
    );
    assert.equal(r.ok, false, 'a host advanced their own payout without permission');
    assert.equal(await status(), 'pending');
  });

  it('records an audit row for every transition', async () => {
    const [payoutId] = await payoutIds();
    await asUser(finance.id, (c) =>
      attempt(c, `select public.transition_payout($1, 'processing')`, [payoutId]),
    );
    const client = await adminClient();
    const { rows } = await client.query(
      `select count(*)::int as n from public.audit_logs
        where target_type = 'payout' and target_id = $1`,
      [String(payoutId)],
    );
    assert.ok(rows[0].n > 0, 'the status change was not audit-logged');
  });

  it('is idempotent when the same step is repeated', async () => {
    const [payoutId] = await payoutIds();
    const first = await asUser(finance.id, (c) =>
      attempt(c, `select public.transition_payout($1, 'processing')`, [payoutId]),
    );
    const again = await asUser(finance.id, (c) =>
      attempt(c, `select public.transition_payout($1, 'processing')`, [payoutId]),
    );
    assert.equal(first.ok, true);
    assert.equal(again.ok, true, 'repeating a completed step should be a no-op, not an error');
  });
});

describe('payouts: only a verified provider result marks a payout paid', () => {
  beforeEach(async () => {
    await setHostVerified(host.id);
    await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    const [payoutId] = await payoutIds();
    for (const step of ['processing', 'approved']) {
      await asUser(finance.id, (c) =>
        attempt(c, `select public.transition_payout($1, $2)`, [payoutId, step]),
      );
    }
  });

  it('finance cannot mark it paid without a transfer reference', async () => {
    const [payoutId] = await payoutIds();
    const r = await asUser(finance.id, (c) =>
      attempt(c, `select public.mark_payout_paid($1, $2)`, [payoutId, 'TRF_fake']),
    );
    assert.equal(r.ok, false, 'a user-facing call marked a payout paid');
  });

  it('service role marks it paid and stamps paid_at', async () => {
    const [payoutId] = await payoutIds();
    const r = await asService((c) =>
      attempt(c, `select public.mark_payout_paid($1, 'TRF_verified_123', 'ref-abc')`, [payoutId]),
    );
    assert.equal(r.ok, true, `mark_payout_paid failed: ${r.error}`);
    const client = await adminClient();
    const { rows } = await client.query(
      `select status, paid_at is not null as stamped from public.payouts where id = $1`,
      [payoutId],
    );
    assert.equal(rows[0].status, 'paid');
    assert.equal(rows[0].stamped, true);
  });
});
