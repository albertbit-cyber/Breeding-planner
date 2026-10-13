/**
 * The female breeding cycle: one card per female per cycle.
 *
 * Rules this module enforces (see docs/status/breeding-upgrade-tracker.md, SBR-01/03/04):
 *  - the first ACTUAL pairing session starts the cycle; planned appointments never do;
 *  - one active cycle per female; later sessions, with any male, attach to it;
 *  - a dated lock record with status "observed" counts once, whatever happens to it later;
 *  - planned, not-observed and unknown entries never count;
 *  - the reproductive stage is derived from events; the administrative status (active /
 *    paused / closed) is a separate field;
 *  - closing, reopening and corrections keep every record.
 *
 * Every function is pure: it returns new objects and never mutates its input.
 */
import { toYmd, toHm, nowIso, compareYmd, minYmd, maxYmd, diffDays } from './dates';
import { defaultSeasonLabel, normalizeSeasonLabel } from './season';

export const CYCLE_STATUS = Object.freeze({ ACTIVE: 'active', PAUSED: 'paused', CLOSED: 'closed' });
export const LOCK_STATUS = Object.freeze({ OBSERVED: 'observed', NOT_OBSERVED: 'not_observed', UNKNOWN: 'unknown' });
export const MALE_STATE = Object.freeze({ PLANNED: 'planned', PARTICIPATED: 'participated' });
export const CLOSURE_OUTCOMES = Object.freeze([
  'hatching_complete',
  'live_birth_complete',
  'no_clutch',
  'failed_clutch',
  'cancelled',
  'other',
  // Written only by archiving the female (sold, died, left the collection); never offered in
  // the close dialog, since the card closes itself the moment she leaves.
  'female_sold',
  'female_died',
  'female_left_collection',
]);
/** Closure outcomes the archive writes. The close dialog leaves these out. */
export const ARCHIVE_CLOSURE_OUTCOMES = Object.freeze(['female_sold', 'female_died', 'female_left_collection']);
export const EVENT_TYPES = Object.freeze([
  'ovulation',
  'pre_lay_shed',
  'egg_laying',
  'live_birth',
  'first_hatch',
  'final_hatch',
  'hatching_complete',
]);
export const EVENT_PRECISION = Object.freeze({ EXACT: 'exact', ESTIMATED: 'estimated' });
export const EVENT_CERTAINTY = Object.freeze({ RECORDED: 'recorded', SUSPECTED: 'suspected' });
/** Milestones the live-bearing workflow has no use for. */
export const EGG_LAYING_ONLY_EVENTS = Object.freeze(['pre_lay_shed', 'egg_laying', 'first_hatch', 'final_hatch', 'hatching_complete']);

let idCounter = 0;
export function makeId(prefix = 'bc') {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const asArray = (value) => (Array.isArray(value) ? value : []);
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

function countOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

// ── Normalisation ─────────────────────────────────────────────────────────────

export function normalizeLock(raw = {}) {
  const lock = asObject(raw) || {};
  const status = Object.values(LOCK_STATUS).includes(lock.status) ? lock.status : LOCK_STATUS.UNKNOWN;
  return {
    id: text(lock.id) || makeId('lock'),
    observationDate: toYmd(lock.observationDate) || null,
    observationTime: toHm(lock.observationTime),
    status,
    notes: text(lock.notes),
    recordedAt: text(lock.recordedAt) || null,
    source: asObject(lock.source) || null,
  };
}

export function normalizeSession(raw = {}) {
  const session = asObject(raw) || {};
  return {
    id: text(session.id) || makeId('ps'),
    maleId: text(session.maleId) || null,
    introductionDate: toYmd(session.introductionDate) || null,
    introductionTime: toHm(session.introductionTime),
    removalDate: toYmd(session.removalDate) || null,
    removalTime: toHm(session.removalTime),
    notes: text(session.notes),
    attachments: asArray(session.attachments).filter(Boolean),
    locks: asArray(session.locks).map(normalizeLock),
    createdAt: text(session.createdAt) || null,
    updatedAt: text(session.updatedAt) || null,
    source: asObject(session.source) || null,
  };
}

export function normalizePlannedPairing(raw = {}) {
  const planned = asObject(raw) || {};
  const status = ['pending', 'done', 'skipped', 'cancelled'].includes(planned.status) ? planned.status : 'pending';
  return {
    id: text(planned.id) || makeId('pp'),
    maleId: text(planned.maleId) || null,
    date: toYmd(planned.date) || null,
    status,
    origin: planned.origin === 'auto_after_lock' ? 'auto_after_lock' : 'manual',
    sourceLockId: text(planned.sourceLockId) || null,
    sourceSessionId: text(planned.sourceSessionId) || null,
    manuallyAdjusted: !!planned.manuallyAdjusted,
    note: text(planned.note),
    resolution: asObject(planned.resolution) || null,
    createdAt: text(planned.createdAt) || null,
    updatedAt: text(planned.updatedAt) || null,
  };
}

export function normalizeEvent(raw = {}) {
  const event = asObject(raw) || {};
  return {
    id: text(event.id) || makeId('ev'),
    type: EVENT_TYPES.includes(event.type) ? event.type : text(event.type),
    date: toYmd(event.date) || null,
    precision: event.precision === EVENT_PRECISION.ESTIMATED ? EVENT_PRECISION.ESTIMATED : EVENT_PRECISION.EXACT,
    certainty: event.certainty === EVENT_CERTAINTY.SUSPECTED ? EVENT_CERTAINTY.SUSPECTED : EVENT_CERTAINTY.RECORDED,
    notes: text(event.notes),
    evidence: asArray(event.evidence).filter(Boolean),
    recordedAt: text(event.recordedAt) || null,
    source: asObject(event.source) || null,
  };
}

export function normalizeClutch(raw = {}) {
  const clutch = asObject(raw) || {};
  return {
    eggsTotal: countOrNull(clutch.eggsTotal),
    fertileEggs: countOrNull(clutch.fertileEggs),
    slugs: countOrNull(clutch.slugs),
    lostEggs: countOrNull(clutch.lostEggs),
    hatchlingsRecorded: countOrNull(clutch.hatchlingsRecorded),
    liveBirths: countOrNull(clutch.liveBirths),
    firstHatchDate: toYmd(clutch.firstHatchDate) || null,
    finalHatchDate: toYmd(clutch.finalHatchDate) || null,
    outcomeComplete: !!clutch.outcomeComplete,
    outcomeCompletedAt: text(clutch.outcomeCompletedAt) || null,
    notes: text(clutch.notes),
    legacyPairingId: text(clutch.legacyPairingId) || null,
  };
}

export function normalizeOffspring(raw = {}) {
  const item = asObject(raw) || {};
  const assignment = asObject(item.sireAssignment) || {};
  return {
    animalId: text(item.animalId) || null,
    sireAssignment: {
      maleId: text(assignment.maleId) || null,
      method: text(assignment.method) || 'unresolved',
      certainty: text(assignment.certainty) || 'unknown',
      note: text(assignment.note),
      assignedAt: text(assignment.assignedAt) || null,
      history: asArray(assignment.history).filter(Boolean),
    },
  };
}

export function normalizeCycle(raw = {}) {
  const cycle = asObject(raw) || {};
  const status = Object.values(CYCLE_STATUS).includes(cycle.status) ? cycle.status : CYCLE_STATUS.ACTIVE;
  const sessions = asArray(cycle.sessions).map(normalizeSession);
  const startDate = toYmd(cycle.startDate) || deriveStartDate(sessions);
  const seasonLabel = normalizeSeasonLabel(cycle.seasonLabel) || defaultSeasonLabel(startDate);
  const closure = asObject(cycle.closure);
  const pause = asObject(cycle.pause);
  return {
    id: text(cycle.id) || makeId('bc'),
    schemaVersion: 1,
    femaleId: text(cycle.femaleId) || null,
    speciesId: text(cycle.speciesId) || null,
    reproductionMode: cycle.reproductionMode === 'live_bearing' ? 'live_bearing' : 'egg_laying',
    seasonLabel,
    seasonLabelSource: cycle.seasonLabelSource === 'manual' ? 'manual' : 'auto',
    startDate,
    status,
    pause: pause ? { pausedAt: text(pause.pausedAt) || null, reason: text(pause.reason) } : null,
    closure: closure
      ? {
        outcome: CLOSURE_OUTCOMES.includes(closure.outcome) ? closure.outcome : 'other',
        closedAt: text(closure.closedAt) || null,
        note: text(closure.note),
        biologicalCompletionDate: toYmd(closure.biologicalCompletionDate) || null,
      }
      : null,
    reopenings: asArray(cycle.reopenings).filter(Boolean),
    multipleSires: !!cycle.multipleSires,
    males: asArray(cycle.males).map((male) => {
      const m = asObject(male) || {};
      return {
        maleId: text(m.maleId) || null,
        state: m.state === MALE_STATE.PARTICIPATED ? MALE_STATE.PARTICIPATED : MALE_STATE.PLANNED,
        notes: text(m.notes),
        addedAt: text(m.addedAt) || null,
      };
    }).filter((male) => male.maleId),
    sessions,
    plannedPairings: asArray(cycle.plannedPairings).map(normalizePlannedPairing),
    events: asArray(cycle.events).map(normalizeEvent),
    clutch: normalizeClutch(cycle.clutch),
    offspring: asArray(cycle.offspring).map(normalizeOffspring).filter((o) => o.animalId),
    legacy: asObject(cycle.legacy) || null,
    reviewFlags: asArray(cycle.reviewFlags).filter(Boolean),
    createdAt: text(cycle.createdAt) || null,
    updatedAt: text(cycle.updatedAt) || null,
    deletedAt: text(cycle.deletedAt) || null,
    metadata: asObject(cycle.metadata) || undefined,
  };
}

export function deriveStartDate(sessions = []) {
  return minYmd(...asArray(sessions).map((s) => s?.introductionDate));
}

function touch(cycle, at) {
  return { ...cycle, updatedAt: at, metadata: { ...(cycle.metadata || {}), updatedAt: at } };
}

/** Participation is a fact about sessions: a male with at least one session has participated. */
export function reconcileMales(cycle) {
  const participated = new Set(cycle.sessions.map((s) => s.maleId).filter(Boolean));
  const known = new Map(cycle.males.map((m) => [m.maleId, m]));
  participated.forEach((maleId) => {
    const existing = known.get(maleId);
    known.set(maleId, { maleId, state: MALE_STATE.PARTICIPATED, notes: existing?.notes || '', addedAt: existing?.addedAt || null });
  });
  const males = Array.from(known.values()).map((m) => (
    participated.has(m.maleId) ? { ...m, state: MALE_STATE.PARTICIPATED } : m
  ));
  const participatedCount = males.filter((m) => m.state === MALE_STATE.PARTICIPATED).length;
  return {
    ...cycle,
    males,
    multipleSires: cycle.multipleSires || participatedCount > 1,
    startDate: deriveStartDate(cycle.sessions) || cycle.startDate,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function findActiveCycle(cycles = [], femaleId) {
  const id = text(femaleId);
  if (!id) return null;
  return asArray(cycles)
    .filter((c) => c && !c.deletedAt && c.femaleId === id && c.status !== CYCLE_STATUS.CLOSED)
    .sort((a, b) => compareYmd(a.startDate, b.startDate))[0] || null;
}

export function cyclesForFemale(cycles = [], femaleId) {
  const id = text(femaleId);
  return asArray(cycles)
    .filter((c) => c && !c.deletedAt && c.femaleId === id)
    .sort((a, b) => compareYmd(b.startDate, a.startDate) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export function observedLocks(cycle, { maleId = null } = {}) {
  const result = [];
  for (const session of asArray(cycle?.sessions)) {
    if (maleId && session.maleId !== maleId) continue;
    for (const lock of asArray(session.locks)) {
      if (lock.status !== LOCK_STATUS.OBSERVED || !lock.observationDate) continue;
      result.push({ ...lock, sessionId: session.id, maleId: session.maleId });
    }
  }
  return result.sort((a, b) => compareYmd(a.observationDate, b.observationDate));
}

/**
 * The accepted counting rule: one dated record with status observed = one lock. A record is
 * counted once however often it is opened, saved or re-ticked. Nothing else counts.
 */
export function countObservedLocks(cycle, options = {}) {
  return observedLocks(cycle, options).length;
}

export function actualSessions(cycle, { maleId = null } = {}) {
  return asArray(cycle?.sessions)
    .filter((s) => s.introductionDate && (!maleId || s.maleId === maleId))
    .sort((a, b) => compareYmd(a.introductionDate, b.introductionDate));
}

export function countSessions(cycle, options = {}) {
  return actualSessions(cycle, options).length;
}

export function maleHistory(cycle, maleId) {
  const sessions = actualSessions(cycle, { maleId });
  const locks = observedLocks(cycle, { maleId });
  return {
    maleId,
    sessionCount: sessions.length,
    lockCount: locks.length,
    latestIntroductionDate: maxYmd(...sessions.map((s) => s.introductionDate)),
    latestLockDate: maxYmd(...locks.map((l) => l.observationDate)),
    sessions,
    locks,
  };
}

export function findEvent(cycle, type, { certainty = null } = {}) {
  return asArray(cycle?.events)
    .filter((e) => e.type === type && e.date && (!certainty || e.certainty === certainty))
    .sort((a, b) => compareYmd(a.date, b.date))[0] || null;
}

/** The recorded (not suspected) date of a milestone, or null. Estimated dates are still returned. */
export function recordedEventDate(cycle, type) {
  return findEvent(cycle, type, { certainty: EVENT_CERTAINTY.RECORDED })?.date || null;
}

/** Reproductive stage derived from facts. Separate from the administrative status. */
export function deriveStage(cycle) {
  if (!cycle) return 'none';
  const closure = cycle.status === CYCLE_STATUS.CLOSED ? cycle.closure : null;
  if (closure && closure.outcome !== 'hatching_complete' && closure.outcome !== 'live_birth_complete') return 'closed_without_offspring';
  if (cycle.clutch?.outcomeComplete || recordedEventDate(cycle, 'hatching_complete')) return 'complete';
  if (recordedEventDate(cycle, 'live_birth')) return 'live_birth';
  if (recordedEventDate(cycle, 'first_hatch') || (cycle.clutch?.hatchlingsRecorded || 0) > 0) return 'hatching';
  if (recordedEventDate(cycle, 'egg_laying')) return 'incubating';
  if (recordedEventDate(cycle, 'pre_lay_shed')) return 'pre_lay_shed';
  if (recordedEventDate(cycle, 'ovulation')) return 'ovulated';
  if (findEvent(cycle, 'ovulation', { certainty: EVENT_CERTAINTY.SUSPECTED })) return 'ovulation_suspected';
  if (countObservedLocks(cycle) > 0) return 'locks_observed';
  if (countSessions(cycle) > 0) return 'pairing';
  return 'pre_pairing';
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function createCycle({ femaleId, speciesId = null, reproductionMode = 'egg_laying', startDate = null, seasonLabel = '', now = nowIso() } = {}) {
  const start = toYmd(startDate);
  const label = normalizeSeasonLabel(seasonLabel);
  return normalizeCycle({
    id: makeId('bc'),
    femaleId,
    speciesId,
    reproductionMode,
    startDate: start,
    seasonLabel: label || defaultSeasonLabel(start),
    seasonLabelSource: label ? 'manual' : 'auto',
    status: CYCLE_STATUS.ACTIVE,
    createdAt: now,
    updatedAt: now,
  });
}

/** Lock input from a quick entry: never defaults to observed. */
export function buildLockFromInput({ id, status, observationDate, observationTime, notes, now = nowIso(), source = null } = {}) {
  const normalizedStatus = Object.values(LOCK_STATUS).includes(status) ? status : LOCK_STATUS.UNKNOWN;
  return normalizeLock({
    id,
    status: normalizedStatus,
    observationDate: observationDate || null,
    observationTime,
    notes,
    recordedAt: now,
    source,
  });
}

/**
 * Add or merge a dated lock observation on a session.
 * A repeated sighting on the same session and the same local date updates the existing record
 * (notes, time, status) instead of adding a second one, so it never adds a count.
 */
export function addLockObservation(cycle, sessionId, input, { now = nowIso() } = {}) {
  const sessionIndex = cycle.sessions.findIndex((s) => s.id === sessionId);
  if (sessionIndex < 0) throw new Error('Pairing session not found.');
  const session = cycle.sessions[sessionIndex];
  const incoming = buildLockFromInput({ ...input, now });
  if (!incoming.observationDate) throw new Error('A lock observation needs a date.');
  const existingById = incoming.id && input.id ? session.locks.findIndex((l) => l.id === incoming.id) : -1;
  const existingByDate = session.locks.findIndex((l) => l.observationDate === incoming.observationDate);
  const targetIndex = existingById >= 0 ? existingById : existingByDate;
  let locks;
  let lock;
  if (targetIndex >= 0) {
    const previous = session.locks[targetIndex];
    lock = {
      ...previous,
      status: incoming.status,
      observationTime: incoming.observationTime ?? previous.observationTime,
      notes: incoming.notes || previous.notes,
      recordedAt: previous.recordedAt || now,
    };
    locks = session.locks.map((l, i) => (i === targetIndex ? lock : l));
  } else {
    lock = incoming;
    locks = [...session.locks, lock];
  }
  const sessions = cycle.sessions.map((s, i) => (i === sessionIndex ? { ...s, locks, updatedAt: now } : s));
  return { cycle: touch({ ...cycle, sessions }, now), lock, merged: targetIndex >= 0 };
}

export function setLockStatus(cycle, sessionId, lockId, status, { now = nowIso(), notes } = {}) {
  if (!Object.values(LOCK_STATUS).includes(status)) throw new Error('Unknown lock status.');
  const sessions = cycle.sessions.map((s) => (s.id !== sessionId ? s : {
    ...s,
    updatedAt: now,
    locks: s.locks.map((l) => (l.id !== lockId ? l : { ...l, status, notes: notes === undefined ? l.notes : text(notes) })),
  }));
  return touch({ ...cycle, sessions }, now);
}

export function removeLock(cycle, sessionId, lockId, { now = nowIso() } = {}) {
  const sessions = cycle.sessions.map((s) => (s.id !== sessionId ? s : {
    ...s,
    updatedAt: now,
    locks: s.locks.filter((l) => l.id !== lockId),
  }));
  return touch({ ...cycle, sessions }, now);
}

/**
 * Record an actual pairing session for a female.
 *
 * - Attaches to her active cycle; creates the cycle when there is none. Never creates a second
 *   active cycle, and never creates a card for a planned appointment (there is no planned path
 *   through here: a session needs an actual introduction date).
 * - Idempotent on `sessionId`: saving the same session again updates it.
 * - Attaches an optional dated lock observation. Status is never defaulted to observed.
 */
export function recordPairingSession(cycles, input, { now = nowIso() } = {}) {
  const femaleId = text(input.femaleId);
  const maleId = text(input.maleId);
  const introductionDate = toYmd(input.introductionDate);
  if (!femaleId) throw new Error('A pairing session needs a female.');
  if (!maleId) throw new Error('A pairing session needs a male.');
  if (!introductionDate) throw new Error('A pairing session needs an actual introduction date.');
  if (input.removalDate && compareYmd(toYmd(input.removalDate), introductionDate) < 0) {
    throw new Error('Removal cannot be before introduction.');
  }

  const list = asArray(cycles).filter(Boolean);
  let cycle = findActiveCycle(list, femaleId);
  let created = false;
  if (!cycle) {
    cycle = createCycle({
      femaleId,
      speciesId: input.speciesId || null,
      reproductionMode: input.reproductionMode || 'egg_laying',
      startDate: introductionDate,
      seasonLabel: input.seasonLabel || '',
      now,
    });
    created = true;
  }

  if (cycle.status === CYCLE_STATUS.PAUSED) {
    // A real pairing on a paused card resumes it; the pause stays in the record.
    cycle = { ...cycle, status: CYCLE_STATUS.ACTIVE, pause: null, reopenings: [...cycle.reopenings, { resumedAt: now, previousPause: cycle.pause }] };
  }

  const requestedId = text(input.sessionId || input.id);
  const existingIndex = requestedId ? cycle.sessions.findIndex((s) => s.id === requestedId) : -1;
  const base = existingIndex >= 0 ? cycle.sessions[existingIndex] : null;
  let session = normalizeSession({
    ...(base || {}),
    id: requestedId || undefined,
    maleId,
    introductionDate,
    introductionTime: input.introductionTime ?? base?.introductionTime,
    removalDate: input.removalDate ?? base?.removalDate,
    removalTime: input.removalTime ?? base?.removalTime,
    notes: input.notes ?? base?.notes,
    attachments: input.attachments ?? base?.attachments,
    locks: base?.locks || [],
    createdAt: base?.createdAt || now,
    updatedAt: now,
    source: input.source || base?.source || { type: 'quick_entry' },
  });

  const sessions = existingIndex >= 0
    ? cycle.sessions.map((s, i) => (i === existingIndex ? session : s))
    : [...cycle.sessions, session];
  cycle = { ...cycle, sessions };

  if (!cycle.males.some((m) => m.maleId === maleId)) {
    cycle = { ...cycle, males: [...cycle.males, { maleId, state: MALE_STATE.PARTICIPATED, notes: '', addedAt: now }] };
  }

  let lock = null;
  let lockMerged = false;
  const lockStatus = input.lockStatus;
  if (lockStatus === LOCK_STATUS.OBSERVED || lockStatus === LOCK_STATUS.NOT_OBSERVED) {
    const observationDate = toYmd(input.lockDate) || introductionDate;
    const added = addLockObservation(cycle, session.id, {
      id: input.lockId,
      status: lockStatus,
      observationDate,
      observationTime: input.lockTime,
      notes: input.lockNotes,
      now,
    }, { now });
    cycle = added.cycle;
    lock = added.lock;
    lockMerged = added.merged;
    session = cycle.sessions.find((s) => s.id === session.id);
  } else if (lockStatus === LOCK_STATUS.UNKNOWN && input.lockDate) {
    // Unknown with a date is still a dated record; it just never counts.
    const added = addLockObservation(cycle, session.id, { id: input.lockId, status: LOCK_STATUS.UNKNOWN, observationDate: toYmd(input.lockDate), notes: input.lockNotes, now }, { now });
    cycle = added.cycle;
    lock = added.lock;
    session = cycle.sessions.find((s) => s.id === session.id);
  }

  // A pending planned pairing for this male on this date is fulfilled by the actual session.
  const plannedPairings = cycle.plannedPairings.map((p) => (
    p.status === 'pending' && p.maleId === maleId && p.date === introductionDate
      ? { ...p, status: 'done', resolution: { kind: 'fulfilled', sessionId: session.id, at: now }, updatedAt: now }
      : p
  ));

  cycle = touch(reconcileMales({ ...cycle, plannedPairings }), now);
  const nextCycles = created ? [...list, cycle] : list.map((c) => (c.id === cycle.id ? cycle : c));
  return { cycles: nextCycles, cycle, session, lock, lockMerged, created };
}

export function updateSession(cycle, sessionId, patch, { now = nowIso() } = {}) {
  const index = cycle.sessions.findIndex((s) => s.id === sessionId);
  if (index < 0) throw new Error('Pairing session not found.');
  const next = normalizeSession({ ...cycle.sessions[index], ...patch, id: sessionId, updatedAt: now });
  if (!next.introductionDate) throw new Error('A pairing session needs an actual introduction date.');
  if (next.removalDate && compareYmd(next.removalDate, next.introductionDate) < 0) throw new Error('Removal cannot be before introduction.');
  const sessions = cycle.sessions.map((s, i) => (i === index ? next : s));
  return touch(reconcileMales({ ...cycle, sessions }), now);
}

export function removeSession(cycle, sessionId, { now = nowIso() } = {}) {
  const sessions = cycle.sessions.filter((s) => s.id !== sessionId);
  const participated = new Set(sessions.map((s) => s.maleId));
  const males = cycle.males.map((m) => (participated.has(m.maleId) ? m : { ...m, state: MALE_STATE.PLANNED }));
  return touch(reconcileMales({ ...cycle, sessions, males }), now);
}

export function addCandidateMale(cycle, maleId, { now = nowIso(), notes = '' } = {}) {
  const id = text(maleId);
  if (!id) throw new Error('Choose a male.');
  if (cycle.males.some((m) => m.maleId === id)) return cycle;
  const males = [...cycle.males, { maleId: id, state: MALE_STATE.PLANNED, notes: text(notes), addedAt: now }];
  return touch({ ...cycle, males, multipleSires: cycle.multipleSires || males.length > 1 }, now);
}

/** Only a male with no recorded participation can be removed outright. */
export function removeCandidateMale(cycle, maleId, { now = nowIso() } = {}) {
  const history = maleHistory(cycle, maleId);
  if (history.sessionCount > 0) {
    return { cycle, removed: false, reason: 'has_history' };
  }
  const males = cycle.males.filter((m) => m.maleId !== maleId);
  const plannedPairings = cycle.plannedPairings.map((p) => (
    p.maleId === maleId && p.status === 'pending'
      ? { ...p, status: 'cancelled', resolution: { kind: 'male_removed', at: now }, updatedAt: now }
      : p
  ));
  return { cycle: touch({ ...cycle, males, plannedPairings }, now), removed: true };
}

/**
 * Multiple sires toggle. Turning it off never erases anything: when more than one male has
 * recorded participation, the flag is kept and the caller is told why. Unused planned
 * associations beyond the first are removed; anything with history stays.
 */
export function setMultipleSires(cycle, enabled, { now = nowIso() } = {}) {
  if (enabled) return { cycle: touch({ ...cycle, multipleSires: true }, now), retained: false };
  const participated = cycle.males.filter((m) => m.state === MALE_STATE.PARTICIPATED);
  if (participated.length > 1) {
    return { cycle: touch({ ...cycle, multipleSires: true }, now), retained: true, reason: 'multiple_participated', participated: participated.map((m) => m.maleId) };
  }
  const keep = participated[0] || cycle.males[0] || null;
  const males = keep ? cycle.males.filter((m) => m.maleId === keep.maleId) : [];
  const removedIds = new Set(cycle.males.filter((m) => !males.includes(m)).map((m) => m.maleId));
  const plannedPairings = cycle.plannedPairings.map((p) => (
    removedIds.has(p.maleId) && p.status === 'pending'
      ? { ...p, status: 'cancelled', resolution: { kind: 'multiple_sires_disabled', at: now }, updatedAt: now }
      : p
  ));
  return { cycle: touch({ ...cycle, multipleSires: false, males, plannedPairings }, now), retained: false, removed: Array.from(removedIds) };
}

/** Record or correct a milestone. A later milestone never requires an earlier one. */
export function recordEvent(cycle, input, { now = nowIso() } = {}) {
  const event = normalizeEvent({ ...input, recordedAt: input.recordedAt || now });
  if (!EVENT_TYPES.includes(event.type)) throw new Error('Unknown milestone type.');
  if (!event.date) throw new Error('A milestone needs a date.');
  if (cycle.reproductionMode === 'live_bearing' && EGG_LAYING_ONLY_EVENTS.includes(event.type)) {
    throw new Error('Egg-laying milestones do not apply to a live-bearing species.');
  }
  const existingIndex = cycle.events.findIndex((e) => e.id === event.id);
  const events = existingIndex >= 0
    ? cycle.events.map((e, i) => (i === existingIndex ? { ...e, ...event, recordedAt: e.recordedAt || event.recordedAt } : e))
    : [...cycle.events, event];
  let clutch = cycle.clutch;
  if (event.type === 'first_hatch' && event.certainty === EVENT_CERTAINTY.RECORDED) clutch = { ...clutch, firstHatchDate: clutch.firstHatchDate || event.date };
  if (event.type === 'final_hatch' && event.certainty === EVENT_CERTAINTY.RECORDED) clutch = { ...clutch, finalHatchDate: event.date };
  return touch({ ...cycle, events, clutch }, now);
}

export function removeEvent(cycle, eventId, { now = nowIso() } = {}) {
  return touch({ ...cycle, events: cycle.events.filter((e) => e.id !== eventId) }, now);
}

export function updateClutch(cycle, patch, { now = nowIso() } = {}) {
  const clutch = normalizeClutch({ ...cycle.clutch, ...patch });
  if (clutch.eggsTotal !== null && clutch.fertileEggs !== null && clutch.slugs !== null && clutch.fertileEggs + clutch.slugs > clutch.eggsTotal) {
    throw new Error('Fertile eggs plus slugs cannot exceed the total.');
  }
  if (clutch.hatchlingsRecorded !== null && clutch.eggsTotal !== null && clutch.hatchlingsRecorded > clutch.eggsTotal) {
    throw new Error('Hatchlings cannot exceed the eggs laid.');
  }
  let events = cycle.events;
  const layDate = toYmd(patch.laidDate);
  if (layDate && !cycle.events.some((e) => e.type === 'egg_laying' && e.certainty === EVENT_CERTAINTY.RECORDED)) {
    events = [...events, normalizeEvent({ type: 'egg_laying', date: layDate, recordedAt: now })];
  }
  return touch({ ...cycle, clutch, events }, now);
}

/** Partial hatching: records the first hatch and the running count. Never closes the cycle. */
export function recordHatching(cycle, { date, hatchlingsRecorded, notes = '' } = {}, { now = nowIso() } = {}) {
  const day = toYmd(date);
  if (!day) throw new Error('A hatch date is required.');
  let next = cycle;
  if (!recordedEventDate(next, 'first_hatch')) {
    next = recordEvent(next, { type: 'first_hatch', date: day, notes }, { now });
  }
  const count = countOrNull(hatchlingsRecorded);
  if (count !== null) {
    next = updateClutch(next, { hatchlingsRecorded: count, firstHatchDate: next.clutch.firstHatchDate || day }, { now });
  }
  return next;
}

/**
 * Hatching complete: the explicit action that resolves every egg's outcome and completes the
 * cycle. Idempotent: calling it again with the same facts changes nothing and never duplicates
 * hatchlings (hatchling records themselves are created by the caller once per index).
 */
export function completeHatchingOutcome(cycle, { finalHatchDate, hatchlingsRecorded, lostEggs, notes = '', completedAt } = {}, { now = nowIso() } = {}) {
  const day = toYmd(finalHatchDate) || cycle.clutch.finalHatchDate || cycle.clutch.firstHatchDate;
  if (!day) throw new Error('The final hatch date is required to complete the outcome.');
  let next = updateClutch(cycle, {
    hatchlingsRecorded: hatchlingsRecorded ?? cycle.clutch.hatchlingsRecorded,
    lostEggs: lostEggs ?? cycle.clutch.lostEggs,
    finalHatchDate: day,
    firstHatchDate: cycle.clutch.firstHatchDate || day,
    outcomeComplete: true,
    outcomeCompletedAt: cycle.clutch.outcomeCompletedAt || completedAt || now,
    notes: notes || cycle.clutch.notes,
  }, { now });
  if (!recordedEventDate(next, 'first_hatch')) next = recordEvent(next, { type: 'first_hatch', date: next.clutch.firstHatchDate || day }, { now });
  if (!recordedEventDate(next, 'final_hatch')) next = recordEvent(next, { type: 'final_hatch', date: day }, { now });
  if (!recordedEventDate(next, 'hatching_complete')) next = recordEvent(next, { type: 'hatching_complete', date: day, notes }, { now });
  if (next.status !== CYCLE_STATUS.CLOSED) {
    next = closeCycle(next, { outcome: 'hatching_complete', note: notes, biologicalCompletionDate: day, closedAt: completedAt || now }, { now });
  }
  return next;
}

/**
 * The female left the collection: close each of her open or paused cards with the archive
 * outcome. Pending planned pairings are cancelled by closeCycle itself.
 */
export function closeCyclesForArchivedFemale(cycles = [], femaleId, outcome, { now = nowIso(), note = '' } = {}) {
  const id = text(femaleId);
  const closedIds = [];
  const next = asArray(cycles).map((cycle) => {
    if (!cycle || cycle.deletedAt || cycle.femaleId !== id || cycle.status === CYCLE_STATUS.CLOSED) return cycle;
    closedIds.push(cycle.id);
    return closeCycle(cycle, { outcome, note, closedAt: now }, { now });
  });
  return { cycles: next, closedIds };
}

/**
 * A male left the collection. The females' cards stay open (one may already be gravid by him),
 * but pairings still planned with him cannot happen, so those are cancelled.
 */
export function cancelPlannedPairingsForArchivedMale(cycles = [], maleId, { now = nowIso() } = {}) {
  const id = text(maleId);
  const changedIds = [];
  const next = asArray(cycles).map((cycle) => {
    if (!cycle || cycle.deletedAt || cycle.status === CYCLE_STATUS.CLOSED) return cycle;
    const planned = asArray(cycle.plannedPairings);
    if (!planned.some((p) => p.maleId === id && p.status === 'pending')) return cycle;
    changedIds.push(cycle.id);
    return touch({
      ...cycle,
      plannedPairings: planned.map((p) => (
        p.maleId === id && p.status === 'pending'
          ? { ...p, status: 'cancelled', resolution: { kind: 'male_left_collection', at: now }, updatedAt: now }
          : p
      )),
    }, now);
  });
  return { cycles: next, changedIds };
}

export function closeCycle(cycle, { outcome, note = '', closedAt, biologicalCompletionDate = null } = {}, { now = nowIso() } = {}) {
  if (!CLOSURE_OUTCOMES.includes(outcome)) throw new Error('Choose a closure outcome.');
  if (outcome === 'other' && !text(note)) throw new Error('A note is required when the outcome is "other".');
  const plannedPairings = cycle.plannedPairings.map((p) => (
    p.status === 'pending' ? { ...p, status: 'cancelled', resolution: { kind: 'cycle_closed', at: now }, updatedAt: now } : p
  ));
  return touch({
    ...cycle,
    status: CYCLE_STATUS.CLOSED,
    pause: null,
    plannedPairings,
    closure: {
      outcome,
      closedAt: closedAt || now,
      note: text(note),
      biologicalCompletionDate: toYmd(biologicalCompletionDate) || null,
    },
  }, now);
}

/** Deliberate reopening keeps the previous closure in the record. */
export function reopenCycle(cycle, { note = '' } = {}, { now = nowIso() } = {}) {
  if (cycle.status !== CYCLE_STATUS.CLOSED) return cycle;
  return touch({
    ...cycle,
    status: CYCLE_STATUS.ACTIVE,
    closure: null,
    clutch: { ...cycle.clutch, outcomeComplete: false },
    reopenings: [...cycle.reopenings, { reopenedAt: now, note: text(note), previousClosure: cycle.closure }],
  }, now);
}

export function pauseCycle(cycle, { reason = '' } = {}, { now = nowIso() } = {}) {
  if (cycle.status !== CYCLE_STATUS.ACTIVE) return cycle;
  const plannedPairings = cycle.plannedPairings.map((p) => (
    p.status === 'pending' && p.origin === 'auto_after_lock'
      ? { ...p, status: 'cancelled', resolution: { kind: 'cycle_paused', at: now }, updatedAt: now }
      : p
  ));
  return touch({ ...cycle, status: CYCLE_STATUS.PAUSED, pause: { pausedAt: now, reason: text(reason) }, plannedPairings }, now);
}

export function resumeCycle(cycle, { now = nowIso() } = {}) {
  if (cycle.status !== CYCLE_STATUS.PAUSED) return cycle;
  return touch({ ...cycle, status: CYCLE_STATUS.ACTIVE, pause: null, reopenings: [...cycle.reopenings, { resumedAt: now, previousPause: cycle.pause }] }, now);
}

export function setSeasonLabel(cycle, label, { now = nowIso() } = {}) {
  const normalized = normalizeSeasonLabel(label);
  if (!normalized) return touch({ ...cycle, seasonLabel: defaultSeasonLabel(cycle.startDate), seasonLabelSource: 'auto' }, now);
  return touch({ ...cycle, seasonLabel: normalized, seasonLabelSource: 'manual' }, now);
}

export function assignOffspringSire(cycle, animalId, { maleId = null, method = 'breeder_assigned', certainty = 'reported', note = '' } = {}, { now = nowIso() } = {}) {
  const id = text(animalId);
  if (!id) throw new Error('Choose an offspring.');
  if (maleId && !cycle.males.some((m) => m.maleId === maleId)) throw new Error('That male is not a candidate sire on this card.');
  const existing = cycle.offspring.find((o) => o.animalId === id);
  const previous = existing?.sireAssignment || null;
  const assignment = {
    maleId: text(maleId) || null,
    method: maleId ? method : 'unresolved',
    certainty: maleId ? certainty : 'unknown',
    note: text(note),
    assignedAt: now,
    history: previous ? [...(previous.history || []), { ...previous, history: undefined }] : [],
  };
  const offspring = existing
    ? cycle.offspring.map((o) => (o.animalId === id ? { ...o, sireAssignment: assignment } : o))
    : [...cycle.offspring, { animalId: id, sireAssignment: assignment }];
  return touch({ ...cycle, offspring }, now);
}

/** Link an offspring to the cycle without choosing a sire: parentage stays unresolved. */
export function linkOffspring(cycle, animalId, { now = nowIso() } = {}) {
  const id = text(animalId);
  if (!id || cycle.offspring.some((o) => o.animalId === id)) return cycle;
  const participated = cycle.males.filter((m) => m.state === MALE_STATE.PARTICIPATED);
  // With exactly one participating male the sire is still only a candidate, but the card can
  // say so honestly: method "single_candidate", certainty "reported", never "confirmed".
  const assignment = participated.length === 1
    ? { maleId: participated[0].maleId, method: 'single_candidate', certainty: 'reported', note: '', assignedAt: now, history: [] }
    : { maleId: null, method: 'unresolved', certainty: 'unknown', note: '', assignedAt: now, history: [] };
  return touch({ ...cycle, offspring: [...cycle.offspring, { animalId: id, sireAssignment: assignment }] }, now);
}

// ── Integrity flags ───────────────────────────────────────────────────────────

/**
 * Chronology conflicts are reported, never "fixed" by inventing dates. Each flag names the
 * records involved so the UI can offer the correction flow.
 */
export function chronologyFlags(cycle) {
  const flags = [];
  const date = (type) => recordedEventDate(cycle, type);
  const ovulation = date('ovulation');
  const shed = date('pre_lay_shed');
  const laying = date('egg_laying');
  const firstHatch = date('first_hatch') || cycle.clutch?.firstHatchDate;
  const finalHatch = date('final_hatch') || cycle.clutch?.finalHatchDate;
  const before = (a, b) => a && b && compareYmd(b, a) < 0;
  if (before(ovulation, shed)) flags.push({ kind: 'shed_before_ovulation', refs: ['pre_lay_shed', 'ovulation'] });
  if (before(shed, laying)) flags.push({ kind: 'laying_before_shed', refs: ['egg_laying', 'pre_lay_shed'] });
  if (before(ovulation, laying)) flags.push({ kind: 'laying_before_ovulation', refs: ['egg_laying', 'ovulation'] });
  if (before(laying, firstHatch)) flags.push({ kind: 'hatch_before_laying', refs: ['first_hatch', 'egg_laying'] });
  if (before(firstHatch, finalHatch)) flags.push({ kind: 'final_hatch_before_first', refs: ['final_hatch', 'first_hatch'] });
  if (cycle.startDate && ovulation && before(cycle.startDate, ovulation)) {
    flags.push({ kind: 'ovulation_before_first_pairing', refs: ['ovulation', 'first_pairing'] });
  }
  for (const session of asArray(cycle.sessions)) {
    if (session.removalDate && before(session.introductionDate, session.removalDate)) {
      flags.push({ kind: 'removal_before_introduction', refs: [session.id] });
    }
    for (const lock of asArray(session.locks)) {
      if (lock.observationDate && session.introductionDate && before(session.introductionDate, lock.observationDate)) {
        flags.push({ kind: 'lock_before_introduction', refs: [session.id, lock.id] });
      }
      if (lock.observationDate && session.removalDate && compareYmd(lock.observationDate, session.removalDate) > 0) {
        flags.push({ kind: 'lock_after_removal', refs: [session.id, lock.id] });
      }
    }
  }
  return flags;
}

/**
 * Suspicious duplicates and impossible overlaps across the card. Reported for review; nothing is
 * merged automatically.
 */
export function duplicateFlags(cycle) {
  const flags = [];
  const locks = observedLocks(cycle);
  const byDate = new Map();
  locks.forEach((lock) => {
    const list = byDate.get(lock.observationDate) || [];
    list.push(lock);
    byDate.set(lock.observationDate, list);
  });
  byDate.forEach((list, day) => {
    const males = new Set(list.map((l) => l.maleId));
    if (males.size > 1) flags.push({ kind: 'locks_same_day_different_males', date: day, refs: list.map((l) => l.id) });
    const sessions = new Set(list.map((l) => l.sessionId));
    if (sessions.size > 1 && males.size === 1) flags.push({ kind: 'locks_same_day_same_male_different_sessions', date: day, refs: list.map((l) => l.id) });
  });
  const sessions = actualSessions(cycle);
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      const a = sessions[i];
      const b = sessions[j];
      if (a.maleId !== b.maleId) continue;
      if (a.removalDate && compareYmd(b.introductionDate, a.removalDate) <= 0 && compareYmd(b.introductionDate, a.introductionDate) >= 0) {
        flags.push({ kind: 'overlapping_sessions_same_male', refs: [a.id, b.id] });
      } else if (a.introductionDate === b.introductionDate) {
        flags.push({ kind: 'same_day_sessions_same_male', refs: [a.id, b.id] });
      }
    }
  }
  return flags;
}

/** Cross-card conflicts: two active cards for one female. */
export function collectionFlags(cycles = []) {
  const flags = [];
  const live = asArray(cycles).filter((c) => c && !c.deletedAt);
  const activeByFemale = new Map();
  live.filter((c) => c.status !== CYCLE_STATUS.CLOSED).forEach((c) => {
    const list = activeByFemale.get(c.femaleId) || [];
    list.push(c.id);
    activeByFemale.set(c.femaleId, list);
  });
  activeByFemale.forEach((ids, femaleId) => {
    if (ids.length > 1) flags.push({ kind: 'multiple_active_cycles', femaleId, refs: ids });
  });
  return flags;
}

export function elapsedDaysSinceStart(cycle, today) {
  return cycle?.startDate ? diffDays(cycle.startDate, today) : null;
}
