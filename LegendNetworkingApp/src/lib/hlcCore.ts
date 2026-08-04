// src/lib/hlcCore.ts
// Hybrid Logical Clock algorithm — pure, zero imports. Split out from
// hlc.ts so it can be unit-tested (and imported by test-only code, like
// test/sqliteContacts.test.ts's fake clock) without ever pulling in
// storage.ts's React Native import chain. See hlc.ts for the stateful
// wrapper the real app uses, and SYNC_DESIGN.md for the full rationale.

export interface ClockState {
  lastMillis: number;
  counter: number;
}

export interface HlcParts {
  millis: number;
  counter: number;
  deviceId: string;
}

export const INITIAL_CLOCK_STATE: ClockState = { lastMillis: 0, counter: 0 };

export function serializeHlc(millis: number, counter: number, deviceId: string): string {
  return `${millis.toString().padStart(15, '0')}-${counter.toString().padStart(6, '0')}-${deviceId}`;
}

export function parseHlc(hlc: string): HlcParts {
  const [millisStr = '0', counterStr = '0', deviceId = ''] = hlc.split('-');
  return { millis: Number(millisStr), counter: Number(counterStr), deviceId };
}

/** Standard comparator: negative if a < b, positive if a > b, 0 if equal. */
export function compareHlc(a: string, b: string): number {
  const pa = parseHlc(a);
  const pb = parseHlc(b);
  if (pa.millis !== pb.millis) return pa.millis < pb.millis ? -1 : 1;
  if (pa.counter !== pb.counter) return pa.counter < pb.counter ? -1 : 1;
  if (pa.deviceId === pb.deviceId) return 0;
  return pa.deviceId < pb.deviceId ? -1 : 1;
}

/**
 * Advance a clock state for a new local write at wall-clock `nowMillis`.
 * If time has moved forward, reset the counter; if not (or it went
 * backwards — a clock adjustment), bump the counter so the result still
 * strictly increases.
 */
export function advanceClock(prev: ClockState, nowMillis: number): ClockState {
  if (nowMillis > prev.lastMillis) return { lastMillis: nowMillis, counter: 0 };
  return { lastMillis: prev.lastMillis, counter: prev.counter + 1 };
}

/**
 * Observe a REMOTE stamp (standard HLC receive rule): the local clock jumps
 * to at least the remote's logical time, so every stamp this device issues
 * afterwards is guaranteed to order AFTER everything it has already seen —
 * even when the two devices' wall clocks are skewed.
 */
export function receiveClock(
  prev: ClockState,
  remote: { millis: number; counter: number },
  nowMillis: number,
): ClockState {
  const maxMillis = Math.max(prev.lastMillis, remote.millis, nowMillis);
  if (maxMillis > prev.lastMillis && maxMillis > remote.millis) {
    // Wall clock is already ahead of both logical clocks.
    return { lastMillis: maxMillis, counter: 0 };
  }
  if (prev.lastMillis === remote.millis && prev.lastMillis === maxMillis) {
    return { lastMillis: maxMillis, counter: Math.max(prev.counter, remote.counter) + 1 };
  }
  if (maxMillis === prev.lastMillis) {
    return { lastMillis: maxMillis, counter: prev.counter + 1 };
  }
  return { lastMillis: maxMillis, counter: remote.counter + 1 };
}
