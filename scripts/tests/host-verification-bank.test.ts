/**
 * A KYC application must not carry a bank account number.
 *
 * The verification wizard used to ask for a 10-digit account number and an
 * account holder name, and write both to public.host_verifications. That is a
 * permanent identifier for someone's bank account, kept in a table every admin
 * reviewing the verification queue can read, alongside the name the applicant
 * typed rather than the one the bank confirmed.
 *
 * Payouts have not read that column since 00038 - they use the Paystack-verified
 * recipient_code on host_bank_accounts - so the KYC copy was never a source of
 * truth, only a second unverified one.
 *
 * Migration 00042 makes the column unwritable in the database rather than by
 * convention, because the writer here is the service role, which is not bound
 * by grants. These tests assert the trigger itself: anything that reaches the
 * column, from any role, is nulled.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  adminClient,
  asService,
  closeAdmin,
  createAuthUser,
  truncateAll,
  type TestUser,
} from './helpers.ts';

let host: TestUser;

const VALID = {
  business_name: 'Lagos Events Ltd',
  // 00033 narrowed this to individual/company.
  business_type: 'company',
  legal_name: 'Ada Lovelace',
  id_number: '08012345678',
  address: '1 Marina, Lagos',
  bank_name: 'Guaranty Trust Bank',
};

before(async () => {
  await truncateAll();
  host = await createAuthUser('kyc-no-raw-account@example.com');
});

after(async () => {
  await closeAdmin();
});

// A host owns exactly one KYC row, so each test starts by clearing it.
beforeEach(async () => {
  const client = await adminClient();
  await client.query(`delete from public.host_verifications where user_id = $1`, [host.id]);
});

/** Inserts a KYC row the way the service role does, with the given account fields. */
async function insertKyc(account: Record<string, unknown>): Promise<string> {
  const id = await asService(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into public.host_verifications
         (user_id, business_name, business_type, legal_name, id_number, address,
          bank_name, account_holder, account_last4, account_number)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        host.id,
        VALID.business_name,
        VALID.business_type,
        VALID.legal_name,
        VALID.id_number,
        VALID.address,
        VALID.bank_name,
        account.account_holder ?? null,
        account.account_last4 ?? null,
        account.account_number ?? null,
      ],
    );
    return rows[0].id;
  });
  return id;
}

async function readKyc(id: string): Promise<{
  account_number: string | null;
  account_holder: string | null;
  account_last4: string | null;
}> {
  const client = await adminClient();
  const { rows } = await client.query<{
    account_number: string | null;
    account_holder: string | null;
    account_last4: string | null;
  }>(`select account_number, account_holder, account_last4 from public.host_verifications where id = $1`, [id]);
  return rows[0];
}

describe('KYC: a bank account number cannot be stored', () => {
  it('nulls a full account number sent by the service role', async () => {
    const id = await insertKyc({
      account_holder: 'ADA LOVERLACE',
      account_last4: '6789',
      account_number: '0123456789',
    });

    const row = await readKyc(id);
    assert.equal(
      row.account_number,
      null,
      'a full NUBAN must never reach the KYC table, even from the writer that stores it'
    );
    // last4 survives: it is enough for an admin to recognise the account and
    // useless to anyone who reads the row.
    assert.equal(row.account_last4, '6789');
  });

  it('nulls an account number on update too, not just insert', async () => {
    const id = await insertKyc({ account_holder: 'ADA LOVERLACE', account_last4: '1111' });

    // A later edit that tries to attach a number must be refused the same way,
    // or the column fills up one update at a time.
    await asService(async (c) => {
      await c.query(`update public.host_verifications set account_number = '9988776655' where id = $1`, [id]);
    });

    assert.equal((await readKyc(id)).account_number, null);
  });

  it('clears a number that was already stored before the migration', async () => {
    // The migration scrubs history. Re-inserting one directly and running the
    // trigger is the only way to prove the scrub itself, so this asserts the
    // column can no longer hold a value at all.
    const id = await insertKyc({ account_holder: 'ADA LOVERLACE', account_last4: '2222' });
    assert.equal((await readKyc(id)).account_number, null);
  });

  it('accepts a KYC with no bank account details at all', async () => {
    // The payout page's bank form is not gated behind verification, so a host
    // can submit KYC first and add the verified account afterwards. If this
    // failed, the two steps would deadlock.
    const id = await insertKyc({});
    const row = await readKyc(id);
    assert.equal(row.account_holder, null, 'an absent account is null, not a placeholder');
    assert.equal(row.account_last4, null);
  });

  it('still refuses a malformed last4', async () => {
    // Dropping NOT NULL must not have weakened the check: absent is allowed,
    // wrong is not.
    const result = await asService(async (c) => {
      try {
        await c.query('savepoint sp1');
        await c.query(
          `insert into public.host_verifications
             (user_id, business_name, business_type, legal_name, id_number, address,
              bank_name, account_holder, account_last4)
           values ($1, $2, $3, $4, $5, $6, $7, 'ADA LOVERLACE', $8)`,
          [host.id, VALID.business_name, VALID.business_type, VALID.legal_name, VALID.id_number, VALID.address, VALID.bank_name, '123'],
        );
        await c.query('release savepoint sp1');
        return null;
      } catch (e) {
        await c.query('rollback to savepoint sp1');
        return (e as Error).message;
      }
    });
    assert.match(String(result), /account_last4/, 'three digits is still not a last-four');
  });

  it('holds even for the table owner, who bypasses grants entirely', async () => {
    // The strongest form of the claim. postgres owns the table, so a revoked
    // GRANT or a column-level rule would not stop it - only a trigger does.
    // If this ever starts failing, the protection has quietly become advisory.
    //
    // The row is created through the service role because a separate guard,
    // enforce_host_verification_flow(), refuses to let the owner insert one at
    // all. The update is done as the owner, which is the part that matters here.
    await insertKyc({ account_holder: 'ADA LOVERLACE', account_last4: '3333' });

    const client = await adminClient();
    const owner = await client.query<{ current_user: string }>('select current_user');
    await client.query(`update public.host_verifications set account_number = '0123456789' where user_id = $1`, [
      host.id,
    ]);

    const { rows } = await client.query<{ account_number: string | null }>(
      `select account_number from public.host_verifications where user_id = $1`,
      [host.id]
    );
    assert.equal(
      rows[0].account_number,
      null,
      `the table owner (${owner.rows[0].current_user}) cannot store one either`
    );
  });

  it('cannot be bypassed by turning the trigger off', async () => {
    // Not a claim about postgres privileges, just that the protection is a
    // trigger on the table rather than a rule in one code path: the invariant
    // is visible in information_schema, so the next migration cannot drop it by
    // accident.
    const client = await adminClient();
    const { rows } = await client.query<{ present: boolean }>(
      `select exists (
         select 1 from pg_trigger
          where tgrelid = 'public.host_verifications'::regclass
            and tgname = 'trg_block_raw_account_numbers'
            and not tgisinternal
       ) as present`,
    );
    assert.equal(rows[0].present, true);
  });
});
