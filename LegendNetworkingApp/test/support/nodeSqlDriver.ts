// test/support/nodeSqlDriver.ts
// A SqlDriver backed by Node's built-in `node:sqlite` module — used ONLY in
// tests, so the real SQL in src/backend/local/sql/sqliteContacts.ts can run
// against a real SQLite engine without any React Native runtime, emulator,
// or native compilation step. Never imported from src/ — the app itself
// always uses src/backend/local/sql/expoSqlDriver.ts on-device.

import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver } from '../../src/backend/local/sql/types';

export function createNodeSqlDriver(): SqlDriver {
  const db = new DatabaseSync(':memory:');

  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params = []) {
      const info = db.prepare(sql).run(...(params as never[]));
      return { changes: Number(info.changes) };
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []) {
      const row = db.prepare(sql).get(...(params as never[]));
      return (row as T) ?? null;
    },
    async withTransactionAsync<T>(fn: () => Promise<T>): Promise<T> {
      // node:sqlite transactions are synchronous; our fn only ever awaits
      // other calls into this same driver, which resolve immediately under
      // the hood here, so running it directly is safe and sufficient for
      // tests.
      return fn();
    },
  };
}
