import { describe, it, expect } from 'vitest';
import { resolveRule, evaluateReview, buildForecasts, normalizeBreedingSettings } from './reviewRules';
import { createExam } from './follicles';
import { recordPairingSession, recordEvent, updateClutch, completeHatchingOutcome } from './cycleModel';

const NOW = '2026-03-01T10:00:00.000Z';
const us = (date, mm, femaleId = 'F1') => createExam({ femaleId, date, method: 'ultrasound', result: 'follicles_seen', largestDiameterMm: mm }, { now: NOW });

describe('configurable review rules', () => {
  it('has no hard-coded size: without settings nothing triggers a review', () => {
    const state = recordPairingSession([], { femaleId: 'F1', maleId: 'M1', introductionDate: '2026-02-01', sessionId: 's1', speciesId: 'ball-python' }, { now: NOW });
    const review = evaluateReview(state.cycle, [us('2026-02-20', 20), us('2026-03-01', 30)], normalizeBreedingSettings({}), { today: '2026-03-01' });
    expect(review.flags.map((f) => f.kind)).not.toContain('pairing_review');
    expect(review.trendAvailable).toBe(true);
  });

  it('species settings apply, individual overrides win, and entering the range is a review prompt', () => {
    const settings = { bySpecies: { 'ball-python': { reviewRangeMinMm: 18, reviewRangeMaxMm: 26, scanReminderDays: 14 } }, byFemale: { F1: { reviewRangeMinMm: 22 } } };
    const rule = resolveRule(settings, { speciesId: 'ball-python', femaleId: 'F1' });
    expect(rule).toMatchObject({ reviewRangeMinMm: 22, reviewRangeMaxMm: 26, scanReminderDays: 14 });
    const state = recordPairingSession([], { femaleId: 'F1', maleId: 'M1', introductionDate: '2026-02-01', sessionId: 's1', speciesId: 'ball-python' }, { now: NOW });
    const single = evaluateReview(state.cycle, [us('2026-02-20', 23)], settings, { today: '2026-03-01' });
    expect(single.flags.map((f) => f.kind)).toContain('pairing_review');
    expect(single.trendAvailable).toBe(false); // one scan = measurement only
    expect(single.flags.map((f) => f.kind)).not.toContain('scan_due'); // due 03-06, not yet
    const later = evaluateReview(state.cycle, [us('2026-02-20', 23)], settings, { today: '2026-03-07' });
    expect(later.flags.map((f) => f.kind)).toContain('scan_due');
    const other = resolveRule(settings, { speciesId: 'corn_snake', femaleId: 'F2' });
    expect(other.reviewRangeMinMm).toBeNull(); // ball python settings never leak to another species
  });

  it('palpation estimates do not trigger the measured-range review', () => {
    const settings = { bySpecies: { 'ball-python': { reviewRangeMinMm: 18, reviewRangeMaxMm: 26 } } };
    const palpation = createExam({ femaleId: 'F1', date: '2026-02-20', method: 'palpation', result: 'follicles_seen', largestDiameterMm: 22 }, { now: NOW });
    const review = evaluateReview({ femaleId: 'F1', speciesId: 'ball-python', status: 'active' }, [palpation], settings, { today: '2026-03-01' });
    expect(review.flags.map((f) => f.kind)).not.toContain('pairing_review');
  });
});

describe('history-based date windows', () => {
  function cycleWith({ start, ovulation, shed, laying, finalHatch }, cycles = []) {
    const state = recordPairingSession(cycles, { femaleId: 'F1', maleId: 'M1', introductionDate: start, sessionId: `${start}-s`, speciesId: 'ball-python' }, { now: NOW });
    let cycle = recordEvent(state.cycle, { type: 'ovulation', date: ovulation }, { now: NOW });
    if (shed) cycle = recordEvent(cycle, { type: 'pre_lay_shed', date: shed }, { now: NOW });
    if (laying) cycle = updateClutch(cycle, { laidDate: laying, eggsTotal: 5 }, { now: NOW });
    if (finalHatch) cycle = completeHatchingOutcome(cycle, { finalHatchDate: finalHatch, hatchlingsRecorded: 5 }, { now: NOW });
    return state.cycles.map((c) => (c.id === cycle.id ? cycle : c));
  }

  it('uses the female history as a forecast only from the configured minimum, descriptive below it, and names the source', () => {
    let cycles = cycleWith({ start: '2022-11-01', ovulation: '2022-12-20', shed: '2023-01-08', laying: '2023-02-05', finalHatch: '2023-04-05' });
    cycles = cycleWith({ start: '2023-11-01', ovulation: '2023-12-20', shed: '2024-01-10', laying: '2024-02-08', finalHatch: '2024-04-08' }, cycles);
    cycles = cycleWith({ start: '2025-11-01', ovulation: '2025-12-27' }, cycles); // current
    const current = cycles[cycles.length - 1];
    const descriptive = buildForecasts({ cycle: current, cycles, settings: normalizeBreedingSettings({}), today: '2026-01-05' });
    const shedWindow = descriptive.windows.find((w) => w.target === 'pre_lay_shed');
    expect(shedWindow).toMatchObject({ source: 'female_history', kind: 'descriptive', sampleCount: 2, earliest: '2026-01-15', latest: '2026-01-17', rangeLabel: 'historical_range' });
    expect(shedWindow).not.toHaveProperty('confidence');

    cycles = cycleWith({ start: '2024-11-01', ovulation: '2024-12-15', shed: '2025-01-05', laying: '2025-02-03', finalHatch: '2025-04-03' }, cycles.slice(0, 2));
    cycles = cycleWith({ start: '2025-11-01', ovulation: '2025-12-27' }, cycles);
    const forecast = buildForecasts({ cycle: cycles[cycles.length - 1], cycles, settings: normalizeBreedingSettings({}), today: '2026-01-05' });
    expect(forecast.windows.find((w) => w.target === 'pre_lay_shed')).toMatchObject({ kind: 'forecast', sampleCount: 3 });
    expect(forecast.windows.find((w) => w.target === 'egg_laying')).toBeUndefined(); // no shed anchor yet
  });

  it('falls back to the species reference only for a documented species, and stops after closure', () => {
    const cycles = cycleWith({ start: '2025-11-01', ovulation: '2025-12-27' });
    const ball = buildForecasts({ cycle: cycles[0], cycles, settings: normalizeBreedingSettings({}), today: '2026-01-05' });
    expect(ball.windows[0]).toMatchObject({ source: 'species_reference', kind: 'reference', sampleCount: null });
    const corn = buildForecasts({ cycle: { ...cycles[0], speciesId: 'corn_snake' }, cycles, settings: normalizeBreedingSettings({}), today: '2026-01-05' });
    expect(corn.windows).toHaveLength(0);
    const closed = buildForecasts({ cycle: { ...cycles[0], status: 'closed' }, cycles, settings: normalizeBreedingSettings({}) });
    expect(closed.windows).toHaveLength(0);
    expect(closed.reason).toBe('cycle_closed');
  });

  it('prefers the female over the collection and only uses collection data it was given', () => {
    let collection = cycleWith({ start: '2023-11-01', ovulation: '2023-12-20', shed: '2024-01-05' });
    collection = collection.map((c) => ({ ...c, femaleId: 'F2' }));
    const mine = cycleWith({ start: '2025-11-01', ovulation: '2025-12-27' });
    const result = buildForecasts({ cycle: mine[0], cycles: mine, collectionCycles: [...collection, ...collection.map((c) => ({ ...c, id: `${c.id}-2`, femaleId: 'F3' })), ...collection.map((c) => ({ ...c, id: `${c.id}-3`, femaleId: 'F4' }))], settings: normalizeBreedingSettings({}), today: '2026-01-05' });
    expect(result.windows[0].source).toBe('collection_history');
    expect(result.windows[0].sampleCount).toBe(3);
  });
});
