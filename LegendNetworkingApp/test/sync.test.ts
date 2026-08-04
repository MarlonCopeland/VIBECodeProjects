// test/sync.test.ts
// Pure-logic tests for the sync engine's building blocks: HLC receive rule,
// base64 codec, and the snapshot diff/merge SQL. (End-to-end apply against a
// real SQLite engine lives with the sqliteContacts suite, which needs the
// node:sqlite driver — Node 22+.)

import { describe, expect, it } from 'vitest';
import {
  INITIAL_CLOCK_STATE,
  compareHlc,
  parseHlc,
  receiveClock,
  serializeHlc,
} from '../src/lib/hlcCore';
import { base64ToBytes, bytesToBase64 } from '../src/lib/base64';
import { SYNC_TABLES, buildUpsertSql, maxHlcOf } from '../src/features/sync/snapshots';

describe('receiveClock (HLC receive rule)', () => {
  it('jumps ahead of a remote clock that is in the future', () => {
    const now = 1_000;
    const remote = { millis: 5_000, counter: 3 };
    const next = receiveClock(INITIAL_CLOCK_STATE, remote, now);
    const stamp = serializeHlc(next.lastMillis, next.counter, 'aa');
    const remoteStamp = serializeHlc(remote.millis, remote.counter, 'bb');
    expect(compareHlc(stamp, remoteStamp)).toBeGreaterThan(0);
  });

  it('uses wall clock when it is ahead of both', () => {
    const next = receiveClock({ lastMillis: 100, counter: 7 }, { millis: 200, counter: 9 }, 10_000);
    expect(next).toEqual({ lastMillis: 10_000, counter: 0 });
  });

  it('breaks three-way millis ties by exceeding both counters', () => {
    const next = receiveClock({ lastMillis: 500, counter: 2 }, { millis: 500, counter: 8 }, 500);
    expect(next.lastMillis).toBe(500);
    expect(next.counter).toBe(9);
  });

  it('always produces stamps that order after everything observed', () => {
    let state = { lastMillis: 0, counter: 0 };
    const seen: string[] = [];
    for (const [remoteMillis, remoteCounter, now] of [
      [50, 0, 10],
      [50, 4, 10],
      [10, 0, 60],
      [1_000, 2, 20],
    ] as const) {
      seen.push(serializeHlc(remoteMillis, remoteCounter, 'remote'));
      state = receiveClock(state, { millis: remoteMillis, counter: remoteCounter }, now);
    }
    const local = serializeHlc(state.lastMillis, state.counter, 'local');
    for (const s of seen) expect(compareHlc(local, s)).toBeGreaterThan(0);
  });
});

describe('base64 codec', () => {
  it('round-trips arbitrary bytes', () => {
    for (const len of [0, 1, 2, 3, 31, 32, 57, 256]) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 37 + len) % 256);
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });

  it('matches Node Buffer output', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('rejects invalid characters', () => {
    expect(() => base64ToBytes('not-!-base64')).toThrow();
  });
});

describe('snapshot merge SQL', () => {
  it('guards every upsert on HLC so older remote writes lose', () => {
    for (const spec of SYNC_TABLES) {
      const sql = buildUpsertSql(spec);
      expect(sql).toContain(`INSERT INTO ${spec.name}`);
      expect(sql).toContain('ON CONFLICT(id) DO UPDATE SET');
      expect(sql).toContain(`WHERE excluded.updated_at > ${spec.name}.updated_at`);
      // Every non-id column is written; id never is.
      for (const col of spec.columns.filter((c) => c !== 'id')) {
        expect(sql).toContain(`${col} = excluded.${col}`);
      }
      expect(sql).not.toContain('id = excluded.id');
    }
  });

  it('every syncable table carries the merge bookkeeping columns', () => {
    for (const spec of SYNC_TABLES) {
      expect(spec.columns).toContain('id');
      expect(spec.columns).toContain('updated_at');
      expect(spec.columns).toContain('deleted_at');
    }
  });

  it('maxHlcOf picks the newest stamp (string order == HLC order)', () => {
    const a = serializeHlc(1_000, 0, 'aa');
    const b = serializeHlc(2_000, 5, 'bb');
    const c = serializeHlc(2_000, 5, 'aa');
    expect(maxHlcOf([
      { t: 'contacts', r: { updated_at: a } },
      { t: 'premises', r: { updated_at: b } },
      { t: 'interactions', r: { updated_at: c } },
    ])).toBe(b);
    // Sanity: lexicographic max agrees with compareHlc.
    expect(compareHlc(b, a)).toBeGreaterThan(0);
    expect(parseHlc(b).deviceId).toBe('bb');
    expect(maxHlcOf([])).toBe('');
  });
});
