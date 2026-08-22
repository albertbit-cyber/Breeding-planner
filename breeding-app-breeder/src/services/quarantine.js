// Quarantine records for animals.
//
// The status tag is the single source of truth for *membership*: an animal tagged "Quarantine" is
// in quarantine, full stop. That is deliberate -- breeders were already using the tag before this
// feature existed, so deriving membership from it means their existing records light up the
// quarantine section with no data migration, and the tag and the section can never disagree.
//
// This module owns everything a tag cannot express: when quarantine started, how long it is meant
// to run, what was observed, what was tested, and the audit trail. Nothing here blocks an action;
// quarantine is a record and a prompt, never a rule. Every default is a suggestion the breeder can
// overwrite, and the clearance checklist reports what is unmet without ever refusing to clear.

import { hashString } from './cloudSyncPayload';

export const QUARANTINE_TAG = 'Quarantine';

export const QUARANTINE_STATUS = {
  NONE: 'none',
  IN: 'in',
  CLEARED: 'cleared',
};

// Restored when an animal leaves quarantine and we have nothing better to fall back on. Matches
// the default initSnakeDraft uses, so a cleared animal looks like any other freshly added one.
const FALLBACK_STATUS = 'Active';

export const DEFAULT_PLANNED_DAYS = 90;
export const CHECK_INTERVAL_DAYS = 7;
export const FECAL_INTERVAL_DAYS = 28;

// Risk is not uniform, so the clock should not be either. An animal you hatched needs nothing; one
// that shared an expo table with fifty collections needs longer than one from a breeder whose room
// you have stood in. These are starting points -- every one is editable per animal.
export const QUARANTINE_SOURCES = [
  { key: 'own-collection', defaultDays: 0, risk: 'none' },
  { key: 'known-breeder', defaultDays: 90, risk: 'low' },
  { key: 'shop', defaultDays: 120, risk: 'medium' },
  { key: 'expo', defaultDays: 120, risk: 'medium' },
  { key: 'import', defaultDays: 180, risk: 'high' },
  { key: 'wild-caught', defaultDays: 180, risk: 'high' },
  { key: 'unknown', defaultDays: 120, risk: 'medium' },
];

const SOURCE_KEYS = new Set(QUARANTINE_SOURCES.map(entry => entry.key));

export function getQuarantineSource(key) {
  return QUARANTINE_SOURCES.find(entry => entry.key === key) || null;
}

export function getDefaultDaysForSource(key) {
  const source = getQuarantineSource(key);
  return source ? source.defaultDays : DEFAULT_PLANNED_DAYS;
}

// Observation vocabularies. The first value of each is the "nothing to report" answer, which is
// what the quick-check sheet preselects -- a check should cost one tap when all is well.
export const CHECK_FIELDS = [
  { key: 'mites', options: ['none', 'seen'] },
  { key: 'breathing', options: ['normal', 'noisy'] },
  { key: 'stool', options: ['normal', 'abnormal', 'none'] },
  { key: 'shed', options: ['none', 'in-shed', 'shed-clean', 'shed-stuck'] },
];

const CHECK_OK_VALUES = { mites: 'none', breathing: 'normal', stool: 'normal', shed: 'none' };
// "No stool" and "in shed" are normal states, not findings -- flagging them would cry wolf weekly.
const CHECK_NEUTRAL_VALUES = { stool: ['none'], shed: ['in-shed', 'shed-clean'] };

export const INTAKE_CHECK_KEYS = ['mites', 'eyes', 'breathing', 'condition', 'vent', 'skin'];
export const INTAKE_CHECK_VALUES = ['unchecked', 'pass', 'flag'];

export const TEST_RESULTS = ['pending', 'clear', 'positive', 'inconclusive'];

export function isQuarantineTag(value) {
  return String(value || '').trim().toLowerCase() === QUARANTINE_TAG.toLowerCase();
}

function textOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

// Dates are stored the way the rest of the app stores user-entered dates: plain YYYY-MM-DD, no
// timezone attached. A quarantine that started "on the 3rd" started on the 3rd everywhere.
export function normalizeQuarantineDate(value) {
  const text = textOrEmpty(value);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function todayYmd(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ymdToUtcMs(ymd) {
  const normalized = normalizeQuarantineDate(ymd);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  const ms = Date.UTC(year, month - 1, day);
  return Number.isFinite(ms) ? ms : null;
}

export function daysBetweenYmd(fromYmd, toYmd) {
  const from = ymdToUtcMs(fromYmd);
  const to = ymdToUtcMs(toYmd);
  if (from === null || to === null) return null;
  return Math.round((to - from) / 86400000);
}

export function addDaysToYmd(ymd, days) {
  const base = ymdToUtcMs(ymd);
  if (base === null) return null;
  const shifted = new Date(base + Number(days || 0) * 86400000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

// Ids are derived from the entry's own content, never random. sanitizeSnakeRecord runs on every
// merge, and a random id would mint a brand-new "distinct" copy of the same entry on every sync --
// the exact bug that turned 116 weight readings into 222,517 rows (see cloudSyncPayload).
function derivedId(prefix, parts) {
  const signature = parts
    .map(part => (part === undefined || part === null ? '' : String(part)))
    .join('|');
  return `${prefix}-${hashString(signature)}`;
}

function dedupeById(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

function byDateAscending(a, b) {
  return String(a.date || '').localeCompare(String(b.date || ''));
}

// --- normalization -------------------------------------------------------------------------

function normalizeHistoryEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const to = textOrEmpty(raw.to);
  if (!to) return null;
  const entry = {
    from: textOrEmpty(raw.from) || QUARANTINE_STATUS.NONE,
    to,
    date: normalizeQuarantineDate(raw.date),
    note: textOrEmpty(raw.note),
  };
  return { id: textOrEmpty(raw.id) || derivedId('quarantine', [entry.from, entry.to, entry.date, entry.note]), ...entry };
}

function normalizeCheckEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const date = normalizeQuarantineDate(raw.date);
  if (!date) return null;
  const entry = { date, weightGrams: positiveNumberOrNull(raw.weightGrams ?? raw.grams ?? raw.weight), notes: textOrEmpty(raw.notes) };
  CHECK_FIELDS.forEach(field => {
    const value = textOrEmpty(raw[field.key]);
    entry[field.key] = field.options.includes(value) ? value : field.options[0];
  });
  const signature = [date, entry.weightGrams, ...CHECK_FIELDS.map(field => entry[field.key]), entry.notes];
  return { id: textOrEmpty(raw.id) || derivedId('qcheck', signature), ...entry };
}

function normalizeTestEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const date = normalizeQuarantineDate(raw.date);
  const kind = textOrEmpty(raw.kind);
  if (!date || !kind) return null;
  const result = TEST_RESULTS.includes(textOrEmpty(raw.result)) ? textOrEmpty(raw.result) : 'pending';
  const entry = {
    date,
    kind,
    result,
    resultDate: normalizeQuarantineDate(raw.resultDate),
    lab: textOrEmpty(raw.lab),
    notes: textOrEmpty(raw.notes),
  };
  return { id: textOrEmpty(raw.id) || derivedId('qtest', [date, kind, entry.lab]), ...entry };
}

function normalizeTreatmentEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const date = normalizeQuarantineDate(raw.date);
  const what = textOrEmpty(raw.what);
  if (!date || !what) return null;
  const entry = {
    date,
    what,
    dose: textOrEmpty(raw.dose),
    reason: textOrEmpty(raw.reason),
    notes: textOrEmpty(raw.notes),
  };
  return { id: textOrEmpty(raw.id) || derivedId('qtreat', [date, what, entry.dose, entry.reason]), ...entry };
}

function normalizeList(raw, normalizer) {
  if (!Array.isArray(raw)) return [];
  return dedupeById(raw.map(normalizer).filter(Boolean)).sort(byDateAscending);
}

function normalizeIntakeChecks(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const result = {};
  let hasAny = false;
  INTAKE_CHECK_KEYS.forEach(key => {
    const value = textOrEmpty(raw[key]);
    const resolved = INTAKE_CHECK_VALUES.includes(value) ? value : 'unchecked';
    result[key] = resolved;
    if (resolved !== 'unchecked') hasAny = true;
  });
  return hasAny ? result : null;
}

// Returns null for "nothing worth storing" so animals that never touched quarantine carry no
// extra bytes into the sync payload.
export function normalizeQuarantine(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const source = SOURCE_KEYS.has(textOrEmpty(raw.source)) ? textOrEmpty(raw.source) : '';
  const record = {
    startedAt: normalizeQuarantineDate(raw.startedAt),
    clearedAt: normalizeQuarantineDate(raw.clearedAt),
    plannedDays: positiveNumberOrNull(raw.plannedDays),
    source,
    sourceName: textOrEmpty(raw.sourceName),
    intakeWeight: positiveNumberOrNull(raw.intakeWeight),
    intakeChecks: normalizeIntakeChecks(raw.intakeChecks),
    notes: textOrEmpty(raw.notes),
    previousStatus: textOrEmpty(raw.previousStatus),
    checks: normalizeList(raw.checks, normalizeCheckEntry),
    tests: normalizeList(raw.tests, normalizeTestEntry),
    treatments: normalizeList(raw.treatments, normalizeTreatmentEntry),
    history: dedupeById((Array.isArray(raw.history) ? raw.history : []).map(normalizeHistoryEntry).filter(Boolean)),
  };
  const isEmpty = !record.startedAt
    && !record.clearedAt
    && !record.plannedDays
    && !record.source
    && !record.sourceName
    && !record.intakeWeight
    && !record.intakeChecks
    && !record.notes
    && !record.previousStatus
    && !record.checks.length
    && !record.tests.length
    && !record.treatments.length
    && !record.history.length;
  return isEmpty ? null : record;
}

function emptyRecord() {
  return {
    startedAt: null,
    clearedAt: null,
    plannedDays: null,
    source: '',
    sourceName: '',
    intakeWeight: null,
    intakeChecks: null,
    notes: '',
    previousStatus: '',
    checks: [],
    tests: [],
    treatments: [],
    history: [],
  };
}

function readRecord(snake) {
  return normalizeQuarantine(snake?.quarantine) || emptyRecord();
}

// --- status --------------------------------------------------------------------------------

// The three statuses are derived, never stored twice -- storing a copy alongside the tag would let
// the two drift apart, and then neither would be trustworthy.
export function getQuarantineStatus(snake) {
  if (isQuarantineTag(snake?.status)) return QUARANTINE_STATUS.IN;
  const record = normalizeQuarantine(snake?.quarantine);
  if (record && (record.clearedAt || record.startedAt)) return QUARANTINE_STATUS.CLEARED;
  return QUARANTINE_STATUS.NONE;
}

export function isInQuarantine(snake) {
  return getQuarantineStatus(snake) === QUARANTINE_STATUS.IN;
}

export function isClearedFromQuarantine(snake) {
  return getQuarantineStatus(snake) === QUARANTINE_STATUS.CLEARED;
}

export function getQuarantineStartDate(snake) { return readRecord(snake).startedAt; }
export function getQuarantineClearedDate(snake) { return readRecord(snake).clearedAt; }
export function getQuarantineNotes(snake) { return readRecord(snake).notes; }
export function getQuarantineHistory(snake) { return readRecord(snake).history; }
export function getQuarantineChecks(snake) { return readRecord(snake).checks; }
export function getQuarantineTests(snake) { return readRecord(snake).tests; }
export function getQuarantineTreatments(snake) { return readRecord(snake).treatments; }
export function getQuarantineRecord(snake) { return readRecord(snake); }

export function getPlannedDays(snake) {
  const record = readRecord(snake);
  if (record.plannedDays) return record.plannedDays;
  if (record.source) return getDefaultDaysForSource(record.source) || null;
  return null;
}

// Day 1 is the start date itself -- a breeder saying "day 3 of quarantine" means three calendar
// days including the day the animal arrived, not 72 hours. Returns null when no start date is
// recorded, which is normal for animals that carried the tag before this feature existed.
export function getQuarantineDays(snake, today = todayYmd()) {
  const record = readRecord(snake);
  if (!record.startedAt) return null;
  const endYmd = getQuarantineStatus(snake) === QUARANTINE_STATUS.IN
    ? today
    : (record.clearedAt || today);
  const diff = daysBetweenYmd(record.startedAt, endYmd);
  return diff === null ? null : diff + 1;
}

export function getQuarantineProgress(snake, today = todayYmd()) {
  const days = getQuarantineDays(snake, today);
  const planned = getPlannedDays(snake);
  if (days === null || !planned) return null;
  return {
    days,
    planned,
    ratio: Math.max(0, Math.min(1, days / planned)),
    remaining: planned - days,
    dueDate: addDaysToYmd(getQuarantineStartDate(snake), planned - 1),
  };
}

// --- derived prompts -----------------------------------------------------------------------

function latestByDate(entries) {
  return entries.length ? entries[entries.length - 1] : null;
}

/**
 * What this animal is waiting on. One item, because a card that lists four things prompts nothing.
 * Ordered by urgency: an outstanding result beats a due fecal beats a due weekly check.
 */
export function getNextQuarantineAction(snake, today = todayYmd()) {
  if (!isInQuarantine(snake)) return null;
  const record = readRecord(snake);

  const pending = record.tests.filter(test => test.result === 'pending');
  if (pending.length) {
    return { kind: 'awaiting-results', count: pending.length, date: latestByDate(pending).date };
  }

  const fecals = record.tests.filter(test => test.result !== 'pending');
  const lastFecal = latestByDate(fecals);
  const fecalDue = lastFecal ? addDaysToYmd(lastFecal.date, FECAL_INTERVAL_DAYS) : addDaysToYmd(record.startedAt, 14);
  const fecalIn = fecalDue ? daysBetweenYmd(today, fecalDue) : null;

  const lastCheck = latestByDate(record.checks);
  const checkDue = lastCheck ? addDaysToYmd(lastCheck.date, CHECK_INTERVAL_DAYS) : record.startedAt;
  const checkIn = checkDue ? daysBetweenYmd(today, checkDue) : null;

  if (fecalIn !== null && fecalIn <= 0 && (checkIn === null || fecalIn <= checkIn)) {
    return { kind: 'fecal-due', dueDate: fecalDue, inDays: fecalIn };
  }
  if (checkIn !== null && checkIn <= 0) {
    return { kind: 'check-due', dueDate: checkDue, inDays: checkIn };
  }
  if (fecalIn !== null && fecalIn <= 7) {
    return { kind: 'fecal-soon', dueDate: fecalDue, inDays: fecalIn };
  }
  if (checkIn !== null) {
    return { kind: 'check-soon', dueDate: checkDue, inDays: checkIn };
  }
  return null;
}

/**
 * Findings that have not been answered by a later clean observation. A flag raised on 12 Aug and
 * followed by a clean check on 19 Aug is resolved; the breeder does not need to see it again.
 */
export function getOpenQuarantineFlags(snake) {
  const record = readRecord(snake);
  const flags = [];

  const lastCheck = latestByDate(record.checks);
  if (lastCheck) {
    CHECK_FIELDS.forEach(field => {
      const value = lastCheck[field.key];
      if (value === CHECK_OK_VALUES[field.key]) return;
      if ((CHECK_NEUTRAL_VALUES[field.key] || []).includes(value)) return;
      flags.push({ kind: 'check', field: field.key, value, date: lastCheck.date });
    });
  }

  record.tests
    .filter(test => test.result === 'positive')
    .forEach(test => flags.push({ kind: 'test', field: test.kind, value: 'positive', date: test.date }));

  return flags;
}

export function getWeightChangeSinceIntake(snake) {
  const record = readRecord(snake);
  const lastCheck = latestByDate(record.checks.filter(check => check.weightGrams));
  if (!record.intakeWeight || !lastCheck) return null;
  return { from: record.intakeWeight, to: lastCheck.weightGrams, delta: lastCheck.weightGrams - record.intakeWeight };
}

function hasAcceptedFeedSince(snake, sinceYmd) {
  const feeds = Array.isArray(snake?.logs?.feeds) ? snake.logs.feeds : [];
  return feeds.some(entry => {
    if (!entry || entry.refused) return false;
    const date = normalizeQuarantineDate(entry.date);
    return date && (!sinceYmd || date >= sinceYmd);
  });
}

/**
 * The six conventional gates before an animal joins the collection. This reports; it never blocks.
 * Every item carries its own explanation so the dialog can say *why* something is unmet rather
 * than showing a bare red cross.
 */
export function getClearanceChecklist(snake, today = todayYmd()) {
  const record = readRecord(snake);
  const items = [];

  const progress = getQuarantineProgress(snake, today);
  items.push({
    key: 'duration',
    met: progress ? progress.days >= progress.planned : false,
    detail: progress ? { days: progress.days, planned: progress.planned, remaining: progress.remaining } : null,
  });

  const clearTests = record.tests.filter(test => test.result === 'clear');
  items.push({ key: 'clean-test', met: clearTests.length > 0, detail: { date: latestByDate(clearTests)?.date || null } });

  const finalWindow = addDaysToYmd(today, -30);
  const recentClear = clearTests.filter(test => !finalWindow || test.date >= finalWindow);
  items.push({ key: 'final-test', met: recentClear.length > 0, detail: { date: latestByDate(recentClear)?.date || null } });

  const weight = getWeightChangeSinceIntake(snake);
  items.push({ key: 'weight', met: weight ? weight.delta >= 0 : false, detail: weight });

  items.push({ key: 'feeding', met: hasAcceptedFeedSince(snake, addDaysToYmd(today, -30)), detail: null });

  const lastTreatment = latestByDate(record.treatments);
  const mitesSeenAfterTreatment = record.checks.some(check => (
    check.mites === 'seen' && (!lastTreatment || check.date >= lastTreatment.date)
  ));
  items.push({ key: 'mites', met: !mitesSeenAfterTreatment, detail: { since: lastTreatment?.date || null } });

  return { items, metCount: items.filter(item => item.met).length, total: items.length };
}

// --- transitions ---------------------------------------------------------------------------

function appendHistory(history, entry) {
  const normalized = normalizeHistoryEntry(entry);
  if (!normalized) return history;
  if (history.some(item => item.id === normalized.id)) return history;
  return [...history, normalized];
}

/**
 * Move an animal between quarantine statuses, returning a new snake. Never mutates its input.
 *
 * `status` is a single tag, not a list, so putting an animal into quarantine necessarily replaces
 * whatever tag it had. That tag is parked in `previousStatus` and handed back on the way out --
 * otherwise an animal that was "Grow-out" would silently come back as something else.
 */
export function applyQuarantineStatus(snake, nextStatus, options = {}) {
  if (!snake || typeof snake !== 'object') return snake;
  const current = getQuarantineStatus(snake);
  const date = normalizeQuarantineDate(options.date) || options.today || todayYmd();
  const note = textOrEmpty(options.note);
  const record = readRecord(snake);

  if (nextStatus === QUARANTINE_STATUS.IN) {
    const previousStatus = current === QUARANTINE_STATUS.IN
      ? record.previousStatus
      : (textOrEmpty(snake.status) || record.previousStatus);
    const source = SOURCE_KEYS.has(options.source) ? options.source : record.source;
    const plannedDays = positiveNumberOrNull(options.plannedDays)
      || record.plannedDays
      || (source ? positiveNumberOrNull(getDefaultDaysForSource(source)) : null)
      || DEFAULT_PLANNED_DAYS;
    return {
      ...snake,
      status: QUARANTINE_TAG,
      quarantine: {
        ...record,
        source,
        sourceName: options.sourceName === undefined ? record.sourceName : textOrEmpty(options.sourceName),
        plannedDays,
        startedAt: record.startedAt && current === QUARANTINE_STATUS.IN ? record.startedAt : date,
        clearedAt: null,
        previousStatus: isQuarantineTag(previousStatus) ? '' : previousStatus,
        notes: options.notes === undefined ? record.notes : textOrEmpty(options.notes),
        history: current === QUARANTINE_STATUS.IN
          ? record.history
          : appendHistory(record.history, { from: current, to: QUARANTINE_STATUS.IN, date, note }),
      },
    };
  }

  if (nextStatus === QUARANTINE_STATUS.CLEARED) {
    const restored = textOrEmpty(record.previousStatus) || FALLBACK_STATUS;
    return {
      ...snake,
      status: isQuarantineTag(snake.status) ? restored : (textOrEmpty(snake.status) || restored),
      quarantine: {
        ...record,
        clearedAt: date,
        previousStatus: '',
        notes: options.notes === undefined ? record.notes : textOrEmpty(options.notes),
        history: current === QUARANTINE_STATUS.CLEARED
          ? record.history
          : appendHistory(record.history, { from: current, to: QUARANTINE_STATUS.CLEARED, date, note }),
      },
    };
  }

  // NONE wipes the record entirely: "this animal was never in quarantine" has to be reachable, or
  // a mistaken tag would leave a permanent scar on the animal's history.
  const restored = textOrEmpty(record.previousStatus) || FALLBACK_STATUS;
  return {
    ...snake,
    status: isQuarantineTag(snake.status) ? restored : (textOrEmpty(snake.status) || restored),
    quarantine: null,
  };
}

/**
 * Mites found, treated, clock back to zero -- you are now timing the treatment, not the settling
 * in. A tracker that only ever counts up is quietly lying to its user, so this is a first-class
 * action rather than something a breeder has to fake by editing the start date.
 */
export function restartQuarantineClock(snake, options = {}) {
  if (!snake || typeof snake !== 'object') return snake;
  const date = normalizeQuarantineDate(options.date) || options.today || todayYmd();
  const record = readRecord(snake);
  return {
    ...snake,
    status: QUARANTINE_TAG,
    quarantine: {
      ...record,
      startedAt: date,
      clearedAt: null,
      history: appendHistory(record.history, {
        from: QUARANTINE_STATUS.IN,
        to: 'restarted',
        date,
        note: textOrEmpty(options.reason),
      }),
    },
  };
}

export function extendQuarantine(snake, extraDays, options = {}) {
  if (!snake || typeof snake !== 'object') return snake;
  const days = positiveNumberOrNull(extraDays);
  if (!days) return snake;
  const record = readRecord(snake);
  const basePlanned = record.plannedDays || getDefaultDaysForSource(record.source) || DEFAULT_PLANNED_DAYS;
  const date = normalizeQuarantineDate(options.date) || options.today || todayYmd();
  return {
    ...snake,
    quarantine: {
      ...record,
      plannedDays: basePlanned + days,
      history: appendHistory(record.history, {
        from: QUARANTINE_STATUS.IN,
        to: 'extended',
        date,
        note: textOrEmpty(options.reason) || `+${days} days`,
      }),
    },
  };
}

export function updateQuarantineDetails(snake, patch = {}) {
  if (!snake || typeof snake !== 'object') return snake;
  if (getQuarantineStatus(snake) === QUARANTINE_STATUS.NONE) return snake;
  const record = readRecord(snake);
  const next = { ...record };
  if (patch.startedAt !== undefined) next.startedAt = patch.startedAt;
  if (patch.clearedAt !== undefined) next.clearedAt = patch.clearedAt;
  if (patch.notes !== undefined) next.notes = patch.notes;
  if (patch.plannedDays !== undefined) next.plannedDays = patch.plannedDays;
  if (patch.sourceName !== undefined) next.sourceName = patch.sourceName;
  if (patch.intakeWeight !== undefined) next.intakeWeight = patch.intakeWeight;
  if (patch.intakeChecks !== undefined) next.intakeChecks = patch.intakeChecks;
  if (patch.source !== undefined) {
    next.source = SOURCE_KEYS.has(patch.source) ? patch.source : '';
    // Changing the source re-suggests the duration, but only while the breeder is still on the
    // suggested value -- a hand-set 150 days must survive a correction to the source field.
    const wasSuggested = !record.plannedDays || record.plannedDays === getDefaultDaysForSource(record.source);
    if (wasSuggested && patch.plannedDays === undefined && next.source) {
      next.plannedDays = getDefaultDaysForSource(next.source) || null;
    }
  }
  return { ...snake, quarantine: normalizeQuarantine(next) };
}

function addLogEntry(snake, listKey, normalizer, raw) {
  if (!snake || typeof snake !== 'object') return snake;
  const entry = normalizer(raw);
  if (!entry) return snake;
  const record = readRecord(snake);
  const existing = record[listKey].filter(item => item.id !== entry.id);
  return {
    ...snake,
    quarantine: { ...record, [listKey]: [...existing, entry].sort(byDateAscending) },
  };
}

function removeLogEntry(snake, listKey, entryId) {
  if (!snake || typeof snake !== 'object' || !entryId) return snake;
  const record = readRecord(snake);
  return {
    ...snake,
    quarantine: { ...record, [listKey]: record[listKey].filter(item => item.id !== entryId) },
  };
}

export const addQuarantineCheck = (snake, raw) => addLogEntry(snake, 'checks', normalizeCheckEntry, raw);
export const removeQuarantineCheck = (snake, id) => removeLogEntry(snake, 'checks', id);
export const addQuarantineTest = (snake, raw) => addLogEntry(snake, 'tests', normalizeTestEntry, raw);
export const removeQuarantineTest = (snake, id) => removeLogEntry(snake, 'tests', id);
export const addQuarantineTreatment = (snake, raw) => addLogEntry(snake, 'treatments', normalizeTreatmentEntry, raw);
export const removeQuarantineTreatment = (snake, id) => removeLogEntry(snake, 'treatments', id);

/**
 * A pending test becomes a result. Keyed by id so the row is replaced rather than duplicated --
 * and because the id is content-derived from date+kind+lab, editing the result never orphans it.
 */
export function setQuarantineTestResult(snake, testId, result, options = {}) {
  if (!snake || typeof snake !== 'object' || !testId) return snake;
  const record = readRecord(snake);
  const resolved = TEST_RESULTS.includes(result) ? result : 'pending';
  return {
    ...snake,
    quarantine: {
      ...record,
      tests: record.tests.map(test => (test.id === testId
        ? {
          ...test,
          result: resolved,
          resultDate: resolved === 'pending' ? null : (normalizeQuarantineDate(options.date) || options.today || todayYmd()),
          notes: options.notes === undefined ? test.notes : textOrEmpty(options.notes),
        }
        : test)),
    },
  };
}

/**
 * Keep the record consistent with the tag after the tag was changed somewhere else -- the status
 * dropdown in the edit modal, the add wizard, an import. Called at save time only, never on load:
 * doing it on load would make every device write a different "today" into the same animal and
 * churn the sync.
 */
export function reconcileQuarantineWithStatus(snake, options = {}) {
  if (!snake || typeof snake !== 'object') return snake;
  const today = options.today || todayYmd();
  const record = normalizeQuarantine(snake.quarantine);
  const tagged = isQuarantineTag(snake.status);

  if (tagged) {
    if (record && record.startedAt && !record.clearedAt) return snake;
    const base = record || emptyRecord();
    return {
      ...snake,
      quarantine: {
        ...base,
        startedAt: base.startedAt && !base.clearedAt ? base.startedAt : today,
        clearedAt: null,
        plannedDays: base.plannedDays || DEFAULT_PLANNED_DAYS,
        history: appendHistory(base.history, {
          from: record && record.clearedAt ? QUARANTINE_STATUS.CLEARED : QUARANTINE_STATUS.NONE,
          to: QUARANTINE_STATUS.IN,
          date: today,
          note: '',
        }),
      },
    };
  }

  // Tag removed by hand while quarantine was open -- record it as cleared today rather than
  // leaving an animal that is neither in quarantine nor ever cleared.
  if (record && record.startedAt && !record.clearedAt) {
    return {
      ...snake,
      quarantine: {
        ...record,
        clearedAt: today,
        previousStatus: '',
        history: appendHistory(record.history, {
          from: QUARANTINE_STATUS.IN,
          to: QUARANTINE_STATUS.CLEARED,
          date: today,
          note: '',
        }),
      },
    };
  }

  return snake;
}

// --- collection-level ----------------------------------------------------------------------

export function countQuarantined(snakes = []) {
  return (Array.isArray(snakes) ? snakes : []).filter(isInQuarantine).length;
}

export function selectQuarantineAnimals(snakes = [], filter = QUARANTINE_STATUS.IN) {
  const list = Array.isArray(snakes) ? snakes : [];
  const matching = filter === 'all'
    ? list.filter(snake => getQuarantineStatus(snake) !== QUARANTINE_STATUS.NONE)
    : list.filter(snake => getQuarantineStatus(snake) === filter);
  // Longest-running first: the animal that has been shut away the longest is the one a breeder
  // most needs to be reminded about.
  return matching.slice().sort((a, b) => {
    const aStart = getQuarantineStartDate(a);
    const bStart = getQuarantineStartDate(b);
    if (aStart && bStart) return aStart.localeCompare(bStart);
    if (aStart) return -1;
    if (bStart) return 1;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
}

/** The four numbers that decide what a breeder does next. */
export function summarizeQuarantine(snakes = [], today = todayYmd()) {
  const inQuarantine = selectQuarantineAnimals(snakes, QUARANTINE_STATUS.IN);
  let checkDue = 0;
  let awaitingResults = 0;
  let flagged = 0;
  inQuarantine.forEach(snake => {
    const action = getNextQuarantineAction(snake, today);
    if (action?.kind === 'awaiting-results') awaitingResults += 1;
    else if (action && (action.kind === 'check-due' || action.kind === 'fecal-due')) checkDue += 1;
    if (getOpenQuarantineFlags(snake).length) flagged += 1;
  });
  return { inQuarantine: inQuarantine.length, checkDue, awaitingResults, flagged };
}

// Calendar events are derived, matching how the calendar already treats feeds, sheds and
// appointments -- there is no stored event row anywhere in this app.
export function deriveQuarantineEvents(snakes = []) {
  const events = [];
  (Array.isArray(snakes) ? snakes : []).forEach(snake => {
    const record = normalizeQuarantine(snake?.quarantine);
    if (!record) return;
    const snakeId = snake?.id || '';
    const snakeName = snake?.name || snakeId;
    const push = (kind, date) => {
      if (!date) return;
      events.push({ id: `quarantine-${kind}-${snakeId}-${date}`, kind, date, snakeId, snakeName });
    };
    push('start', record.startedAt);
    push('cleared', record.clearedAt);
    record.tests.forEach(test => {
      events.push({
        id: `quarantine-test-${snakeId}-${test.id}`,
        kind: 'test',
        date: test.date,
        snakeId,
        snakeName,
        detail: test.kind,
        result: test.result,
      });
    });
    // The due date is only meaningful while the animal is still inside.
    if (isInQuarantine(snake)) {
      const progress = getQuarantineProgress(snake);
      if (progress?.dueDate) push('due', progress.dueDate);
    }
  });
  return events.sort((a, b) => a.date.localeCompare(b.date));
}
