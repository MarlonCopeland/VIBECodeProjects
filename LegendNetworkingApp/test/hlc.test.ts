import { describe, expect, it } from 'vitest';
import { advanceClock, compareHlc, parseHlc, serializeHlc, type ClockState } from '../src/lib/hlcCore';

describe('hlc: pure clock algorithm', () => {
  it('advances the counter within the same millisecond', () => {
    const start: ClockState = { lastMillis: 1000, counter: 0 };
    const next = advanceClock(start, 1000);
    expect(next).toEqual({ lastMillis: 1000, counter: 1 });
  });

  it('resets the counter when wall-clock time moves forward', () => {
    const start: ClockState = { lastMillis: 1000, counter: 5 };
    const next = advanceClock(start, 2000);
    expect(next).toEqual({ lastMillis: 2000, counter: 0 });
  });

  it('still advances monotonically if wall-clock time moves backward', () => {
    const start: ClockState = { lastMillis: 5000, counter: 2 };
    const next = advanceClock(start, 4000);
    expect(next).toEqual({ lastMillis: 5000, counter: 3 });
  });

  it('round-trips serialize/parse', () => {
    const hlc = serializeHlc(123456789, 7, 'abc123');
    const parsed = parseHlc(hlc);
    expect(parsed).toEqual({ millis: 123456789, counter: 7, deviceId: 'abc123' });
  });

  it('orders by millis first', () => {
    const a = serializeHlc(1000, 0, 'device-a');
    const b = serializeHlc(2000, 0, 'device-a');
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(b, a)).toBeGreaterThan(0);
  });

  it('orders by counter when millis tie', () => {
    const a = serializeHlc(1000, 0, 'device-a');
    const b = serializeHlc(1000, 1, 'device-a');
    expect(compareHlc(a, b)).toBeLessThan(0);
  });

  it('breaks ties deterministically by device id when millis and counter tie', () => {
    const a = serializeHlc(1000, 0, 'aaa');
    const b = serializeHlc(1000, 0, 'bbb');
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(b, a)).toBeGreaterThan(0);
  });

  it('is reflexively equal', () => {
    const a = serializeHlc(1000, 3, 'device-a');
    expect(compareHlc(a, a)).toBe(0);
  });

  it('produces a lexicographically sortable string for equal-width inputs', () => {
    const early = serializeHlc(999, 0, 'x');
    const late = serializeHlc(1000, 0, 'x');
    const sorted = [late, early].sort();
    expect(sorted).toEqual([early, late]);
  });
});
