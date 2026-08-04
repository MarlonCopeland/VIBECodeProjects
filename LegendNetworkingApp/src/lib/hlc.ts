// src/lib/hlc.ts
// Stateful Hybrid Logical Clock wrapper: persists device id + clock state
// via AsyncStorage and hands out the next HLC stamp for a local write. The
// algorithm itself lives in hlcCore.ts (pure, no imports) — re-exported
// here for convenience. Storage-layer code that needs a clock takes one as
// an injected `{ nextHlc(): Promise<string> }` dependency instead of
// importing this file, so it stays testable without any RN runtime (see
// src/backend/local/sql/sqliteContacts.ts and SYNC_DESIGN.md).

import * as Crypto from 'expo-crypto';
import { storage } from './storage';
import {
  advanceClock,
  INITIAL_CLOCK_STATE,
  parseHlc,
  receiveClock,
  serializeHlc,
  type ClockState,
} from './hlcCore';

export * from './hlcCore';

const DEVICE_ID_KEY = 'legend.hlc.deviceId';
const STATE_KEY = 'legend.hlc.state';

let deviceId: string | null = null;
let state: ClockState = INITIAL_CLOCK_STATE;
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  const storedDeviceId = await storage.getItem(DEVICE_ID_KEY);
  if (storedDeviceId) {
    deviceId = storedDeviceId;
  } else {
    deviceId = Crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    await storage.setItem(DEVICE_ID_KEY, deviceId);
  }
  const raw = await storage.getItem(STATE_KEY);
  if (raw) {
    try {
      state = JSON.parse(raw) as ClockState;
    } catch {
      /* ignore corrupt state, start fresh */
    }
  }
  loaded = true;
}

/** This device's short id — will double as the sync engine's device identity. */
export async function getDeviceId(): Promise<string> {
  await ensureLoaded();
  return deviceId!;
}

/** The next HLC stamp for a local write. Always persists before returning. */
export async function nextHlc(): Promise<string> {
  await ensureLoaded();
  state = advanceClock(state, Date.now());
  await storage.setItem(STATE_KEY, JSON.stringify(state));
  return serializeHlc(state.lastMillis, state.counter, deviceId!);
}

/**
 * Observe a remote HLC stamp (from a pulled sync change) so future local
 * writes order after everything already seen. Used by the sync engine.
 */
export async function observeHlc(remoteHlc: string): Promise<void> {
  await ensureLoaded();
  const remote = parseHlc(remoteHlc);
  state = receiveClock(state, { millis: remote.millis, counter: remote.counter }, Date.now());
  await storage.setItem(STATE_KEY, JSON.stringify(state));
}
