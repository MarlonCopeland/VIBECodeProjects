// src/backend/local/sql/types.ts
// The minimal SQL surface Legend's local storage needs. `expoSqlDriver.ts`
// satisfies this on-device with expo-sqlite; `test/support/nodeSqlDriver.ts`
// satisfies it in plain Node with the built-in `node:sqlite` module, so the
// actual SQL in `sqliteContacts.ts` runs against a real SQLite engine in
// unit tests — no RN runtime, no emulator. A future Electron desktop client
// (TASKS.md Phase 8.6) would add a third implementation over
// `better-sqlite3` directly, for the same reason: real SQLite, no browser
// workaround, because Electron ships a real Node process.

export interface SqlDriver {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
  withTransactionAsync<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Clock {
  /** Next Hybrid Logical Clock stamp for a local write (see src/lib/hlc.ts). */
  nextHlc(): Promise<string>;
}

export interface IdGenerator {
  genId(): string;
}
