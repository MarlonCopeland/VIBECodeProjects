// vitest.config.ts — pure-logic tests for the desktop client (test/**).
// UI and Electron aren't exercised here; the shared domain/storage layer has
// its own suite in ../LegendNetworkingApp/test.

import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [{ find: /^@legend\//, replacement: `${resolve(__dirname, '../LegendNetworkingApp/src')}/` }],
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
