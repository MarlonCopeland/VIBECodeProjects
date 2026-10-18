// scripts/build.mjs — production build: renderer (Vite) + main/preload (esbuild).
// Output: dist/ (renderer) and dist-electron/ (main.cjs, preload.cjs).

import { build as viteBuild } from 'vite';
import { buildElectron } from './electron-build.mjs';

await viteBuild({ mode: 'production' });
await buildElectron({ watch: false });
console.log('\nBuilt dist/ and dist-electron/. Run `npx electron .` or `npm run dist` to package.');
