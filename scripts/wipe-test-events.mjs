import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ===========================================================================
// Purge all event (parties) data for a clean pre-production marketplace.
//
// SAFE BY DEFAULT: runs as a dry run and only reads/counts. Nothing is
// mutated unless you pass --execute. Before deleting, every affected table is
// exported to JSON under the OS temp dir.
//
// Usage (service role key bypasses RLS, so keep it out of committed files):
//   node --env-file=.env.local scripts/wipe-test-events.mjs
//   node --env-file=.env.local scripts/wipe-test-events.mjs --execute
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env.
//
// FK-safe order: orders reference parties ON DELETE RESTRICT, so orders are
// removed first; deleting parties then cascades ticket_types, reviews,
// reminders, saved_parties and homepage_trending_events.
//
// Deliberately retained: audit_logs (immutable security trail), admin_notes
// and promos (platform-wide config, not tied to any event).
// ===========================================================================

const EXECUTE = process.argv.includes('--execute');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey || serviceKey === '[SENSITIVE]') {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Load them with: node --env-file=.env.local scripts/wipe-test-events.mjs');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(os.tmpdir(), `lagoslive-event-wipe-${stamp}`);

const TABLES = [
  'parties',
  'orders',
  'ticket_types',
  'reviews',
  'reminders',
  'saved_parties',
  'homepage_trending_events',
  'notification_sends',
  'audit_logs',
  'admin_notes',
];

// Notification types whose ref_id points at an event or an order that is going
// away. host_verification / host_payout / campaign are retained.
const EVENT_NOTIFICATION_TYPES = [
  'event_reminder',
  'event_change',
  'event_cancellation',
  'saved_event_update',
  'ticket_confirmation',
  'review_request',
  'refund_update',
  'check_in_summary',
];

async function selectAll(table) {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + page - 1);
    if (error) throw new Error(`select ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < page) break;
  }
  return rows;
}

async function deleteByIds(table, ids) {
  const chunk = 100;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += chunk) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .in('id', ids.slice(i, i + chunk))
      .select('id');
    if (error) throw new Error(`delete ${table}: ${error.message}`);
    deleted += data.length;
  }
  return deleted;
}

async function listEventObjects() {
  const { data: top, error } = await supabase.storage.from('event-images').list('events');
  if (error) throw new Error(`storage list events: ${error.message}`);
  const objects = [];
  for (const entry of top) {
    if (entry.id !== null) {
      objects.push(`events/${entry.name}`);
      continue;
    }
    const { data: children, error: childError } = await supabase.storage
      .from('event-images')
      .list(`events/${entry.name}`);
    if (childError) throw new Error(`storage list events/${entry.name}: ${childError.message}`);
    for (const child of children) objects.push(`events/${entry.name}/${child.name}`);
  }
  return objects;
}

async function main() {
  console.log(`Project: ${supabaseUrl}`);
  console.log(`Mode:    ${EXECUTE ? 'EXECUTE (destructive)' : 'DRY RUN (read-only)'}`);

  fs.mkdirSync(backupDir, { recursive: true });

  const data = {};
  fs.writeFileSync(
    path.join(backupDir, 'manifest.json'),
    JSON.stringify({ supabaseUrl, mode: EXECUTE ? 'execute' : 'dry-run', createdAt: new Date().toISOString() }, null, 2)
  );
  for (const table of TABLES) {
    data[table] = await selectAll(table);
    fs.writeFileSync(path.join(backupDir, `${table}.json`), JSON.stringify(data[table], null, 2));
    console.log(`  ${table}: ${data[table].length} rows backed up`);
  }

  const partyIds = data.parties.map((row) => row.id);
  const orderIds = data.orders.map((row) => row.id);
  const notificationIds = data.notification_sends
    .filter((row) => EVENT_NOTIFICATION_TYPES.includes(row.type))
    .map((row) => row.id);
  const objects = await listEventObjects();
  fs.writeFileSync(path.join(backupDir, 'storage-objects.json'), JSON.stringify(objects, null, 2));

  console.log(`\nTo delete:`);
  console.log(`  parties:            ${partyIds.length}`);
  console.log(`  orders:             ${orderIds.length}`);
  console.log(`  event notifications: ${notificationIds.length}`);
  console.log(`  storage objects:    ${objects.length} (${objects.join(', ') || 'none'})`);
  console.log(`\nRetained: audit_logs (${data.audit_logs.length}), admin_notes (${data.admin_notes.length}), promos (platform-wide).`);
  console.log(`Backup written to: ${backupDir}`);

  if (!EXECUTE) {
    console.log('\nDry run only. Re-run with --execute to delete.');
    return;
  }

  if (objects.length) {
    const { error } = await supabase.storage.from('event-images').remove(objects);
    if (error) throw new Error(`storage remove: ${error.message}`);
    console.log(`\nStorage objects removed: ${objects.length}`);
  }

  console.log(`Orders deleted:       ${await deleteByIds('orders', orderIds)}`);
  console.log(`Parties deleted:      ${await deleteByIds('parties', partyIds)}`);
  if (notificationIds.length) {
    console.log(`Notifications deleted: ${await deleteByIds('notification_sends', notificationIds)}`);
  }

  console.log('\nVerification (remaining rows):');
  for (const table of ['parties', 'orders', 'ticket_types', 'reviews', 'reminders', 'saved_parties', 'homepage_trending_events']) {
    const rows = await selectAll(table);
    console.log(`  ${table}: ${rows.length}`);
  }
  console.log(`\nDone. Backup: ${backupDir}`);
}

main().catch((error) => {
  console.error('\nFAILED:', error.message);
  process.exit(1);
});
