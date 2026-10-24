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

let host: TestUser;
let buyer: TestUser;
let superAdmin: TestUser;
let finance: TestUser;
let partyId: number;
let orderId: string;
let paymentRef: string;

async function resetFixtures() {
  const db = await adminClient();
  await db.query('delete from public.payout_adjustment_items');
  await db.query('delete from public.host_payout_adjustments');
  await db.query('delete from public.payout_items');
  await db.query('delete from public.payouts');
  await db.query('delete from public.wallet_reservations');
  await db.query('delete from public.wallet_ledger');
  await db.query('delete from public.wallets');
  await db.query('delete from public.refunds where order_id=$1', [orderId]);
  await db.query(
    `update public.orders set user_id=null, payment_status='pending', status='pending',
       wallet_paid=0, payment_method=null, refund_status='none', refund_amount=0, refunded_at=null
     where id=$1`,
    [orderId],
  );
  await db.query(`update public.parties set cancelled_at=null, cancellation_reason=null where id=$1`, [partyId]);
  await setHostVerified(host.id, false);
  await setAccountStatus(host.id, 'active');
  await db.query('delete from public.host_bank_accounts');
}

before(async () => {
  await truncateAll();
  host = await createAuthUser('ledger-host@example.com');
  buyer = await createAuthUser('wallet-buyer@example.com');
  superAdmin = await createAuthUser('wallet-super-admin@example.com');
  finance = await createAuthUser('wallet-finance@example.com');
  await setLegacyRole(host.id, 'organizer');
  await setLegacyRole(superAdmin.id, 'super_admin');
  await setLegacyRole(finance.id, 'finance');
  partyId = await createParty(host.id);
  orderId = await createOrder(partyId, { total: 11000, quantity: 2, customer_email: buyer.email });
  const db = await adminClient();
  const { rows } = await db.query('select payment_ref from public.orders where id=$1', [orderId]);
  paymentRef = rows[0].payment_ref;
});

beforeEach(resetFixtures);
after(closeAdmin);

describe('customer wallet checkout', () => {
  it('reserves a partial balance and returns the Paystack remainder from server data', async () => {
    const db = await adminClient();
    await db.query('insert into public.wallets(user_id,balance) values($1,4000)', [buyer.id]);
    await db.query('update public.orders set user_id=$2 where id=$1', [orderId, buyer.id]);

    const result = await asService((client) => client.query<{ split: { wallet_amount: number; paystack_amount: number } }>(
      'select public.reserve_wallet_for_payment($1,$2) as split', [paymentRef, buyer.id],
    ));
    assert.deepEqual(result.rows[0].split, { wallet_amount: 4000, paystack_amount: 7000 });

    const { rows } = await db.query(
      'select o.wallet_paid,o.paystack_paid,o.payment_method,w.balance from public.orders o join public.wallets w on w.user_id=o.user_id where o.id=$1',
      [orderId],
    );
    assert.equal(rows[0].wallet_paid, 4000);
    assert.equal(rows[0].paystack_paid, 7000);
    assert.equal(rows[0].payment_method, 'mixed');
    assert.equal(rows[0].balance, 0);
  });

  it('fully wallet-funds the order and consumes the hold only after confirmation', async () => {
    const db = await adminClient();
    await db.query('insert into public.wallets(user_id,balance) values($1,15000)', [buyer.id]);
    await db.query('update public.orders set user_id=$2 where id=$1', [orderId, buyer.id]);

    const result = await asService((client) => client.query<{ split: { wallet_amount: number; paystack_amount: number } }>(
      'select public.reserve_wallet_for_payment($1,$2) as split', [paymentRef, buyer.id],
    ));
    assert.deepEqual(result.rows[0].split, { wallet_amount: 11000, paystack_amount: 0 });
    const confirmation = await asService((client) => client.query('select public.confirm_order_group($1)', [paymentRef]));
    assert.equal(confirmation.rowCount, 1);

    const { rows } = await db.query(
      `select o.payment_status,o.wallet_paid,o.paystack_paid,w.balance,r.status
         from public.orders o join public.wallets w on w.user_id=o.user_id
         join public.wallet_reservations r on r.payment_ref=o.payment_ref where o.id=$1`,
      [orderId],
    );
    assert.equal(rows[0].payment_status, 'confirmed');
    assert.equal(rows[0].wallet_paid, 11000);
    assert.equal(rows[0].paystack_paid, 0);
    assert.equal(rows[0].balance, 4000);
    assert.equal(rows[0].status, 'consumed');
  });

  it('releases a held balance exactly once when a payment group fails', async () => {
    const db = await adminClient();
    await db.query('insert into public.wallets(user_id,balance) values($1,4000)', [buyer.id]);
    await db.query('update public.orders set user_id=$2 where id=$1', [orderId, buyer.id]);
    await asService((client) => client.query('select public.reserve_wallet_for_payment($1,$2)', [paymentRef, buyer.id]));

    await asService((client) => client.query("select public.settle_order_group_payment($1,'failed')", [paymentRef]));
    await asService((client) => client.query("select public.settle_order_group_payment($1,'failed')", [paymentRef]));
    const { rows } = await db.query(
      `select w.balance,r.status,o.payment_status,
        (select count(*)::int from public.wallet_ledger l where l.reference=$2 and l.kind='checkout_release') as releases
       from public.wallets w join public.wallet_reservations r on r.user_id=w.user_id
       join public.orders o on o.payment_ref=r.payment_ref where w.user_id=$1`,
      [buyer.id, paymentRef],
    );
    assert.equal(rows[0].balance, 4000);
    assert.equal(rows[0].status, 'released');
    assert.equal(rows[0].payment_status, 'failed');
    assert.equal(rows[0].releases, 1);
  });

  it('does not expose the reservation RPC or allow a buyer to edit the balance directly', async () => {
    const deniedRpc = await asUser(buyer.id, (client) => attempt(
      client,
      'select public.reserve_wallet_for_payment($1,$2)', [paymentRef, buyer.id],
    ));
    assert.equal(deniedRpc.ok, false);

    const db = await adminClient();
    await db.query('insert into public.wallets(user_id,balance) values($1,5000)', [buyer.id]);
    const directWrite = await asUser(buyer.id, (client) => attempt(
      client,
      'update public.wallets set balance=100000 where user_id=$1', [buyer.id],
    ));
    assert.equal(directWrite.ok, true);
    assert.equal(directWrite.rowCount, 0, 'RLS should filter the buyer wallet update');
    const { rows } = await db.query('select balance from public.wallets where user_id=$1', [buyer.id]);
    assert.equal(rows[0].balance, 5000);
  });
});

describe('host payout adjustment ledger', () => {
  it('keeps offline host credits separate from ticket sales and claims them with one payout', async () => {
    const db = await adminClient();
    await db.query(
      `update public.orders set payment_status='confirmed',status='confirmed',user_id=null,
         wallet_paid=0,refund_status='none',refund_amount=0 where id=$1`, [orderId],
    );
    await setHostVerified(host.id);
    await setAccountStatus(host.id, 'active');
    await registerBankAccount(host.id);

    const adjusted = await asUser(superAdmin.id, (client) => client.query<{ result: Record<string, number> }>(
      `select public.admin_adjust_host_payout($1,5000,'Offline host credit','OFFLINE-001') as result`, [host.id],
    ));
    assert.equal(adjusted.rows[0].result.balance_after, 14350);

    const { rows: orderBefore } = await db.query('select total from public.orders where id=$1', [orderId]);
    const payout = await asUser(host.id, (client) => client.query('select public.request_payout() as id'));
    const { rows: payoutRows } = await db.query('select revenue,platform_fee,adjustment_total,amount from public.payouts where id=$1', [payout.rows[0].id]);
    assert.equal(payoutRows[0].revenue, 11000);
    assert.equal(payoutRows[0].platform_fee, 1650);
    assert.equal(payoutRows[0].adjustment_total, 5000);
    assert.equal(payoutRows[0].amount, 14350);

    const tamper = await asUser(host.id, (client) => attempt(
      client,
      'update public.payouts set adjustment_total=1 where id=$1', [payout.rows[0].id],
    ));
    assert.equal(tamper.ok && tamper.rowCount !== 0, false, 'a host changed the server-calculated payout adjustment');

    const { rows: orderAfter } = await db.query('select total from public.orders where id=$1', [orderId]);
    assert.equal(orderAfter[0].total, orderBefore[0].total, 'payout adjustment must not rewrite ticket sales');
    const { rows: claimRows } = await db.query('select amount,released from public.payout_adjustment_items where payout_id=$1', [payout.rows[0].id]);
    assert.deepEqual(claimRows.map((row) => [row.amount, row.released]), [[5000, false]]);
  });

  it('requires the dedicated super-admin permission and blocks deductions below zero', async () => {
    const unauthorized = await asUser(finance.id, (client) => attempt(
      client,
      `select public.admin_adjust_host_payout($1,1000,'Offline payment adjustment',null)`, [host.id],
    ));
    assert.equal(unauthorized.ok, false);

    const noNegativeBalance = await asUser(superAdmin.id, (client) => attempt(
      client,
      `select public.admin_adjust_host_payout($1,-1,'Deduct payout balance',null)`, [host.id],
    ));
    assert.equal(noNegativeBalance.ok, false);
  });
});


describe('split-tender refunds', () => {
  it('allocates a partial refund pro-rata and credits only the wallet share', async () => {
    const db = await adminClient();
    await db.query(
      `update public.orders set user_id=$2,payment_status='confirmed',status='confirmed',wallet_paid=4000,
         payment_method='mixed',refund_status='none',refund_amount=0 where id=$1`, [orderId, buyer.id],
    );
    await db.query('insert into public.wallets(user_id,balance) values($1,0)', [buyer.id]);
    const refund = await asService((client) => client.query<{ id: string; wallet_amount: number; paystack_amount: number }>(
      `select r.id,r.wallet_amount,r.paystack_amount
         from public.create_order_refund($1,5500,'Partial split refund',$2) as r`, [orderId, finance.id],
    ));
    assert.equal(refund.rows[0].wallet_amount, 2000);
    assert.equal(refund.rows[0].paystack_amount, 3500);
    await asService((client) => client.query(
      `select public.complete_order_refund($1,'refunded','provider-refund-1','success',null)`, [refund.rows[0].id],
    ));

    const { rows } = await db.query(
      `select w.balance,o.refund_status,r.wallet_amount,r.paystack_amount
         from public.wallets w join public.orders o on o.user_id=w.user_id
         join public.refunds r on r.order_id=o.id where o.id=$1`, [orderId],
    );
    assert.equal(rows[0].balance, 2000);
    assert.equal(rows[0].refund_status, 'refunded');
    assert.equal(rows[0].wallet_amount, 2000);
    assert.equal(rows[0].paystack_amount, 3500);
  });
});

describe('complimentary count and event coupons', () => {
  it('keeps complimentary tickets free and outside paid revenue, and binds account email', async () => {
    const db = await adminClient();
    await db.query(
      `insert into public.ticket_types(party_id,name,price,quantity,sold,active)
       values($1,'Complimentary Guest',15000,10,0,true)`, [partyId],
    );
    const { rows: tierRows } = await db.query('select id from public.ticket_types where party_id=$1', [partyId]);
    await db.query(
      `update public.orders set payment_status='confirmed',status='confirmed',tier='regular',total=11000,
         user_id=null,refund_status='none',refund_amount=0 where id=$1`, [orderId],
    );

    const mismatched = await asUser(superAdmin.id, (client) => attempt(
      client,
      `select public.issue_complimentary_ticket($1,$2,1,'someone-else@example.com','Guest',$3)`,
      [partyId, tierRows[0].id, buyer.id],
    ));
    assert.equal(mismatched.ok, false, 'a complimentary ticket must not link to a different account email');

    const issued = await asUser(superAdmin.id, (client) => client.query<{ ticket: { order_id: string; email: string } }>(
      `select public.issue_complimentary_ticket($1,$2,1,$3,'Guest',$4) as ticket`,
      [partyId, tierRows[0].id, buyer.email, buyer.id],
    ));
    assert.equal(issued.rows[0].ticket.email, buyer.email);

    const { rows: reportRows } = await asUser(superAdmin.id, (client) => client.query(
      'select * from public.event_profitability($1)', [partyId],
    ));
    assert.equal(reportRows[0].gross_revenue, 11000);
    assert.equal(Number(reportRows[0].paid_tickets), 2);
    assert.equal(Number(reportRows[0].complimentary_tickets), 1);
    const { rows: freeRows } = await db.query(
      'select total,tier,payment_status,user_id from public.orders where id=$1', [issued.rows[0].ticket.order_id],
    );
    assert.equal(freeRows[0].total, 0);
    assert.equal(freeRows[0].tier, 'complimentary');
    assert.equal(freeRows[0].payment_status, 'confirmed');
    assert.equal(freeRows[0].user_id, buyer.id);
  });

  it('creates a host coupon scoped to that host’s own event', async () => {
    const created = await asUser(host.id, (client) => client.query<{ id: string }>(
      `select public.create_host_promo($1,'HOSTSAVE',15,'Host coupon',10,null,null) as id`, [partyId],
    ));
    const db = await adminClient();
    const { rows } = await db.query('select party_id,created_by,discount_percent from public.promos where id=$1', [created.rows[0].id]);
    assert.equal(rows[0].party_id, partyId);
    assert.equal(rows[0].created_by, host.id);
    assert.equal(rows[0].discount_percent, 15);
  });
});
