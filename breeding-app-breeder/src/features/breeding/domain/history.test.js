import { describe, it, expect } from 'vitest';
import { recordPairingSession, recordEvent, updateClutch, completeHatchingOutcome, closeCycle, LOCK_STATUS } from './cycleModel';
import { summarizeCycle, femaleStatistics, compareWithHistory, pairingFrequency, median } from './history';
import { createExam } from './follicles';

const NOW = '2026-03-01T10:00:00.000Z';

function completedCycle({ femaleId = 'F1', start, ovulation, shed, laying, firstHatch, finalHatch, eggs = 6, locks = [] }, cycles = []) {
  let state = recordPairingSession(cycles, { femaleId, maleId: 'M1', introductionDate: start, sessionId: `${start}-s1`, lockStatus: locks[0] ? LOCK_STATUS.OBSERVED : undefined, lockDate: locks[0] }, { now: NOW });
  let cycle = state.cycle;
  locks.slice(1).forEach((lockDate, i) => {
    state = recordPairingSession(state.cycles, { femaleId, maleId: 'M1', introductionDate: lockDate, sessionId: `${start}-s${i + 2}`, lockStatus: LOCK_STATUS.OBSERVED, lockDate }, { now: NOW });
    cycle = state.cycle;
  });
  if (ovulation) cycle = recordEvent(cycle, { type: 'ovulation', date: ovulation }, { now: NOW });
  if (shed) cycle = recordEvent(cycle, { type: 'pre_lay_shed', date: shed }, { now: NOW });
  if (laying) cycle = updateClutch(cycle, { laidDate: laying, eggsTotal: eggs, fertileEggs: eggs, slugs: 0 }, { now: NOW });
  if (finalHatch) cycle = completeHatchingOutcome(cycle, { finalHatchDate: finalHatch, hatchlingsRecorded: eggs }, { now: NOW });
  if (firstHatch && !finalHatch) cycle = recordEvent(cycle, { type: 'first_hatch', date: firstHatch }, { now: NOW });
  if (!finalHatch && !laying) cycle = closeCycle(cycle, { outcome: 'no_clutch', note: 'none' }, { now: NOW });
  return state.cycles.map((c) => (c.id === cycle.id ? cycle : c));
}

describe('per-cycle summary', () => {
  it('computes intervals from actual dates and labels the biological completion separately from closure', () => {
    const cycles = completedCycle({ start: '2025-11-01', ovulation: '2025-12-20', shed: '2026-01-08', laying: '2026-02-05', finalHatch: '2026-04-05', locks: ['2025-11-01', '2025-12-01'] });
    const summary = summarizeCycle(cycles[0]);
    expect(summary.intervals.firstPairingToOvulation).toEqual({ value: 49, status: 'ok' });
    expect(summary.intervals.lastPairingBeforeOvulationToOvulation).toEqual({ value: 19, status: 'ok' });
    expect(summary.intervals.firstLockBeforeOvulationToOvulation).toEqual({ value: 49, status: 'ok' });
    expect(summary.intervals.ovulationToPreLayShed).toEqual({ value: 19, status: 'ok' });
    expect(summary.intervals.preLayShedToLaying).toEqual({ value: 28, status: 'ok' });
    expect(summary.intervals.firstPairingToLaying).toEqual({ value: 96, status: 'ok' });
    expect(summary.intervals.layingToFinalHatch).toEqual({ value: 59, status: 'ok' });
    expect(summary.intervals.firstPairingToHatchingComplete).toEqual({ value: 155, status: 'ok' });
    expect(summary.biologicalCompletionDate).toBe('2026-04-05');
    expect(summary.administrativeClosedAt).toBe(NOW);
    expect(summary.lockCount).toBe(2);
    expect(summary.sessionCount).toBe(2);
    expect(summary.frequency.averageIntervalDays).toBe(30);
  });

  it('pairing frequency is unavailable with fewer than two introductions and explains same-day sessions', () => {
    expect(pairingFrequency([{ introductionDate: '2026-03-01' }]).averageIntervalDays).toBeNull();
    const freq = pairingFrequency([{ introductionDate: '2026-03-01' }, { introductionDate: '2026-03-01' }, { introductionDate: '2026-03-31' }]);
    expect(freq.averageIntervalDays).toBe(15);
    expect(freq.sameDayCount).toBe(1);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('excludes estimated and suspected milestone dates from the default statistic and flags invalid chronology', () => {
    let state = recordPairingSession([], { femaleId: 'F1', maleId: 'M1', introductionDate: '2026-01-01', sessionId: 's1' }, { now: NOW });
    let cycle = recordEvent(state.cycle, { type: 'ovulation', date: '2026-02-10', precision: 'estimated' }, { now: NOW });
    let summary = summarizeCycle(cycle);
    expect(summary.intervals.firstPairingToOvulation.status).toBe('not_recorded');
    expect(summarizeCycle(cycle, [], { usePreciseOnly: false }).intervals.firstPairingToOvulation.value).toBe(40);
    cycle = recordEvent(cycle, { type: 'pre_lay_shed', date: '2026-03-01' }, { now: NOW });
    cycle = recordEvent(cycle, { type: 'egg_laying', date: '2026-02-20' }, { now: NOW });
    summary = summarizeCycle(cycle);
    expect(summary.intervals.preLayShedToLaying.status).toBe('invalid_chronology');
    expect(summary.invalidChronology).toContain('preLayShedToLaying');
  });
});

describe('M. across-cycle statistics', () => {
  it('reports median, range and metric-specific sample counts; no-clutch cycles stay visible without corrupting clutch size', () => {
    let cycles = completedCycle({ start: '2023-11-01', ovulation: '2023-12-21', shed: '2024-01-10', laying: '2024-02-08', finalHatch: '2024-04-08', eggs: 5 });
    cycles = completedCycle({ start: '2024-11-01', ovulation: '2024-12-15', shed: '2025-01-02', laying: '2025-02-01', finalHatch: '2025-04-01', eggs: 7 }, cycles);
    cycles = completedCycle({ start: '2025-11-05' }, cycles); // closed, no clutch
    cycles = completedCycle({ start: '2026-01-05', ovulation: '2026-02-20' }, cycles); // current, incomplete
    const current = cycles[cycles.length - 1];
    const stats = femaleStatistics(cycles, [], { excludeCycleId: current.id });
    expect(stats.cycleCount).toBe(3);
    expect(stats.noClutchCycles).toHaveLength(1);
    expect(stats.laidClutchCount).toBe(2);
    expect(stats.metrics.eggsTotal).toMatchObject({ n: 2, median: 6, min: 5, max: 7 });
    expect(stats.metrics.firstPairingToOvulation).toMatchObject({ n: 2, median: 47, min: 44, max: 50 });
    expect(stats.metrics.ovulationToPreLayShed).toMatchObject({ n: 2, min: 18, max: 20 });
    expect(stats.metrics.layingToFirstHatch).toMatchObject({ n: 2 });
    const comparison = compareWithHistory(summarizeCycle(current), stats, { today: '2026-03-01' });
    expect(comparison.firstPairingToOvulation).toMatchObject({ verdict: 'within_range', current: 46 });
    expect(comparison.ovulationToPreLayShed.verdict).toBe('not_completed');
  });

  it('labels one prior cycle honestly and gives an empty state with no history', () => {
    const cycles = completedCycle({ start: '2024-11-01', ovulation: '2024-12-15', shed: '2025-01-02', laying: '2025-02-01', finalHatch: '2025-04-01' });
    const one = femaleStatistics(cycles, []);
    expect(one.metrics.firstPairingToOvulation.label).toBe('one_prior');
    expect(one.metrics.firstPairingToOvulation.n).toBe(1);
    const none = femaleStatistics([], []);
    expect(none.hasHistory).toBe(false);
    expect(none.metrics.eggsTotal.label).toBe('none');
    expect(compareWithHistory(null, none).firstPairingToOvulation.verdict).toBe('no_history');
  });

  it('includes follicle trend per cycle from associated exams', () => {
    const cycles = completedCycle({ start: '2025-11-01', ovulation: '2025-12-20' });
    const cycle = cycles[0];
    const exams = [
      createExam({ femaleId: 'F1', cycleId: cycle.id, date: '2025-10-01', method: 'ultrasound', result: 'follicles_seen', largestDiameterMm: 12 }, { now: NOW }),
      createExam({ femaleId: 'F1', cycleId: cycle.id, date: '2025-12-01', method: 'ultrasound', result: 'follicles_seen', largestDiameterMm: 28 }, { now: NOW }),
    ];
    const summary = summarizeCycle(cycle, exams);
    expect(summary.follicles.firstMeasurement.valueMm).toBe(12);
    expect(summary.follicles.latestMeasurement.valueMm).toBe(28);
    expect(summary.follicles.trend.deltaMm).toBe(16);
    expect(summary.follicles.examCount).toBe(2);
  });
});
