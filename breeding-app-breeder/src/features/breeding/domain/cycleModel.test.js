import { describe, it, expect } from 'vitest';
import {
  recordPairingSession,
  addLockObservation,
  countObservedLocks,
  countSessions,
  maleHistory,
  setLockStatus,
  removeLock,
  setMultipleSires,
  addCandidateMale,
  removeCandidateMale,
  recordEvent,
  updateClutch,
  recordHatching,
  completeHatchingOutcome,
  completeIfRegistered,
  registrationStatus,
  hatchingDone,
  closeCycle,
  reopenCycle,
  pauseCycle,
  deriveStage,
  chronologyFlags,
  duplicateFlags,
  findActiveCycle,
  linkOffspring,
  assignOffspringSire,
  collectionFlags,
  LOCK_STATUS,
  CYCLE_STATUS,
} from './cycleModel';

const NOW = '2026-03-01T10:00:00.000Z';
const base = { femaleId: 'F1', maleId: 'M1', introductionDate: '2026-03-01' };

describe('A. first actual pairing creates one female cycle', () => {
  it('creates exactly one cycle, and repeated or concurrent saves of the same session do not duplicate it', () => {
    const first = recordPairingSession([], { ...base, sessionId: 's1' }, { now: NOW });
    expect(first.created).toBe(true);
    expect(first.cycles).toHaveLength(1);
    expect(first.cycle.startDate).toBe('2026-03-01');
    expect(first.cycle.seasonLabel).toBe('2025–26');
    expect(first.cycle.status).toBe(CYCLE_STATUS.ACTIVE);

    // Same request again (a retry) and a "concurrent" second call from the same base state.
    const retry = recordPairingSession(first.cycles, { ...base, sessionId: 's1' }, { now: NOW });
    expect(retry.created).toBe(false);
    expect(retry.cycles).toHaveLength(1);
    expect(countSessions(retry.cycle)).toBe(1);

    const concurrentA = recordPairingSession(first.cycles, { ...base, sessionId: 'sA' }, { now: NOW });
    const concurrentB = recordPairingSession(first.cycles, { ...base, sessionId: 'sB' }, { now: NOW });
    expect(concurrentA.cycles).toHaveLength(1);
    expect(concurrentB.cycles).toHaveLength(1);
    expect(concurrentA.cycle.id).toBe(concurrentB.cycle.id);
  });

  it('a planned appointment alone cannot start a cycle', () => {
    expect(() => recordPairingSession([], { femaleId: 'F1', maleId: 'M1', introductionDate: null })).toThrow(/actual introduction date/);
    expect(findActiveCycle([], 'F1')).toBeNull();
  });

  it('one active cycle per female: a second female gets her own card', () => {
    const a = recordPairingSession([], { ...base, sessionId: 's1' }, { now: NOW });
    const b = recordPairingSession(a.cycles, { femaleId: 'F2', maleId: 'M1', introductionDate: '2026-03-02', sessionId: 's2' }, { now: NOW });
    expect(b.cycles).toHaveLength(2);
    expect(collectionFlags(b.cycles)).toEqual([]);
  });
});

describe('B. another pairing and another male use the active card', () => {
  it('keeps per-male histories separate and totals correct', () => {
    let state = recordPairingSession([], { ...base, sessionId: 's1', lockStatus: LOCK_STATUS.OBSERVED }, { now: NOW });
    state = recordPairingSession(state.cycles, { femaleId: 'F1', maleId: 'M2', introductionDate: '2026-03-10', sessionId: 's2', lockStatus: LOCK_STATUS.NOT_OBSERVED }, { now: NOW });
    state = recordPairingSession(state.cycles, { femaleId: 'F1', maleId: 'M1', introductionDate: '2026-04-01', sessionId: 's3', lockStatus: LOCK_STATUS.OBSERVED }, { now: NOW });
    expect(state.cycles).toHaveLength(1);
    const cycle = state.cycle;
    expect(cycle.multipleSires).toBe(true);
    expect(cycle.males.map((m) => m.maleId).sort()).toEqual(['M1', 'M2']);
    expect(countSessions(cycle)).toBe(3);
    expect(countObservedLocks(cycle)).toBe(2);
    expect(maleHistory(cycle, 'M1')).toMatchObject({ sessionCount: 2, lockCount: 2, latestIntroductionDate: '2026-04-01', latestLockDate: '2026-04-01' });
    expect(maleHistory(cycle, 'M2')).toMatchObject({ sessionCount: 1, lockCount: 0, latestIntroductionDate: '2026-03-10', latestLockDate: null });
  });

  it('changing the male for a new entry does not rewrite earlier sessions', () => {
    let state = recordPairingSession([], { ...base, sessionId: 's1' }, { now: NOW });
    state = recordPairingSession(state.cycles, { femaleId: 'F1', maleId: 'M2', introductionDate: '2026-03-05', sessionId: 's2' }, { now: NOW });
    expect(state.cycle.sessions.find((s) => s.id === 's1').maleId).toBe('M1');
    expect(state.cycle.sessions.find((s) => s.id === 's2').maleId).toBe('M2');
  });
});

describe('C/D/E. observed-lock counting rule', () => {
  it('March 1 observed + April 1 observed = two locks; repeating the same dated record adds nothing', () => {
    let state = recordPairingSession([], { ...base, sessionId: 's1', lockStatus: LOCK_STATUS.OBSERVED, lockDate: '2026-03-01' }, { now: NOW });
    state = recordPairingSession(state.cycles, { ...base, introductionDate: '2026-04-01', sessionId: 's2', lockStatus: LOCK_STATUS.OBSERVED, lockDate: '2026-04-01' }, { now: NOW });
    expect(countObservedLocks(state.cycle)).toBe(2);
    // Re-save the same observation (reopened and checked again): still two.
    const again = addLockObservation(state.cycle, 's1', { status: LOCK_STATUS.OBSERVED, observationDate: '2026-03-01', notes: 'checked again' }, { now: NOW });
    expect(again.merged).toBe(true);
    expect(countObservedLocks(again.cycle)).toBe(2);
    const twice = addLockObservation(again.cycle, 's1', { status: LOCK_STATUS.OBSERVED, observationDate: '2026-03-01' }, { now: NOW });
    expect(countObservedLocks(twice.cycle)).toBe(2);
    expect(twice.cycle.sessions.find((s) => s.id === 's1').locks).toHaveLength(1);
  });

  it('planned, not-observed and unknown entries never count; corrections recalculate', () => {
    let state = recordPairingSession([], { ...base, sessionId: 's1', lockStatus: LOCK_STATUS.NOT_OBSERVED }, { now: NOW });
    expect(countObservedLocks(state.cycle)).toBe(0);
    state = recordPairingSession(state.cycles, { ...base, introductionDate: '2026-03-10', sessionId: 's2', lockStatus: LOCK_STATUS.UNKNOWN, lockDate: '2026-03-10' }, { now: NOW });
    expect(countObservedLocks(state.cycle)).toBe(0);
    const lockId = state.cycle.sessions.find((s) => s.id === 's1').locks[0].id;
    const corrected = setLockStatus(state.cycle, 's1', lockId, LOCK_STATUS.OBSERVED, { now: NOW });
    expect(countObservedLocks(corrected)).toBe(1);
    const removed = removeLock(corrected, 's1', lockId, { now: NOW });
    expect(countObservedLocks(removed)).toBe(0);
    expect(deriveStage(removed)).toBe('pairing');
  });

  it('never defaults a lock to observed', () => {
    const state = recordPairingSession([], { ...base, sessionId: 's1' }, { now: NOW });
    expect(state.lock).toBeNull();
    expect(countObservedLocks(state.cycle)).toBe(0);
  });

  it('introduction and lock dates can differ; a session can span days', () => {
    const state = recordPairingSession([], { ...base, sessionId: 's1', removalDate: '2026-03-05', lockStatus: LOCK_STATUS.OBSERVED, lockDate: '2026-03-03' }, { now: NOW });
    const session = state.cycle.sessions[0];
    expect(session.introductionDate).toBe('2026-03-01');
    expect(session.removalDate).toBe('2026-03-05');
    expect(session.locks[0].observationDate).toBe('2026-03-03');
    // A second sighting on March 3 within the same session: same record, same count.
    const again = addLockObservation(state.cycle, 's1', { status: LOCK_STATUS.OBSERVED, observationDate: '2026-03-03', observationTime: '18:00' }, { now: NOW });
    expect(again.merged).toBe(true);
    expect(countObservedLocks(again.cycle)).toBe(1);
    // A sighting on March 4 in the same session is a second dated record.
    const next = addLockObservation(again.cycle, 's1', { status: LOCK_STATUS.OBSERVED, observationDate: '2026-03-04' }, { now: NOW });
    expect(countObservedLocks(next.cycle)).toBe(2);
    expect(chronologyFlags(next.cycle)).toEqual([]);
  });

  it('flags suspicious duplicates across males and impossible chronology instead of merging', () => {
    let state = recordPairingSession([], { ...base, sessionId: 's1', lockStatus: LOCK_STATUS.OBSERVED, lockDate: '2026-03-02' }, { now: NOW });
    state = recordPairingSession(state.cycles, { femaleId: 'F1', maleId: 'M2', introductionDate: '2026-03-02', sessionId: 's2', lockStatus: LOCK_STATUS.OBSERVED, lockDate: '2026-03-02' }, { now: NOW });
    expect(countObservedLocks(state.cycle)).toBe(2);
    expect(duplicateFlags(state.cycle).map((f) => f.kind)).toContain('locks_same_day_different_males');
    const bad = addLockObservation(state.cycle, 's1', { status: LOCK_STATUS.OBSERVED, observationDate: '2026-02-20' }, { now: NOW });
    expect(chronologyFlags(bad.cycle).map((f) => f.kind)).toContain('lock_before_introduction');
  });
});

describe('G. multiple sires toggle never deletes history', () => {
  it('keeps the multi-sire state when two males have participated and explains why', () => {
    let state = recordPairingSession([], { ...base, sessionId: 's1' }, { now: NOW });
    state = recordPairingSession(state.cycles, { femaleId: 'F1', maleId: 'M2', introductionDate: '2026-03-05', sessionId: 's2' }, { now: NOW });
    const result = setMultipleSires(state.cycle, false, { now: NOW });
    expect(result.retained).toBe(true);
    expect(result.reason).toBe('multiple_participated');
    expect(result.cycle.multipleSires).toBe(true);
    expect(result.cycle.sessions).toHaveLength(2);
    expect(result.cycle.males).toHaveLength(2);
  });

  it('removes an unused planned male safely and refuses one with history', () => {
    let state = recordPairingSession([], { ...base, sessionId: 's1' }, { now: NOW });
    let cycle = addCandidateMale(state.cycle, 'M9', { now: NOW });
    expect(cycle.multipleSires).toBe(true);
    const off = setMultipleSires(cycle, false, { now: NOW });
    expect(off.retained).toBe(false);
    expect(off.cycle.males.map((m) => m.maleId)).toEqual(['M1']);
    const refused = removeCandidateMale(off.cycle, 'M1', { now: NOW });
    expect(refused.removed).toBe(false);
    expect(refused.reason).toBe('has_history');
  });
});

describe('L. milestones: recorded vs suspected, no earlier milestone required', () => {
  it('records a later milestone without an earlier one and keeps certainty distinct', () => {
    const state = recordPairingSession([], { ...base, sessionId: 's1' }, { now: NOW });
    let cycle = recordEvent(state.cycle, { type: 'egg_laying', date: '2026-06-10' }, { now: NOW });
    expect(deriveStage(cycle)).toBe('incubating');
    cycle = recordEvent(cycle, { type: 'ovulation', date: '2026-04-20', certainty: 'suspected' }, { now: NOW });
    expect(cycle.events.find((e) => e.type === 'ovulation').certainty).toBe('suspected');
    // Suspected ovulation never fills the recorded slot.
    expect(chronologyFlags(cycle)).toEqual([]);
    const conflict = recordEvent(cycle, { type: 'pre_lay_shed', date: '2026-07-01' }, { now: NOW });
    expect(chronologyFlags(conflict).map((f) => f.kind)).toContain('laying_before_shed');
    // The conflicting date is kept, not invented away.
    expect(conflict.events.find((e) => e.type === 'pre_lay_shed').date).toBe('2026-07-01');
  });

  it('refuses egg-laying milestones for a live-bearing species', () => {
    const state = recordPairingSession([], { ...base, sessionId: 's1', reproductionMode: 'live_bearing' }, { now: NOW });
    expect(() => recordEvent(state.cycle, { type: 'egg_laying', date: '2026-06-10' })).toThrow(/live-bearing/);
    expect(recordEvent(state.cycle, { type: 'ovulation', date: '2026-04-10' }).events).toHaveLength(1);
  });
});

describe('K/O. clutch, hatching and completion', () => {
  function laidCycle() {
    const state = recordPairingSession([], { ...base, sessionId: 's1' }, { now: NOW });
    let cycle = recordEvent(state.cycle, { type: 'ovulation', date: '2026-04-20' }, { now: NOW });
    cycle = recordEvent(cycle, { type: 'pre_lay_shed', date: '2026-05-08' }, { now: NOW });
    cycle = updateClutch(cycle, { laidDate: '2026-06-05', eggsTotal: 7, fertileEggs: 6, slugs: 1 }, { now: NOW });
    return cycle;
  }

  it('keeps follicle count, egg count and hatchling count as separate facts', () => {
    const cycle = laidCycle();
    expect(cycle.clutch).toMatchObject({ eggsTotal: 7, fertileEggs: 6, slugs: 1, hatchlingsRecorded: null });
    expect(() => updateClutch(cycle, { fertileEggs: 7, slugs: 1 })).toThrow(/exceed/);
    expect(() => updateClutch(cycle, { hatchlingsRecorded: 8 })).toThrow(/exceed/);
  });

  it('first hatchling keeps the cycle open; the final outcome waits for the hatchlings to be registered; retries do not duplicate', () => {
    let cycle = laidCycle();
    cycle = recordHatching(cycle, { date: '2026-08-01', hatchlingsRecorded: 2 }, { now: NOW });
    expect(cycle.status).toBe(CYCLE_STATUS.ACTIVE);
    expect(deriveStage(cycle)).toBe('hatching');
    expect(cycle.clutch.firstHatchDate).toBe('2026-08-01');
    cycle = completeHatchingOutcome(cycle, { finalHatchDate: '2026-08-04', hatchlingsRecorded: 5, lostEggs: 1 }, { now: '2026-08-05T09:00:00.000Z' });
    // Hatched, but no hatchling exists as an animal yet: the cycle is still an active pairing.
    expect(cycle.status).toBe(CYCLE_STATUS.ACTIVE);
    expect(registrationStatus(cycle)).toEqual({ hatched: true, expected: 5, registered: 0, missing: 5 });
    expect(deriveStage(cycle)).toBe('complete');
    const again = completeHatchingOutcome(cycle, { finalHatchDate: '2026-08-04', hatchlingsRecorded: 5, lostEggs: 1 }, { now: '2026-08-06T09:00:00.000Z' });
    expect(again.events.filter((e) => e.type === 'hatching_complete')).toHaveLength(1);
    expect(again.clutch.hatchlingsRecorded).toBe(5);
    // Registering four of five leaves it open; the fifth completes it.
    let registered = again;
    ['H1', 'H2', 'H3', 'H4'].forEach((id) => { registered = linkOffspring(registered, id, { now: NOW }); });
    expect(completeIfRegistered(registered, { now: NOW }).status).toBe(CYCLE_STATUS.ACTIVE);
    registered = completeIfRegistered(linkOffspring(registered, 'H5', { now: NOW }), { now: '2026-08-20T09:00:00.000Z' });
    expect(registered.status).toBe(CYCLE_STATUS.CLOSED);
    expect(registered.closure.outcome).toBe('hatching_complete');
    expect(registered.closure.biologicalCompletionDate).toBe('2026-08-04');
    expect(registered.closure.closedAt).toBe('2026-08-20T09:00:00.000Z');
  });

  it('a reopened card stays open until the final outcome is recorded again', () => {
    let cycle = completeHatchingOutcome(laidCycle(), { finalHatchDate: '2026-08-04', hatchlingsRecorded: 1, lostEggs: 5 }, { now: NOW });
    cycle = completeIfRegistered(linkOffspring(cycle, 'H1', { now: NOW }), { now: NOW });
    expect(cycle.status).toBe(CYCLE_STATUS.CLOSED);
    const reopened = reopenCycle(cycle, { note: 'fix a date' }, { now: NOW });
    expect(completeIfRegistered(reopened, { now: NOW }).status).toBe(CYCLE_STATUS.ACTIVE);
    const again = completeHatchingOutcome(reopened, { finalHatchDate: '2026-08-04' }, { now: NOW });
    expect(again.status).toBe(CYCLE_STATUS.CLOSED);
  });

  it('a clutch with no hatchlings closes as a failed clutch at once: there is nothing to register', () => {
    const cycle = completeHatchingOutcome(laidCycle(), { finalHatchDate: '2026-08-04', hatchlingsRecorded: 0, lostEggs: 6 }, { now: NOW });
    expect(cycle.status).toBe(CYCLE_STATUS.CLOSED);
    expect(cycle.closure.outcome).toBe('failed_clutch');
  });

  it('partial hatching never completes the cycle, even with every hatchling so far registered', () => {
    let cycle = recordHatching(laidCycle(), { date: '2026-08-01', hatchlingsRecorded: 2 }, { now: NOW });
    cycle = linkOffspring(linkOffspring(cycle, 'H1', { now: NOW }), 'H2', { now: NOW });
    expect(hatchingDone(cycle)).toBe(false);
    expect(completeIfRegistered(cycle, { now: NOW }).status).toBe(CYCLE_STATUS.ACTIVE);
    // Once the counts account for every egg (5 hatched + 1 lost + 1 slug = 7), it has hatched.
    cycle = updateClutch(cycle, { hatchlingsRecorded: 5, lostEggs: 1 }, { now: NOW });
    expect(hatchingDone(cycle)).toBe(true);
  });

  it('closes without hatchlings for a documented reason and reopens deliberately with history kept', () => {
    const state = recordPairingSession([], { ...base, sessionId: 's1', lockStatus: LOCK_STATUS.OBSERVED }, { now: NOW });
    expect(() => closeCycle(state.cycle, { outcome: 'other' })).toThrow(/note/);
    const closed = closeCycle(state.cycle, { outcome: 'no_clutch', note: 'Follicles regressed per vet' }, { now: '2026-07-01T00:00:00.000Z' });
    expect(closed.status).toBe(CYCLE_STATUS.CLOSED);
    expect(deriveStage(closed)).toBe('closed_without_offspring');
    expect(findActiveCycle([closed], 'F1')).toBeNull();
    const reopened = reopenCycle(closed, { note: 'Eggs after all' }, { now: '2026-07-02T00:00:00.000Z' });
    expect(reopened.status).toBe(CYCLE_STATUS.ACTIVE);
    expect(reopened.reopenings[0].previousClosure.outcome).toBe('no_clutch');
    expect(countObservedLocks(reopened)).toBe(1);
    // Her next cycle can only start once the previous one is closed.
    const next = recordPairingSession([closed], { femaleId: 'F1', maleId: 'M3', introductionDate: '2026-11-01', sessionId: 'n1' }, { now: NOW });
    expect(next.created).toBe(true);
    expect(next.cycles).toHaveLength(2);
  });

  it('pausing cancels automatic reminders but keeps everything else', () => {
    const state = recordPairingSession([], { ...base, sessionId: 's1' }, { now: NOW });
    const paused = pauseCycle(state.cycle, { reason: 'Female off food' }, { now: NOW });
    expect(paused.status).toBe(CYCLE_STATUS.PAUSED);
    expect(findActiveCycle([paused], 'F1')?.id).toBe(paused.id);
    const resumed = recordPairingSession([paused], { ...base, introductionDate: '2026-04-01', sessionId: 's2' }, { now: NOW });
    expect(resumed.created).toBe(false);
    expect(resumed.cycle.status).toBe(CYCLE_STATUS.ACTIVE);
  });
});

describe('N. candidate sires and parentage', () => {
  it('a lock never selects a father; unresolved stays unresolved until assigned with a method', () => {
    let state = recordPairingSession([], { ...base, sessionId: 's1', lockStatus: LOCK_STATUS.OBSERVED }, { now: NOW });
    state = recordPairingSession(state.cycles, { femaleId: 'F1', maleId: 'M2', introductionDate: '2026-03-08', sessionId: 's2', lockStatus: LOCK_STATUS.OBSERVED }, { now: NOW });
    let cycle = linkOffspring(state.cycle, 'H1', { now: NOW });
    expect(cycle.offspring[0].sireAssignment).toMatchObject({ maleId: null, method: 'unresolved', certainty: 'unknown' });
    cycle = assignOffspringSire(cycle, 'H1', { maleId: 'M2', method: 'dna_test', certainty: 'confirmed', note: 'Lab report 42' }, { now: NOW });
    expect(cycle.offspring[0].sireAssignment).toMatchObject({ maleId: 'M2', method: 'dna_test', certainty: 'confirmed' });
    expect(cycle.offspring[0].sireAssignment.history).toHaveLength(1);
    expect(() => assignOffspringSire(cycle, 'H1', { maleId: 'M7' })).toThrow(/candidate/);
  });

  it('with a single participating male the sire is a labelled candidate, not a confirmation', () => {
    const state = recordPairingSession([], { ...base, sessionId: 's1' }, { now: NOW });
    const cycle = linkOffspring(state.cycle, 'H1', { now: NOW });
    expect(cycle.offspring[0].sireAssignment).toMatchObject({ maleId: 'M1', method: 'single_candidate', certainty: 'reported' });
  });
});
