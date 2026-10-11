/**
 * Legacy pairing records → breeding cycles.
 *
 * One legacy pairing (female × male × appointments × lifecycle) becomes one cycle unless the
 * female AND an explicit season token (seasonId / cycleYear / seasonName set on the record) say
 * two pairings belong to the same season, in which case they become one multi-sire cycle. Two
 * pairings of the same female whose only common ground is a start year are kept apart and
 * flagged for review; nothing is merged on a guess.
 *
 * Every mapping is deterministic (cycle id = `bc-legacy-<first pairing id>`), so the plan can
 * be re-run on either side of the sync without creating a second copy. Source records are not
 * modified; the cycle carries `legacy.pairingIds` so the old data stays reachable.
 *
 * Lock handling: a dated legacy lock (lockDate / lockLoggedAt, or the appointment date when the
 * appointment was ticked as locked) becomes one dated record with status observed and legacy
 * provenance. An appointment that was ticked done but not locked becomes a session with no lock
 * record (status unknown, never observed). Aggregate counts (`lockCount`, `locks` arrays with
 * no dates) are kept as an aggregate with provenance and flagged; they never become dated locks.
 */
import { toYmd, compareYmd, nowIso, minYmd, maxYmd } from './dates';
import { normalizeCycle, reconcileMales, CYCLE_STATUS, LOCK_STATUS, MALE_STATE } from './cycleModel';
import { seasonLabelFromYear, normalizeSeasonLabel } from './season';

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const asArray = (value) => (Array.isArray(value) ? value : []);

export function legacyCycleId(pairingId) {
  return `bc-legacy-${text(pairingId)}`;
}

/** Explicit season evidence only. A start date is NOT explicit evidence. */
export function explicitSeasonToken(pairing) {
  if (!pairing || typeof pairing !== 'object') return null;
  if (pairing.seasonId) return String(pairing.seasonId);
  if (pairing.season?.id) return String(pairing.season.id);
  if (pairing.cycleYear !== undefined && pairing.cycleYear !== null && pairing.cycleYear !== '') return String(pairing.cycleYear);
  if (pairing.seasonKey) return String(pairing.seasonKey);
  if (typeof pairing.seasonName === 'string' && pairing.seasonName.trim()) return pairing.seasonName.trim();
  return null;
}

function legacyLockDate(appointment) {
  return toYmd(appointment?.lockDate) || toYmd(appointment?.lockLoggedAt) || (appointment?.lockObserved ? toYmd(appointment?.date) : null);
}

function legacyIntroductionDate(appointment) {
  const done = typeof appointment?.appointmentDone === 'boolean' ? appointment.appointmentDone : !!appointment?.pairingObserved;
  return toYmd(appointment?.pairingDate) || toYmd(appointment?.pairingLoggedAt) || (done ? toYmd(appointment?.date) : null);
}

function appointmentIsPlannedOnly(appointment) {
  return !legacyIntroductionDate(appointment) && !legacyLockDate(appointment) && !!toYmd(appointment?.date);
}

function convertPairing(pairing, { now }) {
  const sessions = [];
  const planned = [];
  const notes = [];
  asArray(pairing.appointments).forEach((appointment, index) => {
    const appointmentId = text(appointment?.id) || `${pairing.id}-appt-${index + 1}`;
    const introduction = legacyIntroductionDate(appointment);
    const lockDate = legacyLockDate(appointment);
    const source = { type: 'legacy_pairing', legacyPairingId: pairing.id, legacyAppointmentId: appointmentId };
    if (introduction || lockDate) {
      const locks = [];
      if (lockDate && appointment.lockObserved) {
        locks.push({ id: `${appointmentId}-lock`, observationDate: lockDate, status: LOCK_STATUS.OBSERVED, notes: '', recordedAt: now, source });
      }
      sessions.push({
        id: `${appointmentId}-session`,
        maleId: text(pairing.maleId) || null,
        introductionDate: introduction || lockDate,
        notes: text(appointment.notes),
        locks,
        createdAt: now,
        updatedAt: now,
        source: { ...source, introductionInferredFromLock: !introduction && !!lockDate },
      });
      if (!introduction && lockDate) notes.push({ kind: 'introduction_inferred_from_lock', appointmentId });
    } else if (appointmentIsPlannedOnly(appointment)) {
      planned.push({
        id: `${appointmentId}-planned`,
        maleId: text(pairing.maleId) || null,
        date: toYmd(appointment.date),
        status: 'pending',
        origin: 'manual',
        manuallyAdjusted: true,
        note: text(appointment.notes),
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  // Aggregate lock evidence without dates is preserved as an aggregate, never expanded.
  const aggregateCandidates = [
    Number.isFinite(Number(pairing.lockCount)) && Number(pairing.lockCount) > 0 ? Number(pairing.lockCount) : null,
    asArray(pairing.locks).filter((l) => !toYmd(l?.date) && !toYmd(l?.lockDate)).length || null,
    asArray(pairing.lockLogs).filter((l) => !toYmd(l?.date) && !toYmd(l?.lockDate)).length || null,
  ].filter((n) => n !== null);
  const datedExtraLocks = [...asArray(pairing.locks), ...asArray(pairing.lockLogs)]
    .map((l) => toYmd(l?.date) || toYmd(l?.lockDate))
    .filter(Boolean);
  const aggregateLocks = aggregateCandidates.length ? { count: Math.max(...aggregateCandidates), source: 'legacy_aggregate', note: 'Count without dates from the legacy pairing record; not counted as dated locks.' } : null;

  // Dated locks that lived outside appointments get their own single-day sessions so the date is kept.
  datedExtraLocks.forEach((day, index) => {
    const id = `${pairing.id}-extra-lock-${index + 1}`;
    if (sessions.some((s) => s.locks.some((l) => l.observationDate === day))) return;
    sessions.push({
      id: `${id}-session`,
      maleId: text(pairing.maleId) || null,
      introductionDate: day,
      notes: '',
      locks: [{ id, observationDate: day, status: LOCK_STATUS.OBSERVED, notes: '', recordedAt: now, source: { type: 'legacy_pairing', legacyPairingId: pairing.id, field: 'locks' } }],
      createdAt: now,
      updatedAt: now,
      source: { type: 'legacy_pairing', legacyPairingId: pairing.id, introductionInferredFromLock: true },
    });
  });

  const events = [];
  const pushEvent = (type, record, extra = {}) => {
    const date = toYmd(record?.date);
    if (!date) return;
    events.push({ id: `${pairing.id}-${type}`, type, date, precision: 'exact', certainty: 'recorded', notes: text(record?.notes), recordedAt: now, source: { type: 'legacy_pairing', legacyPairingId: pairing.id }, ...extra });
  };
  if (pairing.ovulation?.observed) pushEvent('ovulation', pairing.ovulation);
  if (pairing.preLayShed?.observed) pushEvent('pre_lay_shed', pairing.preLayShed);
  if (pairing.clutch?.recorded) pushEvent('egg_laying', pairing.clutch);
  if (pairing.hatch?.recorded && toYmd(pairing.hatch?.date)) {
    pushEvent('first_hatch', pairing.hatch);
  }

  const clutchRecorded = !!pairing.clutch?.recorded;
  const hatchRecorded = !!pairing.hatch?.recorded;
  const clutch = {
    eggsTotal: clutchRecorded ? pairing.clutch?.eggsTotal : null,
    fertileEggs: clutchRecorded ? pairing.clutch?.fertileEggs : null,
    slugs: clutchRecorded ? pairing.clutch?.slugs : null,
    hatchlingsRecorded: hatchRecorded ? pairing.hatch?.hatchedCount : null,
    firstHatchDate: hatchRecorded ? toYmd(pairing.hatch?.date) : null,
    // The legacy model had one hatch date and no "all outcomes resolved" fact. The cycle is left
    // open on that point; the keeper completes it with the explicit action.
    outcomeComplete: false,
    legacyPairingId: pairing.id,
  };

  const workflow = String(pairing.workflowStatus || pairing.status || '').toLowerCase();
  const completed = workflow === 'completed' || workflow === 'archived';
  const startDate = minYmd(...sessions.map((s) => s.introductionDate)) || null;
  const legacyStart = toYmd(pairing.startDate);
  const seasonToken = explicitSeasonToken(pairing);
  const seasonYear = seasonToken && /^\d{4}$/.test(seasonToken) ? Number(seasonToken) : null;
  const seasonLabel = seasonToken && !seasonYear ? normalizeSeasonLabel(seasonToken) : (seasonYear ? seasonLabelFromYear(seasonYear) : '');

  const reviewReasons = [];
  if (!startDate) reviewReasons.push('no_actual_pairing_date');
  if (aggregateLocks) reviewReasons.push('aggregate_locks_without_dates');
  if (!text(pairing.maleId)) reviewReasons.push('missing_male');
  notes.forEach((n) => reviewReasons.push(n.kind));

  let closure = null;
  if (completed) {
    const reason = text(pairing.completionReason);
    const outcome = hatchRecorded ? 'hatching_complete'
      : ['no_ovulation_observed', 'follicles_reabsorbed', 'ovulated_no_eggs', 'season_skipped', 'season_ended', 'pairing_unsuccessful'].includes(reason) ? 'no_clutch'
        : reason === 'eggs_laid' ? 'other'
          : ['health_reason', 'breeding_stopped'].includes(reason) ? 'cancelled'
            : 'other';
    closure = {
      outcome,
      closedAt: text(pairing.completedAt) || now,
      note: [text(pairing.completionNote), reason ? `Legacy completion reason: ${reason}` : ''].filter(Boolean).join(' '),
      biologicalCompletionDate: hatchRecorded ? toYmd(pairing.hatch?.date) : null,
    };
  }

  const cycle = normalizeCycle({
    id: legacyCycleId(pairing.id),
    femaleId: text(pairing.femaleId) || null,
    seasonLabel: seasonLabel || (startDate || legacyStart ? seasonLabelFromYear(Number(String(startDate || legacyStart).slice(0, 4))) : ''),
    seasonLabelSource: seasonLabel ? 'manual' : 'auto',
    startDate: startDate || legacyStart || null,
    status: completed ? CYCLE_STATUS.CLOSED : CYCLE_STATUS.ACTIVE,
    closure,
    multipleSires: false,
    males: text(pairing.maleId) ? [{ maleId: text(pairing.maleId), state: sessions.length ? MALE_STATE.PARTICIPATED : MALE_STATE.PLANNED, addedAt: now }] : [],
    sessions,
    plannedPairings: planned,
    events,
    clutch,
    legacy: {
      pairingIds: [pairing.id],
      label: text(pairing.label),
      aggregateLocks,
      reviewNeeded: reviewReasons.length > 0,
      reviewReasons,
      seasonToken,
      legacyStartDate: legacyStart,
      migratedAt: now,
    },
    createdAt: text(pairing.createdAt) || now,
    updatedAt: now,
  });
  return reconcileMales(cycle);
}

function mergeCycles(cycles, { now }) {
  const [first, ...rest] = cycles;
  let merged = first;
  rest.forEach((other) => {
    merged = {
      ...merged,
      males: [...merged.males, ...other.males.filter((m) => !merged.males.some((x) => x.maleId === m.maleId))],
      sessions: [...merged.sessions, ...other.sessions],
      plannedPairings: [...merged.plannedPairings, ...other.plannedPairings],
      events: [...merged.events, ...other.events.filter((e) => !merged.events.some((x) => x.type === e.type))],
      startDate: minYmd(merged.startDate, other.startDate),
      status: merged.status === CYCLE_STATUS.ACTIVE || other.status === CYCLE_STATUS.ACTIVE ? CYCLE_STATUS.ACTIVE : CYCLE_STATUS.CLOSED,
      closure: merged.status === CYCLE_STATUS.ACTIVE || other.status === CYCLE_STATUS.ACTIVE ? null : (merged.closure || other.closure),
      clutch: merged.clutch.eggsTotal !== null ? merged.clutch : other.clutch,
      legacy: {
        ...merged.legacy,
        pairingIds: [...merged.legacy.pairingIds, ...other.legacy.pairingIds],
        aggregateLocks: merged.legacy.aggregateLocks || other.legacy.aggregateLocks,
        reviewNeeded: merged.legacy.reviewNeeded || other.legacy.reviewNeeded || true,
        reviewReasons: Array.from(new Set([...merged.legacy.reviewReasons, ...other.legacy.reviewReasons, 'merged_by_explicit_season'])),
      },
      multipleSires: true,
      updatedAt: now,
    };
  });
  return reconcileMales(normalizeCycle(merged));
}

/**
 * Build the migration plan. Pure and rerun-safe: pairings whose cycle already exists are skipped.
 * Returns the new cycles plus a reconciliation report.
 */
export function planLegacyMigration(pairings = [], existingCycles = [], { now = nowIso() } = {}) {
  const existingIds = new Set(asArray(existingCycles).map((c) => c?.id).filter(Boolean));
  const existingLegacyPairingIds = new Set(asArray(existingCycles).flatMap((c) => asArray(c?.legacy?.pairingIds)));
  const report = { total: 0, converted: 0, skippedExisting: 0, skippedInvalid: 0, merged: 0, reviewNeeded: [], aggregateLocks: [], mappings: [], warnings: [] };
  const converted = [];

  asArray(pairings).forEach((pairing) => {
    if (!pairing || typeof pairing !== 'object') return;
    report.total += 1;
    const pairingId = text(pairing.id);
    if (!pairingId || !text(pairing.femaleId)) { report.skippedInvalid += 1; report.warnings.push({ pairingId: pairingId || null, kind: 'missing_id_or_female' }); return; }
    if (pairing.isDemo === true) { report.skippedInvalid += 1; return; }
    if (existingIds.has(legacyCycleId(pairingId)) || existingLegacyPairingIds.has(pairingId)) { report.skippedExisting += 1; return; }
    converted.push({ pairing, cycle: convertPairing(pairing, { now }) });
  });

  // Group by female + explicit season token; only explicit evidence merges.
  const groups = new Map();
  converted.forEach((entry) => {
    const token = explicitSeasonToken(entry.pairing);
    const key = token ? `${entry.cycle.femaleId}::${token}` : `${entry.cycle.femaleId}::pairing:${entry.pairing.id}`;
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  });

  const cycles = [];
  groups.forEach((entries) => {
    entries.sort((a, b) => compareYmd(a.cycle.startDate, b.cycle.startDate) || String(a.pairing.id).localeCompare(String(b.pairing.id)));
    const cycle = entries.length > 1 ? mergeCycles(entries.map((e) => e.cycle), { now }) : entries[0].cycle;
    if (entries.length > 1) report.merged += entries.length - 1;
    cycles.push(cycle);
    entries.forEach((e) => report.mappings.push({ pairingId: e.pairing.id, cycleId: cycle.id, merged: entries.length > 1 }));
  });

  // Same female, overlapping dates, no explicit shared season: keep apart, flag for review.
  const byFemale = new Map();
  cycles.forEach((c) => { const list = byFemale.get(c.femaleId) || []; list.push(c); byFemale.set(c.femaleId, list); });
  byFemale.forEach((list) => {
    list.sort((a, b) => compareYmd(a.startDate, b.startDate));
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1];
      const cur = list[i];
      const prevEnd = prev.closure?.biologicalCompletionDate || maxYmd(...prev.sessions.map((s) => s.introductionDate), ...prev.events.map((e) => e.date)) || prev.startDate;
      if (prev.startDate && cur.startDate && prevEnd && compareYmd(cur.startDate, prevEnd) <= 0) {
        [prev, cur].forEach((c) => {
          c.legacy = { ...c.legacy, reviewNeeded: true, reviewReasons: Array.from(new Set([...c.legacy.reviewReasons, 'overlaps_other_cycle_same_female'])) };
        });
      }
    }
    // Several legacy pairings open at once for one female: all but the latest-started are closed
    // administratively? No: the rule is one active cycle, but closing is a judgement. Flag instead.
    const active = list.filter((c) => c.status === CYCLE_STATUS.ACTIVE);
    if (active.length > 1) {
      active.forEach((c) => {
        c.legacy = { ...c.legacy, reviewNeeded: true, reviewReasons: Array.from(new Set([...c.legacy.reviewReasons, 'multiple_active_legacy_pairings'])) };
      });
    }
  });

  cycles.forEach((c) => {
    report.converted += 1;
    if (c.legacy?.reviewNeeded) report.reviewNeeded.push({ cycleId: c.id, pairingIds: c.legacy.pairingIds, reasons: c.legacy.reviewReasons });
    if (c.legacy?.aggregateLocks) report.aggregateLocks.push({ cycleId: c.id, count: c.legacy.aggregateLocks.count });
  });

  return { cycles, report };
}

/** Counts that must survive a migration; used by the reconciliation report and the tests. */
export function legacyCounts(pairings = []) {
  let datedLocks = 0;
  let introductions = 0;
  let plannedOnly = 0;
  asArray(pairings).forEach((pairing) => {
    asArray(pairing?.appointments).forEach((appointment) => {
      if (legacyLockDate(appointment) && appointment.lockObserved) datedLocks += 1;
      if (legacyIntroductionDate(appointment)) introductions += 1;
      if (appointmentIsPlannedOnly(appointment)) plannedOnly += 1;
    });
  });
  return { pairings: asArray(pairings).filter(Boolean).length, datedLocks, introductions, plannedOnly };
}

export function cycleCounts(cycles = []) {
  let locks = 0;
  let sessions = 0;
  let planned = 0;
  asArray(cycles).forEach((cycle) => {
    asArray(cycle?.sessions).forEach((session) => {
      sessions += 1;
      locks += asArray(session.locks).filter((l) => l.status === LOCK_STATUS.OBSERVED).length;
    });
    planned += asArray(cycle?.plannedPairings).length;
  });
  return { cycles: asArray(cycles).filter(Boolean).length, locks, sessions, planned };
}
