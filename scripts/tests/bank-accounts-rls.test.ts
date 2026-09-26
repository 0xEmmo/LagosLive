import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminClient,
  asService,
  asUser,
  attempt,
  closeAdmin,
  createAuthUser,
  registerBankAccount,
  setLegacyRole,
  truncateAll,
  type TestUser,
} from './helpers.ts';

/**
 * PART 3b — verified bank details.
 *
 * The payout destination used to be a `bank_last4` typed into the request by
 * the person being paid. These tests pin the properties that make a payout
 * destination trustworthy instead:
 *
 *   - the account number is never stored, so a database breach cannot yield
 *     live bank credentials;
 *   - the Paystack recipient code is not readable by the host, only by the
 *     service role, because that token is what money is sent to;
 *   - a verified account cannot be registered, edited or retired by a client;
 *   - a host cannot touch somebody else's account;
 *   - an account a live payout depends on cannot be retired out from under it.
 */

let host: TestUser;
let other: TestUser;
let stranger: TestUser;

before(async () => {
  await truncateAll();
  host = await createAuthUser('bank-host@example.com');
  other = await createAuthUser('bank-other@example.com');
  stranger = await createAuthUser('bank-stranger@example.com');
  await setLegacyRole(host.id, 'organizer');
  await setLegacyRole(other.id, 'organizer');
});

beforeEach(async () => {
  const client = await adminClient();
  // Payouts first: payouts.bank_account_id is ON DELETE RESTRICT, so a payout
  // left over from a previous test would block this cleanup — which is the
  // behaviour under test, not a bug in the fixture.
  await client.query(`delete from public.payout_items`);
  await client.query(`delete from public.payouts`);
  await client.query(`delete from public.host_bank_accounts`);
});

after(async () => {
  await closeAdmin();
});

describe('bank accounts: the account number is never stored', () => {
  it('has nowhere to put an account number', async () => {
    const client = await adminClient();
    const { rows } = await client.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'host_bank_accounts'`,
    );
    const columns = rows.map((r) => r.column_name);
    assert.ok(
      !columns.includes('account_number'),
      'host_bank_accounts must not have a column for the account number',
    );
    assert.ok(
      columns.includes('recipient_code'),
      'host_bank_accounts should hold the Paystack recipient code',
    );
    assert.ok(
      columns.includes('account_number_last4'),
      'host_bank_accounts should keep the last four digits for display',
    );
  });

  it('keeps only the last four digits of the number it was given', async () => {
    const client = await adminClient();
    const id = await registerBankAccount(host.id, { last4: '9876' });
    const { rows } = await client.query(
      `select account_number_last4 from public.host_bank_accounts where id = $1`,
      [id],
    );
    assert.equal(rows[0].account_number_last4, '9876');
  });
});

describe('bank accounts: the recipient code is service-role only', () => {
  it('cannot be read by the host through a direct select', async () => {
    await registerBankAccount(host.id);
    const result = await asUser(host.id, (c) =>
      attempt(c, `select recipient_code from public.host_bank_accounts`),
    );
    assert.equal(result.ok, false, 'a host could read their own recipient code directly');
  });

  it('is not returned by the function the host is meant to use', async () => {
    await registerBankAccount(host.id);
    const { rows: data } = await asUser(host.id, (c) => c.query('select * from public.my_bank_accounts()'));
    assert.ok(Array.isArray(data), 'my_bank_accounts should return a list');
    assert.equal(data.length, 1);
    // The whole point: the token that money is sent to is not in this result.
    assert.ok(
      !('recipient_code' in data[0]),
      'my_bank_accounts must not expose recipient_code to the host',
    );
    // The fields the form actually needs are present.
    assert.equal(data[0].account_number_last4, '0123');
    assert.equal(data[0].bank_name, 'Guaranty Trust Bank');
  });
});

describe('bank accounts: only the service role can create one', () => {
  it('refuses a client that tries to register its own account', async () => {
    const result = await asUser(host.id, (c) =>
      attempt(
        c,
        `insert into public.host_bank_accounts
           (user_id, bank_code, bank_name, account_name, account_number_last4, recipient_code)
         values ($1, '058', 'Guaranty Trust Bank', 'HOST', '0001', 'RCP_forged_by_client')`,
        [host.id],
      ),
    );
    assert.equal(result.ok, false, 'a host could register a bank account directly');
  });

  it('refuses a client calling register_bank_account', async () => {
    const result = await asUser(host.id, (c) =>
      attempt(c, `select public.register_bank_account(
        $1, '058', 'GTBank', 'HOST', '0001', 'RCP_forged_by_client')`, [host.id]),
    );
    assert.equal(result.ok, false, 'a host could call register_bank_account directly');
  });

  it('refuses an anonymous caller', async () => {
    const { asAnon } = await import('./helpers.ts');
    const result = await asAnon((c) =>
      attempt(c, `select public.register_bank_account(
        $1, '058', 'GTBank', 'HOST', '0001', 'RCP_anonymous')`, [host.id]),
    );
    assert.equal(result.ok, false, 'an anonymous caller could register a bank account');
  });

  it('lets the service role register one', async () => {
    const id = await registerBankAccount(host.id, { recipientCode: 'RCP_service_ok' });
    const client = await adminClient();
    const { rows } = await client.query(
      `select recipient_code from public.host_bank_accounts where id = $1`,
      [id],
    );
    assert.equal(rows[0].recipient_code, 'RCP_service_ok');
  });
});

describe('bank accounts: a host can only see and remove their own', () => {
  it('lists only the calling host accounts', async () => {
    await registerBankAccount(host.id);
    await registerBankAccount(other.id);
    const { rows: data } = await asUser(host.id, (c) => c.query('select * from public.my_bank_accounts()'));
    assert.equal(data.length, 1, 'a host saw another host bank accounts');
  });

  it('refuses to remove somebody else account', async () => {
    const otherId = await registerBankAccount(other.id);
    const result = await asUser(host.id, (c) =>
      attempt(c, `select public.remove_bank_account($1)`, [otherId]),
    );
    assert.equal(result.ok, false, "a host could remove another host's bank account");

    const client = await adminClient();
    const { rows } = await client.query(
      `select removed_at from public.host_bank_accounts where id = $1`,
      [otherId],
    );
    assert.equal(rows[0].removed_at, null, 'the account was retired despite the refusal');
  });

  it('lets a host remove their own', async () => {
    const id = await registerBankAccount(host.id);
    const result = await asUser(host.id, (c) =>
      attempt(c, `select public.remove_bank_account($1)`, [id]),
    );
    assert.equal(result.ok, true, `remove_bank_account failed: ${result.error}`);

    const { rows: data } = await asUser(host.id, (c) => c.query('select * from public.my_bank_accounts()'));
    assert.equal(data.length, 0, 'a removed account is still listed');
  });

  it('replaces rather than accumulating, so a payout destination is never ambiguous', async () => {
    await registerBankAccount(host.id, { last4: '1111' });
    await registerBankAccount(host.id, { last4: '2222' });
    const { rows: data } = await asUser(host.id, (c) => c.query('select * from public.my_bank_accounts()'));
    assert.equal(data.length, 1, 'a host ended up with more than one live account');
    assert.equal(data[0].account_number_last4, '2222');
  });
});

describe('bank accounts: a live payout pins the destination', () => {
  it('refuses to retire an account a pending payout depends on', async () => {
    const bankId = await registerBankAccount(host.id);
    await asService((c) =>
      c.query(
        `insert into public.payouts
           (organizer_id, bank_account_id, period_start, period_end, revenue,
            platform_fee, amount, status, bank_last4)
         values ($1, $2, current_date, current_date, 5000, 750, 4250, 'pending', '0123')`,
        [host.id, bankId],
      ),
    );

    const result = await asUser(host.id, (c) =>
      attempt(c, `select public.remove_bank_account($1)`, [bankId]),
    );
    assert.equal(result.ok, false, 'the account behind a pending payout could be retired');

    await asService((c) => c.query(`update public.payouts set status = 'rejected' where bank_account_id = $1`, [bankId]));
    const afterRejection = await asUser(host.id, (c) =>
      attempt(c, `select public.remove_bank_account($1)`, [bankId]),
    );
    assert.equal(afterRejection.ok, true, 'a rejected payout should no longer pin the account');
  });

  it('keeps the account row reachable after a paid payout, for the audit trail', async () => {
    const bankId = await registerBankAccount(host.id);
    await asService((c) =>
      c.query(
        `insert into public.payouts
           (organizer_id, bank_account_id, period_start, period_end, revenue,
            platform_fee, amount, status, bank_last4, paid_at)
         values ($1, $2, current_date, current_date, 5000, 750, 4250, 'paid', '0123', now())`,
        [host.id, bankId],
      ),
    );

    // The ON DELETE RESTRICT foreign key is the guarantee: a paid payout's
    // destination cannot be deleted out from under the record of it.
    let blocked = false;
    try {
      await asService((c) => c.query(`delete from public.host_bank_accounts where id = $1`, [bankId]));
    } catch (err) {
      blocked = err instanceof Error && err.message.includes('foreign key constraint');
    }
    assert.equal(blocked, true, 'a paid payout lost the record of where it was sent');
  });
});

describe('bank accounts: a stranger has no business here', () => {
  it('sees nothing when calling the listing function', async () => {
    await registerBankAccount(host.id);
    const { rows: data } = await asUser(stranger.id, (c) => c.query('select * from public.my_bank_accounts()'));
    assert.equal(data.length, 0, 'a stranger saw a bank account');
  });

  it('cannot reach the table at all', async () => {
    const result = await asUser(stranger.id, (c) =>
      attempt(c, `select count(*)::int as n from public.host_bank_accounts`),
    );
    assert.equal(result.ok, false, 'a user could read the bank accounts table directly');
  });
});
