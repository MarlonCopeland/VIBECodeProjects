// src/backend/local/sql/schema.ts
// DDL for Legend's local contact graph. Every syncable table carries
// updated_at (HLC) and deleted_at (HLC tombstone, NULL = alive) so the
// future sync engine (TASKS.md Phase 8.3+) can diff and merge rows without
// ever mutating history in place. Domain timestamps (interactions'
// occurred_at) are plain ISO strings the user controls, kept separate from
// this sync bookkeeping. See SYNC_DESIGN.md for the full rationale.

import type { SqlDriver } from './types';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    nickname TEXT,
    company TEXT,
    title TEXT,
    avatar_url TEXT,
    where_met_place TEXT,
    where_met_city TEXT,
    where_met_note TEXT,
    notes TEXT,
    favorite INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS contact_phones (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    label TEXT NOT NULL,
    number TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS contact_emails (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    label TEXT NOT NULL,
    address TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS premises (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    note TEXT,
    premise_id TEXT,
    deleted_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS circles (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    query_kinds TEXT NOT NULL DEFAULT '[]',
    query_tags TEXT NOT NULL DEFAULT '[]',
    query_text TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS circle_pins (
    id TEXT PRIMARY KEY,
    circle_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS circle_excludes (
    id TEXT PRIMARY KEY,
    circle_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);`,
  `CREATE INDEX IF NOT EXISTS idx_phones_contact ON contact_phones(contact_id);`,
  `CREATE INDEX IF NOT EXISTS idx_emails_contact ON contact_emails(contact_id);`,
  `CREATE INDEX IF NOT EXISTS idx_premises_contact ON premises(contact_id);`,
  `CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_id);`,
  `CREATE INDEX IF NOT EXISTS idx_circles_owner ON circles(owner_id);`,
  `CREATE INDEX IF NOT EXISTS idx_pins_circle ON circle_pins(circle_id);`,
  `CREATE INDEX IF NOT EXISTS idx_excludes_circle ON circle_excludes(circle_id);`,
];

// Keyed by driver instance so multiple independent databases (e.g. one per
// test) each get migrated once, instead of a single global guard that would
// wrongly skip migration for a fresh in-memory test database.
const migratedDrivers = new WeakSet<SqlDriver>();

export async function migrate(driver: SqlDriver): Promise<void> {
  if (migratedDrivers.has(driver)) return;
  for (const stmt of STATEMENTS) {
    await driver.execAsync(stmt);
  }
  migratedDrivers.add(driver);
}

export async function hasSeeded(driver: SqlDriver): Promise<boolean> {
  const row = await driver.getFirstAsync<{ value: string }>(
    `SELECT value FROM meta WHERE key = 'seeded'`,
  );
  return row?.value === 'true';
}

export async function markSeeded(driver: SqlDriver): Promise<void> {
  await driver.runAsync(`INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded', 'true')`);
}
