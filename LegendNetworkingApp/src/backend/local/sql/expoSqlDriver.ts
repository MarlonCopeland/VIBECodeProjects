// src/backend/local/sql/expoSqlDriver.ts
// SqlDriver implementation over expo-sqlite — Legend's real on-device
// storage. This is the only file in the storage layer that imports
// expo-sqlite directly; everything else depends on the SqlDriver interface
// (src/backend/local/sql/types.ts) so it can be swapped or tested.

import * as SQLite from 'expo-sqlite';
import type { SqlDriver } from './types';

let dbPromise: ReturnType<typeof SQLite.openDatabaseAsync> | null = null;

function getDb() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync('legend.db');
  return dbPromise;
}

export const expoSqlDriver: SqlDriver = {
  async execAsync(sql) {
    const db = await getDb();
    await db.execAsync(sql);
  },

  async runAsync(sql, params = []) {
    const db = await getDb();
    const result = await db.runAsync(sql, params as SQLite.SQLiteBindParams);
    return { changes: result.changes };
  },

  async getAllAsync<T>(sql: string, params: unknown[] = []) {
    const db = await getDb();
    return db.getAllAsync<T>(sql, params as SQLite.SQLiteBindParams);
  },

  async getFirstAsync<T>(sql: string, params: unknown[] = []) {
    const db = await getDb();
    const row = await db.getFirstAsync<T>(sql, params as SQLite.SQLiteBindParams);
    return row ?? null;
  },

  async withTransactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    const db = await getDb();
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await fn();
    });
    return result;
  },
};
