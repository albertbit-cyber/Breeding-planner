/**
 * Historical summaries and the female's own pace.
 *
 * Per cycle: every interval the product defines, computed from actual dates only. Across
 * cycles: for each metric the MEDIAN with its shortest–longest range and its own sample count.
 * Unknown stays "not recorded" and is excluded only from the calculations that need it.
 * Estimated or suspected milestone dates are excluded from the default statistic. Invalid
 * chronology never becomes a negative interval: it is flagged and that calculation is skipped.
 */
import { diffDays, compareYmd, maxYmd } from './dates';
import {
  actualSessions,
  observedLocks,
  findEvent,
  EVENT_CERTAINTY,
  EVENT_PRECISION,
  CYCLE_STATUS,
} from './cycleModel';
import { examsForCycle, latestMeasurement, isOnFollicleCurve, comparableChange } from './follicles';

export const INTERVAL_METRICS = Object.freeze([
  'firstPairingToOvulation',
  'lastPairingBeforeOvulationToOvulation',
  'firstLockBeforeOvulationToOvulation',
  'ovulationToPreLayShed',
  'preLayShedToLaying',
  'firstPairingToLaying',
  'layingToFirstHatch',
  'layingToFinalHatch',
  'firstPairingToHatchingComplete',
]);

export const COUNT_METRICS = Object.freeze(['eggsTotal', 'fertileEggs', 'slugs', 'hatchlingsRecorded']);

/** A milestone date usable for the default statistic: recorded AND exact. */
function exactRecordedDate(cycle, type) {
  const event = findEvent(cycle, type, { certainty: EVENT_CERTAINTY.RECORDED });
  if (!event || event.precision !== EVENT_PRECISION.EXACT) return null;
  return event.date;
}

function anyDate(cycle, type) {
  return findEvent(cycle, type)?.date || null;
}

/** Days from a to b, or a flagged null when b is before a (invalid chronology). */
function interval(from, to) {
  if (!from || !to) return { value: null, status: 'not_recorded' };
  const days = diffDays(from, to);
  if (days === null) return { value: null, status: 'not_recorded' };
  if (days < 0) return { value: null, status: 'invalid_chronology' };
  return { value: days, status: 'ok' };
}

export function mean(values) {
  const list = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!list.length) return null;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

export function median(values) {
  const list = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

/**
 * Pairing frequency over a labelled set of introductions: the mean of consecutive gaps. With
 * fewer than two introductions it is unavailable (null), not zero. Same-day sessions remain in
 * the list and are reported separately so the keeper can see them.
 */
export function pairingFrequency(sessions = []) {
  const dates = sessions.map((s) => s.introductionDate).filter(Boolean).sort();
  if (dates.length < 2) return { averageIntervalDays: null, intervals: [], sameDayCount: 0, introductions: dates.length };
  const intervals = [];
  let sameDayCount = 0;
  for (let i = 1; i < dates.length; i += 1) {
    const gap = diffDays(dates[i - 1], dates[i]);
    if (gap === 0) sameDayCount += 1;
    intervals.push(gap);
  }
  return { averageIntervalDays: Math.round(mean(intervals) * 10) / 10, intervals, sameDayCount, introductions: dates.length };
}

export function summarizeCycle(cycle, exams = [], { usePreciseOnly = true } = {}) {
  const dateOf = usePreciseOnly ? (type) => exactRecordedDate(cycle, type) : (type) => anyDate(cycle, type);
  const ovulation = dateOf('ovulation');
  const shed = dateOf('pre_lay_shed');
  const laying = dateOf('egg_laying');
  const firstHatch = dateOf('first_hatch') || (usePreciseOnly ? cycle.clutch?.firstHatchDate : cycle.clutch?.firstHatchDate);
  const finalHatch = dateOf('final_hatch') || cycle.clutch?.finalHatchDate;
  const hatchingComplete = dateOf('hatching_complete') || (cycle.clutch?.outcomeComplete ? finalHatch : null);
  const sessions = actualSessions(cycle);
  const locks = observedLocks(cycle);
  const firstPairing = cycle.startDate || sessions[0]?.introductionDate || null;
  const lastPairingBeforeOvulation = ovulation
    ? maxYmd(...sessions.filter((s) => compareYmd(s.introductionDate, ovulation) <= 0).map((s) => s.introductionDate))
    : null;
  const firstLockBeforeOvulation = ovulation
    ? (locks.filter((l) => compareYmd(l.observationDate, ovulation) <= 0)[0]?.observationDate || null)
    : null;

  const intervals = {
    firstPairingToOvulation: interval(firstPairing, ovulation),
    lastPairingBeforeOvulationToOvulation: interval(lastPairingBeforeOvulation, ovulation),
    firstLockBeforeOvulationToOvulation: interval(firstLockBeforeOvulation, ovulation),
    ovulationToPreLayShed: interval(ovulation, shed),
    preLayShedToLaying: interval(shed, laying),
    firstPairingToLaying: interval(firstPairing, laying),
    layingToFirstHatch: interval(laying, firstHatch),
    layingToFinalHatch: interval(laying, finalHatch),
    firstPairingToHatchingComplete: interval(firstPairing, hatchingComplete),
  };

  const males = cycle.males.map((male) => {
    const maleSessions = actualSessions(cycle, { maleId: male.maleId });
    const maleLocks = observedLocks(cycle, { maleId: male.maleId });
    const lastBeforeOvulation = ovulation
      ? maxYmd(...maleSessions.filter((s) => compareYmd(s.introductionDate, ovulation) <= 0).map((s) => s.introductionDate))
      : null;
    return {
      maleId: male.maleId,
      state: male.state,
      sessionCount: maleSessions.length,
      lockCount: maleLocks.length,
      introductionDates: maleSessions.map((s) => s.introductionDate),
      sessions: maleSessions,
      lockDates: maleLocks.map((l) => l.observationDate),
      frequency: pairingFrequency(maleSessions),
      // Timing only. It implies neither causation nor paternity.
      lastPairingToOvulation: interval(lastBeforeOvulation, ovulation),
    };
  });

  const cycleExams = examsForCycle(exams, cycle);
  const curve = cycleExams.filter((e) => isOnFollicleCurve(e));
  const firstMeasurement = curve[0] ? { valueMm: curve[0].largestDiameterMm, date: curve[0].date } : null;
  const latest = latestMeasurement(cycleExams);
  const trend = curve.length >= 2 ? comparableChange(curve[0], curve[curve.length - 1]) : null;

  const noClutch = cycle.status === CYCLE_STATUS.CLOSED && cycle.closure && ['no_clutch', 'cancelled', 'failed_clutch', 'other'].includes(cycle.closure.outcome) && !laying;

  return {
    cycleId: cycle.id,
    seasonLabel: cycle.seasonLabel,
    status: cycle.status,
    startDate: firstPairing,
    closure: cycle.closure,
    biologicalCompletionDate: hatchingComplete,
    administrativeClosedAt: cycle.closure?.closedAt || null,
    sessionCount: sessions.length,
    lockCount: locks.length,
    lockDates: locks.map((l) => l.observationDate),
    frequency: pairingFrequency(sessions),
    males,
    milestones: { ovulation, preLayShed: shed, eggLaying: laying, firstHatch, finalHatch, hatchingComplete },
    intervals,
    clutch: {
      eggsTotal: cycle.clutch?.eggsTotal ?? null,
      fertileEggs: cycle.clutch?.fertileEggs ?? null,
      slugs: cycle.clutch?.slugs ?? null,
      hatchlingsRecorded: cycle.clutch?.hatchlingsRecorded ?? null,
      lostEggs: cycle.clutch?.lostEggs ?? null,
      laid: !!laying || cycle.clutch?.eggsTotal !== null && cycle.clutch?.eggsTotal !== undefined,
      noClutch: !!noClutch,
    },
    follicles: { firstMeasurement, latestMeasurement: latest, trend, examCount: cycleExams.length },
    invalidChronology: Object.entries(intervals).filter(([, v]) => v.status === 'invalid_chronology').map(([k]) => k),
  };
}

function statistic(values) {
  const list = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!list.length) return { n: 0, median: null, min: null, max: null, label: 'none' };
  return {
    n: list.length,
    median: Math.round(median(list) * 10) / 10,
    min: Math.min(...list),
    max: Math.max(...list),
    label: list.length === 1 ? 'one_prior' : 'typical',
  };
}

/**
 * Across-cycle statistics for a female. The current (incomplete) cycle is excluded by passing
 * its id. Clutch-size statistics use laid clutches only; no-clutch cycles are counted separately.
 */
export function femaleStatistics(cycles = [], exams = [], { excludeCycleId = null } = {}) {
  const usable = (Array.isArray(cycles) ? cycles : []).filter((c) => c && !c.deletedAt && c.id !== excludeCycleId);
  const summaries = usable.map((c) => summarizeCycle(c, exams));
  const metrics = {};
  INTERVAL_METRICS.forEach((key) => {
    metrics[key] = statistic(summaries.map((s) => (s.intervals[key].status === 'ok' ? s.intervals[key].value : null)));
  });
  const laidSummaries = summaries.filter((s) => s.clutch.laid && !s.clutch.noClutch);
  COUNT_METRICS.forEach((key) => {
    metrics[key] = statistic(laidSummaries.map((s) => s.clutch[key]));
  });
  metrics.locksPerCycle = statistic(summaries.filter((s) => s.sessionCount > 0).map((s) => s.lockCount));
  metrics.sessionsPerCycle = statistic(summaries.filter((s) => s.sessionCount > 0).map((s) => s.sessionCount));
  const noClutchCycles = summaries.filter((s) => s.clutch.noClutch).map((s) => s.cycleId);
  return {
    cycleCount: summaries.length,
    usableCycleIds: summaries.map((s) => s.cycleId),
    laidClutchCount: laidSummaries.length,
    noClutchCycles,
    metrics,
    hasHistory: summaries.length > 0,
  };
}

/**
 * Compare the current cycle with the female's history. "faster" / "slower" / "within range" is
 * only claimed when a completed interval exists on both sides; elapsed time without a completed
 * interval is reported as "elapsed" with the historical range for context.
 */
export function compareWithHistory(currentSummary, stats, { today = null } = {}) {
  const out = {};
  INTERVAL_METRICS.forEach((key) => {
    const stat = stats?.metrics?.[key];
    const current = currentSummary?.intervals?.[key];
    if (!stat || stat.n === 0) { out[key] = { verdict: 'no_history' }; return; }
    if (current?.status === 'ok') {
      const verdict = current.value < stat.min ? 'faster' : current.value > stat.max ? 'slower' : 'within_range';
      out[key] = { verdict, current: current.value, ...stat };
      return;
    }
    out[key] = { verdict: 'not_completed', ...stat };
  });
  if (today && currentSummary?.startDate && stats?.metrics?.firstPairingToOvulation?.n) {
    const elapsed = diffDays(currentSummary.startDate, today);
    const stat = stats.metrics.firstPairingToOvulation;
    if (elapsed !== null && !currentSummary.milestones.ovulation) {
      out.elapsedSinceFirstPairing = { days: elapsed, beyondHistoricalMax: elapsed > stat.max, ...stat };
    }
  }
  return out;
}
