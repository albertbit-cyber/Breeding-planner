/**
 * Follicle examinations.
 *
 * An examination belongs to the FEMALE. It may be associated with a cycle later (pre-pairing
 * scans are the normal case), and the association never changes its date or starts a cycle.
 *
 * The distinctions this module keeps apart, because the product rules say they must be:
 *  - "not visualized" is not "no follicles" and is not 0 mm;
 *  - a palpation value is an estimate; an external observation has no measured diameter at all;
 *  - largest diameter is not average diameter; a visible count is not a clutch size;
 *  - post-ovulation structures are not follicles and never join the follicle curve;
 *  - change and rate are computed only between comparable records (same method, same metric,
 *    at least one day apart), and a lower reading is a prompt to review, never a diagnosis.
 */
import { toYmd, toHm, diffDays, compareYmd, nowIso } from './dates';

export const EXAM_METHODS = Object.freeze(['ultrasound', 'palpation', 'external']);
export const EXAM_RESULTS = Object.freeze(['follicles_seen', 'not_visualized', 'inconclusive', 'post_ovulation']);
export const MEASUREMENT_AXES = Object.freeze(['largest_diameter', 'length', 'width', 'average_diameter', 'other']);
export const COUNT_CERTAINTY = Object.freeze(['exact', 'approximate', 'unknown']);
export const COVERAGE = Object.freeze(['complete', 'partial']);
export const IMAGE_QUALITY = Object.freeze(['good', 'fair', 'poor']);

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const asArray = (value) => (Array.isArray(value) ? value : []);
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

let counter = 0;
export function makeExamId(prefix = 'fx') {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function positiveOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function nonNegativeIntOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export function normalizeMeasurement(raw = {}) {
  const m = asObject(raw) || {};
  return {
    id: text(m.id) || makeExamId('fm'),
    valueMm: positiveOrNull(m.valueMm),
    axis: MEASUREMENT_AXES.includes(m.axis) ? m.axis : 'other',
    location: text(m.location),
    structureLabel: text(m.structureLabel),
    isEstimate: !!m.isEstimate,
  };
}

export function normalizeExam(raw = {}) {
  const exam = asObject(raw) || {};
  const method = EXAM_METHODS.includes(exam.method) ? exam.method : 'ultrasound';
  const result = EXAM_RESULTS.includes(exam.result) ? exam.result : 'inconclusive';
  const isEstimate = method === 'palpation';
  let largestDiameterMm = positiveOrNull(exam.largestDiameterMm);
  let measurements = asArray(exam.measurements).map(normalizeMeasurement).filter((m) => m.valueMm !== null);
  if (method === 'external') {
    // An external observation cannot produce a measured diameter. Any value is dropped here and
    // reported by validateExam so the form shows why.
    largestDiameterMm = null;
    measurements = [];
  }
  if (isEstimate) measurements = measurements.map((m) => ({ ...m, isEstimate: true }));
  return {
    id: text(exam.id) || makeExamId('fx'),
    schemaVersion: 1,
    femaleId: text(exam.femaleId) || null,
    cycleId: text(exam.cycleId) || null,
    date: toYmd(exam.date) || null,
    time: toHm(exam.time),
    method,
    result,
    largestDiameterMm,
    largestIsEstimate: isEstimate && largestDiameterMm !== null,
    measurements,
    visibleCount: nonNegativeIntOrNull(exam.visibleCount),
    countCertainty: COUNT_CERTAINTY.includes(exam.countCertainty) ? exam.countCertainty : 'unknown',
    coverage: COVERAGE.includes(exam.coverage) ? exam.coverage : 'complete',
    notes: text(exam.notes),
    attachments: asArray(exam.attachments).filter((a) => a && typeof a === 'object').map((a) => ({
      id: text(a.id) || makeExamId('fa'),
      kind: a.kind === 'video' ? 'video' : 'image',
      name: text(a.name),
      url: text(a.url) || null,
      note: text(a.note),
      addedAt: text(a.addedAt) || null,
    })),
    nextReviewDate: toYmd(exam.nextReviewDate) || null,
    operator: text(exam.operator),
    equipment: text(exam.equipment),
    imageQuality: IMAGE_QUALITY.includes(exam.imageQuality) ? exam.imageQuality : null,
    interpretationOverride: asObject(exam.interpretationOverride)
      ? { text: text(exam.interpretationOverride.text), reason: text(exam.interpretationOverride.reason), at: text(exam.interpretationOverride.at) || null }
      : null,
    createdAt: text(exam.createdAt) || null,
    updatedAt: text(exam.updatedAt) || null,
    deletedAt: text(exam.deletedAt) || null,
    metadata: asObject(exam.metadata) || undefined,
  };
}

/** Returns a list of error codes; an empty list means the exam can be saved. */
export function validateExam(raw = {}) {
  const errors = [];
  const exam = asObject(raw) || {};
  if (!text(exam.femaleId)) errors.push('female_required');
  if (!toYmd(exam.date)) errors.push('date_required');
  if (exam.method && !EXAM_METHODS.includes(exam.method)) errors.push('method_invalid');
  if (exam.result && !EXAM_RESULTS.includes(exam.result)) errors.push('result_invalid');
  if (exam.method === 'external' && (positiveOrNull(exam.largestDiameterMm) !== null || asArray(exam.measurements).some((m) => positiveOrNull(m?.valueMm) !== null))) {
    errors.push('external_cannot_measure');
  }
  if (exam.largestDiameterMm !== undefined && exam.largestDiameterMm !== null && exam.largestDiameterMm !== '' && positiveOrNull(exam.largestDiameterMm) === null) {
    errors.push('diameter_must_be_positive');
  }
  if (exam.visibleCount !== undefined && exam.visibleCount !== null && exam.visibleCount !== '' && nonNegativeIntOrNull(exam.visibleCount) === null) {
    errors.push('count_must_be_non_negative');
  }
  asArray(exam.measurements).forEach((m) => {
    if (m && m.valueMm !== '' && m.valueMm !== null && m.valueMm !== undefined && positiveOrNull(m.valueMm) === null) errors.push('measurement_must_be_positive');
  });
  if (exam.result === 'post_ovulation' && positiveOrNull(exam.largestDiameterMm) !== null && exam.method === 'ultrasound') {
    // Allowed to record a structure size, but it is never a follicle measurement. The form warns.
  }
  return Array.from(new Set(errors));
}

export function createExam(input, { now = nowIso() } = {}) {
  const errors = validateExam(input);
  if (errors.length) {
    const error = new Error('Examination is not valid.');
    error.codes = errors;
    throw error;
  }
  return normalizeExam({ ...input, id: input.id || undefined, createdAt: input.createdAt || now, updatedAt: now });
}

export function updateExam(exam, patch, { now = nowIso() } = {}) {
  const merged = { ...exam, ...patch, id: exam.id, femaleId: exam.femaleId, createdAt: exam.createdAt, updatedAt: now };
  const errors = validateExam(merged);
  if (errors.length) {
    const error = new Error('Examination is not valid.');
    error.codes = errors;
    throw error;
  }
  return normalizeExam(merged);
}

export function setInterpretationOverride(exam, { text: note, reason }, { now = nowIso() } = {}) {
  if (!text(reason)) throw new Error('Give a reason for overriding the interpretation.');
  return normalizeExam({ ...exam, interpretationOverride: { text: note, reason, at: now }, updatedAt: now });
}

export function examsForFemale(exams = [], femaleId) {
  const id = text(femaleId);
  return asArray(exams).filter((e) => e && !e.deletedAt && e.femaleId === id).sort((a, b) => compareYmd(a.date, b.date));
}

export function examsForCycle(exams = [], cycle) {
  if (!cycle) return [];
  return asArray(exams).filter((e) => e && !e.deletedAt && e.cycleId === cycle.id).sort((a, b) => compareYmd(a.date, b.date));
}

/** True when the exam carries a measured (not estimated) follicular diameter. */
export function hasMeasuredFollicleDiameter(exam) {
  return !!exam && exam.method === 'ultrasound' && exam.result === 'follicles_seen' && exam.largestDiameterMm !== null;
}

/** The default chart series: largest measured ultrasound follicular diameter. */
export function isOnFollicleCurve(exam, { method = 'ultrasound' } = {}) {
  if (!exam || exam.deletedAt) return false;
  if (exam.result === 'post_ovulation') return false;
  if (exam.method !== method) return false;
  return exam.largestDiameterMm !== null;
}

export function latestMeasurement(exams = [], { method = 'ultrasound' } = {}) {
  const list = asArray(exams).filter((e) => isOnFollicleCurve(e, { method })).sort((a, b) => compareYmd(a.date, b.date));
  const exam = list[list.length - 1] || null;
  if (!exam) return null;
  return { valueMm: exam.largestDiameterMm, date: exam.date, isEstimate: exam.largestIsEstimate, examId: exam.id, method: exam.method };
}

export function latestExam(exams = []) {
  const list = asArray(exams).filter((e) => e && !e.deletedAt && e.date).sort((a, b) => compareYmd(a.date, b.date));
  return list[list.length - 1] || null;
}

/**
 * Measured change between two comparable records: same method, both on the follicle curve, at
 * least one day apart. Returns null for anything else (no rate for a zero-day interval, no
 * mixing of palpation and ultrasound, no egg measurements).
 */
export function comparableChange(previous, next) {
  if (!previous || !next) return null;
  if (previous.method !== next.method) return { comparable: false, reason: 'different_method' };
  if (!isOnFollicleCurve(previous, { method: previous.method }) || !isOnFollicleCurve(next, { method: next.method })) {
    return { comparable: false, reason: 'not_on_curve' };
  }
  const days = diffDays(previous.date, next.date);
  if (days === null) return { comparable: false, reason: 'missing_date' };
  if (days === 0) return { comparable: false, reason: 'zero_day_interval' };
  if (days < 0) return comparableChange(next, previous);
  const deltaMm = Math.round((next.largestDiameterMm - previous.largestDiameterMm) * 100) / 100;
  const ratePerDay = Math.round((deltaMm / days) * 1000) / 1000;
  return {
    comparable: true,
    deltaMm,
    days,
    ratePerDay,
    isEstimate: !!(previous.largestIsEstimate || next.largestIsEstimate),
    // Recorded fact: lower than before. Interpretation (regression, stasis) is the keeper's call.
    direction: deltaMm > 0 ? 'higher' : deltaMm < 0 ? 'lower' : 'unchanged',
    suggestReview: deltaMm < 0,
  };
}

/** The change from the previous comparable record to the latest one, if any. */
export function latestChange(exams = [], { method = 'ultrasound' } = {}) {
  const list = asArray(exams).filter((e) => isOnFollicleCurve(e, { method })).sort((a, b) => compareYmd(a.date, b.date));
  if (list.length < 2) return null;
  return comparableChange(list[list.length - 2], list[list.length - 1]);
}

/** Series for the chart and its table, one entry per record, grouped by method. */
export function buildFollicleSeries(exams = []) {
  const groups = { ultrasound: [], palpation: [] };
  asArray(exams)
    .filter((e) => e && !e.deletedAt && e.date)
    .sort((a, b) => compareYmd(a.date, b.date))
    .forEach((exam) => {
      if (exam.result === 'post_ovulation' || exam.method === 'external') return;
      if (exam.largestDiameterMm === null) return;
      groups[exam.method]?.push({ examId: exam.id, date: exam.date, valueMm: exam.largestDiameterMm, isEstimate: exam.largestIsEstimate, result: exam.result });
    });
  const nonNumeric = asArray(exams)
    .filter((e) => e && !e.deletedAt && e.date && (e.largestDiameterMm === null || e.result === 'post_ovulation' || e.method === 'external'))
    .sort((a, b) => compareYmd(a.date, b.date))
    .map((e) => ({ examId: e.id, date: e.date, method: e.method, result: e.result }));
  return { ultrasound: groups.ultrasound, palpation: groups.palpation, nonNumeric };
}

/**
 * Associate unassigned exams of a female with a cycle. Pre-pairing scans count: anything after
 * the previous closed cycle (or ever, for a first cycle) up to the cycle's end. Dates are kept.
 */
export function associateExamsWithCycle(exams = [], cycle, { previousCycleEnd = null, now = nowIso() } = {}) {
  if (!cycle) return { exams: asArray(exams), associated: [] };
  const end = cycle.status === 'closed' ? (cycle.closure?.biologicalCompletionDate || toYmd(cycle.closure?.closedAt)) : null;
  const associated = [];
  const next = asArray(exams).map((exam) => {
    if (!exam || exam.deletedAt || exam.femaleId !== cycle.femaleId || exam.cycleId) return exam;
    if (previousCycleEnd && compareYmd(exam.date, previousCycleEnd) <= 0) return exam;
    if (end && compareYmd(exam.date, end) > 0) return exam;
    associated.push(exam.id);
    return { ...exam, cycleId: cycle.id, updatedAt: now, metadata: { ...(exam.metadata || {}), updatedAt: now } };
  });
  return { exams: next, associated };
}

/** Relative days from the first actual pairing; negative for pre-pairing scans. Null without a start. */
export function relativeDay(exam, cycle) {
  if (!exam?.date || !cycle?.startDate) return null;
  return diffDays(cycle.startDate, exam.date);
}
