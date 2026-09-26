import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const migrationsDir = join(repoRoot, 'supabase', 'migrations');

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  adminDb: string;
  testDb: string;
}

/**
 * Connection settings for the local regression database.
 *
 * Defaults target a local PostgreSQL 16. Override with TEST_DATABASE_ADMIN_URL /
 * TEST_DATABASE_URL if the instance lives elsewhere. No secret is ever
 * hard-coded: the defaults are throwaway local-dev credentials.
 */
export function dbConfig(): DbConfig {
  return {
    host: process.env.TEST_PGHOST ?? '127.0.0.1',
    port: Number(process.env.TEST_PGPORT ?? 5432),
    user: process.env.TEST_PGUSER ?? 'postgres',
    password: process.env.TEST_PGPASSWORD ?? 'postgres',
    adminDb: process.env.TEST_PGADMINDATABASE ?? 'postgres',
    testDb: process.env.TEST_PGTESTDATABASE ?? 'lagoslive_rls_test',
  };
}

export function connect(database: string): pg.Client {
  const cfg = dbConfig();
  return new pg.Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database,
  });
}

/**
 * Lists the migrations to apply, in order.
 *
 * MIGRATION_LIMIT truncates the list so a fix can be re-run against the schema
 * it was meant to repair. "Does this test actually fail before the fix?" is the
 * only way to know a regression test is real, and doing that by renaming
 * migration files is error-prone enough to be worth a supported flag.
 */
export function migrationFiles(): string[] {
  const all = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const limit = process.env.MIGRATION_LIMIT;
  if (limit === undefined || limit === '') return all;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`MIGRATION_LIMIT must be a non-negative integer, got ${limit}`);
  }
  return all.slice(0, n);
}

/** Drops and recreates the test database, then applies bootstrap + all migrations. */
export async function resetDatabase(): Promise<void> {
  const cfg = dbConfig();
  const admin = connect(cfg.adminDb);
  await admin.connect();
  try {
    await admin.query(
      `select pg_terminate_backend(pid) from pg_stat_activity
       where datname = $1 and pid <> pg_backend_pid()`,
      [cfg.testDb],
    );
    await admin.query(`drop database if exists "${cfg.testDb}"`);
    await admin.query(`create database "${cfg.testDb}"`);
  } finally {
    await admin.end();
  }

  const client = connect(cfg.testDb);
  await client.connect();
  try {
    await client.query('create extension if not exists "pgcrypto"');
    await client.query(readFileSync(join(here, 'bootstrap.sql'), 'utf8'));

    for (const file of migrationFiles()) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      try {
        await client.query(sql);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Migration ${file} failed: ${message}`);
      }
    }
  } finally {
    await client.end();
  }
}

const isDirectRun =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const only = process.argv[2];
  if (only === '--migrations') {
    const cfg = dbConfig();
    const client = connect(cfg.testDb);
    await client.connect();
    for (const file of migrationFiles()) {
      await client.query(readFileSync(join(migrationsDir, file), 'utf8'));
      console.log(`applied ${file}`);
    }
    await client.end();
  } else {
    await resetDatabase();
    console.log(
      `rebuilt ${dbConfig().testDb} with ${migrationFiles().length} migrations`,
    );
  }
}
