// scripts/dev.mjs — `npm run dev`: Vite dev server (HMR for the renderer),
// esbuild watch for main/preload, and Electron pointed at the dev server.
// Editing electron/*.ts restarts Electron; editing src/ hot-reloads.

import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildElectron } from './electron-build.mjs';

const require = createRequire(import.meta.url);
const electronPath = /** @type {string} */ (require('electron'));

const server = await createServer({ mode: 'development' });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5183/';
server.printUrls();

let child = null;
let restarting = false;

function launch() {
  const env = { ...process.env, VITE_DEV_SERVER_URL: url };
  // Hosts that are themselves Electron apps (VS Code, Claude) export this,
  // which would make our Electron run as plain Node with no window.
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electronPath, ['.'], { stdio: 'inherit', env });
  child.on('exit', () => {
    if (restarting) return;
    void server.close();
    process.exit(0);
  });
}

await buildElectron({
  watch: true,
  onRebuild() {
    if (!child) return;
    restarting = true;
    child.once('exit', () => {
      restarting = false;
      launch();
    });
    child.kill();
  },
});

launch();
