import { randomUUID } from 'node:crypto';
import { connect } from '../db/apply.ts';

export type ApiRole = 'anon' | 'authenticated' | 'service_role';

export interface TestUser {
  id: string;
  email: string;
}

export interface Attempt {
  ok: boolean;
  rowCount: number;
  error: string | null;
  errorCode: string | null;
}

let admin: import('pg').PoolClient | import('pg').Client | null = null;

/** Connection that bypasses RLS. Used only for fixtures and assertions. */
export async function adminClient() {
  if (!admin) {
    admin = connect('lagoslive_rls_test');
    await admin.connect();
  }
  return admin;
}

export async function closeAdmin() {
  if (admin) {
    await admin.end();
    admin = null;
  }
}

export function testDbName(): string {
  return process.env.TEST_PGTESTDATABASE ?? 'lagoslive_rls_test';
}

export function testClient() {
  return connect(testDbName());
}

/**
 * Runs `fn` as a Supabase API role with a forged-but-realistic JWT.
 *
 * RLS is enforced here exactly as it is on a hosted project: the session
 * connects as the table owner, then switches to `anon`/`authenticated`/
 * `service_role` inside a transaction, so `current_user` is the API role and
 * row security applies. The transaction commits on completion and rolls back
 * on error, so a write has to be real to be asserted on; `attempt` isolates
 * each statement in a savepoint so a rejected write commits cleanly. Suites
 * re-seed their own tables in `before`, which is what isolates tests.
 */
export async function asRole<T>(
  role: ApiRole,
  claims: { sub?: string; role?: string } | null,
  fn: (client: import('pg').Client) => Promise<T>,
  options: { commit?: boolean } = {},
): Promise<T> {
  const client = testClient();
  await client.connect();
  try {
    await client.query('begin');
    if (claims) {
      const payload = JSON.stringify({ role, ...claims });
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [payload]);
    } else {
      await client.query(`select set_config('request.jwt.claims', '', true)`);
    }
    await client.query(`set local role ${role}`);
    const result = await fn(client);
    // Committed by default: the interesting question is whether a write
    // *persisted*, so it has to outlive the transaction to be checked. Each
    // rejected statement is isolated in its own savepoint (see `attempt`), so
    // a denied write still commits cleanly. Suites re-seed their tables in
    // `before`, which is what isolates tests; pass `commit: false` for a test
    // that needs its writes discarded.
    await client.query(options.commit === false ? 'rollback' : 'commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export function asUser<T>(
  userId: string,
  fn: (c: import('pg').Client) => Promise<T>,
  options: { commit?: boolean } = {},
) {
  return asRole('authenticated', { sub: userId, role: 'authenticated' }, fn, options);
}
export function asAnon<T>(fn: (c: import('pg').Client) => Promise<T>) {
  return asRole('anon', null, fn);
}

export function asService<T>(fn: (c: import('pg').Client) => Promise<T>) {
  return asRole('service_role', { role: 'service_role' }, fn);
}

/**
 * Runs `fn` as the table owner with no API role set — the same session a
 * migration or a SECURITY DEFINER function body runs in.
 *
 * Needed to test constraints and triggers that are supposed to hold even for
 * the owner, which is a claim an API-role test cannot make.
 */
export async function asOwner<T>(
  fn: (client: import('pg').Client) => Promise<T>,
  options: { commit?: boolean } = {},
): Promise<T> {
  const client = testClient();
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', '', true)`);
    const result = await fn(client);
    await client.query(options.commit === false ? 'rollback' : 'commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Executes a statement and reports what happened instead of throwing.
 *
 * RLS has two distinct failure modes and both matter for these tests:
 *   * a WITH CHECK violation raises 42501
 *   * a missing/over-filtering USING clause raises nothing and simply reports
 *     zero affected rows
 * A test that only asserted "no error" would happily pass on the second case,
 * which is exactly how the profile escalation hid.
 */
export async function attempt(
  client: import('pg').Client,
  sql: string,
  values: unknown[] = [],
): Promise<Attempt> {
  // A rejected statement aborts the whole transaction, which would make every
  // later assertion in the same test unrunnable. Each attempt therefore runs
  // inside a savepoint so a blocked write can be inspected and the session
  // stays usable — the blocked-write case is the interesting one.
  await client.query('savepoint sp_attempt');
  try {
    const result = await client.query(sql, values);
    await client.query('release savepoint sp_attempt');
    return { ok: true, rowCount: result.rowCount ?? 0, error: null, errorCode: null };
  } catch (error) {
    const err = error as { message?: string; code?: string };
    await client.query('rollback to savepoint sp_attempt');
    await client.query('release savepoint sp_attempt').catch(() => undefined);
    return { ok: false, rowCount: 0, error: err.message ?? null, errorCode: err.code ?? null };
  }
}

export async function scalar<T = unknown>(sql: string, values: unknown[] = []): Promise<T> {
  const client = await adminClient();
  const result = await client.query(sql, values);
  return result.rows[0]?.value as T;
}

export type AttemptWithValue<T> = {
  ok: boolean;
  /** The first column of the first row, or null when the statement returned none. */
  value: T | null;
  error: string | null;
  errorCode: string | null;
};

/**
 * Like `attempt`, but hands back the value the statement produced.
 *
 * Several of the functions under test are called for their return value rather
 * than their side effect — claim_payout_transfer has to return the reference it
 * issued, or the test is asserting on a claim it never actually made. attempt()
 * deliberately reports only success and failure, so this is the version to reach
 * for when the value is the point of the call.
 */
export async function attemptValue<T = unknown>(
  client: import('pg').Client,
  sql: string,
  values: unknown[] = [],
): Promise<AttemptWithValue<T>> {
  await client.query('savepoint sp_value');
  try {
    const result = await client.query(sql, values);
    await client.query('release savepoint sp_value');
    const first = result.rows[0];
    if (!first) return { ok: true, value: null, error: null, errorCode: null };
    return { ok: true, value: Object.values(first)[0] as T, error: null, errorCode: null };
  } catch (error) {
    const err = error as { message?: string; code?: string };
    await client.query('rollback to savepoint sp_value');
    await client.query('release savepoint sp_value').catch(() => undefined);
    return { ok: false, value: null, error: err.message ?? null, errorCode: err.code ?? null };
  }
}

/** Creates an auth user; the handle_new_user trigger provisions the profile. */
export async function createAuthUser(email: string, meta: Record<string, unknown> = {}): Promise<TestUser> {
  const id = randomUUID();
  const client = await adminClient();
  await client.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [id, email, JSON.stringify(meta)],
  );
  return { id, email };
}

/** Promotes a user's legacy profiles.role, which also syncs user_roles. */
export async function setLegacyRole(userId: string, role: string) {
  const client = await adminClient();
  await client.query(`update public.profiles set role = $2 where id = $1`, [userId, role]);
}

/** Creates an approved, on-sale party owned by `organizerId`. */
/**
 * Marks a user a verified host.
 *
 * Goes through the service role because `enforce_host_verification_review`
 * rejects any direct write to these columns except for service_role or an
 * admin, which is exactly the protection a fixture should not be routing
 * around by writing as the table owner.
 */
export async function setHostVerified(userId: string, verified = true) {
  await asService((c) =>
    c.query(
      `update public.profiles
          set host_verification_status = $2,
              host_verification_reviewed_at = now()
        where id = $1`,
      [userId, verified ? 'verified' : 'unverified'],
    ),
  );
}

export async function setAccountStatus(userId: string, status: string) {
  await asService((c) => c.query(`update public.profiles set account_status = $2 where id = $1`, [userId, status]));
}

/**
 * Registers a verified bank account for a user.
 *
 * `register_bank_account` is service-role only because in production the values
 * it stores come from Paystack's response to a live recipient-creation call.
 * A fixture cannot make that call, so it supplies a synthetic recipient code —
 * the point of the helper is the database state, not the provider round-trip.
 */
export async function registerBankAccount(
  userId: string,
  overrides: {
    bankCode?: string;
    bankName?: string;
    accountName?: string;
    last4?: string;
    recipientCode?: string;
  } = {},
): Promise<string> {
  const client = await adminClient();
  const { rows } = await client.query<{ id: string }>(
    `select public.register_bank_account($1, $2, $3, $4, $5, $6) as id`,
    [
      userId,
      overrides.bankCode ?? '058',
      overrides.bankName ?? 'Guaranty Trust Bank',
      overrides.accountName ?? 'LAGOSLIVE TEST HOST',
      overrides.last4 ?? '0123',
      overrides.recipientCode ?? `RCP_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    ],
  );
  return rows[0].id;
}

export async function createParty(
  organizerId: string,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const client = await adminClient();
  // `enforce_event_review` only lets staff move a party into approved. Seeding
  // fixtures uses the same documented bypass the migrations use, so the test
  // doesn't have to grant events.approve to a throwaway user.
  await client.query(`select set_config('app.bypass_event_review', 'on', false)`);
  const { rows } = await client.query(
    `insert into public.parties
       (title, date, time, location, address, lat, lng, fee, fee_num, distance, vibe,
        capacity, spots_left, age_restriction, dress_code, organizer, instagram, whatsapp,
        description, gradient, starts_at, ends_at, created_by, status)
     values ($1, current_date + 30, '20:00', 'Victoria Island', '24 Adeola Odeku St',
             6.4281, 3.4219, '5,000', 5000, 4.2, 'Club',
             200, 200, '18+', 'Smart casual', 'Test Host', '@testhost', '+2348000000000',
             'A test party.', 'sunset', now() + interval '30 days', now() + interval '30 days 5 hours',
             $2, 'approved')
     returning id`,
    [String(overrides.title ?? 'Test Party'), organizerId],
  );
  await client.query(`select set_config('app.bypass_event_review', 'off', false)`);
  return rows[0].id;
}

/** Creates an order for a party, defaulting to a pending/unpaid one. */
export async function createOrder(
  partyId: number,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const client = await adminClient();
  const { rows } = await client.query(
    `insert into public.orders
       (party_id, tier, quantity, unit_price, service_fee, total, order_ref, payment_ref,
        status, payment_status, customer_email, ticket_access_token)
     values ($1, 'regular', $2, $3, $4, $5, $6, $6, $7, $8, $9, $10)
     returning id`,
    [
      partyId,
      overrides.quantity ?? 2,
      overrides.unit_price ?? 5000,
      overrides.service_fee ?? 1000,
      overrides.total ?? 11000,
      `ref-${randomUUID().slice(0, 12)}`,
      overrides.payment_status ?? 'pending',
      overrides.status ?? 'pending',
      String(overrides.customer_email ?? 'buyer@example.com'),
      overrides.ticket_access_token ?? `tok_${randomUUID().replace(/-/g, '')}`,
    ],
  );
  return rows[0].id;
}

/**
 * Truncates mutable data so each suite starts clean.
 *
 * Every suite shares one test database and re-seeds in its own `before`, which
 * is why the test runner is invoked with --test-concurrency=1: two files
 * truncating and re-inserting the same tables at the same time would race, and
 * the resulting failure would look like a security bug.
 *
 * The RBAC catalogue (roles / permissions / role_permissions) is seeded by
 * migration 00024 and is reference data, not test data: truncating it silently
 * strips every staff user of their permissions and makes privilege tests pass
 * for the wrong reason.
 */
const SEED_TABLES = new Set(['permissions', 'roles', 'role_permissions']);

export async function truncateAll() {
  const client = await adminClient();
  const tables = await client.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = tables.rows
    .map((r) => r.tablename)
    .filter((t) => !SEED_TABLES.has(t))
    .map((t) => `public."${t}"`)
    .join(', ');

  // Clear assignable-role rows first: user_roles.assigned_by references
  // auth.users with no ON DELETE action, so deleting a user who appears in
  // that column would violate the constraint.
  await client.query(`delete from public.user_roles`);

  // DELETE, not TRUNCATE ... CASCADE. Truncating auth.users cascades into every
  // referencing table regardless of its ON DELETE rule, which would wipe the
  // seeded `roles` catalogue via roles.created_by and silently strip all staff
  // permissions. Deleting respects ON DELETE SET NULL and keeps the catalogue.
  await client.query(`delete from auth.users`);

  if (names) {
    await client.query(`truncate ${names} restart identity cascade`);
  }
}
