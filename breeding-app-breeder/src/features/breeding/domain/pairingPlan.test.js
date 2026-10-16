import { describe, it, expect } from 'vitest';
import { recordPairingSession, recordEvent, normalizeCycle, closeCycle, pauseCycle, countObservedLocks, countSessions } from './cycleModel';
import {
  pairingPlanRows,
  nextRowDate,
  upcomingPairings,
  markPaired,
  unmarkPaired,
  markLock,
  unmarkLock,
  setPairedDate,
  setRowNote,
  milestoneSummary,
  milestoneCountdown,
  clutchCountsPatch,
} from './pairingPlan';
import { dueFollowUps, reviewPlannedAfterOvulation } from './followUps';
import { mergeBreedingCycleRecords } from './sync';

const NOW = '2026-01-13T10:00:00.000Z';

function cardPairedOn(date = '2026-01-13') {
  return recordPairingSession([], { femaleId: 'F1', maleId: 'M1', introductionDate: date, sessionId: 's1' }, { now: NOW }).cycle;
}

/** The legacy shape behind the Salisu screenshot: five planned dates and nothing paired. */
function legacyPlannedCard() {
  return normalizeCycle({
    id: 'bc-legacy',
    femaleId: 'F1',
    startDate: '2026-01-13',
    males: [{ maleId: 'SALISU', state: 'planned' }],
    plannedPairings: ['2026-01-13', '2026-02-13', '2026-03-13', '2026-04-17', '2026-05-11'].map((date, i) => ({ id: `pp${i + 1}`, maleId: 'SALISU', date, status: 'pending', origin: 'manual' })),
  });
}

describe('pairing plan rows', () => {
  it('a new card has its first pairing ticked and the next row one calendar month later', () => {
    const rows = pairingPlanRows(cardPairedOn('2026-01-31'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: 'session', paired: true, pairedDate: '2026-01-31', maleId: 'M1' });
    expect(rows[1]).toMatchObject({ kind: 'next', paired: false, plannedDate: '2026-02-28', maleId: 'M1' });
  });

  it('ticking Paired counts from the day it was ticked, not from the planned date', () => {
    let cycle = cardPairedOn('2026-01-13');
    const next = pairingPlanRows(cycle).find((r) => r.kind === 'next');
    expect(next.plannedDate).toBe('2026-02-13');
    cycle = markPaired(cycle, next, { date: '2026-02-20', now: NOW }).cycle;
    const rows = pairingPlanRows(cycle);
    expect(rows.map((r) => r.pairedDate || r.plannedDate)).toEqual(['2026-01-13', '2026-02-20', '2026-03-20']);
    expect(countSessions(cycle)).toBe(2);
  });

  it('a corrected pairing date moves the next row with it', () => {
    let cycle = cardPairedOn('2026-01-13');
    cycle = setPairedDate(cycle, 's1', '2026-01-20', { now: NOW });
    expect(nextRowDate(cycle)).toBe('2026-02-20');
  });

  it('a card with nothing paired starts its first row on the day the card started', () => {
    const cycle = normalizeCycle({ id: 'bc-empty', femaleId: 'F1', startDate: '2026-10-01', males: [{ maleId: 'M1' }] });
    expect(pairingPlanRows(cycle)).toEqual([expect.objectContaining({ kind: 'next', plannedDate: '2026-10-01', maleId: 'M1' })]);
  });

  it('planned dates that pass unticked stay as blank rows and never turn overdue', () => {
    const cycle = legacyPlannedCard();
    const rows = pairingPlanRows(cycle);
    expect(rows.map((r) => [r.kind, r.plannedDate, r.paired])).toEqual([
      ['planned', '2026-01-13', false],
      ['planned', '2026-02-13', false],
      ['planned', '2026-03-13', false],
      ['planned', '2026-04-17', false],
      ['planned', '2026-05-11', false],
    ]);
    // Nothing is past-due anywhere: not on the calendar, not in the overview.
    expect(upcomingPairings(cycle, { today: '2026-10-15' })).toEqual([]);
    expect(dueFollowUps(cycle, [], { today: '2026-10-15' })).toEqual([]);
    // Only dates still ahead are offered as reminders.
    expect(upcomingPairings(cycle, { today: '2026-04-01' }).map((r) => r.plannedDate)).toEqual(['2026-04-17', '2026-05-11']);
    expect(dueFollowUps(cycle, [], { today: '2026-04-01' }).every((i) => i.overdue === false)).toBe(true);
  });

  it('ticking a planned row fulfils it; unticking puts it back at its planned date with the note', () => {
    let cycle = legacyPlannedCard();
    const first = pairingPlanRows(cycle)[0];
    cycle = setRowNote(cycle, first, 'Very interested', { now: NOW });
    const withNote = pairingPlanRows(cycle)[0];
    const paired = markPaired(cycle, withNote, { date: '2026-01-14', now: NOW });
    cycle = paired.cycle;
    expect(cycle.plannedPairings.find((p) => p.id === 'pp1')).toMatchObject({ status: 'done', resolution: { sessionId: paired.session.id } });
    expect(pairingPlanRows(cycle)[0]).toMatchObject({ kind: 'session', pairedDate: '2026-01-14', plannedDate: '2026-01-13', note: 'Very interested' });
    // The later planned rows are still waiting, so no extra next row is added.
    expect(pairingPlanRows(cycle).filter((r) => r.kind === 'next')).toHaveLength(0);
    // Ticked months later, the first row still stays first; the next row follows that pairing.
    const late = markPaired(cycle, pairingPlanRows(cycle)[1], { date: '2026-10-15', now: NOW }).cycle;
    const lateRows = pairingPlanRows(late);
    expect(lateRows.map((r) => r.plannedDate)).toEqual(['2026-01-13', '2026-02-13', '2026-03-13', '2026-04-17', '2026-05-11', '2026-11-15']);
    expect(lateRows[1]).toMatchObject({ paired: true, pairedDate: '2026-10-15' });
    expect(lateRows[5].kind).toBe('next');

    cycle = unmarkPaired(cycle, paired.session.id, { now: NOW });
    expect(countSessions(cycle)).toBe(0);
    expect(pairingPlanRows(cycle)[0]).toMatchObject({ kind: 'planned', plannedDate: '2026-01-13', note: 'Very interested' });
  });

  it('a note on the next row is kept by storing that row', () => {
    let cycle = cardPairedOn('2026-01-13');
    const next = pairingPlanRows(cycle).find((r) => r.kind === 'next');
    cycle = setRowNote(cycle, next, 'Male in shed', { now: NOW });
    const rows = pairingPlanRows(cycle);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ kind: 'planned', plannedDate: '2026-02-13', note: 'Male in shed' });
  });

  it('ticking Lock observed records one observed lock; unticking removes it', () => {
    let cycle = cardPairedOn('2026-01-13');
    cycle = markLock(cycle, 's1', { date: '2026-01-15', now: NOW });
    const row = pairingPlanRows(cycle)[0];
    expect(row.lock).toMatchObject({ status: 'observed', observationDate: '2026-01-15' });
    expect(countObservedLocks(cycle)).toBe(1);
    cycle = unmarkLock(cycle, 's1', row.lock.id, { now: NOW });
    expect(countObservedLocks(cycle)).toBe(0);
    expect(pairingPlanRows(cycle)[0].lock).toBeNull();
  });

  it('a lock does not add a row: the next row follows the pairing, not the lock', () => {
    let cycle = cardPairedOn('2026-01-13');
    cycle = markLock(cycle, 's1', { date: '2026-01-25', now: NOW });
    expect(nextRowDate(cycle)).toBe('2026-02-13');
    expect(cycle.plannedPairings).toHaveLength(0);
  });

  it('ovulation ends the plan: no next row, nothing upcoming, pending rows cancelled', () => {
    let cycle = legacyPlannedCard();
    cycle = markPaired(cycle, pairingPlanRows(cycle)[0], { date: '2026-01-13', now: NOW }).cycle;
    cycle = recordEvent(cycle, { type: 'ovulation', date: '2026-03-01' }, { now: NOW });
    cycle = reviewPlannedAfterOvulation(cycle, { now: NOW }).cycle;
    expect(nextRowDate(cycle)).toBeNull();
    expect(upcomingPairings(cycle, { today: '2026-03-02' })).toEqual([]);
    expect(pairingPlanRows(cycle).map((r) => r.kind)).toEqual(['session']);
  });

  it('paused and closed cards offer no reminders; closed cards add no next row', () => {
    const cycle = cardPairedOn('2026-01-13');
    expect(upcomingPairings(pauseCycle(cycle, {}, { now: NOW }), { today: '2026-01-14' })).toEqual([]);
    const closed = closeCycle(cycle, { outcome: 'cancelled' }, { now: NOW });
    expect(nextRowDate(closed)).toBeNull();
    expect(() => markPaired(closed, { kind: 'next', maleId: 'M1' }, { now: NOW })).toThrow();
  });

  it('ticking Paired on a paused card resumes it', () => {
    const paused = pauseCycle(cardPairedOn('2026-01-13'), {}, { now: NOW });
    const next = pairingPlanRows(paused).find((r) => r.kind === 'next');
    expect(markPaired(paused, next, { date: '2026-02-13', now: NOW }).cycle.status).toBe('active');
  });
});

describe('unticking survives sync', () => {
  it('an unticked pairing is not brought back by the older copy on the other device', () => {
    const synced = markLock(cardPairedOn('2026-01-13'), 's1', { date: '2026-01-15', now: NOW });
    const local = unmarkPaired(synced, 's1', { now: '2026-01-16T10:00:00.000Z' });
    expect(local.removedIds).toEqual(expect.arrayContaining(['s1', synced.sessions[0].locks[0].id]));
    // Either way round, the merge keeps it removed.
    expect(countSessions(mergeBreedingCycleRecords(local, synced))).toBe(0);
    expect(countSessions(mergeBreedingCycleRecords(synced, local))).toBe(0);
  });

  it('an unticked lock and a removed milestone stay removed after a merge', () => {
    let synced = markLock(cardPairedOn('2026-01-13'), 's1', { date: '2026-01-15', now: NOW });
    synced = recordEvent(synced, { id: 'ev-ov', type: 'ovulation', date: '2026-02-01' }, { now: NOW });
    let local = unmarkLock(synced, 's1', synced.sessions[0].locks[0].id, { now: '2026-02-02T10:00:00.000Z' });
    local = { ...local, events: local.events.filter((e) => e.id !== 'ev-ov'), removedIds: [...local.removedIds, 'ev-ov'] };
    const merged = mergeBreedingCycleRecords(local, synced);
    expect(countObservedLocks(merged)).toBe(0);
    expect(merged.events).toHaveLength(0);
  });
});

describe('milestones keep the old pairing card arithmetic', () => {
  const base = () => cardPairedOn('2026-01-13');

  it('ovulation → pre-lay shed expected 21 days later, counted "day N of 21"', () => {
    const cycle = recordEvent(base(), { type: 'ovulation', date: '2026-03-01' }, { now: NOW });
    expect(milestoneSummary(cycle).preLayEta).toBe('2026-03-22');
    expect(milestoneCountdown(cycle, { today: '2026-03-05' })).toMatchObject({ key: 'pre_lay_shed', targetDate: '2026-03-22', totalDays: 21, dayNumber: 5, daysLeft: 17 });
  });

  it('pre-lay shed → eggs 30 days later; laying → hatching 60 days later; one countdown at a time', () => {
    let cycle = recordEvent(base(), { type: 'ovulation', date: '2026-03-01' }, { now: NOW });
    cycle = recordEvent(cycle, { type: 'pre_lay_shed', date: '2026-03-20' }, { now: NOW });
    expect(milestoneCountdown(cycle, { today: '2026-03-21' })).toMatchObject({ key: 'egg_laying', targetDate: '2026-04-19', totalDays: 30 });
    cycle = recordEvent(cycle, { type: 'egg_laying', date: '2026-04-18' }, { now: NOW });
    expect(milestoneCountdown(cycle, { today: '2026-04-18' })).toMatchObject({ key: 'first_hatch', targetDate: '2026-06-17', totalDays: 60, dayNumber: 1 });
    cycle = recordEvent(cycle, { type: 'first_hatch', date: '2026-06-15' }, { now: NOW });
    expect(milestoneCountdown(cycle, { today: '2026-06-16' })).toBeNull();
  });

  it('good eggs = eggs − slugs; slugs cannot exceed eggs; a separately entered fertile count is kept', () => {
    const cycle = base();
    const patch = clutchCountsPatch(cycle, { eggsTotal: '8' });
    expect(patch).toEqual({ eggsTotal: 8, slugs: null, fertileEggs: 8 });
    const withEggs = { ...cycle, clutch: { ...cycle.clutch, ...patch } };
    expect(clutchCountsPatch(withEggs, { slugs: '2' })).toEqual({ eggsTotal: 8, slugs: 2, fertileEggs: 6 });
    expect(milestoneSummary({ ...withEggs, clutch: { ...withEggs.clutch, slugs: 2 } }).goodEggs).toBe(6);
    expect(() => clutchCountsPatch(withEggs, { slugs: '9' })).toThrow(/Slugs/);
    const manualFertile = { ...cycle, clutch: { ...cycle.clutch, eggsTotal: 8, slugs: 1, fertileEggs: 5 } };
    expect(clutchCountsPatch(manualFertile, { slugs: '2' })).toEqual({ eggsTotal: 8, slugs: 2 });
  });
});
