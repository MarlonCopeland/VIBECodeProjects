// electron/main.ts
// Legend desktop — Electron main process.
//
// Owns the three things a renderer must never touch directly:
//   1. The SQLite vault (userData/legend.db) via Node's built-in node:sqlite —
//      real SQLite, no native module to rebuild per Electron version. The
//      renderer reaches it only through the narrow `legend:sql` IPC channel,
//      which the renderer-side ipcSqlDriver adapts to Legend's SqlDriver
//      interface (../LegendNetworkingApp/src/backend/local/sql/types.ts), so
//      the exact same sqliteContacts.ts runs here as on the phone.
//   2. Secrets (auth session, sync vault key), encrypted with the OS keychain
//      via safeStorage — the desktop equivalent of expo-secure-store.
//   3. OS integration: external links (tel:/mailto:/sms:/https:) and native
//      open/save dialogs for CSV import/export.

import { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } from 'electron';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

// ---- SQLite vault ----------------------------------------------------------

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(join(dir, 'legend.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

type SqlOp = 'exec' | 'run' | 'all' | 'first';
type SqlParam = null | number | bigint | string | Uint8Array;

function toParams(params: unknown): SqlParam[] {
  if (!Array.isArray(params)) return [];
  // node:sqlite rejects booleans/undefined; SQLite has no such types anyway.
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p as SqlParam;
  });
}

ipcMain.handle('legend:sql', (_e, op: SqlOp, sql: string, params?: unknown[]) => {
  const d = getDb();
  switch (op) {
    case 'exec':
      d.exec(sql);
      return null;
    case 'run': {
      const info = d.prepare(sql).run(...toParams(params));
      return { changes: Number(info.changes) };
    }
    case 'all':
      // Spread into plain objects: node:sqlite rows have a null prototype,
      // which structured clone handles, but plain objects are friendlier.
      return d.prepare(sql).all(...toParams(params)).map((r) => ({ ...r }));
    case 'first': {
      const row = d.prepare(sql).get(...toParams(params));
      return row ? { ...row } : null;
    }
    default:
      throw new Error(`Unknown sql op: ${String(op)}`);
  }
});

// ---- Secure store (safeStorage) ------------------------------------------

function securePath(): string {
  return join(app.getPath('userData'), 'secure-store.json');
}

function readSecure(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(securePath(), 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSecure(data: Record<string, string>): void {
  writeFileSync(securePath(), JSON.stringify(data), 'utf8');
}

function seal(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `enc:${safeStorage.encryptString(value).toString('base64')}`;
  }
  // Linux without a keyring: still works, just not OS-encrypted.
  return `raw:${Buffer.from(value, 'utf8').toString('base64')}`;
}

function unseal(stored: string): string | null {
  try {
    if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    if (stored.startsWith('raw:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8');
  } catch {
    /* keychain changed or corrupt — treat as missing */
  }
  return null;
}

ipcMain.handle('legend:secure:get', (_e, key: string) => {
  const stored = readSecure()[key];
  return stored ? unseal(stored) : null;
});
ipcMain.handle('legend:secure:set', (_e, key: string, value: string) => {
  const data = readSecure();
  data[key] = seal(value);
  writeSecure(data);
});
ipcMain.handle('legend:secure:remove', (_e, key: string) => {
  const data = readSecure();
  delete data[key];
  writeSecure(data);
});

// ---- OS integration --------------------------------------------------------

const EXTERNAL_SCHEMES = new Set(['https:', 'http:', 'mailto:', 'tel:', 'sms:']);

function openExternalSafe(url: string): boolean {
  try {
    if (!EXTERNAL_SCHEMES.has(new URL(url).protocol)) return false;
  } catch {
    return false;
  }
  void shell.openExternal(url);
  return true;
}

ipcMain.handle('legend:openExternal', (_e, url: string) => openExternalSafe(url));

ipcMain.handle(
  'legend:saveFile',
  async (e, opts: { defaultName: string; content: string; filters?: Electron.FileFilter[] }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showSaveDialog(win!, {
      defaultPath: join(app.getPath('documents'), opts.defaultName),
      filters: opts.filters,
    });
    if (res.canceled || !res.filePath) return null;
    writeFileSync(res.filePath, opts.content, 'utf8');
    return res.filePath;
  },
);

ipcMain.handle('legend:openFile', async (e, opts: { filters?: Electron.FileFilter[] }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: opts.filters });
  const path = res.filePaths[0];
  if (res.canceled || !path || !existsSync(path)) return null;
  return { name: path.split(/[\\/]/).pop() ?? path, content: readFileSync(path, 'utf8') };
});

// ---- Window ----------------------------------------------------------------

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    title: 'Legend',
    backgroundColor: '#0B0D12',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Every link that tries to leave the app opens in the OS instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const internal = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://');
    if (!internal) {
      event.preventDefault();
      openExternalSafe(url);
    }
  });

  if (DEV_URL) {
    void win.loadURL(DEV_URL);
  } else {
    void win.loadFile(join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  if (!DEV_URL) {
    // Production CSP. Dev skips it: Vite's React refresh preamble is inline.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob: https:; connect-src 'self' https: wss:; font-src 'self' data:",
          ],
        },
      });
    });
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  db?.close();
  db = null;
  if (process.platform !== 'darwin') app.quit();
});
