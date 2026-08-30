/**
 * The animal list rendered as plain text, for pasting into a message.
 *
 * A keeper sending availability to a buyer does not want a PDF -- they want three lines they can
 * drop into WhatsApp. So this is the catalog's data with the catalog's presentation removed:
 * sex as the 1.0/0.1 notation the hobby actually uses, the genetics as logged, and the price.
 *
 * Kept free of React and of App.jsx's helpers so the formatting can be tested on its own. The
 * caller resolves each animal's genetics first (the catalog's `resolveCatalogMorph` does this),
 * because that resolution reaches into morph/het normalisation that has no business here.
 */

import { normalizeSexValue } from './animalSex';

/** Fallback heading for animals whose birth year cannot be read. Callers pass a translated one. */
export const UNKNOWN_YEAR_LABEL = 'Year not recorded';

const DEFAULT_CURRENCY = 'EUR';

/** Currencies a keeper is realistically pricing in, written the way they'd write them by hand. */
const CURRENCY_SYMBOLS = {
  EUR: '€',
  USD: '$',
  GBP: '£',
};

/**
 * Males first, then females, then anything not sexed yet. Buyers scan for the sex code, so the
 * codes should not interleave.
 */
const SEX_ORDER = { M: 0, F: 1 };

export function formatSexCode(rawSex) {
  const normalized = normalizeSexValue(rawSex);
  if (normalized === 'M') return '1.0';
  if (normalized === 'F') return '0.1';
  return '0.0.1';
}

/**
 * The birth year as a number, preferring the explicit `year` field and falling back to the date.
 * Returns null when neither is readable -- the caller groups those separately rather than
 * guessing a year onto an animal.
 */
export function resolveBirthYear(animal) {
  const explicit = Number(animal?.year);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const match = String(animal?.birthDate ?? '').trim().match(/^(\d{4})/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The price with its currency, or an empty string when no price is recorded. An animal without a
 * price still belongs on the list -- the keeper fills that in by hand -- so this never throws it
 * away, it just leaves the segment off.
 */
export function formatPrice(animal) {
  const raw = animal?.price;
  if (raw === null || typeof raw === 'undefined') return '';
  const text = String(raw).trim();
  if (!text) return '';

  const code = String(animal?.currency || '').trim().toUpperCase() || DEFAULT_CURRENCY;
  const symbol = CURRENCY_SYMBOLS[code];

  // A price typed as "450 EUR" or "ask" already says what it means. Appending a currency to it
  // gives "450 EUR €", so anything that is not a bare number is left exactly as written.
  const numeric = Number(text.replace(/[\s,]/g, ''));
  if (!Number.isFinite(numeric)) return text;

  return symbol ? `${text} ${symbol}` : `${text} ${code}`;
}

/** One animal as its line, without the trailing newline. */
export function formatAnimalLine(animal) {
  const sex = formatSexCode(animal?.sex);
  const genetics = String(animal?.genetics ?? '').trim() || '—';
  const price = formatPrice(animal);
  return price ? `${sex}  ${genetics} — ${price}` : `${sex}  ${genetics}`;
}

/**
 * The whole selection as one block of text, sectioned by birth year.
 *
 * Years run newest first, because the current season is what a buyer is being offered. Animals
 * with no readable year go last under a heading the caller can translate, rather than being
 * dropped -- a missing birth date is a data gap, and silently shortening the list would hide it.
 */
export function buildAnimalTextList(animals = [], { unknownYearLabel = UNKNOWN_YEAR_LABEL } = {}) {
  const rows = (Array.isArray(animals) ? animals : []).filter(Boolean);
  if (!rows.length) return '';

  const byYear = new Map();
  rows.forEach(animal => {
    const year = resolveBirthYear(animal);
    const key = year === null ? unknownYearLabel : year;
    if (!byYear.has(key)) byYear.set(key, []);
    byYear.get(key).push(animal);
  });

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const years = [...byYear.keys()]
    .filter(key => key !== unknownYearLabel)
    .sort((a, b) => b - a);
  if (byYear.has(unknownYearLabel)) years.push(unknownYearLabel);

  return years
    .map(year => {
      const lines = byYear.get(year)
        .slice()
        .sort((a, b) => {
          const sexDelta = (SEX_ORDER[normalizeSexValue(a?.sex)] ?? 2) - (SEX_ORDER[normalizeSexValue(b?.sex)] ?? 2);
          if (sexDelta !== 0) return sexDelta;
          return collator.compare(String(a?.genetics || ''), String(b?.genetics || ''));
        })
        .map(formatAnimalLine);
      return [String(year), ...lines].join('\n');
    })
    .join('\n\n');
}
