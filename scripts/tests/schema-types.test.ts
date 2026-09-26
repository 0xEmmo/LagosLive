import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminClient, closeAdmin } from './helpers.ts';

/**
 * Generated types must describe the schema that actually exists.
 *
 * lib/supabase/database.types.ts is committed, and nothing regenerates it as
 * part of the build, so it drifts silently: a migration adds a table or an RPC,
 * the application calls it, and `tsc` fails with an error that reads like a
 * typing bug rather than "you forgot to update the generated file". This suite
 * compares the types file against the live migrated schema in both directions,
 * so a missing entry is a test failure with an accurate message.
 *
 * It is a name-and-shape check, not a full type-equality check: the point is to
 * catch an entry that was never added, and a table that was dropped or renamed
 * out from under code that still refers to it.
 */

const TYPES_PATH = new URL('../../lib/supabase/database.types.ts', import.meta.url);

let types: string;
let tables: string[];
let functions: string[];

before(async () => {
  types = readFileSync(TYPES_PATH, 'utf8');
  const client = await adminClient();

  tables = (
    await client.query<{ tablename: string }>(
      `select tablename from pg_tables
        where schemaname = 'public'
          and tablename not in ('spatial_ref_sys', 'geometry_columns', 'geography_columns')
        order by tablename`,
    )
  ).rows.map((r) => r.tablename);

  functions = (
    await client.query<{ proname: string }>(
      `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          -- overloads collapse to one name, matching how the generated file
          -- keys the Functions map
        group by p.proname
        order by p.proname`,
    )
  ).rows.map((r) => r.proname);
});

after(async () => {
  await closeAdmin();
});

/** Reads the top-level keys of a `Tables:` / `Functions:` block. */
function declaredKeys(section: 'Tables' | 'Functions'): Set<string> {
  const start = types.indexOf(`    ${section}: {`);
  assert.notEqual(start, -1, `no ${section} block in database.types.ts`);
  const end = types.indexOf('\n    Views:', start);
  const block = types.slice(start, end === -1 ? undefined : end);
  const keys = new Set<string>();
  // Four-space-indented keys are the direct members of the block.
  for (const m of block.matchAll(/^ {6}([A-Za-z_]\w*): \{/gm)) keys.add(m[1]);
  return keys;
}

describe('generated types: tables', () => {
  it('declares every public table in the schema', () => {
    const declared = declaredKeys('Tables');
    const missing = tables.filter((t) => !declared.has(t));
    assert.deepEqual(
      missing,
      [],
      `these tables exist in the database but not in lib/supabase/database.types.ts — regenerate it: ${missing.join(', ')}`,
    );
  });

  it('declares no table that no longer exists', () => {
    const declared = declaredKeys('Tables');
    const stale = [...declared].filter((t) => !tables.includes(t));
    assert.deepEqual(
      stale,
      [],
      `database.types.ts declares tables that are not in the schema: ${stale.join(', ')}`,
    );
  });

  it('has the payment ledger, which the webhook route writes to', () => {
    assert.ok(
      declaredKeys('Tables').has('payment_events'),
      'payment_events is missing from the generated types',
    );
  });

  it('has the payout provenance table, which stops double-claiming revenue', () => {
    assert.ok(
      declaredKeys('Tables').has('payout_items'),
      'payout_items is missing from the generated types',
    );
  });

  it('has the verified bank details table', () => {
    assert.ok(
      declaredKeys('Tables').has('host_bank_accounts'),
      'host_bank_accounts is missing from the generated types',
    );
  });

  it('has the transfer delivery ledger and the payout freeze table', () => {
    // The webhook writes payout_transfer_events for every delivery, matched or
    // not, and request_payout consults host_payout_freezes. Both are load-bearing
    // and a type drift in either would fail at runtime, not at compile time.
    assert.ok(
      declaredKeys('Tables').has('payout_transfer_events'),
      'payout_transfer_events is missing from the generated types',
    );
    assert.ok(
      declaredKeys('Tables').has('host_payout_freezes'),
      'host_payout_freezes is missing from the generated types',
    );
    // The webhook reads this one directly: a delivery that matches no live payout
    // is checked against closed attempts, and a rename would compile cleanly and
    // then quietly stop recognising redeliveries.
    assert.ok(
      declaredKeys('Tables').has('payout_transfer_attempts'),
      'payout_transfer_attempts is missing from the generated types',
    );
  });

  it('types the columns the attempt history is read by', () => {
    const start = types.indexOf('      payout_transfer_attempts: {');
    assert.notEqual(start, -1, 'no payout_transfer_attempts block in database.types.ts');
    const rowStart = types.indexOf('        Row: {', start);
    const rowEnd = types.indexOf('        Insert: {', start);
    const row = types.slice(rowStart, rowEnd);
    for (const column of ['attempt_number', 'status', 'transfer_code', 'transfer_reference', 'reversal_reason']) {
      assert.ok(row.includes(column), `payout_transfer_attempts.Row is missing ${column}`);
    }
  });

  it('leaves payouts.Row.status a string so the states live in one place', () => {
    // Narrowing this to a union would put the state machine in two files, and
    // database.types.ts is generated — so a migration adding a state would fail to
    // compile until someone hand-edited a generated file. The constraint itself is
    // exercised for real by the transfer_pending tests in payout-transfers.test.ts.
    const start = types.indexOf('      payouts: {');
    const rowStart = types.indexOf('        Row: {', start);
    const rowEnd = types.indexOf('        Insert: {', start);
    assert.ok(
      types.slice(rowStart, rowEnd).includes('status: string'),
      'payouts.Row.status should stay a string so states are not duplicated in the types',
    );
  });

  it('types the reversal columns on payouts', () => {
    // Read as text because the file is loaded as a string, and the block is
    // located by its own boundaries so the assertion is about payouts rather
    // than about a column of the same name somewhere else.
    const start = types.indexOf('      payouts: {');
    assert.notEqual(start, -1, 'no payouts block in database.types.ts');
    const rowStart = types.indexOf('        Row: {', start);
    const rowEnd = types.indexOf('        Insert: {', start);
    const row = types.slice(rowStart, rowEnd);
    for (const column of [
      'reversed_at',
      'reversal_code',
      'reversal_reference',
      'reversal_reason',
      'transfer_attempted_at',
    ]) {
      assert.ok(row.includes(column), `payouts.Row is missing ${column}`);
    }
  });
});

describe('generated types: functions', () => {
  it('declares every public function in the schema', () => {
    const declared = declaredKeys('Functions');
    // The generated file omits functions that take or return types the Supabase
    // generator cannot express, and internal helpers are equally absent from a
    // regenerated file. Anything the application calls is what matters here, so
    // this asserts on the functions the app actually uses rather than on every
    // internal trigger helper in the database.
    const usedByApp = [
      'write_audit_log',
      'confirm_order_group',
      'settle_order_payment',
      'record_payment_event_outcome',
      'payment_reconciliation',
      'request_payout',
      'transition_payout',
      'mark_payout_paid',
      'my_bank_accounts',
      'register_bank_account',
      'remove_bank_account',
    ];
    const missing = usedByApp.filter((f) => !declared.has(f));
    assert.deepEqual(
      missing,
      [],
      `functions called by the application are missing from the generated types: ${missing.join(', ')}`,
    );
  });

  it('has a type for the RPC the webhook calls to stamp an outcome', () => {
    assert.ok(
      types.includes('record_payment_event_outcome:'),
      'record_payment_event_outcome is missing from the generated types',
    );
  });
});
