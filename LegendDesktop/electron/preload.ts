// electron/preload.ts
// The ONLY bridge between the sandboxed renderer and the main process. Kept
// deliberately narrow: SQL against the vault, the keychain-backed secure
// store, external links, and file dialogs. The renderer's view of this lives
// in src/platform/bridge.ts.

import { contextBridge, ipcRenderer } from 'electron';

type SqlOp = 'exec' | 'run' | 'all' | 'first';
interface FileFilter {
  name: string;
  extensions: string[];
}

const legend = {
  platform: process.platform,
  sql: (op: SqlOp, sql: string, params?: unknown[]) => ipcRenderer.invoke('legend:sql', op, sql, params),
  secure: {
    get: (key: string) => ipcRenderer.invoke('legend:secure:get', key) as Promise<string | null>,
    set: (key: string, value: string) => ipcRenderer.invoke('legend:secure:set', key, value) as Promise<void>,
    remove: (key: string) => ipcRenderer.invoke('legend:secure:remove', key) as Promise<void>,
  },
  openExternal: (url: string) => ipcRenderer.invoke('legend:openExternal', url) as Promise<boolean>,
  saveFile: (opts: { defaultName: string; content: string; filters?: FileFilter[] }) =>
    ipcRenderer.invoke('legend:saveFile', opts) as Promise<string | null>,
  openFile: (opts: { filters?: FileFilter[] }) =>
    ipcRenderer.invoke('legend:openFile', opts) as Promise<{ name: string; content: string } | null>,
};

contextBridge.exposeInMainWorld('legend', legend);

export type LegendBridge = typeof legend;
