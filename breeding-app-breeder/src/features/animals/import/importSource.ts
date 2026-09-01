// Which kind of sheet did the keeper just hand us?
//
// Read from the header row alone -- never the file name. MorphMarket's export is called
// animals.csv today, but a keeper who renames it, or MorphMarket who renames it, must not
// lose the automatic mapping over a filename.

import { normalizeHeaderLabel } from '../../../utils/csvRows';
import { detectHeaderKey } from '../../../utils/csvRows';

export const IMPORT_SOURCES = {
  MORPHMARKET: 'MORPHMARKET',
  GENERIC_CSV: 'GENERIC_CSV',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ImportSource = typeof IMPORT_SOURCES[keyof typeof IMPORT_SOURCES];

/**
 * Headers no other export we have seen carries together. All five are required: `Sex` and
 * `Traits` alone appear on plenty of generic sheets, but `Animal_Id*` beside `Category*` and
 * `Title*` is MorphMarket's own vocabulary.
 */
const MORPHMARKET_REQUIRED_HEADERS = [
  'category',
  'title',
  'animal id',
  'traits',
  'sex',
];

/**
 * Corroborating headers. We ask for several rather than all of them, because MorphMarket
 * changes its export over time and a missing optional column must not cost us the mapping --
 * the failure mode we are protecting against is misreading an unrelated CSV, not being
 * slightly out of date with MorphMarket.
 */
const MORPHMARKET_SUPPORTING_HEADERS = [
  'maturity',
  'price',
  'state',
  'visibility',
  'enabled',
  'dob',
  'weight',
  'photo urls',
];

const MORPHMARKET_SUPPORTING_MINIMUM = 4;

/**
 * Classifies a header row. Extra columns, unknown future columns and reordered columns are all
 * fine; what matters is that enough of MorphMarket's distinctive vocabulary is present.
 */
export function detectImportSource(headers: unknown): ImportSource {
  const list = Array.isArray(headers) ? headers : [];
  const normalized = new Set(list.map(normalizeHeaderLabel).filter(Boolean));

  const hasAllRequired = MORPHMARKET_REQUIRED_HEADERS.every(header => normalized.has(header));
  if (hasAllRequired) {
    const supporting = MORPHMARKET_SUPPORTING_HEADERS.filter(header => normalized.has(header)).length;
    if (supporting >= MORPHMARKET_SUPPORTING_MINIMUM) return IMPORT_SOURCES.MORPHMARKET;
  }

  // Anything the generic sheet importer can already read stays its job.
  const hasGenericColumn = list.some(header => detectHeaderKey(header) !== null);
  return hasGenericColumn ? IMPORT_SOURCES.GENERIC_CSV : IMPORT_SOURCES.UNKNOWN;
}
