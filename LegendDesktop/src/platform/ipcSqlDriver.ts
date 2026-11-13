// src/platform/ipcSqlDriver.ts
// Legend's SqlDriver (../LegendNetworkingApp/src/backend/local/sql/types.ts)
// over the Electron IPC bridge. The SQLite file itself lives in the main
// process (node:sqlite, userData/legend.db).
//
// vite.config.ts swaps this module in for the mobile app's expoSqlDriver.ts
// wherever the shared code imports it, so sqliteContacts.ts, the sync engine
// and the demo-data cleanup all run against the desktop vault unchanged.

import type { SqlDriver } from '@legend/backend/local/sql/types';
import { bridge } from './bridge';

let txDepth = 0;

export const expoSqlDriver: SqlDriver = {
  async execAsync(sql) {
    await bridge().sql('exec', sql);
  },
  async runAsync(sql, params = []) {
    return (await bridge().sql('run', sql, params)) as { changes: number };
  },
  async getAllAsync<T>(sql: string, params: unknown[] = []) {
    return (await bridge().sql('all', sql, params)) as T[];
  },
  async getFirstAsync<T>(sql: string, params: unknown[] = []) {
    return ((await bridge().sql('first', sql, params)) as T | null) ?? null;
  },
  async withTransactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    // SQLite has no nested BEGIN; an inner call just joins the outer one.
    if (txDepth > 0) return fn();
    txDepth += 1;
    await bridge().sql('exec', 'BEGIN');
    try {
      const result = await fn();
      await bridge().sql('exec', 'COMMIT');
      return result;
    } catch (e) {
      await bridge().sql('exec', 'ROLLBACK');
      throw e;
    } finally {
      txDepth -= 1;
    }
  },
};
