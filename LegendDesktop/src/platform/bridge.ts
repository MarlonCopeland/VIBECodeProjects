// src/platform/bridge.ts
// Typed access to the preload bridge (electron/preload.ts). Everything that
// needs the main process goes through here.

import type { LegendBridge } from '../../electron/preload';

declare global {
  interface Window {
    legend?: LegendBridge;
  }
}

export function bridge(): LegendBridge {
  if (!window.legend) {
    throw new Error('Legend desktop bridge missing — run inside Electron (npm run dev), not a plain browser.');
  }
  return window.legend;
}

/** Open tel:/mailto:/sms:/https: in the OS. */
export function openExternal(url: string): Promise<boolean> {
  return bridge().openExternal(url);
}
