/**
 * The pairing plan on a breeding card: one row per pairing, each with a "paired" tick and date,
 * a "lock observed" tick and date, and a short note.
 *
 * Rows are read from the card's own records, so nothing here is a second copy of the truth:
 *  - every actual pairing session is a ticked row;
 *  - every pending planned pairing is an unticked row at its planned date;
 *  - one more unticked row, the NEXT row, follows one calendar month after the latest pairing
 *    (or sits on the day the card started when nothing is paired yet). It is derived, never
 *    stored, so it moves by itself when a pairing date is corrected.
 *
 * A row whose date passes unticked just stays unticked: it is never "overdue", it is not offered
 * to the calendar, and no reminder goes out for it. Ovulation ends the plan: no next row after it.
 *
 * The milestone side keeps the old pairing card's arithmetic: pre-lay shed expected 21 days after
 * ovulation, eggs 30 days after the pre-lay shed, hatching 60 days after laying.
 */
import { addCalendarMonths, addDays, compareYmd, diffDays, nowIso, todayYmd, toYmd } from './dates';
import {
  CYCLE_STATUS,
  LOCK_STATUS,
  MALE_STATE,
  actualSessions,
  addLockObservation,
  normalizePlannedPairing,
  normalizeSession,
  reconcileMales,
  recordedEventDate,
  removeLock,
  removeSession,
  updateSession,
} from './cycleModel';

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const asArray = (value) => (Array.isArray(value) ? value : []);

function touch(cycle, at) {
  return { ...cycle, updatedAt: at, metadata: { ...(cycle.metadata || {}), updatedAt: at } };
}

/** Days from a milestone to the next expected one, as the old pairing card counted them. */
export const MILESTONE_INTERVALS = Object.freeze({ preLay: 21, eggLaying: 30, hatch: 60 });

/** The male a new row pairs with: the one paired most recently, else the latest candidate. */
export function defaultPlanMale(cycle) {
  const sessions = actualSessions(cycle);
  const last = sessions[sessions.length - 1];
  if (last?.maleId) return last.maleId;
  const males = asArray(cycle?.males);
  const participated = males.filter((m) => m.state === MALE_STATE.PARTICIPATED);
  return (participated[participated.length - 1] || males[males.length - 1])?.maleId || null;
}

function observedLocksOf(session) {
  return asArray(session?.locks)
    .filter((l) => l.status === LOCK_STATUS.OBSERVED && l.observationDate)
    .sort((a, b) => compareYmd(a.observationDate, b.observationDate));
}

/** The date the next row is planned for, or null when the plan has ended or a row already waits. */
export function nextRowDate(cycle) {
  if (!cycle || cycle.status === CYCLE_STATUS.CLOSED) return null;
  if (recordedEventDate(cycle, 'ovulation')) return null;
  const sessions = actualSessions(cycle);
  const latest = sessions.length ? sessions[sessions.length - 1].introductionDate : null;
  const pending = asArray(cycle.plannedPairings).filter((p) => p.status === 'pending' && p.date);
  if (!latest) {
    if (pending.length) return null;
    return toYmd(cycle.startDate) || toYmd(cycle.createdAt) || null;
  }
  if (pending.some((p) => compareYmd(p.date, latest) > 0)) return null;
  return addCalendarMonths(latest, 1);
}

/**
 * Every row of the plan, oldest first. Shape:
 *   { key, kind: 'session' | 'planned' | 'next', paired, pairedDate, plannedDate, sessionId,
 *     plannedId, maleId, lock, lockCount, note }
 */
export function pairingPlanRows(cycle) {
  if (!cycle) return [];
  const linkedPlan = new Map();
  asArray(cycle.plannedPairings).forEach((p) => {
    const sessionId = p.status === 'done' ? text(p.resolution?.sessionId) : '';
    if (sessionId) linkedPlan.set(sessionId, p);
  });
  const rows = actualSessions(cycle).map((session) => {
    const locks = observedLocksOf(session);
    const plan = linkedPlan.get(session.id) || null;
    return {
      key: session.id,
      kind: 'session',
      paired: true,
      pairedDate: session.introductionDate,
      plannedDate: plan?.date || null,
      sessionId: session.id,
      plannedId: plan?.id || null,
      maleId: session.maleId,
      lock: locks[0] || null,
      lockCount: locks.length,
      note: session.notes || '',
    };
  });
  asArray(cycle.plannedPairings)
    .filter((p) => p.status === 'pending' && p.date)
    .forEach((p) => {
      rows.push({ key: p.id, kind: 'planned', paired: false, pairedDate: null, plannedDate: p.date, sessionId: null, plannedId: p.id, maleId: p.maleId || defaultPlanMale(cycle), lock: null, lockCount: 0, note: p.note || '' });
    });
  // A row keeps its place once ticked: a planned row sorts by its planned date even when it was
  // paired later, so ticking an old row does not send it to the bottom of the list.
  const sortDate = (row) => row.plannedDate || row.pairedDate;
  rows.sort((a, b) => compareYmd(sortDate(a), sortDate(b)) || (a.paired === b.paired ? 0 : a.paired ? -1 : 1));
  const next = nextRowDate(cycle);
  if (next) rows.push({ key: 'next', kind: 'next', paired: false, pairedDate: null, plannedDate: next, sessionId: null, plannedId: null, maleId: defaultPlanMale(cycle), lock: null, lockCount: 0, note: '' });
  return rows;
}

/**
 * Unticked rows still ahead of today on an active card: the only pairing dates the calendar shows
 * as reminders. A date that has passed drops off; ticked pairings and locks are shown as records.
 */
export function upcomingPairings(cycle, { today = todayYmd() } = {}) {
  if (!cycle || cycle.deletedAt || cycle.status !== CYCLE_STATUS.ACTIVE) return [];
  if (recordedEventDate(cycle, 'ovulation')) return [];
  return pairingPlanRows(cycle).filter((row) => !row.paired && row.plannedDate && compareYmd(row.plannedDate, today) >= 0);
}

// ── Ticking ───────────────────────────────────────────────────────────────────

/**
 * "Paired" ticked on a row: an actual pairing session on `date` (today unless given). A planned
 * row it fulfils is marked done and linked to the session. A paused card resumes, the way a
 * recorded pairing always resumes it.
 */
export function markPaired(cycle, row, { date = todayYmd(), maleId = null, now = nowIso() } = {}) {
  if (cycle.status === CYCLE_STATUS.CLOSED) throw new Error('This card is closed. Reopen it first.');
  const day = toYmd(date);
  if (!day) throw new Error('A pairing needs a date.');
  const male = text(maleId) || text(row?.maleId) || defaultPlanMale(cycle);
  if (!male) throw new Error('Add a male to this card first.');
  const session = normalizeSession({
    maleId: male,
    introductionDate: day,
    notes: row?.note || '',
    createdAt: now,
    updatedAt: now,
    source: { type: 'pairing_plan', plannedId: row?.plannedId || null },
  });
  let next = { ...cycle, sessions: [...cycle.sessions, session] };
  if (!next.males.some((m) => m.maleId === male)) next = { ...next, males: [...next.males, { maleId: male, state: MALE_STATE.PARTICIPATED, notes: '', addedAt: now }] };
  if (next.status === CYCLE_STATUS.PAUSED) {
    next = { ...next, status: CYCLE_STATUS.ACTIVE, pause: null, reopenings: [...next.reopenings, { resumedAt: now, previousPause: next.pause }] };
  }
  if (row?.plannedId) {
    next = {
      ...next,
      plannedPairings: next.plannedPairings.map((p) => (
        p.id === row.plannedId ? { ...p, status: 'done', resolution: { kind: 'fulfilled', sessionId: session.id, at: now }, updatedAt: now } : p
      )),
    };
  }
  return { cycle: touch(reconcileMales(next), now), session };
}

/**
 * "Paired" unticked: the session and its locks are removed (and stay removed through sync). A
 * planned row it had fulfilled goes back to waiting at its planned date, keeping the note.
 */
export function unmarkPaired(cycle, sessionId, { now = nowIso() } = {}) {
  const session = cycle.sessions.find((s) => s.id === sessionId);
  if (!session) return cycle;
  const plannedPairings = cycle.plannedPairings.map((p) => (
    p.status === 'done' && p.resolution?.sessionId === sessionId
      ? { ...p, status: 'pending', resolution: null, note: session.notes || p.note, updatedAt: now }
      : p
  ));
  return removeSession({ ...cycle, plannedPairings }, sessionId, { now });
}

/** "Lock observed" ticked: one observed, dated lock on the row's pairing. */
export function markLock(cycle, sessionId, { date = todayYmd(), now = nowIso() } = {}) {
  return addLockObservation(cycle, sessionId, { status: LOCK_STATUS.OBSERVED, observationDate: toYmd(date) }, { now }).cycle;
}

/** "Lock observed" unticked: the row's lock record is removed. */
export function unmarkLock(cycle, sessionId, lockId, { now = nowIso() } = {}) {
  return removeLock(cycle, sessionId, lockId, { now });
}

export function setPairedDate(cycle, sessionId, date, { now = nowIso() } = {}) {
  const day = toYmd(date);
  if (!day) throw new Error('A pairing needs a date.');
  return updateSession(cycle, sessionId, { introductionDate: day }, { now });
}

/**
 * The row's note. A paired row keeps it on the session; a planned row on the planned entry. A
 * note on the next row stores that row as a planned entry so the note has somewhere to live.
 */
export function setRowNote(cycle, row, note, { now = nowIso() } = {}) {
  const value = text(note);
  if (row.kind === 'session') return updateSession(cycle, row.sessionId, { notes: value }, { now });
  if (row.kind === 'planned') {
    return touch({ ...cycle, plannedPairings: cycle.plannedPairings.map((p) => (p.id === row.plannedId ? { ...p, note: value, updatedAt: now } : p)) }, now);
  }
  if (!value || !row.plannedDate) return cycle;
  const planned = normalizePlannedPairing({ maleId: row.maleId, date: row.plannedDate, status: 'pending', origin: 'manual', note: value, createdAt: now, updatedAt: now });
  return touch({ ...cycle, plannedPairings: [...cycle.plannedPairings, planned] }, now);
}

// ── Milestones ────────────────────────────────────────────────────────────────

/** The recorded milestone dates the plan shows, and when each next one is expected. */
export function milestoneSummary(cycle) {
  const ovulation = recordedEventDate(cycle, 'ovulation');
  const preLay = recordedEventDate(cycle, 'pre_lay_shed');
  const laid = recordedEventDate(cycle, 'egg_laying');
  const hatched = recordedEventDate(cycle, 'first_hatch') || cycle?.clutch?.firstHatchDate || null;
  const eggs = cycle?.clutch?.eggsTotal ?? null;
  const slugs = cycle?.clutch?.slugs ?? null;
  return {
    ovulation,
    preLay,
    laid,
    hatched,
    liveBirth: recordedEventDate(cycle, 'live_birth'),
    preLayEta: ovulation ? addDays(ovulation, MILESTONE_INTERVALS.preLay) : null,
    eggLayingEta: preLay ? addDays(preLay, MILESTONE_INTERVALS.eggLaying) : null,
    hatchEta: laid ? addDays(laid, MILESTONE_INTERVALS.hatch) : null,
    eggs,
    slugs,
    goodEggs: eggs === null ? null : Math.max(0, eggs - (slugs || 0)),
  };
}

/**
 * The one countdown the card shows: the next stage still to come, the way the old pairing card
 * queued its timers. `dayNumber` is "day N of total"; `daysLeft` goes negative once the date passes.
 */
export function milestoneCountdown(cycle, { today = todayYmd() } = {}) {
  if (!cycle || cycle.reproductionMode === 'live_bearing') return null;
  const m = milestoneSummary(cycle);
  let timer = null;
  if (m.ovulation && !m.preLay && !m.laid) timer = { key: 'pre_lay_shed', from: m.ovulation, targetDate: m.preLayEta, totalDays: MILESTONE_INTERVALS.preLay };
  else if (m.preLay && !m.laid) timer = { key: 'egg_laying', from: m.preLay, targetDate: m.eggLayingEta, totalDays: MILESTONE_INTERVALS.eggLaying };
  else if (m.laid && !m.hatched && m.eggs !== 0) timer = { key: 'first_hatch', from: m.laid, targetDate: m.hatchEta, totalDays: MILESTONE_INTERVALS.hatch };
  if (!timer) return null;
  const daysLeft = diffDays(today, timer.targetDate);
  const elapsed = diffDays(timer.from, today);
  return { ...timer, daysLeft, dayNumber: Math.max(1, elapsed + 1) };
}

/** Eggs and slugs from the plan. Fertile eggs follow (eggs − slugs) unless they were entered separately. */
export function clutchCountsPatch(cycle, { eggsTotal, slugs }) {
  const count = (v) => (v === '' || v === null || v === undefined ? null : Math.max(0, Math.floor(Number(v))));
  const eggs = eggsTotal === undefined ? cycle.clutch.eggsTotal : count(eggsTotal);
  const slugCount = slugs === undefined ? cycle.clutch.slugs : count(slugs);
  if (Number.isNaN(eggs) || Number.isNaN(slugCount)) throw new Error('Enter a whole number.');
  if (eggs !== null && slugCount !== null && slugCount > eggs) throw new Error('Slugs cannot be more than the eggs laid.');
  const previous = cycle.clutch;
  const fertileWasDerived = previous.fertileEggs === null
    || (previous.eggsTotal !== null && previous.fertileEggs === previous.eggsTotal - (previous.slugs || 0));
  const patch = { eggsTotal: eggs, slugs: slugCount };
  if (fertileWasDerived) patch.fertileEggs = eggs === null ? null : eggs - (slugCount || 0);
  return patch;
}

export const PLAN_MILESTONES = Object.freeze({
  egg_laying: ['ovulation', 'pre_lay_shed', 'egg_laying'],
  live_bearing: ['ovulation', 'live_birth'],
});

