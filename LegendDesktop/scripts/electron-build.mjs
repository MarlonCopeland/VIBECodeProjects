// scripts/electron-build.mjs — bundles electron/main.ts + electron/preload.ts
// to CommonJS (a sandboxed preload must be a single CJS file).

import { context, build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'warning',
};

const entries = [
  { entryPoints: [resolve(root, 'electron/main.ts')], outfile: resolve(root, 'dist-electron/main.cjs') },
  { entryPoints: [resolve(root, 'electron/preload.ts')], outfile: resolve(root, 'dist-electron/preload.cjs') },
];

/** @param {{ watch: boolean, onRebuild?: () => void }} opts */
export async function buildElectron({ watch, onRebuild }) {
  if (!watch) {
    await Promise.all(entries.map((e) => build({ ...shared, ...e })));
    return;
  }
  const plugin = {
    name: 'notify',
    setup(b) {
      let first = true;
      b.onEnd((result) => {
        if (first) {
          first = false;
          return;
        }
        if (result.errors.length === 0) onRebuild?.();
      });
    },
  };
  const ctxs = await Promise.all(entries.map((e) => context({ ...shared, ...e, plugins: [plugin] })));
  await Promise.all(ctxs.map((c) => c.rebuild()));
  await Promise.all(ctxs.map((c) => c.watch()));
}
