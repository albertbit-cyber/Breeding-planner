import { parseYmdParts } from './dates';

/**
 * Season labels.
 *
 * The app's existing convention is the calendar year of the pairing (`cycleYear`). A breeding
 * cycle runs into the following year, so the card shows "2026–27" style labels. The default is
 * derived from the start year only: it never assumes a September (or any other) boundary. The
 * label is editable; the record's identity never depends on it, and two cycles with the same
 * label stay distinct (they are told apart by start date).
 */
export function defaultSeasonLabel(startDate) {
  const parts = parseYmdParts(startDate);
  if (!parts) return '';
  const next = String(parts.year + 1).slice(-2);
  return `${parts.year}–${next}`;
}

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
