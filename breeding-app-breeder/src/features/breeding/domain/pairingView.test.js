import { describe, it, expect } from 'vitest';
import { recordPairingSession, recordEvent, updateClutch, recordHatching, LOCK_STATUS } from './cycleModel';
import { cycleToPairingView, isIncubating, clutchNumbersToAssign, displayMaleId } from './pairingView';

const NOW = '2026-01-01T00:00:00.000Z';

function laid() {
  let { cycle } = recordPairingSession([], { femaleId: 'F', maleId: 'M1', introductionDate: '2025-11-01', sessionId: 's1', lockStatus: LOCK_STATUS.OBSERVED, lockDate: '2025-11-02' }, { now: NOW });
  cycle = recordPairingSession([cycle], { femaleId: 'F', maleId: 'M2', introductionDate: '2025-12-01', sessionId: 's2' }, { now: NOW }).cycle;
  cycle = recordEvent(cycle, { type: 'ovulation', date: '2026-02-01' }, { now: NOW });
  return updateClutch(cycle, { laidDate: '2026-03-20', eggsTotal: 6 }, { now: NOW });
}

describe('a card as the older screens read it', () => {
  it('maps sessions, locks, milestones and the clutch', () => {
    const view = cycleToPairingView(laid());
    expect(view.maleId).toBe('M2');
    expect(view.appointments.find((a) => a.lockObserved).lockDate).toBe('2025-11-02');
    expect(view.ovulation).toEqual({ observed: true, date: '2026-02-01' });
    expect(view.clutch).toMatchObject({ recorded: true, date: '2026-03-20', eggsTotal: 6 });
    expect(view.bookkeeping).toBe('cycle');
  });

  it('reads incubator bookkeeping from the legacy pairing that holds it', () => {
    const cycle = { ...laid(), legacy: { pairingIds: ['p1'] } };
    const pairingsById = new Map([['p1', { id: 'p1', clutch: { date: '2026-03-20', clutchNumber: 4, eggBoxNumber: 4, eggBoxNotes: { 1: 'top' } } }]]);
    const view = cycleToPairingView(cycle, { pairingsById });
    expect(view.bookkeeping).toBe('legacy');
    expect(view.bookkeepingPairingId).toBe('p1');
    expect(view.clutch).toMatchObject({ clutchNumber: 4, eggBoxNotes: { 1: 'top' } });
  });

  it('a clutch is in the incubator from egg laid until hatching starts', () => {
    const cycle = laid();
    expect(isIncubating(cycle)).toBe(true);
    expect(isIncubating(recordHatching(cycle, { date: '2026-05-18', hatchlingsRecorded: 2 }, { now: NOW }))).toBe(false);
    expect(isIncubating({ ...cycle, status: 'closed' })).toBe(false);
  });

  it('numbers new clutches above every number in use, oldest first, once', () => {
    const a = laid();
    const b = { ...updateClutch(laid(), { laidDate: '2026-03-01' }, { now: NOW }), id: 'b' };
    b.events = b.events.map((e) => (e.type === 'egg_laying' ? { ...e, date: '2026-03-01' } : e));
    const numbered = { ...laid(), id: 'c', clutch: { ...laid().clutch, clutchNumber: 9 } };
    expect(clutchNumbersToAssign([a, b, numbered], [{ clutch: { eggBoxNumber: 12 } }])).toEqual([{ id: 'b', number: 13 }, { id: a.id, number: 14 }]);
  });

  it('falls back to the candidate male before any session', () => {
    expect(displayMaleId({ sessions: [], males: [{ maleId: 'M9', state: 'planned' }] })).toBe('M9');
  });
});
