// src/features/sync/snapshots.ts
// The sync engine's diff/merge core, pure SQL over the SqlDriver interface.
//
// Design (SYNC_DESIGN.md): the local tables ARE the oplog — every syncable
// row already carries an HLC `updated_at` (bumped on every change, including
// tombstones) and a `deleted_at` tombstone. So a "change" is simply a row
// snapshot whose updated_at is newer than the last push cursor, and applying
// a remote change is an upsert guarded by HLC comparison (row-level
// last-write-wins; child tables are normalized, so per-item merge falls out
// for phones/emails/premises/pins/excludes). Serialized HLCs are zero-padded
// specifically so plain string comparison orders them correctly — in SQL and
// in JS alike.

import type { SqlDriver } from '../../backend/local/sql/types';

export interface TableSpec {
  name: string;
  columns: string[];
}

/** Every syncable table, with its full column list (id first). */
export const SYNC_TABLES: TableSpec[] = [
  {
    name: 'contacts',
    columns: [
      'id', 'owner_id', 'first_name', 'last_name', 'nickname', 'company', 'title',
      'avatar_url', 'where_met_place', 'where_met_city', 'where_met_note', 'notes',
      'favorite', 'source', 'created_at', 'updated_at', 'deleted_at',
    ],
  },
  { name: 'contact_phones', columns: ['id', 'contact_id', 'label', 'number', 'updated_at', 'deleted_at'] },
  { name: 'contact_emails', columns: ['id', 'contact_id', 'label', 'address', 'updated_at', 'deleted_at'] },
  { name: 'premises', columns: ['id', 'contact_id', 'kind', 'label', 'tags', 'updated_at', 'deleted_at'] },
  {
    name: 'interactions',
    columns: ['id', 'contact_id', 'kind', 'occurred_at', 'note', 'premise_id', 'updated_at', 'deleted_at'],
  },
  {
    name: 'circles',
    columns: ['id', 'owner_id', 'name', 'query_kinds', 'query_tags', 'query_text', 'created_at', 'updated_at', 'deleted_at'],
  },
  { name: 'circle_pins', columns: ['id', 'circle_id', 'contact_id', 'updated_at', 'deleted_at'] },
  { name: 'circle_excludes', columns: ['id', 'circle_id', 'contact_id', 'updated_at', 'deleted_at'] },
];

/** One changed row, as shipped inside the encrypted payload. */
export interface RowSnapshot {
  t: string;
  r: Record<string, unknown>;
}

/**
 * Collect every row changed since `sinceHlc` ('' = everything, the initial
 * full upload). When `onlyDeviceId` is set, only rows whose latest write came
 * from that device are included — each device pushes its own writes, which is
 * what keeps pulled rows from echoing back to the server forever.
 */
export async function collectChanges(
  driver: SqlDriver,
  sinceHlc: string,
  onlyDeviceId: string | null,
): Promise<RowSnapshot[]> {
  const out: RowSnapshot[] = [];
  for (const spec of SYNC_TABLES) {
    const where = onlyDeviceId
      ? `updated_at > ? AND updated_at LIKE ?`
      : `updated_at > ?`;
    const params = onlyDeviceId ? [sinceHlc, `%-${onlyDeviceId}`] : [sinceHlc];
    const rows = await driver.getAllAsync<Record<string, unknown>>(
      `SELECT ${spec.columns.join(', ')} FROM ${spec.name} WHERE ${where}`,
      params,
    );
    for (const r of rows) out.push({ t: spec.name, r });
  }
  return out;
}

/** Build the guarded-upsert SQL for one table (exported for unit tests). */
export function buildUpsertSql(spec: TableSpec): string {
  const placeholders = spec.columns.map(() => '?').join(', ');
  const updates = spec.columns
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  return (
    `INSERT INTO ${spec.name} (${spec.columns.join(', ')}) VALUES (${placeholders}) ` +
    `ON CONFLICT(id) DO UPDATE SET ${updates} ` +
    `WHERE excluded.updated_at > ${spec.name}.updated_at`
  );
}

const SPEC_BY_NAME = new Map(SYNC_TABLES.map((s) => [s.name, s]));

/**
 * Apply remote snapshots in one transaction. Unknown tables/columns are
 * ignored (a newer app version may sync tables this one doesn't know);
 * conflicts resolve by HLC — an older remote write is a silent no-op.
 */
export async function applySnapshots(driver: SqlDriver, snapshots: RowSnapshot[]): Promise<number> {
  let applied = 0;
  await driver.withTransactionAsync(async () => {
    for (const snap of snapshots) {
      const spec = SPEC_BY_NAME.get(snap.t);
      if (!spec) continue;
      const params = spec.columns.map((c) => (snap.r[c] === undefined ? null : snap.r[c]));
      await driver.runAsync(buildUpsertSql(spec), params);
      applied += 1;
    }
  });
  return applied;
}

/** Highest updated_at across snapshots ('' if none) — the new push cursor. */
export function maxHlcOf(snapshots: RowSnapshot[]): string {
  let max = '';
  for (const s of snapshots) {
    const hlc = typeof s.r.updated_at === 'string' ? s.r.updated_at : '';
    if (hlc > max) max = hlc;
  }
  return max;
}
