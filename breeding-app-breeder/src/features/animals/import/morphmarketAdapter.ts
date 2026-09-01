// MorphMarket export -> normalized Serpentora import rows.
//
// This module is an ADAPTER and nothing more. It does not create animals, it does not know how
// an id is generated, and it contains no genetics logic: it translates MorphMarket's columns
// into the shape the existing animal-creation path already accepts, and hands the Traits string
// to the app's own species-aware free-text genetics parser (injected, so this file never
// reaches into the gene database itself).
//
// What it DOES own is the refusal to guess. Every field MorphMarket leaves blank, every
// category we cannot place, and every id already in the collection comes back as a note on the
// row rather than as a silently invented value.

import { parseCsvToRows, normalizeHeaderLabel } from '../../../utils/csvRows';
import { detectImportSource, IMPORT_SOURCES, type ImportSource } from './importSource';
import { resolveSpeciesFromCategory } from './speciesAliases';
import { sexOrUnknown, UNKNOWN_SEX } from '../animalSex';

/** MorphMarket exports weights in grams, which is also Serpentora's animal weight unit. */
export const MORPHMARKET_WEIGHT_UNIT = 'g';

/** Recorded on every animal this importer creates, as provenance. */
export const MORPHMARKET_IMPORT_SOURCE = 'morphmarket';

/** A reticulated python tops out near 90 kg; anything past this is a typo, not an animal. */
const MAX_SENSIBLE_WEIGHT_GRAMS = 250000;

export type ImportRowStatus = 'ready' | 'warning' | 'conflict' | 'error';
export type ImportRowResolution = 'import' | 'skip' | 'update';

export type ImportRowNote = {
  code: string;
  /** English fallback. The review UI translates by `code` and falls back to this. */
  message: string;
};

export type MorphMarketAnimalDraft = {
  name: string;
  id: string;
  sex: string;
  species: string;
  morphs: string[];
  hets: string[];
  birthDate: string | null;
  weight: number | null;
  price: string;
  importSource: string;
  importedAt: string;
  /** MorphMarket's Traits cell, verbatim, so the parse can always be audited afterwards. */
  importRawTraits: string;
};

export type MorphMarketImportRow = {
  /** 1-based position among DATA rows, i.e. what the keeper sees minus the header. */
  rowNumber: number;
  status: ImportRowStatus;
  warnings: ImportRowNote[];
  errors: ImportRowNote[];
  /** The existing animal's id when this row collides with the collection, else null. */
  conflictWithId: string | null;
  resolution: ImportRowResolution;
  raw: {
    category: string;
    title: string;
    animalId: string;
    sex: string;
    dob: string;
    weight: string;
    price: string;
    traits: string;
  };
  animal: MorphMarketAnimalDraft | null;
};

export type MorphMarketImportSummary = {
  total: number;
  importable: number;
  bySpecies: Array<{ speciesId: string; count: number }>;
  male: number;
  female: number;
  unknownSex: number;
  missingDob: number;
  missingWeight: number;
  missingAnimalId: number;
  conflicts: number;
  errors: number;
};

export type MorphMarketImportPlan = {
  source: ImportSource;
  headers: string[];
  rows: MorphMarketImportRow[];
  summary: MorphMarketImportSummary;
};

/**
 * The genetics engine, injected. The real implementation is App.jsx's `geneticsForSpecies` plus
 * `parseAnimalText`; tests pass a spy. Keeping it a parameter is what stops a second, simpler
 * MorphMarket genetics parser from ever growing here.
 */
export type ParseGeneticsFn = (
  speciesId: string,
  traitsText: string,
) => Promise<{ morphs?: string[]; hets?: string[]; unmatchedNotes?: string } | null>;

export type BuildPlanOptions = {
  existingAnimals?: Array<{ id?: string | null } | null>;
  parseGenetics?: ParseGeneticsFn | null;
  /** Injected so the provenance stamp is deterministic under test. */
  now?: () => Date;
};

// --- cell reading --------------------------------------------------------------------------

/**
 * A blank cell is an ABSENT value, never the string "", "null" or "undefined". Spreadsheet
 * round-trips produce all three, and any of them written onto an animal shows up as the
 * keeper's own data later.
 */
function cellText(value: unknown): string {
  const trimmed = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return '';
  return trimmed;
}

function buildColumnIndex(headers: string[]): Map<string, number> {
  const index = new Map<string, number>();
  headers.forEach((header, position) => {
    const key = normalizeHeaderLabel(header);
    // First occurrence wins: a duplicated header is MorphMarket's problem, not a reason to
    // read the later, usually empty, copy.
    if (key && !index.has(key)) index.set(key, position);
  });
  return index;
}

// --- field parsers -------------------------------------------------------------------------

export type ParsedDate = { value: string | null; parsed: boolean };

/**
 * MorphMarket exports dates as US M/D/YYYY -- `8/7/2026` is the 7th of August, not the 8th of
 * July. Parsing that with `new Date(...)` hands the decision to the browser's locale and
 * quietly shifts a third of every collection's hatch dates, so the format is matched
 * explicitly. ISO is accepted too, because a keeper who edits the sheet often produces one.
 */
export function parseMorphMarketDate(raw: unknown): ParsedDate {
  const text = cellText(raw);
  if (!text) return { value: null, parsed: true };

  let year: number;
  let month: number;
  let day: number;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
  } else if (us) {
    month = Number(us[1]); day = Number(us[2]); year = Number(us[3]);
  } else {
    return { value: null, parsed: false };
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2999) {
    return { value: null, parsed: false };
  }
  // Rejects 2/30 and friends: a rolled-over Date is a different day than the sheet claimed.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return { value: null, parsed: false };
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return { value: year + '-' + pad(month) + '-' + pad(day), parsed: true };
}

export type ParsedNumber = { value: number | null; parsed: boolean };

function parseDecimal(raw: unknown): ParsedNumber {
  const text = cellText(raw);
  if (!text) return { value: null, parsed: true };
  // Strips currency symbols, thousands separators and any trailing unit; keeps the number.
  const cleaned = text
    .replace(/[^0-9.,-]/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '')
    .replace(/,/g, '.');
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return { value: null, parsed: false };
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric) || numeric < 0) return { value: null, parsed: false };
  // Zero is MorphMarket's "not recorded" for both weight and price, so it stays absent
  // rather than becoming a 0 g animal offered at 0.
  if (numeric === 0) return { value: null, parsed: true };
  return { value: numeric, parsed: true };
}

/** MorphMarket weights are grams, matching Serpentora's animal weight unit. */
export function parseMorphMarketWeight(raw: unknown): ParsedNumber {
  const parsed = parseDecimal(raw);
  if (!parsed.parsed || parsed.value === null) return parsed;
  if (parsed.value > MAX_SENSIBLE_WEIGHT_GRAMS) return { value: null, parsed: false };
  return parsed;
}

export function parseMorphMarketPrice(raw: unknown): ParsedNumber {
  return parseDecimal(raw);
}

// --- row mapping ---------------------------------------------------------------------------

function note(code: string, message: string): ImportRowNote {
  return { code, message };
}

function statusFor(row: Pick<MorphMarketImportRow, 'errors' | 'warnings' | 'conflictWithId'>): ImportRowStatus {
  if (row.errors.length) return 'error';
  if (row.conflictWithId) return 'conflict';
  if (row.warnings.length) return 'warning';
  return 'ready';
}

type RowContext = {
  rowNumber: number;
  columns: Map<string, number>;
  existingIdMap: Map<string, string>;
  seenIdsInFile: Map<string, number>;
  importedAt: string;
};

/**
 * Maps ONE MorphMarket row. Genetics are filled in afterwards by buildMorphMarketImportPlan,
 * because the parser is async and species-aware while this stays synchronous and pure.
 */
export function mapMorphMarketRow(cells: string[], context: RowContext): MorphMarketImportRow | null {
  const { rowNumber, columns, existingIdMap, seenIdsInFile, importedAt } = context;
  const read = (header: string): string => {
    const position = columns.get(header);
    return position === undefined ? '' : cellText(cells[position]);
  };

  const raw = {
    category: read('category'),
    title: read('title'),
    animalId: read('animal id'),
    sex: read('sex'),
    dob: read('dob'),
    weight: read('weight'),
    price: read('price'),
    traits: read('traits'),
  };

  // A wholly blank line is spreadsheet padding, not a failed animal.
  if (!Object.values(raw).some(Boolean)) return null;

  const warnings: ImportRowNote[] = [];
  const errors: ImportRowNote[] = [];
  let conflictWithId: string | null = null;

  // Species FIRST: genetics are parsed against this species' gene table, so resolving it late
  // would mean reading ball python traits out of a gecko.
  const speciesId = resolveSpeciesFromCategory(raw.category);
  if (!speciesId) {
    errors.push(note(
      'unresolved-species',
      raw.category
        ? 'Species could not be resolved from category "' + raw.category + '"'
        : 'Species missing: MorphMarket category is empty',
    ));
  }

  if (!raw.title) errors.push(note('missing-title', 'Required title missing'));

  if (!raw.animalId) {
    warnings.push(note('missing-animal-id', 'Animal ID missing'));
  } else {
    const key = raw.animalId.toLowerCase();
    const existing = existingIdMap.get(key);
    if (existing) {
      conflictWithId = existing;
    } else if (seenIdsInFile.has(key)) {
      warnings.push(note(
        'duplicate-animal-id-in-file',
        'Animal ID "' + raw.animalId + '" also appears on row ' + seenIdsInFile.get(key) + ' of this file',
      ));
    }
    if (!seenIdsInFile.has(key)) seenIdsInFile.set(key, rowNumber);
  }

  const sex = sexOrUnknown(raw.sex);
  if (sex === UNKNOWN_SEX) {
    warnings.push(note('unknown-sex', raw.sex ? 'Unknown sex "' + raw.sex + '"' : 'Sex not recorded'));
  }

  const dob = parseMorphMarketDate(raw.dob);
  if (!raw.dob) warnings.push(note('missing-dob', 'Missing date of birth'));
  else if (!dob.parsed) warnings.push(note('unparsable-dob', 'Date of birth "' + raw.dob + '" could not be read'));

  const weight = parseMorphMarketWeight(raw.weight);
  if (!raw.weight) warnings.push(note('missing-weight', 'Missing weight'));
  else if (!weight.parsed || weight.value === null) {
    warnings.push(note('invalid-weight', 'Weight "' + raw.weight + '" is not a usable value in grams'));
  }

  const price = parseMorphMarketPrice(raw.price);
  if (raw.price && !price.parsed) {
    warnings.push(note('invalid-price', 'Price "' + raw.price + '" could not be read'));
  }

  if (!raw.traits) warnings.push(note('missing-traits', 'No genetics listed'));

  const animal: MorphMarketAnimalDraft | null = errors.length ? null : {
    name: raw.title,
    // Preserved exactly as MorphMarket wrote it. The id is an identifier and nothing else:
    // no sex, year, clutch or species is ever read back out of its characters.
    id: raw.animalId,
    sex,
    species: speciesId as string,
    morphs: [],
    hets: [],
    birthDate: dob.value,
    weight: weight.value,
    // Kept as a string to match how the app already stores price. A price is a reference value
    // on the animal card; it never implies the animal is for sale here.
    price: price.value === null ? '' : String(price.value),
    importSource: MORPHMARKET_IMPORT_SOURCE,
    importedAt,
    importRawTraits: raw.traits,
  };

  const row: MorphMarketImportRow = {
    rowNumber,
    status: 'ready',
    warnings,
    errors,
    conflictWithId,
    // Safest non-destructive default. Updating an existing animal is only ever something the
    // keeper chooses explicitly on the review screen.
    resolution: conflictWithId ? 'skip' : 'import',
    raw,
    animal,
  };
  row.status = statusFor(row);
  return row;
}

// --- plan ----------------------------------------------------------------------------------

export function summarizeMorphMarketPlan(rows: MorphMarketImportRow[]): MorphMarketImportSummary {
  const speciesCounts = new Map<string, number>();
  const summary: MorphMarketImportSummary = {
    total: rows.length,
    importable: 0,
    bySpecies: [],
    male: 0,
    female: 0,
    unknownSex: 0,
    missingDob: 0,
    missingWeight: 0,
    missingAnimalId: 0,
    conflicts: 0,
    errors: 0,
  };

  rows.forEach(row => {
    if (row.status === 'error') summary.errors += 1;
    else summary.importable += 1;
    if (row.conflictWithId) summary.conflicts += 1;

    const codes = new Set(row.warnings.map(entry => entry.code));
    if (codes.has('missing-dob') || codes.has('unparsable-dob')) summary.missingDob += 1;
    if (codes.has('missing-weight') || codes.has('invalid-weight')) summary.missingWeight += 1;
    if (codes.has('missing-animal-id')) summary.missingAnimalId += 1;

    const sex = row.animal ? row.animal.sex : sexOrUnknown(row.raw.sex);
    if (sex === 'M') summary.male += 1;
    else if (sex === 'F') summary.female += 1;
    else summary.unknownSex += 1;

    const speciesId = row.animal ? row.animal.species : null;
    if (speciesId) speciesCounts.set(speciesId, (speciesCounts.get(speciesId) || 0) + 1);
  });

  summary.bySpecies = Array.from(speciesCounts.entries())
    .map(([speciesId, count]) => ({ speciesId, count }))
    .sort((a, b) => b.count - a.count);
  return summary;
}

/**
 * Reads a MorphMarket CSV end to end and returns a reviewable plan. Nothing is written: the
 * caller shows this to the keeper, who confirms before a single animal is created.
 *
 * One bad row never sinks the file -- an unresolvable species produces one error row and every
 * other row stays importable.
 */
export async function buildMorphMarketImportPlan(
  csvText: string,
  options: BuildPlanOptions = {},
): Promise<MorphMarketImportPlan> {
  const existingAnimals = options.existingAnimals || [];
  const parseGenetics = options.parseGenetics || null;
  const now = options.now || (() => new Date());

  const grid = parseCsvToRows(csvText);
  const headers = (grid[0] || []).map(cell => String(cell == null ? '' : cell));
  const source = detectImportSource(headers);
  if (source !== IMPORT_SOURCES.MORPHMARKET) {
    return { source, headers, rows: [], summary: summarizeMorphMarketPlan([]) };
  }

  const columns = buildColumnIndex(headers);
  const existingIdMap = new Map<string, string>();
  (Array.isArray(existingAnimals) ? existingAnimals : []).forEach(animal => {
    const id = String((animal && animal.id) || '').trim();
    if (id) existingIdMap.set(id.toLowerCase(), id);
  });

  const seenIdsInFile = new Map<string, number>();
  const importedAt = now().toISOString();

  const rows: MorphMarketImportRow[] = [];
  grid.slice(1).forEach((cells, offset) => {
    const row = mapMorphMarketRow(cells, {
      rowNumber: offset + 1,
      columns,
      existingIdMap,
      seenIdsInFile,
      importedAt,
    });
    if (row) rows.push(row);
  });

  // Genetics last, and only for rows that resolved a species. The whole Traits string goes to
  // the app's own free-text parser; only the genetics come back out of it, because sex, id,
  // weight and dates all have dedicated MorphMarket columns that must win over whatever a
  // free-text parser thinks it sees inside a trait list.
  if (typeof parseGenetics === 'function') {
    for (const row of rows) {
      if (!row.animal || !row.animal.importRawTraits) continue;
      let parsed = null;
      try {
        parsed = await parseGenetics(row.animal.species, row.animal.importRawTraits);
      } catch (error) {
        row.warnings.push(note('genetics-parse-failed', 'Genetics could not be parsed for this row'));
        row.status = statusFor(row);
        continue;
      }
      const rawMorphs = parsed ? parsed.morphs : undefined;
      const rawHets = parsed ? parsed.hets : undefined;
      const morphs = Array.isArray(rawMorphs) ? rawMorphs.filter(Boolean) : [];
      const hets = Array.isArray(rawHets) ? rawHets.filter(Boolean) : [];
      row.animal.morphs = morphs;
      row.animal.hets = hets;

      const leftover = String((parsed ? parsed.unmatchedNotes : '') || '').trim();
      if (leftover) {
        row.warnings.push(note('unrecognized-traits', 'Unrecognised genetics: ' + leftover));
      } else if (!morphs.length && !hets.length) {
        row.warnings.push(note('unrecognized-traits', 'Unrecognised genetics: ' + row.animal.importRawTraits));
      }
      row.status = statusFor(row);
    }
  }

  return { source, headers, rows, summary: summarizeMorphMarketPlan(rows) };
}

/**
 * The rows the keeper's choices say to actually write, split by what should happen to each.
 * Error rows can never appear as work whatever the resolution says.
 */
export function selectRowsToCommit(rows: MorphMarketImportRow[]): {
  create: MorphMarketImportRow[];
  update: MorphMarketImportRow[];
  skipped: MorphMarketImportRow[];
  failed: MorphMarketImportRow[];
} {
  const create: MorphMarketImportRow[] = [];
  const update: MorphMarketImportRow[] = [];
  const skipped: MorphMarketImportRow[] = [];
  const failed: MorphMarketImportRow[] = [];

  (Array.isArray(rows) ? rows : []).forEach(row => {
    if (!row || row.status === 'error' || !row.animal) { failed.push(row); return; }
    if (row.resolution === 'skip') { skipped.push(row); return; }
    if (row.conflictWithId) {
      // A conflict that was never explicitly resolved stays unwritten rather than becoming a
      // second animal wearing an id the collection already uses.
      if (row.resolution === 'update') update.push(row);
      else skipped.push(row);
      return;
    }
    create.push(row);
  });

  return { create, update, skipped, failed };
}
