import { parseYmdParts, toYmd, compareYmd, maxYmd, minYmd, todayYmd } from './dates';

/**
 * Breeding seasons.
 *
 * A season runs from the first pairing to the last hatching. A cycle belongs to the season its
 * first pairing falls in, and keeps it for good: reopening a closed cycle never moves it into
 * the current season.
 *
 * By default a new season starts on 1 September, so a pairing on 2026-10-14 is "2026–27" and one
 * on 2026-01-20 is "2025–26". A breeder on a different timeline presses "Start new season": that
 * records a manual start for the next season's label, which replaces the calendar boundary for
 * that label only. The label is the season's identity; the start date only decides which label
 * a first pairing date falls under.
 *
 * A season ends by itself once its last event is done: every one of its cycles is closed, which
 * for a productive cycle means the clutch hatched and the hatchlings were registered.
 */

export const DEFAULT_SEASON_START = Object.freeze({ month: 9, day: 1 });

const pad = (n) => String(n).padStart(2, '0');

export function seasonLabelFromYear(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return '';
  return `${y}–${String(y + 1).slice(-2)}`;
}

/** The first year named by a label ("2026–27" → 2026, "2026" → 2026), or null. */
export function seasonStartYear(label) {
  const match = /(\d{4})/.exec(String(label || ''));
  return match ? Number(match[1]) : null;
}

export function normalizeSeasonLabel(value) {
  const text = String(value ?? '').trim().replace(/\s*[-–—]\s*/, '–');
  return text.slice(0, 40);
}

export function nextSeasonLabel(label) {
  const year = seasonStartYear(label);
  return year === null ? '' : seasonLabelFromYear(year + 1);
}

export function normalizeSeasonSettings(raw = {}) {
  const settings = raw && typeof raw === 'object' ? raw : {};
  const month = Number(settings.startMonth);
  const day = Number(settings.startDay);
  const startMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : DEFAULT_SEASON_START.month;
  const maxDay = new Date(2001, startMonth, 0).getDate();
  const startDay = Number.isInteger(day) && day >= 1 && day <= maxDay ? day : Math.min(DEFAULT_SEASON_START.day, maxDay);
  const seen = new Set();
  const manualStarts = (Array.isArray(settings.manualStarts) ? settings.manualStarts : [])
    .map((entry) => ({
      label: normalizeSeasonLabel(entry?.label),
      startDate: toYmd(entry?.startDate),
      createdAt: entry?.createdAt ? String(entry.createdAt) : null,
      reason: entry?.reason ? String(entry.reason) : 'manual',
    }))
    .filter((entry) => entry.label && entry.startDate && seasonStartYear(entry.label) !== null)
    .sort((a, b) => compareYmd(b.startDate, a.startDate))
    .filter((entry) => (seen.has(entry.label) ? false : (seen.add(entry.label), true)))
    .sort((a, b) => compareYmd(a.startDate, b.startDate));
  return {
    startMonth,
    startDay,
    manualStarts,
    initializedAt: settings.initializedAt ? String(settings.initializedAt) : null,
  };
}

/** When the season with this label starts: its manual start if one was recorded, otherwise the calendar boundary. */
export function seasonStartDate(label, seasonSettings) {
  const settings = normalizeSeasonSettings(seasonSettings);
  const normalized = normalizeSeasonLabel(label);
  const manual = settings.manualStarts.find((entry) => entry.label === normalized);
  if (manual) return manual.startDate;
  const year = seasonStartYear(normalized);
  if (year === null) return null;
  return `${year}-${pad(settings.startMonth)}-${pad(settings.startDay)}`;
}

/** The season a cycle whose first pairing was on `date` belongs to. */
export function resolveSeasonLabel(date, seasonSettings) {
  const parts = parseYmdParts(date);
  if (!parts) return '';
  const ymd = toYmd(date);
  const settings = normalizeSeasonSettings(seasonSettings);
  const candidates = new Set();
  for (let y = parts.year - 2; y <= parts.year + 1; y += 1) candidates.add(seasonLabelFromYear(y));
  settings.manualStarts.forEach((entry) => candidates.add(entry.label));
  let best = null;
  candidates.forEach((label) => {
    const start = seasonStartDate(label, settings);
    if (!start || compareYmd(start, ymd) > 0) return;
    if (!best || compareYmd(start, best.start) > 0 || (start === best.start && seasonStartYear(label) > seasonStartYear(best.label))) {
      best = { label, start };
    }
  });
  return best ? best.label : seasonLabelFromYear(parts.year - 1);
}

/** Default label for a start date under the calendar rule (1 September unless configured). */
export function defaultSeasonLabel(startDate, seasonSettings = null) {
  return resolveSeasonLabel(startDate, seasonSettings);
}

export function currentSeasonLabel(seasonSettings, today = todayYmd()) {
  return resolveSeasonLabel(today, seasonSettings);
}

/**
 * "Start new season": the season after the current one begins today. Pressing it twice on the
 * same day does nothing the second time.
 */
export function startNewSeason(seasonSettings, { today = todayYmd(), now = new Date().toISOString() } = {}) {
  const settings = normalizeSeasonSettings(seasonSettings);
  const current = currentSeasonLabel(settings, today);
  if (seasonStartDate(current, settings) === today) return { settings, label: current, changed: false };
  const label = nextSeasonLabel(current);
  const manualStarts = [...settings.manualStarts.filter((entry) => entry.label !== label), { label, startDate: today, createdAt: now, reason: 'manual' }];
  return { settings: normalizeSeasonSettings({ ...settings, manualStarts }), label, changed: true };
}

/**
 * The first time seasons are switched on, cycles that are already running stay in the season
 * they were running in. When an open cycle started after the calendar boundary of today's
 * season, the calendar rule would move it into the new season; instead the new season is
 * recorded as starting today, so only pairings from now on belong to it.
 */
export function initializeSeasonSettings(seasonSettings, cycles = [], { today = todayYmd(), now = new Date().toISOString() } = {}) {
  const settings = normalizeSeasonSettings(seasonSettings);
  if (settings.initializedAt) return { settings, changed: false };
  const current = currentSeasonLabel(settings, today);
  const boundary = seasonStartDate(current, settings);
  const runningSinceBoundary = (Array.isArray(cycles) ? cycles : []).some((cycle) => (
    cycle && !cycle.deletedAt && cycle.status !== 'closed' && cycle.startDate
    && compareYmd(cycle.startDate, boundary) >= 0 && compareYmd(cycle.startDate, today) < 0
  ));
  const manual = settings.manualStarts.some((entry) => entry.label === current);
  const manualStarts = runningSinceBoundary && !manual
    ? [...settings.manualStarts, { label: current, startDate: today, createdAt: now, reason: 'running_cycles_kept' }]
    : settings.manualStarts;
  return { settings: normalizeSeasonSettings({ ...settings, manualStarts, initializedAt: now }), changed: true };
}

/**
 * Cards mapped from legacy records before seasons existed were stamped "manual" when the record
 * carried a bare year. That year was the calendar year of the pairing, not a keeper's choice.
 */
function isLegacyYearLabel(cycle) {
  const token = String(cycle?.legacy?.seasonToken ?? '');
  return /^\d{4}$/.test(token) && cycle.seasonLabel === seasonLabelFromYear(Number(token));
}

/** Cycles whose automatic label no longer matches the season rule. Manual labels are never touched. */
export function cyclesNeedingSeasonLabel(cycles = [], seasonSettings) {
  const out = [];
  (Array.isArray(cycles) ? cycles : []).forEach((cycle) => {
    if (!cycle || cycle.deletedAt || !cycle.startDate) return;
    if (cycle.seasonLabelSource === 'manual' && !isLegacyYearLabel(cycle)) return;
    const label = resolveSeasonLabel(cycle.startDate, seasonSettings);
    if (label && label !== cycle.seasonLabel) out.push({ id: cycle.id, label });
  });
  return out;
}

function cycleEndDate(cycle) {
  return toYmd(cycle?.closure?.biologicalCompletionDate)
    || toYmd(cycle?.clutch?.finalHatchDate)
    || toYmd(cycle?.closure?.closedAt)
    || null;
}

/**
 * One row per season, newest first. A season with no open cycle has ended; its end date is the
 * latest completion among its cycles.
 */
export function summarizeSeasons(cycles = [], seasonSettings, { today = todayYmd() } = {}) {
  const current = currentSeasonLabel(seasonSettings, today);
  const bySeason = new Map();
  (Array.isArray(cycles) ? cycles : []).forEach((cycle) => {
    if (!cycle || cycle.deletedAt) return;
    const label = cycle.seasonLabel || resolveSeasonLabel(cycle.startDate, seasonSettings) || '';
    if (!label) return;
    const row = bySeason.get(label) || { label, cycles: [], open: 0, closed: 0, incubating: 0, firstPairing: null, endedOn: null };
    row.cycles.push(cycle);
    if (cycle.status === 'closed') row.closed += 1;
    else row.open += 1;
    row.firstPairing = minYmd(row.firstPairing, cycle.startDate);
    bySeason.set(label, row);
  });
  if (!bySeason.has(current)) {
    bySeason.set(current, { label: current, cycles: [], open: 0, closed: 0, incubating: 0, firstPairing: null, endedOn: null });
  }
  const rows = Array.from(bySeason.values()).map((row) => {
    const isCurrent = row.label === current;
    const ended = !isCurrent && row.open === 0 && row.cycles.length > 0;
    return {
      ...row,
      isCurrent,
      ended,
      endedOn: ended ? maxYmd(...row.cycles.map(cycleEndDate)) : null,
      startsOn: seasonStartDate(row.label, seasonSettings),
    };
  });
  return rows.sort((a, b) => (seasonStartYear(b.label) ?? -Infinity) - (seasonStartYear(a.label) ?? -Infinity) || b.label.localeCompare(a.label));
}
