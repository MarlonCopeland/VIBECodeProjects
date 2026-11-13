// Type-only stand-in for expo-sqlite so `tsc` can check the shared
// expoSqlDriver.ts. Never bundled: vite.config.ts redirects that driver to
// src/platform/ipcSqlDriver.ts.

export type SQLiteBindParams = unknown[];

interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SQLiteBindParams): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params: SQLiteBindParams): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SQLiteBindParams): Promise<T | null>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
}

export function openDatabaseAsync(_name: string): Promise<Db> {
  throw new Error('expo-sqlite is not available on desktop');
}
