// vitest.config.ts
// Runs the storage/domain-logic unit tests only (test/**). This is
// deliberately separate from the app itself: these tests run in plain Node
// (not the RN/Expo runtime), which is exactly why the storage layer
// (src/backend/local/sql/sqliteContacts.ts) is written against the
// injectable SqlDriver/Clock interfaces rather than importing expo-sqlite
// or expo-crypto directly — see SYNC_DESIGN.md.
//
// Requires Node 22+ (for the built-in node:sqlite module used by
// test/support/nodeSqlDriver.ts) — independent of the app's own Node 18-20
// requirement (Expo's CLI config loader), since tests never invoke Expo.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
