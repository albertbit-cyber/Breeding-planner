import { describe, it, expect } from 'vitest';
import { recordPairingSession, recordEvent, pauseCycle, closeCycle, LOCK_STATUS } from './cycleModel';
import {
  proposeNextPairing,
  applyProposal,
  scheduleFollowUpForLock,
  reschedulePlannedPairing,
  skipPlannedPairing,
  reviewPlannedAfterOvulation,
  pendingPlannedPairings,
  addManualPlannedPairing,
} from './followUps';

const NOW = '2026-03-01T10:00:00.000Z';
const TODAY = '2026-03-01';

function withLock(date = '2026-03-01', sessionId = 's1', cycles = []) {
  const state = recordPairingSession(cycles, { femaleId: 'F1', maleId: 'M1', introductionDate: date, sessionId, lockStatus: LOCK_STATUS.OBSERVED, lockDate: date }, { now: NOW });
  return state;
}

describe('F. follow-up proposals', () => {
  it('March 1 observed lock proposes April 1 as a PLANNED next pairing for that male', () => {
    const state = withLock();
    const result = scheduleFollowUpForLock(state.cycle, { sessionId: 's1', lock: state.lock, today: TODAY, now: NOW });
    expect(result.proposal).toMatchObject({ kind: 'create', date: '2026-04-01', maleId: 'M1' });
    const pending = pendingPlannedPairings(result.cycle);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ date: '2026-04-01', maleId: 'M1', origin: 'auto_after_lock', status: 'pending' });
    expect(result.cycle.sessions).toHaveLength(1); // A planned pairing is not a session.
  });

  it('end-of-month and leap-year proposals clamp instead of rolling over', () => {
    const jan = withLock('2026-01-31');
    expect(proposeNextPairing(jan.cycle, { sessionId: 's1', lock: jan.lock, today: '2026-01-31' }).date).toBe('2026-02-28');
    const leap = withLock('2028-01-31');
    expect(proposeNextPairing(leap.cycle, { sessionId: 's1', lock: leap.lock, today: '2028-01-31' }).date).toBe('2028-02-29');
  });

  it('retries and edits never duplicate the reminder', () => {
    const state = withLock();
    const first = scheduleFollowUpForLock(state.cycle, { sessionId: 's1', lock: state.lock, today: TODAY, now: NOW });
    const second = scheduleFollowUpForLock(first.cycle, { sessionId: 's1', lock: state.lock, today: TODAY, now: NOW });
    expect(second.proposal.kind).toBe('reuse');
    expect(pendingPlannedPairings(second.cycle)).toHaveLength(1);
    const applied = applyProposal(second.cycle, { kind: 'create', date: '2026-04-01', maleId: 'M1' }, { now: NOW });
    expect(pendingPlannedPairings(applied.cycle)).toHaveLength(1);
  });

  it('a manually adjusted date is never overwritten silently; a later lock offers reuse', () => {
    const state = withLock();
    const scheduled = scheduleFollowUpForLock(state.cycle, { sessionId: 's1', lock: state.lock, today: TODAY, now: NOW });
    const plannedId = pendingPlannedPairings(scheduled.cycle)[0].id;
    const moved = reschedulePlannedPairing(scheduled.cycle, plannedId, '2026-04-05', { now: NOW });
    const later = recordPairingSession([moved], { femaleId: 'F1', maleId: 'M1', introductionDate: '2026-03-10', sessionId: 's2', lockStatus: LOCK_STATUS.OBSERVED, lockDate: '2026-03-10' }, { now: NOW });
    const proposal = proposeNextPairing(later.cycle, { sessionId: 's2', lock: later.lock, today: '2026-03-10' });
    expect(proposal.kind).toBe('reuse');
    expect(proposal.keptManualDate).toBe(true);
    expect(pendingPlannedPairings(later.cycle)[0].date).toBe('2026-04-05');
  });

  it('a later lock moves an untouched automatic proposal forward, never back', () => {
    const state = withLock('2026-03-01');
    const scheduled = scheduleFollowUpForLock(state.cycle, { sessionId: 's1', lock: state.lock, today: TODAY, now: NOW });
    const later = recordPairingSession([scheduled.cycle], { femaleId: 'F1', maleId: 'M1', introductionDate: '2026-03-12', sessionId: 's2', lockStatus: LOCK_STATUS.OBSERVED, lockDate: '2026-03-12' }, { now: NOW });
    const forward = scheduleFollowUpForLock(later.cycle, { sessionId: 's2', lock: later.lock, today: '2026-03-12', now: NOW });
    expect(forward.proposal.kind).toBe('update');
    expect(pendingPlannedPairings(forward.cycle)).toHaveLength(1);
    expect(pendingPlannedPairings(forward.cycle)[0].date).toBe('2026-04-12');
    // Backfilling an EARLIER lock afterwards leaves the later proposal alone.
    const earlier = recordPairingSession([forward.cycle], { femaleId: 'F1', maleId: 'M1', introductionDate: '2026-03-05', sessionId: 's3', lockStatus: LOCK_STATUS.OBSERVED, lockDate: '2026-03-05' }, { now: NOW });
    const back = scheduleFollowUpForLock(earlier.cycle, { sessionId: 's3', lock: earlier.lock, today: '2026-03-12', now: NOW });
    expect(back.proposal.kind).toBe('reuse');
    expect(pendingPlannedPairings(back.cycle)[0].date).toBe('2026-04-12');
  });

  it('historical backfill does not create past-due reminders; it offers one deliberate choice', () => {
    const state = withLock('2025-11-01');
    const proposal = proposeNextPairing(state.cycle, { sessionId: 's1', lock: state.lock, today: '2026-03-01' });
    expect(proposal).toMatchObject({ kind: 'suppressed', reason: 'historical', date: '2025-12-01' });
    const applied = applyProposal(state.cycle, proposal, { now: NOW });
    expect(pendingPlannedPairings(applied.cycle)).toHaveLength(0);
  });

  it('paused and closed cycles and recorded ovulation suppress new proposals; ovulation cancels pending automatic ones', () => {
    const state = withLock();
    const scheduled = scheduleFollowUpForLock(state.cycle, { sessionId: 's1', lock: state.lock, today: TODAY, now: NOW });
    const manual = addManualPlannedPairing(scheduled.cycle, { maleId: 'M1', date: '2026-04-20' }, { now: NOW }).cycle;
    const ovulated = recordEvent(manual, { type: 'ovulation', date: '2026-03-20' }, { now: NOW });
    const review = reviewPlannedAfterOvulation(ovulated, { now: NOW });
    expect(review.cancelled).toHaveLength(1);
    expect(review.toReview).toHaveLength(1);
    const cancelled = review.cycle.plannedPairings.find((p) => p.origin === 'auto_after_lock');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.resolution.kind).toBe('ovulation_recorded');
    expect(proposeNextPairing(review.cycle, { sessionId: 's1', lock: state.lock, today: TODAY }).reason).toBe('ovulation_recorded');

    const paused = pauseCycle(state.cycle, {}, { now: NOW });
    expect(proposeNextPairing(paused, { sessionId: 's1', lock: state.lock, today: TODAY }).reason).toBe('cycle_paused');
    const closed = closeCycle(state.cycle, { outcome: 'cancelled' }, { now: NOW });
    expect(proposeNextPairing(closed, { sessionId: 's1', lock: state.lock, today: TODAY }).reason).toBe('cycle_closed');
  });

  it('skip keeps the record; a fulfilled plan is marked done by the actual session', () => {
    const state = withLock();
    const scheduled = scheduleFollowUpForLock(state.cycle, { sessionId: 's1', lock: state.lock, today: TODAY, now: NOW });
    const plannedId = pendingPlannedPairings(scheduled.cycle)[0].id;
    const skipped = skipPlannedPairing(scheduled.cycle, plannedId, { reason: 'Male shedding', now: NOW });
    expect(skipped.plannedPairings[0]).toMatchObject({ status: 'skipped', resolution: { kind: 'skipped', reason: 'Male shedding' } });
    const fresh = scheduleFollowUpForLock(state.cycle, { sessionId: 's1', lock: state.lock, today: TODAY, now: NOW });
    const done = recordPairingSession([fresh.cycle], { femaleId: 'F1', maleId: 'M1', introductionDate: '2026-04-01', sessionId: 's2' }, { now: NOW });
    expect(done.cycle.plannedPairings[0].status).toBe('done');
    expect(done.cycle.plannedPairings[0].resolution.sessionId).toBe('s2');
  });
});
