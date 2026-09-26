/**
 * Refunds: a ledger, not a hopeful read of a response body.
 *
 * Every test here corresponds to a way real money goes missing:
 *  - a refusal recorded as a success, because the word "refund" was in the text
 *  - the same guest refunded twice, because nothing was written before the call
 *  - a cancelled event whose tickets stayed sold forever
 *  - revenue paid out to a host for a ticket whose refund is still queued
 *
 * The tests call the real database functions. Where a test needs to observe
 * something the API role cannot do (seed a confirmed order, set refund state
 * directly) it uses the owner connection, which is the same session a migration
 * runs in, and says so.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  adminClient,
  asService,
  asOwner,
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

let finance: TestUser;
let host: TestUser;
let outsider: TestUser;
/**
 * Declining or parking a refund needs `orders.refund`, which only super_admin
 * holds. The finance role holds `transactions.refund` instead - the right to
 * actually send money back. Keeping the two apart is deliberate: deciding a
 * guest gets nothing is not the same power as moving their money.
 */
let approver: TestUser;
let partyId: number;
let orderId: string;

const ORDER_TOTAL = 11_000;
const QUANTITY = 2;

/** Confirms an order the way confirm_order_group() would, sold count included. */
async function confirmOrder(id: string, ticketTypeId?: number): Promise<void> {
  const client = await adminClient();
  if (ticketTypeId !== undefined) {
    await client.query(`update public.orders set ticket_type_id = $2 where id = $1`, [
      id,
      ticketTypeId,
    ]);
    await client.query(
      `update public.ticket_types set sold = sold + $2 where id = $1`,
      [ticketTypeId, QUANTITY],
    );
  }
  await client.query(
    `update public.orders
        set payment_status = 'confirmed', status = 'confirmed',
            refund_status = 'none', refund_amount = 0
      where id = $1`,
    [id],
  );
}

async function inventory(): Promise<{ spots: number; sold: number | null }> {
  const client = await adminClient();
  const { rows } = await client.query<{ spots: number; sold: number | null }>(
    `select p.spots_left as spots, tt.sold as sold
       from public.parties p
       left join public.ticket_types tt on tt.party_id = p.id
      where p.id = $1`,
    [partyId],
  );
  return rows[0];
}

async function refundRow(id: string): Promise<{ status: string; amount: number }> {
  const client = await adminClient();
  const { rows } = await client.query<{ status: string; amount: number }>(
    `select status, amount from public.refunds where id = $1`,
    [id],
  );
  return rows[0];
}

/** Creates a ledger row as finance and returns its id. */
async function createRefund(
  amount = ORDER_TOTAL,
  key?: string,
  actor = finance.id,
  targetOrderId = orderId,
): Promise<string> {
  const id = await asService(async (c) => {
    const res = await c.query<{ id: string }>(
      `select id from public.create_order_refund($1, $2, 'Customer requested', $3, $4)`,
      [targetOrderId, amount, actor, key ?? null],
    );
    return res.rows[0].id;
  });
  return id;
}

before(async () => {
  await truncateAll();
  finance = await createAuthUser('finance-refunds@example.com');
  host = await createAuthUser('host-refunds@example.com');
  outsider = await createAuthUser('outsider-refunds@example.com');
  approver = await createAuthUser('approver-refunds@example.com');
  await setLegacyRole(finance.id, 'finance');
  await setLegacyRole(host.id, 'organizer');
  await setLegacyRole(outsider.id, 'organizer');
  await setLegacyRole(approver.id, 'super_admin');
});

beforeEach(async () => {
  const client = await adminClient();
  await client.query(`delete from public.refunds`);
  await client.query(`delete from public.payout_items`);
  await client.query(`delete from public.payouts`);
  await client.query(`delete from public.orders`);
  await client.query(`delete from public.ticket_types`);
  await client.query(`delete from public.parties`);
  partyId = await createParty(host.id, { title: 'Refund Party' });
  orderId = await createOrder(partyId, {
    total: ORDER_TOTAL,
    quantity: QUANTITY,
    payment_status: 'confirmed',
    status: 'confirmed',
  });
  await confirmOrder(orderId);
});

after(async () => {
  await closeAdmin();
});

describe('refunds: a refund is written down before Paystack is called', () => {
  it('starts with the inventory the order consumed', async () => {
    const before2 = await inventory();
    assert.equal(before2.spots, 200 - QUANTITY, 'inserting an order holds its spots');
  });

  it('a refund only exists as `requested` until the provider is called', async () => {
    const id = await createRefund();
    assert.equal((await refundRow(id)).status, 'requested');

    const client = await adminClient();
    const { rows } = await client.query<{ refund_status: string; refunded_at: Date | null }>(
      `select refund_status, refunded_at from public.orders where id = $1`,
      [orderId],
    );
    assert.equal(rows[0].refund_status, 'requested');
    assert.equal(rows[0].refunded_at, null, 'nothing is refunded before the provider confirms');
  });

  it('the ledger row is durable before submission, so a crash leaves evidence', async () => {
    // The row is written and committed by create_order_refund's own transaction.
    // If the process died here, this row is the only reason finance can find
    // the guest again.
    const id = await createRefund();
    const row = await refundRow(id);
    assert.equal(row.status, 'requested');
  });
});

describe('refunds: success is proven by a provider id, never by message text', () => {
  it('refuses to mark a refund successful without a provider refund id', async () => {
    const id = await createRefund();
    await asService((c) => attempt(c, `select public.mark_refund_submitted($1)`, [id]));

    // This is the exact shape of the old bug: the provider said no, and the
    // response body mentioned "refund". Only the missing provider id stops it
    // being recorded as money returned.
    const result = await asService((c) =>
      attempt(c, `select public.complete_order_refund($1, 'refunded', null, 'failed', 'Refund rejected')`, [id]),
    );
    assert.equal(result.ok, false, 'a success with no provider id must not be recorded');
    assert.match(result.error ?? '', /provider refund id/i);

    const row = await refundRow(id);
    assert.notEqual(row.status, 'refunded');
  });

  it('records a provider refusal as failed, not refunded', async () => {
    const id = await createRefund();
    await asService((c) => attempt(c, `select public.mark_refund_submitted($1)`, [id]));
    await asService((c) =>
      attempt(c, `select public.complete_order_refund($1, 'failed', null, 'failed', 'Refund rejected by provider')`, [id]),
    );

    assert.equal((await refundRow(id)).status, 'failed');

    const client = await adminClient();
    const { rows } = await client.query<{ refund_status: string }>(
      `select refund_status from public.orders where id = $1`,
      [orderId],
    );
    assert.equal(rows[0].refund_status, 'failed');
  });

  it('refuses an outcome that is not one of the three known ones', async () => {
    const id = await createRefund();
    const result = await asService((c) =>
      attempt(c, `select public.complete_order_refund($1, 'probably', 'r-1')`, [id]),
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /Invalid refund outcome/);
  });

  it('the same provider refund id cannot be booked against a second refund', async () => {
    const first = await createRefund();
    await asService((c) => attempt(c, `select public.mark_refund_submitted($1)`, [first]));
    await asService((c) =>
      attempt(c, `select public.complete_order_refund($1, 'refunded', 'ps_refund_1')`, [first]),
    );

    // The table owner writing a duplicate provider id is the only way to set up
    // the collision - the API roles cannot reach this table at all.
    const result = await asOwner((c) =>
      attempt(
        c,
        `insert into public.refunds (order_id, party_id, amount, idempotency_key, provider_refund_id)
         values ($1, $2, 500, 'other-key', 'ps_refund_1')`,
        [orderId, partyId],
      ),
    );
    assert.equal(result.ok, false, 'a provider refund id identifies exactly one refund');
  });
});

describe('refunds: inventory comes back exactly once', () => {
  it('a completed refund returns both spots and the sold count', async () => {
    const client = await adminClient();
    const { rows } = await client.query<{ id: number }>(
      `insert into public.ticket_types (party_id, name, price, quantity, sold, active, sort_order)
       values ($1, 'General Entry', 5000, 50, 0, true, 0) returning id`,
      [partyId],
    );
    const ticketTypeId = rows[0].id;
    await confirmOrder(orderId, ticketTypeId);

    const before2 = await inventory();
    assert.equal(before2.sold, QUANTITY, 'confirming the order sold the tickets');

    const id = await createRefund();
    await asService((c) => attempt(c, `select public.mark_refund_submitted($1)`, [id]));
    await asService((c) =>
      attempt(c, `select public.complete_order_refund($1, 'refunded', 'ps_refund_ok')`, [id]),
    );

    const after2 = await inventory();
    assert.equal(after2.spots, 200, 'spots_left is returned');
    assert.equal(after2.sold, 0, 'ticket_types.sold is returned too');
    assert.notEqual(after2.sold, before2.sold);
  });

  it('replaying a completed refund does not restock a second time', async () => {
    const id = await createRefund();
    await asService((c) => attempt(c, `select public.mark_refund_submitted($1)`, [id]));
    await asService((c) =>
      attempt(c, `select public.complete_order_refund($1, 'refunded', 'ps_refund_once')`, [id]),
    );
    const afterFirst = await inventory();

    // A retried webhook or a double-clicked button lands here.
    const replay = await asService((c) =>
      attempt(c, `select public.complete_order_refund($1, 'refunded', 'ps_refund_once')`, [id]),
    );
    assert.equal(replay.ok, true, 'replaying a terminal refund is a no-op, not an error');

    const afterReplay = await inventory();
    assert.equal(afterReplay.spots, afterFirst.spots, 'spots_left moved exactly once');
  });

  it('an unknown provider outcome holds the inventory instead of guessing', async () => {
    const before2 = await inventory();
    const id = await createRefund();
    await asService((c) => attempt(c, `select public.mark_refund_submitted($1)`, [id]));

    // A timeout. We do not know whether Paystack moved the money, so the only
    // safe answer is to keep holding the ticket and let a human reconcile.
    await asService((c) =>
      attempt(c, `select public.complete_order_refund($1, 'unknown', null, null, 'Request timed out')`, [id]),
    );

    assert.equal((await refundRow(id)).status, 'processing', 'it stays in flight');
    const after2 = await inventory();
    assert.equal(after2.spots, before2.spots, 'the ticket is still held');

    const client = await adminClient();
    const { rows } = await client.query<{ refund_status: string }>(
      `select refund_status from public.orders where id = $1`,
      [orderId],
    );
    assert.equal(rows[0].refund_status, 'processing');
  });

  it('an in-flight refund is not silently resubmitted by mark_refund_submitted', async () => {
    const id = await createRefund();
    await asService((c) => attempt(c, `select public.mark_refund_submitted($1)`, [id]));

    const second = await asService((c) => attempt(c, `select public.mark_refund_submitted($1)`, [id]));
    assert.equal(second.ok, true, 'idempotent, not an error');
    assert.equal((await refundRow(id)).status, 'submitted');
  });
});

describe('refunds: the same guest cannot be refunded twice', () => {
  it('refuses a refund larger than the amount still refundable', async () => {
    const result = await asService((c) =>
      attempt(c, `select public.create_order_refund($1, $2, 'Too much', $3, 'over-key')`, [
        orderId,
        ORDER_TOTAL + 1,
        finance.id,
      ]),
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /still refundable/i);
  });

  it('a failed refund can be retried for the remaining amount', async () => {
    const first = await createRefund(ORDER_TOTAL, 'attempt-1');
    await asService((c) => attempt(c, `select public.mark_refund_submitted($1)`, [first]));
    const closed = await asService((c) =>
      attempt(c, `select public.complete_order_refund($1, 'failed', null, 'failed', 'Declined')`, [first]),
    );
    assert.equal(closed.ok, true, `the failure must be recorded: ${closed.error}`);
    assert.equal((await refundRow(first)).status, 'failed', 'a definite failure closes the attempt');

    // The failed attempt is closed, so the money is owed again and a retry is
    // legitimate. What must not happen is refunding it twice.
    const retry = await asService((c) => attemptValue(
      c,
      `select id from public.create_order_refund($1, $2, 'Retry', $3, 'attempt-2')`,
      [orderId, ORDER_TOTAL, finance.id],
    ));
    assert.equal(retry.ok, true, `retry after a definite failure should be allowed: ${retry.error}`);

    const client = await adminClient();
    const { rows } = await client.query<{ n: string }>(
      `select count(*)::text as n from public.refunds where order_id = $1`,
      [orderId],
    );
    assert.equal(rows[0].n, '2', 'one failed attempt plus one retry, not a duplicate');
  });

  it('a second open refund for one order is refused by the database', async () => {
    await createRefund(5_000, 'open-1');

    // Total is 11000 and 5000 is already committed, so 5000 more fits the
    // arithmetic but two refunds cannot be in flight at once. The partial
    // unique index is what stops it, not the amount check.
    const result = await asService((c) =>
      attempt(c, `select public.create_order_refund($1, $2, 'Also mine', $3, 'open-2')`, [
        orderId,
        5_000,
        finance.id,
      ]),
    );
    assert.equal(result.ok, false, 'only one in-flight refund per order');
    assert.equal(result.errorCode, '23505');
  });

  it('the same idempotency key replays the original refund', async () => {
    const first = await createRefund(4_000, 'stable-key');
    const second = await asService(async (c) => {
      const res = await c.query<{ id: string }>(
        `select id from public.create_order_refund($1, 4000, 'Same key', $2, 'stable-key')`,
        [orderId, finance.id],
      );
      return res.rows[0].id;
    });

    assert.equal(second, first, 'a retried request returns the row it already made');

    const client = await adminClient();
    const { rows } = await client.query<{ n: string }>(
      `select count(*)::text as n from public.refunds where idempotency_key = 'stable-key'`,
    );
    assert.equal(rows[0].n, '1');
  });
});

describe('refunds: authorization is decided in the database', () => {
  it('refuses an actor without the finance refund permission', async () => {
    const result = await asService((c) =>
      attempt(c, `select public.create_order_refund($1, 100, 'Let me', $2, 'unauth-key')`, [
        orderId,
        outsider.id,
      ]),
    );
    assert.equal(result.ok, false, 'an organizer cannot refund a customer');
    assert.equal(result.errorCode, '42501');
  });

  it('an authenticated client cannot call the refund functions at all', async () => {
    const result = await asUser(finance.id, (c) =>
      attempt(c, `select public.create_order_refund($1, 100, 'Direct', $2, 'direct-key')`, [
        orderId,
        finance.id,
      ]),
    );
    assert.equal(result.ok, false, 'the functions are service-role only');
  });

  it('an anonymous client cannot call the refund functions', async () => {
    const result = await asService((c) =>
      c.query(`select has_function_privilege('anon', 'public.create_order_refund(uuid,integer,text,uuid,text)', 'execute')`),
    );
    assert.equal(result.rows[0].has_function_privilege, false, 'anon holds no execute grant');
  });

  it('the refund ledger is not readable by a signed-in user', async () => {
    const result = await asService((c) =>
      c.query(
        `select relrowsecurity, (select count(*) from pg_policies where schemaname='public' and tablename='refunds') as policies
           from pg_class where oid = 'public.refunds'::regclass`,
      ),
    );
    assert.equal(result.rows[0].relrowsecurity, true, 'RLS is on');
    assert.equal(
      Number(result.rows[0].policies),
      0,
      'no policy means no row is visible to anon or authenticated',
    );
  });

  it('refuses a refund for an order that was never paid', async () => {
    const client = await adminClient();
    const { rows } = await client.query<{ id: string }>(
      `insert into public.orders
         (party_id, tier, quantity, unit_price, service_fee, total, order_ref, payment_ref,
          status, payment_status, customer_email, ticket_access_token)
       values ($1, 'regular', 1, 5000, 1000, 6000, 'pend-1', 'pend-1', 'pending', 'pending',
               'nobody@example.com', 'tok_pending')
       returning id`,
      [partyId],
    );

    const result = await asService((c) =>
      attempt(c, `select public.create_order_refund($1, 100, 'Never paid', $2, 'unpaid-key')`, [
        rows[0].id,
        finance.id,
      ]),
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /confirmed order/i);
  });
});

describe('refunds: refund state is server-owned', () => {
  it('a signed-in user cannot mark an order refunded directly', async () => {
    const result = await asUser(finance.id, (c) =>
      attempt(c, `update public.orders set refund_status = 'refunded', refund_amount = $2 where id = $1`, [
        orderId,
        ORDER_TOTAL,
      ]),
    );
    assert.equal(result.ok, false, 'refund state is not client-settable');
    assert.equal(result.errorCode, '42501');
  });

  it('a signed-in user cannot clear a refund either', async () => {
    const id = await createRefund();
    await asService((c) => attempt(c, `select public.mark_refund_submitted($1)`, [id]));

    const result = await asUser(finance.id, (c) =>
      attempt(c, `update public.orders set refund_status = 'none' where id = $1`, [orderId]),
    );
    assert.equal(result.ok, false, 'reverting refund state is just as forbidden');
  });

  it('a signed-in user cannot insert an already-refunded order', async () => {
    const result = await asUser(host.id, (c) =>
      attempt(
        c,
        `insert into public.orders
           (party_id, tier, quantity, unit_price, service_fee, total, order_ref, payment_ref,
            status, payment_status, customer_email, ticket_access_token, refund_status, refund_amount)
         values ($1, 'regular', 1, 5000, 1000, 6000, 'sneak-1', 'sneak-1', 'confirmed', 'confirmed',
                 'sneak@example.com', 'tok_sneak', 'refunded', 6000)`,
        [partyId],
      ),
    );
    assert.equal(result.ok, false, 'a refund cannot be backdated by inserting an order');
    assert.equal(result.errorCode, '42501');
  });

  it('a signed-in user cannot cancel an event directly', async () => {
    const result = await asUser(host.id, (c) =>
      attempt(c, `update public.parties set cancelled_at = now() where id = $1`, [partyId]),
    );
    assert.equal(result.ok, false, 'cancelling bypasses the refund queue');
    assert.equal(result.errorCode, '42501');
  });

  it('a host can still read refund state for their own event', async () => {
    await createRefund();
    const result = await asUser(host.id, (c) =>
      attemptValue<string>(c, `select refund_status from public.orders where id = $1`, [orderId]),
    );
    assert.equal(result.ok, true, `reads are untouched by the guard: ${result.error}`);
    assert.equal(result.value, 'requested');
  });
});

describe('event cancellation: stop the doors, then queue the refunds', () => {
  it('queues one refund per confirmed order and blocks new orders immediately', async () => {
    const rows = await asService(async (c) => {
      const res = await c.query<{ order_id: string; needs_refund: boolean; amount: number }>(
        `select r->>'order_id' as order_id,
                (r->>'needs_refund')::boolean as needs_refund,
                (r->>'amount')::int as amount
           from public.begin_event_cancellation($1, 'Venue flooded', $2) r`,
        [partyId, host.id],
      );
      return res.rows;
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].order_id, orderId);
    assert.equal(rows[0].needs_refund, true);
    assert.equal(rows[0].amount, ORDER_TOTAL);

    // The critical ordering guarantee: the event is closed to new orders in the
    // same transaction that queued the refund, so there is no window in which a
    // sold-out, cancelled event still accepts checkout.
    const client = await adminClient();
    const { rows: cancelled } = await client.query<{ cancelled_at: Date | null }>(
      `select cancelled_at from public.parties where id = $1`,
      [partyId],
    );
    assert.ok(cancelled[0].cancelled_at, 'the event is marked cancelled');

    const blocked = await asService((c) =>
      attempt(c, `insert into public.orders
          (party_id, tier, quantity, unit_price, service_fee, total, order_ref, payment_ref,
           status, payment_status, customer_email, ticket_access_token)
        values ($1, 'regular', 1, 5000, 1000, 6000, 'late-1', 'late-1', 'pending', 'pending',
                'late@example.com', 'tok_late')`, [partyId]),
    );
    assert.equal(blocked.ok, false, 'a cancelled event takes no new orders');
    assert.match(blocked.error ?? '', /cancelled/i);
  });

  it('does not refund a pending order, because no money was taken', async () => {
    const client = await adminClient();
    await client.query(
      `insert into public.orders
         (party_id, tier, quantity, unit_price, service_fee, total, order_ref, payment_ref,
          status, payment_status, customer_email, ticket_access_token)
       values ($1, 'regular', 1, 5000, 1000, 6000, 'pend-9', 'pend-9', 'pending', 'pending',
               'pending@example.com', 'tok_pend9')`,
      [partyId],
    );

    const rows = await asService(async (c) => {
      const res = await c.query<{ order_id: string; needs_refund: boolean; order_ref: string }>(
        `select r->>'order_id' as order_id, (r->>'needs_refund')::boolean as needs_refund,
                r->>'order_ref' as order_ref
           from public.begin_event_cancellation($1, 'Closed', $2) r`,
        [partyId, host.id],
      );
      return res.rows;
    });

    // The work list is the money path, and only a confirmed order has money in
    // it. A pending order holds a spot until the payment window closes, and is
    // released by the abandoned-order sweep rather than by a refund.
    assert.equal(rows.length, 1, 'only the confirmed order is in the refund work list');
    assert.equal(rows[0].order_id, orderId);
    assert.equal(rows[0].needs_refund, true);

    const { rows: pending } = await client.query<{ n: string }>(
      `select count(*)::text as n from public.refunds where order_id in
         (select id from public.orders where order_ref = 'pend-9')`,
    );
    assert.equal(Number(pending[0].n), 0, 'a pending order is never queued for a refund');
  });

  it('re-running a cancellation re-attaches to the same refunds', async () => {
    await asService((c) =>
      attempt(c, `select * from public.begin_event_cancellation($1, 'Flood', $2)`, [partyId, host.id]),
    );
    const again = await asService((c) =>
      attempt(c, `select * from public.begin_event_cancellation($1, 'Flood', $2)`, [partyId, host.id]),
    );
    assert.equal(again.ok, true, 'cancellation is idempotent');

    const client = await adminClient();
    const { rows } = await client.query<{ n: string }>(
      `select count(*)::text as n from public.refunds where party_id = $1`,
      [partyId],
    );
    assert.equal(rows[0].n, '1', 'the guest is not queued for a second refund');
  });

  it('does not move the original cancellation time on a retry', async () => {
    const client = await adminClient();
    await asService((c) =>
      attempt(c, `select * from public.begin_event_cancellation($1, 'First reason', $2)`, [partyId, host.id]),
    );
    const first = await client.query<{ cancelled_at: Date; reason: string }>(
      `select cancelled_at, cancellation_reason as reason from public.parties where id = $1`,
      [partyId],
    );

    await asService((c) =>
      attempt(c, `select * from public.begin_event_cancellation($1, 'Different reason', $2)`, [partyId, host.id]),
    );
    const second = await client.query<{ cancelled_at: Date; reason: string }>(
      `select cancelled_at, cancellation_reason as reason from public.parties where id = $1`,
      [partyId],
    );

    assert.equal(second.rows[0].cancelled_at.getTime(), first.rows[0].cancelled_at.getTime());
    assert.equal(second.rows[0].reason, 'First reason', 'the first stated reason stands');
  });

  it('refuses a cancellation from someone with no stake in the event', async () => {
    const result = await asService((c) =>
      attempt(c, `select * from public.begin_event_cancellation($1, 'I will cancel it', $2)`, [
        partyId,
        outsider.id,
      ]),
    );
    assert.equal(result.ok, false, 'an unrelated organizer cannot cancel another host event');
    assert.equal(result.errorCode, '42501');
  });

  it('refuses a cancellation with no reason', async () => {
    const result = await asService((c) =>
      attempt(c, `select * from public.begin_event_cancellation($1, '   ', $2)`, [partyId, host.id]),
    );
    assert.equal(result.ok, false, 'guests are owed an explanation');
  });
});

describe('payouts: revenue with a refund in any state is not paid out', () => {
  /**
   * Leaves the host with exactly one event and one paid order worth 11000, so a
   * payout assertion reads as a single number rather than a sum of leftovers
   * from the shared fixture.
   */
  async function seedPayoutableHost(): Promise<number> {
    const client = await adminClient();
    await client.query(`delete from public.orders`);
    await client.query(`delete from public.ticket_types`);
    await client.query(`delete from public.parties`);
    await setHostVerified(host.id);
    await setAccountStatus(host.id, 'active');
    await client.query(`delete from public.host_bank_accounts`);
    await registerBankAccount(host.id);

    const fresh = await createParty(host.id, { title: 'Payout Party' });
    const paid = await createOrder(fresh, {
      total: 11_000,
      quantity: 1,
      payment_status: 'confirmed',
      status: 'confirmed',
    });
    await confirmOrder(paid);
    return fresh;
  }

  /** The single seeded order in a freshly seeded host's party. */
  async function orderIdFor(party: number): Promise<string> {
    const client = await adminClient();
    const { rows } = await client.query<{ id: string }>(
      `select id from public.orders where party_id = $1 limit 1`,
      [party],
    );
    return rows[0].id;
  }

  /** How many payout rows exist at all - a zero payout still creates one. */
  async function payoutCount(): Promise<number> {
    const client = await adminClient();
    const { rows } = await client.query<{ n: string }>(`select count(*)::text as n from public.payouts`);
    return Number(rows[0].n);
  }

  /**
   * Requests a payout and returns the revenue it released, or null when the
   * request was refused because nothing was eligible.
   *
   * An order worth 11000 is below nothing, but a request with zero eligible
   * revenue is refused by the 1000 naira floor - which is the point: no payout
   * row is created at all, so the host cannot be handed a zero or a partial
   * figure that looks real.
   */
  async function revenueForPayout(): Promise<number | null> {
    const result = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    if (!result.ok) {
      assert.match(
        result.error ?? '',
        /below the minimum/,
        'a payout with nothing eligible is refused by the floor, not paid as zero',
      );
      return null;
    }
    const client = await adminClient();
    const { rows } = await client.query<{ revenue: number }>(
      `select revenue from public.payouts order by created_at desc limit 1`,
    );
    return rows[0]?.revenue ?? null;
  }

  it('refuses to pay out revenue whose refund is still queued', async () => {
    // The dangerous ordering: a host asks for their money, and the refund that
    // is about to take it has not been issued yet. Paying first means the guest
    // is refunded out of the host's already-paid-out balance.
    const fresh = await seedPayoutableHost();
    const client = await adminClient();
    await client.query(`update public.orders set refund_status = 'requested' where party_id = $1`, [fresh]);

    assert.equal(await revenueForPayout(), null, 'nothing may be released while a refund is open');
    assert.equal(await payoutCount(), 0, 'and no payout row may exist at all');
  });

  it('refuses to pay out revenue whose refund is in flight with Paystack', async () => {
    const fresh = await seedPayoutableHost();
    const paid = await orderIdFor(fresh);
    const refund = await createRefund(11_000, undefined, finance.id, paid);
    await asService(async (c) => {
      await c.query(`select public.mark_refund_submitted($1)`, [refund]);
    });

    assert.equal(await revenueForPayout(), null, 'an in-flight refund still owns the money');
  });

  it('refuses to pay out revenue that was refunded', async () => {
    const fresh = await seedPayoutableHost();
    const paid = await orderIdFor(fresh);
    const refund = await createRefund(11_000, undefined, finance.id, paid);
    await asService(async (c) => {
      await c.query(`select public.mark_refund_submitted($1)`, [refund]);
    });
    await asService(async (c) => {
      await c.query(`select public.complete_order_refund($1, 'refunded', 'prov-payout-block')`, [refund]);
    });

    assert.equal(await revenueForPayout(), null, 'money that went back to the guest is not the host\'s');
  });

  it('refuses to pay out revenue whose refund failed and is retryable', async () => {
    // A failed refund means Paystack said no, so the host is arguably owed the
    // money - but 'arguably' is not a reconciliation. Paying out here and then
    // having the retry succeed double-pays. The order has to be resolved by a
    // person first.
    const fresh = await seedPayoutableHost();
    const paid = await orderIdFor(fresh);
    const refund = await createRefund(11_000, undefined, finance.id, paid);
    await asService(async (c) => {
      await c.query(`select public.mark_refund_submitted($1)`, [refund]);
    });
    await asService(async (c) => {
      await c.query(`select public.complete_order_refund($1, 'failed', null, 'failed', 'Refund rejected')`, [
        refund,
      ]);
    });

    assert.equal(await revenueForPayout(), null, 'an unresolved failed refund blocks the payout');
  });

  it('pays out a declined refund, because the guest kept their ticket', async () => {
    const fresh = await seedPayoutableHost();
    await asService(async (c) => {
      await c.query(`update public.orders set refund_status = 'rejected' where party_id = $1`, [fresh]);
    });

    assert.equal(await revenueForPayout(), 11_000, 'a declined refund leaves the host owed the sale');
  });

  it('pays out only the orders with no refund in any state', async () => {
    const fresh = await seedPayoutableHost();
    const client = await adminClient();

    // A second clean order, so the assertion can tell "the failed one was
    // excluded" apart from "nothing was eligible at all".
    const clean = await createOrder(fresh, {
      total: 11_000,
      quantity: 1,
      payment_status: 'confirmed',
      status: 'confirmed',
    });
    await confirmOrder(clean);
    await client.query(
      `update public.orders set refund_status = 'failed' where id = (select id from public.orders where party_id = $1 and total = 11000 order by created_at limit 1)`,
      [fresh],
    );
    // The seeded order is the one that now fails; the newly created one pays.
    await client.query(`update public.orders set refund_status = 'none' where id = $1`, [clean]);

    assert.equal(await revenueForPayout(), 11_000, 'only the eligible order is released');
  });
});

/**
 * The admin order screen used to offer three buttons that wrote refund_status
 * straight onto the order: requested, refunded, rejected. "refunded" is the one
 * that does damage - one click, no Paystack call, and the order reads as paid
 * back while the guest has none of their money.
 *
 * record_refund_decision() takes only the two states that are genuinely
 * decisions, so there is no hand-writable path to 'refunded' left.
 */
describe('refund decisions: a hand cannot mark money as returned', () => {
  async function decide(decision: string, reason = 'Because the review said so') {
    return asService((c) =>
      attempt(c, `select public.record_refund_decision($1, $2, $3, $4)`, [
        orderId,
        decision,
        reason,
        approver.id,
      ]),
    );
  }

  it('refuses every spelling of a hand-written refunded', async () => {
    for (const decision of ['refunded', 'refunded ', 'REFUNDED', 'Refunded']) {
      const result = await decide(decision);
      assert.equal(result.ok, false, `'${decision}' must not be settable by hand`);
      assert.match(result.error ?? '', /only be marked refunded by completing a real Paystack refund/);
    }
  });

  it('refuses a decision that is not one of the two real ones', async () => {
    const result = await decide('sortof_refunded');
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /only be marked refunded/);
  });

  it('refuses a decision with no reason', async () => {
    const result = await decide('rejected', '   ');
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /needs a reason/);
  });

  it('requires refund permission', async () => {
    const result = await asService((c) =>
      attempt(c, `select public.record_refund_decision($1, 'rejected', 'No permission', $2)`, [
        orderId,
        outsider.id,
      ]),
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /requires refund permission/);
  });

  it('is not callable by a signed-in organizer at all', async () => {
    const result = await asUser(outsider.id, (c) =>
      attempt(c, `select public.record_refund_decision($1, 'rejected', 'From the client', $2)`, [
        orderId,
        outsider.id,
      ]),
    );
    assert.equal(result.ok, false, 'the function is service-role only, so a client cannot reach it');
  });

  it('cannot relabel a refund that really did return the money', async () => {
    const refund = await createRefund();
    await asService(async (c) => {
      await c.query(`select public.mark_refund_submitted($1)`, [refund]);
    });
    await asService(async (c) => {
      await c.query(`select public.complete_order_refund($1, 'refunded', 'prov-immutable')`, [refund]);
    });

    const result = await decide('rejected', 'changing my mind');
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /already been refunded/);
  });

  it('records a declined refund, and a declined refund is payable again', async () => {
    const client = await adminClient();
    await client.query(`delete from public.host_bank_accounts`);
    await registerBankAccount(host.id);
    await setHostVerified(host.id);
    await setAccountStatus(host.id, 'active');

    assert.equal((await decide('rejected', 'Outside the refund window')).ok, true);

    const { rows } = await client.query<{ refund_status: string }>(
      `select refund_status from public.orders where id = $1`,
      [orderId],
    );
    assert.equal(rows[0].refund_status, 'rejected');

    // The guest kept their ticket, so the host is still owed the sale. If a
    // decline released nothing to the host, declining a refund would silently
    // confiscate it.
    const paid = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(paid.ok, true, 'a declined refund must not strand the host\'s money');
  });

  it('records a refund under review, which keeps payout blocked', async () => {
    const client = await adminClient();
    await client.query(`delete from public.host_bank_accounts`);
    await registerBankAccount(host.id);
    await setHostVerified(host.id);
    await setAccountStatus(host.id, 'active');

    assert.equal((await decide('requested', 'Needs a second look')).ok, true);

    const paid = await asUser(host.id, (c) => attempt(c, `select public.request_payout()`));
    assert.equal(paid.ok, false, 'an open refund still owns the money');
  });

  it('leaves an audit trail naming the reason', async () => {
    assert.equal((await decide('rejected', 'Duplicate order, same buyer')).ok, true);

    const client = await adminClient();
    const { rows } = await client.query<{ action: string; details: { reason: string; previous_status: string } }>(
      `select action, details from public.audit_logs
        where target_type = 'order' and target_id = $1 and action = 'refund_rejected'`,
      [orderId],
    );
    assert.equal(rows.length, 1, 'the decision is recorded once');
    assert.equal(rows[0].details.reason, 'Duplicate order, same buyer');
    assert.equal(rows[0].details.previous_status, 'none');
  });
});

