import { describe, it, expect } from 'vitest';
import { recordPairingSession, recordEvent, updateClutch, completeHatchingOutcome, closeCycle } from './cycleModel';
import { cycleClock } from './cycleClock';
import { femaleStatistics } from './history';

const NOW = '2026-01-01T00:00:00.000Z';
const base = () => recordPairingSession([], { femaleId: 'F', maleId: 'M', introductionDate: '2025-11-01', sessionId: 's1' }, { now: NOW }).cycle;
const ev = (cycle, type, date) => recordEvent(cycle, { type, date }, { now: NOW });

describe('the cycle clock', () => {
  it('does not start before ovulation is logged', () => {
    expect(cycleClock(base(), '2026-02-01')).toBeNull();
  });

  it('counts 21 days from ovulation to the pre-lay shed', () => {
    const clock = cycleClock(ev(base(), 'ovulation', '2026-02-01'), '2026-02-11');
    expect(clock).toMatchObject({ target: 'pre_lay_shed', totalDays: 21, dueDate: '2026-02-22', day: 10, daysUntil: 11, state: 'upcoming' });
  });

  it('counts 30 days from the shed to eggs, and 60 days from eggs to hatching', () => {
    let cycle = ev(ev(base(), 'ovulation', '2026-02-01'), 'pre_lay_shed', '2026-02-20');
    expect(cycleClock(cycle, '2026-03-01')).toMatchObject({ target: 'egg_laying', dueDate: '2026-03-22' });
    cycle = updateClutch(cycle, { laidDate: '2026-03-21', eggsTotal: 6 }, { now: NOW });
    expect(cycleClock(cycle, '2026-04-01')).toMatchObject({ target: 'first_hatch', totalDays: 60, dueDate: '2026-05-20', day: 11 });
  });

  it('counts from the latest logged milestone when one was skipped', () => {
    const cycle = ev(base(), 'pre_lay_shed', '2026-02-20');
    expect(cycleClock(cycle, '2026-03-01')).toMatchObject({ anchor: 'pre_lay_shed', target: 'egg_laying' });
  });

  it('watches two days before, is due on the day, then strictly past due: 2 warning days, then overdue', () => {
    const cycle = updateClutch(base(), { laidDate: '2026-03-01', eggsTotal: 6 }, { now: NOW }); // due 2026-04-30
    expect(cycleClock(cycle, '2026-04-27').state).toBe('upcoming');
    expect(cycleClock(cycle, '2026-04-28').state).toBe('watch');
    expect(cycleClock(cycle, '2026-04-30')).toMatchObject({ state: 'due', day: 60 });
    expect(cycleClock(cycle, '2026-05-01')).toMatchObject({ state: 'late', daysLate: 1, day: 61 });
    expect(cycleClock(cycle, '2026-05-02')).toMatchObject({ state: 'late', daysLate: 2 });
    expect(cycleClock(cycle, '2026-05-03')).toMatchObject({ state: 'overdue', daysLate: 3, progress: 1 });
  });

  it('stops once the clutch hatched or the card closed', () => {
    const laid = updateClutch(base(), { laidDate: '2026-03-01', eggsTotal: 6 }, { now: NOW });
    expect(cycleClock(completeHatchingOutcome(laid, { finalHatchDate: '2026-04-29', hatchlingsRecorded: 6 }, { now: NOW }), '2026-05-01')).toBeNull();
    expect(cycleClock(closeCycle(laid, { outcome: 'failed_clutch' }, { now: NOW }), '2026-05-01')).toBeNull();
  });
});

describe('history windows ignore records that cannot be true', () => {
  it('drops a clutch that "hatched" the day it was laid and says how many were dropped', () => {
    const cycle = (id, laid, hatch) => ({ ...updateClutch(base(), { laidDate: laid, eggsTotal: 4 }, { now: NOW }), id, clutch: { eggsTotal: 4, firstHatchDate: hatch } });
    const stats = femaleStatistics([cycle('a', '2026-03-01', '2026-03-01'), cycle('b', '2026-03-01', '2026-04-30'), cycle('c', '2026-03-01', '2026-05-02')]);
    expect(stats.metrics.layingToFirstHatch).toMatchObject({ n: 2, min: 60, max: 62, ignored: 1 });
  });
});
