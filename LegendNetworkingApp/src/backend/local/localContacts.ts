// src/backend/local/localContacts.ts
// Wires the real on-device SqlDriver + HLC clock into sqliteContacts.ts and
// runs the one-time demo seed. The actual ContactsApi logic lives in
// ./sql/sqliteContacts.ts — this file exists only to supply its two
// RN-coupled dependencies (SQLite itself, and the persisted HLC clock), so
// that file can stay plain TypeScript and run in tests against a different
// driver/clock (see test/support/nodeSqlDriver.ts). See SYNC_DESIGN.md and
// TASKS.md Phase 8 for the full design.

import * as Crypto from 'expo-crypto';
import { expoSqlDriver } from './sql/expoSqlDriver';
import { createSqliteContacts } from './sql/sqliteContacts';
import { seedIfNeeded } from './sql/seed';
import { nextHlc } from '../../lib/hlc';
import type { ContactsApi } from '../types';

const impl = createSqliteContacts(expoSqlDriver, {
  nextHlc,
  genId: () => Crypto.randomUUID(),
});

let seedPromise: Promise<void> | null = null;

function ensureSeeded(ownerId: string): Promise<void> {
  if (!seedPromise) seedPromise = seedIfNeeded(expoSqlDriver, impl, ownerId);
  return seedPromise;
}

export const localContacts: ContactsApi = {
  ...impl,
  async listContacts(ownerId) {
    await ensureSeeded(ownerId);
    return impl.listContacts(ownerId);
  },
  async listInteractions(ownerId) {
    await ensureSeeded(ownerId);
    return impl.listInteractions(ownerId);
  },
  async listCircles(ownerId) {
    await ensureSeeded(ownerId);
    return impl.listCircles(ownerId);
  },
};
