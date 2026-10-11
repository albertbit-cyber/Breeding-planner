/**
 * The shared event timeline of a breeding card: planned and actual pairings, observed locks,
 * scans, sheds, suspected or recorded ovulation, laying, hatch events and closure. Every entry
 * carries a `kind`, a `certainty` ("planned" | "recorded" | "suspected" | "estimated") and the
 * male label where one applies, so the UI never has to rely on colour alone.
 */
import { compareYmd, toYmd, diffDays } from './dates';
import { LOCK_STATUS, EVENT_CERTAINTY, EVENT_PRECISION } from './cycleModel';
import { examsForCycle } from './follicles';

export function buildTimeline(cycle, exams = [], { includePlanned = true } = {}) {
  if (!cycle) return [];
  const entries = [];
  (cycle.sessions || []).forEach((session) => {
    if (session.introductionDate) {
      entries.push({ id: `${session.id}:intro`, kind: 'pairing_session', date: session.introductionDate, time: session.introductionTime, maleId: session.maleId, sessionId: session.id, certainty: 'recorded', notes: session.notes });
    }
    if (session.removalDate && session.removalDate !== session.introductionDate) {
      entries.push({ id: `${session.id}:removal`, kind: 'male_removed', date: session.removalDate, time: session.removalTime, maleId: session.maleId, sessionId: session.id, certainty: 'recorded' });
    }
    (session.locks || []).forEach((lock) => {
      if (!lock.observationDate) return;
      entries.push({
        id: lock.id,
        kind: lock.status === LOCK_STATUS.OBSERVED ? 'lock_observed' : lock.status === LOCK_STATUS.NOT_OBSERVED ? 'lock_not_observed' : 'lock_unknown',
        date: lock.observationDate,
        time: lock.observationTime,
        maleId: session.maleId,
        sessionId: session.id,
        lockId: lock.id,
        certainty: 'recorded',
        notes: lock.notes,
      });
    });
  });
  if (includePlanned) {
    (cycle.plannedPairings || []).forEach((planned) => {
      if (!planned.date) return;
      entries.push({ id: planned.id, kind: 'planned_pairing', date: planned.date, maleId: planned.maleId, plannedId: planned.id, status: planned.status, origin: planned.origin, certainty: 'planned' });
    });
  }
  (cycle.events || []).forEach((event) => {
    if (!event.date) return;
    const certainty = event.certainty === EVENT_CERTAINTY.SUSPECTED ? 'suspected' : event.precision === EVENT_PRECISION.ESTIMATED ? 'estimated' : 'recorded';
    entries.push({ id: event.id, kind: event.type, date: event.date, eventId: event.id, certainty, notes: event.notes });
  });
  examsForCycle(exams, cycle).forEach((exam) => {
    entries.push({
      id: exam.id,
      kind: 'follicle_exam',
      date: exam.date,
      time: exam.time,
      examId: exam.id,
      method: exam.method,
      result: exam.result,
      valueMm: exam.largestDiameterMm,
      isEstimate: exam.largestIsEstimate,
      certainty: 'recorded',
      relativeDay: cycle.startDate ? diffDays(cycle.startDate, exam.date) : null,
    });
  });
  if (cycle.status === 'closed' && cycle.closure) {
    const date = cycle.closure.biologicalCompletionDate || toYmd(cycle.closure.closedAt);
    if (date) entries.push({ id: `${cycle.id}:closure`, kind: 'closure', date, outcome: cycle.closure.outcome, certainty: 'recorded', administrative: !cycle.closure.biologicalCompletionDate });
  }
  const order = { planned_pairing: 9, follicle_exam: 1, pairing_session: 2, lock_observed: 3, lock_not_observed: 3, lock_unknown: 3, male_removed: 4 };
  return entries.sort((a, b) => compareYmd(a.date, b.date) || (order[a.kind] || 5) - (order[b.kind] || 5) || String(a.time || '').localeCompare(String(b.time || '')));
}
