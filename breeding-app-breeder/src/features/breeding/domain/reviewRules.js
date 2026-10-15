/**
 * Configurable review rules and deterministic, history-based date windows.
 *
 * Nothing in here hard-codes a follicle size. A breeder-chosen range triggers a pairing REVIEW,
 * which is a prompt to look, not a fitness decision. Forecasts are windows derived from this
 * female's own completed intervals (preferred), then from the same-species collection history
 * the user can see, and only then from documented species references when one exists. Every
 * forecast names its source, sample count, anchor and the fact that the range is historical,
 * not a confidence interval. No forecast is produced when the evidence is insufficient.
 */
import { addDays, compareYmd, diffDays, todayYmd } from './dates';
import { CYCLE_STATUS, recordedEventDate } from './cycleModel';
import { femaleStatistics } from './history';
import { latestMeasurement, latestExam, latestChange } from './follicles';
import { normalizeSeasonSettings } from './season';

/** Minimum usable comparable cycles before a history-based window is called a forecast. */
export const DEFAULT_MIN_CYCLES_FOR_FORECAST = 3;

/**
 * Documented species references. Only the ball python has one here; anything else stays
 * unavailable rather than borrowing the ball python's numbers. The numbers are the ones the
 * existing backend prediction engine already used (reproductiveCycleService SPECIES_DEFAULTS),
 * kept so the two surfaces agree.
 */
export const SPECIES_REFERENCES = Object.freeze({
  'ball-python': Object.freeze({
    label: 'Ball python (keeper literature, typical ranges)',
    ovulationToPreLayShed: { min: 14, max: 25 },
    preLayShedToLaying: { min: 27, max: 35 },
    layingToFirstHatch: { min: 52, max: 62 },
  }),
});

export const DEFAULT_BREEDING_SETTINGS = Object.freeze({
  schemaVersion: 1,
  minCyclesForForecast: DEFAULT_MIN_CYCLES_FOR_FORECAST,
  bySpecies: {},
  byFemale: {},
});

const emptyRule = () => ({
  reviewRangeMinMm: null,
  reviewRangeMaxMm: null,
  scanReminderDays: null,
  pauseAutomaticReminders: false,
});

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function normalizeRule(raw = {}) {
  const rule = raw && typeof raw === 'object' ? raw : {};
  return {
    reviewRangeMinMm: numberOrNull(rule.reviewRangeMinMm),
    reviewRangeMaxMm: numberOrNull(rule.reviewRangeMaxMm),
    scanReminderDays: numberOrNull(rule.scanReminderDays) ? Math.round(numberOrNull(rule.scanReminderDays)) : null,
    pauseAutomaticReminders: !!rule.pauseAutomaticReminders,
  };
}

export function normalizeBreedingSettings(raw = {}) {
  const settings = raw && typeof raw === 'object' ? raw : {};
  const bySpecies = {};
  Object.entries(settings.bySpecies || {}).forEach(([key, rule]) => { if (key) bySpecies[key] = normalizeRule(rule); });
  const byFemale = {};
  Object.entries(settings.byFemale || {}).forEach(([key, rule]) => { if (key) byFemale[key] = normalizeRule(rule); });
  const min = Number(settings.minCyclesForForecast);
  return {
    schemaVersion: 1,
    minCyclesForForecast: Number.isFinite(min) && min >= 1 ? Math.round(min) : DEFAULT_MIN_CYCLES_FOR_FORECAST,
    bySpecies,
    byFemale,
    seasons: normalizeSeasonSettings(settings.seasons),
    updatedAt: settings.updatedAt || null,
  };
}

/** Individual override wins per field; otherwise the species rule; otherwise unset. */
export function resolveRule(settings, { speciesId, femaleId } = {}) {
  const normalized = normalizeBreedingSettings(settings);
  const species = normalized.bySpecies[speciesId] || emptyRule();
  const female = normalized.byFemale[femaleId] || emptyRule();
  const pick = (key) => (female[key] !== null && female[key] !== undefined && female[key] !== false ? female[key] : species[key]);
  return {
    reviewRangeMinMm: pick('reviewRangeMinMm'),
    reviewRangeMaxMm: pick('reviewRangeMaxMm'),
    scanReminderDays: pick('scanReminderDays'),
    pauseAutomaticReminders: !!(female.pauseAutomaticReminders || species.pauseAutomaticReminders),
    sources: {
      reviewRange: female.reviewRangeMinMm !== null || female.reviewRangeMaxMm !== null ? 'female' : (species.reviewRangeMinMm !== null || species.reviewRangeMaxMm !== null ? 'species' : 'none'),
      scanReminder: female.scanReminderDays !== null ? 'female' : (species.scanReminderDays !== null ? 'species' : 'none'),
    },
  };
}

/**
 * Review flags for a card. A single scan yields a measurement only; a trend needs at least two
 * comparable scans. Entering the configured range is a review prompt, nothing more.
 */
export function evaluateReview(cycle, exams = [], settings, { today = todayYmd(), speciesId = null, femaleId = null } = {}) {
  const rule = resolveRule(settings, { speciesId: speciesId || cycle?.speciesId, femaleId: femaleId || cycle?.femaleId });
  const flags = [];
  const latest = latestMeasurement(exams);
  const change = latestChange(exams);
  if (latest && !latest.isEstimate && (rule.reviewRangeMinMm !== null || rule.reviewRangeMaxMm !== null)) {
    const aboveMin = rule.reviewRangeMinMm === null || latest.valueMm >= rule.reviewRangeMinMm;
    const belowMax = rule.reviewRangeMaxMm === null || latest.valueMm <= rule.reviewRangeMaxMm;
    if (aboveMin && belowMax) {
      flags.push({ kind: 'pairing_review', valueMm: latest.valueMm, date: latest.date, range: [rule.reviewRangeMinMm, rule.reviewRangeMaxMm], source: rule.sources.reviewRange });
    }
  }
  if (change?.comparable && change.suggestReview) {
    flags.push({ kind: 'lower_measurement_review', deltaMm: change.deltaMm, days: change.days });
  }
  const last = latestExam(exams);
  if (!rule.pauseAutomaticReminders && cycle?.status !== CYCLE_STATUS.CLOSED) {
    if (last?.nextReviewDate && compareYmd(last.nextReviewDate, today) <= 0) {
      flags.push({ kind: 'scan_due', date: last.nextReviewDate, source: 'exam_next_review' });
    } else if (last?.date && rule.scanReminderDays !== null && !last.nextReviewDate) {
      const due = addDays(last.date, rule.scanReminderDays);
      if (compareYmd(due, today) <= 0) flags.push({ kind: 'scan_due', date: due, source: rule.sources.scanReminder });
    }
  }
  return { rule, flags, latest, change, trendAvailable: !!change?.comparable };
}

const COLLECTION_ANCHORS = [
  { key: 'ovulationToPreLayShed', anchor: 'ovulation', target: 'pre_lay_shed' },
  { key: 'preLayShedToLaying', anchor: 'pre_lay_shed', target: 'egg_laying' },
  { key: 'layingToFirstHatch', anchor: 'egg_laying', target: 'first_hatch' },
];

/**
 * Deterministic date windows for the next milestones of an active cycle.
 *
 * Source order: this female's completed cycles (n >= minCycles → "forecast"; 1..minCycles-1 →
 * "descriptive" and labelled as such), then the same-species collection cycles supplied by the
 * caller (only data the user may see), then the species reference if one is documented. A
 * window is `anchorDate + [min, max]` of the observed interval; it is a historical range.
 */
export function buildForecasts({ cycle, cycles = [], exams = [], collectionCycles = [], settings, speciesId = null, today = todayYmd() } = {}) {
  if (!cycle || cycle.status === CYCLE_STATUS.CLOSED) return { windows: [], reason: cycle ? 'cycle_closed' : 'no_cycle' };
  const normalized = normalizeBreedingSettings(settings);
  const minCycles = normalized.minCyclesForForecast;
  const femaleStats = femaleStatistics(cycles.filter((c) => c.femaleId === cycle.femaleId), exams, { excludeCycleId: cycle.id });
  const collectionStats = femaleStatistics(collectionCycles.filter((c) => c.femaleId !== cycle.femaleId && c.id !== cycle.id), [], {});
  const species = SPECIES_REFERENCES[speciesId || cycle.speciesId] || null;
  const windows = [];

  COLLECTION_ANCHORS.forEach(({ key, anchor, target }) => {
    if (cycle.reproductionMode === 'live_bearing' && target !== 'ovulation') return;
    const anchorDate = recordedEventDate(cycle, anchor);
    if (!anchorDate) return;
    if (recordedEventDate(cycle, target)) return; // Already happened: no projection.
    let stat = null;
    let source = null;
    let kind = null;
    if (femaleStats.metrics[key]?.n >= minCycles) { stat = femaleStats.metrics[key]; source = 'female_history'; kind = 'forecast'; }
    else if (femaleStats.metrics[key]?.n >= 1) { stat = femaleStats.metrics[key]; source = 'female_history'; kind = 'descriptive'; }
    else if (collectionStats.metrics[key]?.n >= minCycles) { stat = collectionStats.metrics[key]; source = 'collection_history'; kind = 'forecast'; }
    else if (species?.[key]) { stat = { n: null, min: species[key].min, max: species[key].max, median: null }; source = 'species_reference'; kind = 'reference'; }
    if (!stat) return;
    windows.push({
      metric: key,
      target,
      anchor,
      anchorDate,
      earliest: addDays(anchorDate, stat.min),
      latest: addDays(anchorDate, stat.max),
      typical: stat.median !== null && stat.median !== undefined ? addDays(anchorDate, Math.round(stat.median)) : null,
      source,
      kind,
      sampleCount: stat.n,
      ignoredCount: stat.ignored || 0,
      minDays: stat.min,
      maxDays: stat.max,
      typicalDays: stat.median !== null && stat.median !== undefined ? Math.round(stat.median) : null,
      rangeLabel: 'historical_range',
      overdue: compareYmd(addDays(anchorDate, stat.max), today) < 0,
      elapsedDays: diffDays(anchorDate, today),
    });
  });

  return { windows, minCycles, femaleCycleCount: femaleStats.cycleCount };
}
