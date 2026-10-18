// scripts/build.mjs — production build: renderer (Vite) + main/preload (esbuild).
// Output: dist/ (renderer) and dist-electron/ (main.cjs, preload.cjs).
//
// `--local` builds against the offline demo backend (troubleshooting only —
// used by `npm run smoke`, which seeds the vault without a network). Normal
// builds use the Supabase backend from ../LegendNetworkingApp/.env.

import { build as viteBuild } from 'vite';
import { buildElectron } from './electron-build.mjs';

if (process.argv.includes('--local')) {
  // vite.config.ts's loadEnv lets process.env override the .env files.
  process.env.APP_BACKEND = 'local';
  console.log('Building against the LOCAL demo backend (troubleshooting build).');
}

await viteBuild({ mode: 'production' });
await buildElectron({ watch: false });
console.log('\nBuilt dist/ and dist-electron/. Run `npx electron .` or `npm run dist` to package.');
