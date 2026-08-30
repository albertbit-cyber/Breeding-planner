import { describe, expect, it } from 'vitest';
import {
  NOTICE_MAX_INTERVAL,
  NOTICE_MIN_INTERVAL,
  normalizeNoticeState,
  pickNoticeInterval,
  recordQuarantineStart,
} from './quarantineNotice';

const alwaysLow = () => 0;
const alwaysHigh = () => 0.999999;

/** Runs `count` animals through the schedule and returns the 1-based positions that showed it. */
function runSchedule(count, random) {
  let state = null;
  const shown = [];
  for (let index = 1; index <= count; index += 1) {
    const result = recordQuarantineStart(state, random);
    state = result.state;
    if (result.show) shown.push(index);
  }
  return shown;
}

describe('notice schedule', () => {
  it('shows on the very first animal that goes into quarantine', () => {
    expect(recordQuarantineStart(null, alwaysLow).show).toBe(true);
  });

  it('stays quiet for the whole gap, then shows again', () => {
    // Shortest gap: first animal, then every 5th.
    expect(runSchedule(20, alwaysLow)).toEqual([1, 6, 11, 16]);
  });

  it('honours the longest gap', () => {
    expect(runSchedule(30, alwaysHigh)).toEqual([1, 11, 21]);
  });

  it('keeps every gap inside 5 to 10 whatever the roll', () => {
    const rolls = [0, 0.17, 0.34, 0.5, 0.67, 0.83, 0.999];
    let index = 0;
    const shown = runSchedule(200, () => rolls[index++ % rolls.length]);
    for (let position = 1; position < shown.length; position += 1) {
      const gap = shown[position] - shown[position - 1];
      expect(gap).toBeGreaterThanOrEqual(NOTICE_MIN_INTERVAL);
      expect(gap).toBeLessThanOrEqual(NOTICE_MAX_INTERVAL);
    }
  });

  // The point of re-rolling: no fixed rhythm to learn and click through on autopilot.
  it('does not settle into a fixed rhythm', () => {
    const rolls = [0, 0.999, 0.34, 0.83, 0.17];
    let index = 0;
    const shown = runSchedule(120, () => rolls[index++ % rolls.length]);
    const gaps = shown.slice(1).map((value, position) => value - shown[position]);
    expect(new Set(gaps).size).toBeGreaterThan(1);
  });

  // It can be spaced out, never switched off.
  it('always comes back eventually', () => {
    expect(runSchedule(60, alwaysHigh).length).toBeGreaterThan(4);
  });

  it('counts starts even on the quiet animals', () => {
    let state = null;
    for (let index = 0; index < 4; index += 1) state = recordQuarantineStart(state, alwaysLow).state;
    expect(state.starts).toBe(4);
  });
});

describe('pickNoticeInterval', () => {
  it('clamps both ends of the range', () => {
    expect(pickNoticeInterval(() => 0)).toBe(NOTICE_MIN_INTERVAL);
    expect(pickNoticeInterval(() => 0.999999)).toBe(NOTICE_MAX_INTERVAL);
  });

  it('never leaves the range for an out-of-bounds or broken random source', () => {
    [() => -1, () => 1, () => 5, () => NaN].forEach(random => {
      const interval = pickNoticeInterval(random);
      expect(interval).toBeGreaterThanOrEqual(NOTICE_MIN_INTERVAL);
      expect(interval).toBeLessThanOrEqual(NOTICE_MAX_INTERVAL);
    });
  });
});

describe('normalizeNoticeState', () => {
  it('starts a fresh install due for the notice', () => {
    expect(normalizeNoticeState(null)).toEqual({ starts: 0, nextAt: 1 });
  });

  it('repairs a corrupted or hand-edited record rather than trusting it', () => {
    expect(normalizeNoticeState({ starts: -5, nextAt: 0 })).toEqual({ starts: 0, nextAt: 1 });
    expect(normalizeNoticeState({ starts: 'x', nextAt: 'y' })).toEqual({ starts: 0, nextAt: 1 });
    expect(normalizeNoticeState({ starts: 7.8, nextAt: 12.3 })).toEqual({ starts: 7, nextAt: 12 });
  });

  // Zeroing nextAt by hand must not suppress the notice forever.
  it('cannot be edited into never showing', () => {
    expect(recordQuarantineStart({ starts: 500, nextAt: 0 }, alwaysLow).show).toBe(true);
  });
});
