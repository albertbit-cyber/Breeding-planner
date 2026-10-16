/**
 * Planned pairings and follow-up proposals.
 *
 * A planned pairing is separate from an actual session and from an observed lock. The one
 * automatic proposal the app makes: an observed lock proposes the next pairing for that male
 * ONE CALENDAR MONTH later (March 1 → April 1; January 31 → February 28/29). The proposal is
 * editable and skippable, never silently overwrites a date the keeper adjusted, never fires
 * for a paused or closed cycle or after recorded ovulation, and never creates a storm of past
 * dates when history is backfilled.
 */
import { addCalendarMonths, compareYmd, nowIso, todayYmd, toYmd } from './dates';
import { CYCLE_STATUS, LOCK_STATUS, normalizePlannedPairing, recordedEventDate, findEvent, EVENT_CERTAINTY } from './cycleModel';
import { upcomingPairings } from './pairingPlan';

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());

function touch(cycle, at) {
  return { ...cycle, updatedAt: at, metadata: { ...(cycle.metadata || {}), updatedAt: at } };
}

export function pendingPlannedPairings(cycle, { maleId = null } = {}) {
  return (cycle?.plannedPairings || [])
    .filter((p) => p.status === 'pending' && p.date && (!maleId || p.maleId === maleId))
    .sort((a, b) => compareYmd(a.date, b.date));
}

export function nextPlannedPairing(cycle) {
  return pendingPlannedPairings(cycle)[0] || null;
}

/**
 * Work out what (if anything) should follow a newly recorded lock observation.
 *
 * Returns a proposal object describing the action, without applying it:
 *  - { kind: 'create', date }                  a new pending planned pairing
 *  - { kind: 'update', planned, date }         move the existing automatic one (never a manual one)
 *  - { kind: 'reuse', planned }                an appropriate pending entry already exists
 *  - { kind: 'suppressed', reason, date? }     nothing automatic: paused/closed/ovulated/historical
 */
export function proposeNextPairing(cycle, { sessionId, lock, today = todayYmd() } = {}) {
  if (!cycle || !lock || lock.status !== LOCK_STATUS.OBSERVED || !lock.observationDate) {
    return { kind: 'suppressed', reason: 'no_observed_lock' };
  }
  if (cycle.status !== CYCLE_STATUS.ACTIVE) return { kind: 'suppressed', reason: cycle.status === CYCLE_STATUS.PAUSED ? 'cycle_paused' : 'cycle_closed' };
  if (recordedEventDate(cycle, 'ovulation')) return { kind: 'suppressed', reason: 'ovulation_recorded' };
  const session = (cycle.sessions || []).find((s) => s.id === sessionId);
  if (!session?.maleId) return { kind: 'suppressed', reason: 'no_session' };

  const date = addCalendarMonths(lock.observationDate, 1);
  if (!date) return { kind: 'suppressed', reason: 'invalid_date' };

  // Backfilled history: a date already in the past is offered as one deliberate choice, never
  // created as an automatic (and already overdue) reminder.
  if (compareYmd(date, today) < 0) return { kind: 'suppressed', reason: 'historical', date, maleId: session.maleId };

  const pending = pendingPlannedPairings(cycle, { maleId: session.maleId });
  const automatic = pending.find((p) => p.origin === 'auto_after_lock');
  if (automatic) {
    if (automatic.date === date) return { kind: 'reuse', planned: automatic, date };
    if (automatic.manuallyAdjusted) return { kind: 'reuse', planned: automatic, date, keptManualDate: true };
    // Only move it forward: an earlier lock entered later must not drag a later proposal back.
    if (compareYmd(date, automatic.date) > 0) return { kind: 'update', planned: automatic, date };
    return { kind: 'reuse', planned: automatic, date: automatic.date };
  }
  if (pending.length) return { kind: 'reuse', planned: pending[0], date: pending[0].date, manual: true };
  return { kind: 'create', date, maleId: session.maleId };
}

/** Apply a proposal. Idempotent: applying the same proposal twice leaves one pending entry. */
export function applyProposal(cycle, proposal, { sessionId = null, lockId = null, now = nowIso() } = {}) {
  if (!proposal || proposal.kind === 'suppressed' || proposal.kind === 'reuse') return { cycle, planned: proposal?.planned || null };
  if (proposal.kind === 'update') {
    const plannedPairings = cycle.plannedPairings.map((p) => (
      p.id === proposal.planned.id ? { ...p, date: proposal.date, sourceLockId: lockId || p.sourceLockId, sourceSessionId: sessionId || p.sourceSessionId, updatedAt: now } : p
    ));
    const planned = plannedPairings.find((p) => p.id === proposal.planned.id);
    return { cycle: touch({ ...cycle, plannedPairings }, now), planned };
  }
  const existing = pendingPlannedPairings(cycle, { maleId: proposal.maleId }).find((p) => p.origin === 'auto_after_lock');
  if (existing) return { cycle, planned: existing };
  const planned = normalizePlannedPairing({
    maleId: proposal.maleId,
    date: proposal.date,
    status: 'pending',
    origin: 'auto_after_lock',
    sourceLockId: lockId,
    sourceSessionId: sessionId,
    createdAt: now,
    updatedAt: now,
  });
  return { cycle: touch({ ...cycle, plannedPairings: [...cycle.plannedPairings, planned] }, now), planned };
}

/** Convenience: propose and apply in one step. */
export function scheduleFollowUpForLock(cycle, { sessionId, lock, today = todayYmd(), now = nowIso() } = {}) {
  const proposal = proposeNextPairing(cycle, { sessionId, lock, today });
  const applied = applyProposal(cycle, proposal, { sessionId, lockId: lock?.id, now });
  return { ...applied, proposal };
}

export function addManualPlannedPairing(cycle, { maleId, date, note = '' } = {}, { now = nowIso() } = {}) {
  const day = toYmd(date);
  if (!text(maleId)) throw new Error('Choose a male.');
  if (!day) throw new Error('A planned pairing needs a date.');
  if (cycle.status === CYCLE_STATUS.CLOSED) throw new Error('A closed card cannot take new planned pairings. Reopen it first.');
  const duplicate = pendingPlannedPairings(cycle, { maleId }).find((p) => p.date === day);
  if (duplicate) return { cycle, planned: duplicate, reused: true };
  const planned = normalizePlannedPairing({ maleId, date: day, note, origin: 'manual', manuallyAdjusted: true, createdAt: now, updatedAt: now });
  return { cycle: touch({ ...cycle, plannedPairings: [...cycle.plannedPairings, planned] }, now), planned, reused: false };
}

export function reschedulePlannedPairing(cycle, plannedId, date, { now = nowIso() } = {}) {
  const day = toYmd(date);
  if (!day) throw new Error('Choose a new date.');
  const plannedPairings = cycle.plannedPairings.map((p) => (
    p.id === plannedId ? { ...p, date: day, manuallyAdjusted: true, updatedAt: now } : p
  ));
  return touch({ ...cycle, plannedPairings }, now);
}

export function skipPlannedPairing(cycle, plannedId, { reason = '', now = nowIso() } = {}) {
  return resolvePlanned(cycle, plannedId, 'skipped', { kind: 'skipped', reason: text(reason), at: now }, now);
}

export function cancelPlannedPairing(cycle, plannedId, { reason = '', now = nowIso() } = {}) {
  return resolvePlanned(cycle, plannedId, 'cancelled', { kind: 'cancelled', reason: text(reason), at: now }, now);
}

function resolvePlanned(cycle, plannedId, status, resolution, now) {
  const plannedPairings = cycle.plannedPairings.map((p) => (
    p.id === plannedId && p.status === 'pending' ? { ...p, status, resolution, updatedAt: now } : p
  ));
  return touch({ ...cycle, plannedPairings }, now);
}

/**
 * Ovulation recorded: the pairing plan is over. Every pending planned pairing is cancelled with
 * the reason kept, so nothing is left asking to be paired. `toReview` stays for callers and is
 * always empty.
 */
export function reviewPlannedAfterOvulation(cycle, { now = nowIso() } = {}) {
  if (!recordedEventDate(cycle, 'ovulation') && !findEvent(cycle, 'ovulation', { certainty: EVENT_CERTAINTY.SUSPECTED })) return { cycle, cancelled: [], toReview: [] };
  const cancelled = [];
  const plannedPairings = cycle.plannedPairings.map((p) => {
    if (p.status !== 'pending') return p;
    cancelled.push(p.id);
    return { ...p, status: 'cancelled', resolution: { kind: 'ovulation_recorded', at: now }, updatedAt: now };
  });
  return { cycle: cancelled.length ? touch({ ...cycle, plannedPairings }, now) : cycle, cancelled, toReview: [] };
}

/**
 * Upcoming pairings and scan reviews, for the overview. A pairing date that passed unticked is
 * not listed and never "overdue": a missed pairing asks nothing of the keeper.
 */
export function dueFollowUps(cycle, exams = [], { today = todayYmd() } = {}) {
  const items = [];
  upcomingPairings(cycle, { today }).forEach((row) => {
    items.push({ kind: 'planned_pairing', date: row.plannedDate, maleId: row.maleId, plannedId: row.plannedId, overdue: false, cycleId: cycle.id });
  });
  (exams || [])
    .filter((e) => e.nextReviewDate && !e.deletedAt && (!cycle || !e.cycleId || e.cycleId === cycle.id))
    .sort((a, b) => compareYmd(b.date, a.date))
    .slice(0, 1)
    .forEach((e) => {
      items.push({ kind: 'scan_review', date: e.nextReviewDate, examId: e.id, overdue: compareYmd(e.nextReviewDate, today) < 0, cycleId: cycle?.id || null });
    });
  return items.sort((a, b) => compareYmd(a.date, b.date));
}
