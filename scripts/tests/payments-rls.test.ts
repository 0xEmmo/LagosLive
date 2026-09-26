import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminClient,
  asOwner,
  asService,
  asUser,
  attempt,
  closeAdmin,
  createAuthUser,
  createOrder,
  createParty,
  setLegacyRole,
  truncateAll,
  type TestUser,
} from './helpers.ts';

/**
 * PART 2 — payment integrity and reconciliation.
 *
 * The `orders` UPDATE policy is the host check-in policy, and it has no
 * WITH CHECK, so its USING expression is reused as the check: a host who
 * created an event may write ANY column on ANY order for that event. That
 * includes the money columns. These tests pin down what a host and a buyer
 * must not be able to do, and that the audited RPCs remain the only way in.
 */

let host: TestUser;
let buyer: TestUser;
let partyId: number;
let orderId: string;

async function field(column: string): Promise<string | null> {
  const client = await adminClient();
  const { rows } = await client.query(
    `select ${column}::text as v from public.orders where id = $1`,
    [orderId],
  );
  return rows.length ? rows[0].v : null;
}

async function resetOrder() {
  const client = await adminClient();
  await client.query(
    `update public.orders
        set payment_status = 'pending', status = 'pending', total = 11000,
            refund_status = 'none', refund_amount = 0, refunded_at = null,
            customer_email = 'buyer@example.com', quantity = 2
      where id = $1`,
    [orderId],
  );
}

before(async () => {
  await truncateAll();
  host = await createAuthUser('host@example.com');
  buyer = await createAuthUser('buyer@example.com');
  await setLegacyRole(host.id, 'organizer');
  partyId = await createParty(host.id);
  orderId = await createOrder(partyId);
});

beforeEach(resetOrder);

after(async () => {
  await closeAdmin();
});

describe('payments: a host cannot rewrite the money', () => {
  it('cannot mark an unpaid order as paid', async () => {
    const result = await asUser(host.id, (c) =>
      attempt(c, `update public.orders set payment_status = 'confirmed' where id = $1`, [
        orderId,
      ]),
    );
    assert.equal(result.ok, false, 'a host was able to confirm a payment themselves');
    assert.equal(await field('payment_status'), 'pending');
  });

  it('cannot rewrite the order total or unit price', async () => {
    const result = await asUser(host.id, (c) =>
      attempt(
        c,
        `update public.orders set total = 1, unit_price = 1 where id = $1`,
        [orderId],
      ),
    );
    assert.equal(result.ok, false, 'a host was able to rewrite the amount charged');
    assert.equal(await field('total'), '11000');
  });

  it('cannot mark itself refunded without paying anyone back', async () => {
    const result = await asUser(host.id, (c) =>
      attempt(
        c,
        `update public.orders
            set refund_status = 'refunded', refund_amount = 11000, refunded_at = now()
          where id = $1`,
        [orderId],
      ),
    );
    assert.equal(result.ok, false, 'a host was able to mark a refund as paid out');
    assert.equal(await field('refund_status'), 'none');
  });

  it('cannot change the quantity sold against its own event', async () => {
    const result = await asUser(host.id, (c) =>
      attempt(c, `update public.orders set quantity = 99 where id = $1`, [orderId]),
    );
    assert.equal(result.ok, false, 'a host was able to inflate the tickets sold');
    assert.equal(await field('quantity'), '2');
  });

  it('cannot redirect a buyer’s ticket to another address', async () => {
    const result = await asUser(host.id, (c) =>
      attempt(
        c,
        `update public.orders
            set customer_email = 'attacker@evil.com', ticket_access_token = 'stolen-token'
          where id = $1`,
        [orderId],
      ),
    );
    assert.equal(result.ok, false, 'a host was able to redirect a ticket');
    assert.equal(await field('customer_email'), 'buyer@example.com');
  });

  it('cannot attach a confirmed ticket to a user id of their choosing', async () => {
    const result = await asUser(host.id, (c) =>
      attempt(c, `update public.orders set user_id = $2, status = 'confirmed' where id = $1`, [
        orderId,
        host.id,
      ]),
    );
    assert.equal(result.ok, false, 'a host was able to claim a buyer order as their own');
  });
});

describe('payments: a buyer cannot pay themselves in', () => {
  // A buyer matches no UPDATE policy, so the write raises nothing and simply
  // reports zero affected rows. Asserting the row count rather than the error
  // is what distinguishes "RLS filtered it" from "the statement was rejected":
  // a test that only checked for an error would pass even if a future policy
  // let the write through with a stale `using` clause.
  it('cannot confirm their own order', async () => {
    const result = await asUser(buyer.id, (c) =>
      attempt(c, `update public.orders set payment_status = 'confirmed' where id = $1`, [
        orderId,
      ]),
    );
    assert.equal(result.rowCount, 0, 'a buyer confirmed their own order without paying');
    assert.equal(await field('payment_status'), 'pending');
  });

  it('cannot call the group confirmation function', async () => {
    const client = await adminClient();
    const { rows } = await client.query(
      `select payment_ref from public.orders where id = $1`,
      [orderId],
    );
    const result = await asUser(buyer.id, (c) =>
      attempt(c, `select public.confirm_order_group($1)`, [rows[0].payment_ref]),
    );
    assert.equal(result.ok, false, 'confirm_order_group is callable by a buyer');
  });

  it('cannot insert a confirmed order directly', async () => {
    const result = await asUser(buyer.id, (c) =>
      attempt(
        c,
        `insert into public.orders
           (party_id, tier, quantity, unit_price, service_fee, total, order_ref, payment_ref,
            status, payment_status, customer_email, user_id)
         values ($1, 'regular', 5, 0, 0, 0, 'free-rip', 'free-rip', 'confirmed', 'confirmed',
                 'buyer@example.com', $2)`,
        [partyId, buyer.id],
      ),
    );
    const client = await adminClient();
    const { rows } = await client.query(
      `select count(*)::int as n from public.orders where order_ref = 'free-rip'`,
    );
    assert.equal(rows[0].n, 0, 'a self-confirmed free order was inserted');
    assert.equal(result.ok, false, 'the INSERT was not rejected outright');
  });
});

describe('payments: the audited paths stay open', () => {
  it('service role can still settle a payment', async () => {
    const result = await asService((c) =>
      attempt(c, `select public.settle_order_payment($1, 'failed')`, [orderId]),
    );
    assert.equal(result.ok, true, `settle_order_payment broke: ${result.error}`);
    assert.equal(await field('payment_status'), 'failed');
    await resetOrder();
  });

  it('service role can still confirm a paid group', async () => {
    const client = await adminClient();
    const { rows } = await client.query(
      `select payment_ref, party_id from public.orders where id = $1`,
      [orderId],
    );
    const result = await asService((c) =>
      attempt(c, `select public.confirm_order_group($1)`, [rows[0].payment_ref]),
    );
    assert.equal(result.ok, true, `confirm_order_group broke: ${result.error}`);
    assert.equal(await field('payment_status'), 'confirmed');
    await resetOrder();
  });

  it('the host can still check a guest in (moved to check-in suite)', async () => {
    // The authoritative check-in RPC is covered in checkin-rls.test.ts. It is
    // intentionally not exercised here: staff_check_in is a Part 4 concern and
    // its contract belongs in one place.
    const client = await adminClient();
    await client.query(
      `update public.orders set check_in_status = 'checked_in', checked_in_at = now() where id = $1`,
      [orderId],
    );
    assert.equal(await field('check_in_status'), 'checked_in');
  });
});

describe('payments: the provider event ledger', () => {
  it('exists and records webhook deliveries', async () => {
    const client = await adminClient();
    const { rows } = await client.query(
      `select count(*)::int as n from information_schema.tables
        where table_schema = 'public' and table_name = 'payment_events'`,
    );
    assert.equal(rows[0].n, 1, 'there is no payment_events ledger to reconcile against');
  });

  it('is append-only and readable only by service role', async () => {
    const inserted = await asService((c) =>
      attempt(
        c,
        `insert into public.payment_events (provider, event, reference, payload)
         values ('paystack', 'charge.success', $1, '{"amount":100}'::jsonb)`,
        [`evt_${Date.now()}`],
      ),
    );
    assert.equal(inserted.ok, true, `service role cannot record a payment event: ${inserted.error}`);

    const asBuyer = await asUser(buyer.id, (c) =>
      attempt(
        c,
        `insert into public.payment_events (provider, event, reference, payload)
         values ('paystack', 'charge.success', 'forged', '{}'::jsonb)`,
      ),
    );
    assert.equal(asBuyer.ok, false, 'a buyer was able to forge a payment event');
  });

  it('is replay safe: one row per provider event', async () => {
    const client = await adminClient();
    const reference = `evt_dup_${Date.now()}`;
    const first = await asService((c) =>
      attempt(
        c,
        `insert into public.payment_events (provider, event, reference, payload)
         values ('paystack', 'charge.success', $1, '{}'::jsonb)`,
        [reference],
      ),
    );
    const second = await asService((c) =>
      attempt(
        c,
        `insert into public.payment_events (provider, event, reference, payload)
         values ('paystack', 'charge.success', $1, '{}'::jsonb)`,
        [reference],
      ),
    );
    assert.equal(first.ok, true);
    assert.equal(second.ok, false, 'the same provider event was recorded twice');
  });

  it('does not let a recorded payment be rewritten or deleted', async () => {
    const client = await adminClient();
    const reference = `evt_imm_${Date.now()}`;
    await asService((c) =>
      attempt(
        c,
        `insert into public.payment_events (provider, event, reference, payload)
         values ('paystack', 'charge.success', $1, '{"amount":500}'::jsonb)`,
        [reference],
      ),
    );

    // service_role holds no UPDATE/DELETE on the ledger, so this is blocked at
    // the grant layer...
    const rewrite = await asService((c) =>
      attempt(c, `update public.payment_events set payload = '{"amount":1}'::jsonb where reference = $1`, [
        reference,
      ]),
    );
    assert.equal(rewrite.ok, false, 'a recorded payment amount was rewritten');

    const remove = await asService((c) =>
      attempt(c, `delete from public.payment_events where reference = $1`, [reference]),
    );
    assert.equal(remove.ok, false, 'a payment event was deleted from the ledger');

    // ...and the trigger blocks it even for the owner, so a future `grant all`
    // cannot quietly reopen it.
    const asOwnerWrite = await asOwner((c) =>
      attempt(c, `update public.payment_events set payload = '{}'::jsonb where reference = $1`, [
        reference,
      ]),
    );
    assert.equal(asOwnerWrite.ok, false, 'the ledger is mutable from the owner connection');

    const { rows: idRows } = await client.query(
      `select id from public.payment_events where reference = $1`,
      [reference],
    );
    const stamped = await asService((c) =>
      attempt(c, `select public.record_payment_event_outcome($1, 'confirmed')`, [idRows[0].id]),
    );
    assert.equal(stamped.ok, true, `could not stamp the outcome: ${stamped.error}`);
    const { rows } = await client.query(
      `select outcome, processed_at is not null as stamped from public.payment_events where reference = $1`,
      [reference],
    );
    assert.equal(rows[0].outcome, 'confirmed');
    assert.equal(rows[0].stamped, true);
  });
});
