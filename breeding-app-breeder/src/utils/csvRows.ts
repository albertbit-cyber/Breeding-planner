// CSV primitives shared by every sheet importer.
//
// These lived inside App.jsx, where nothing could test them and the MorphMarket adapter could
// not reach them without importing the whole application. Moving them here keeps ONE parser:
// a second hand-rolled one would drift, and the fields that break naive parsing (MorphMarket's
// Desc column carries commas, quotes and newlines) are exactly the fields we ignore, so a drift
// would shift every later column silently rather than failing loudly.

/**
 * Removes a UTF-8 byte order mark. Spreadsheet exports routinely carry one, and it otherwise
 * becomes part of the first header cell -- turning `Category*` into `\uFEFFCategory*`, which no
 * header matcher recognises.
 */
export function stripBom(text: string): string {
  return typeof text === 'string' && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * CSV -> rows of cells. Handles quoted fields, doubled quotes, embedded commas and newlines,
 * and both CRLF and LF endings. Values are returned verbatim: no coercion, no formula
 * evaluation, nothing interpreted. CSV contents are untrusted input and stay inert strings.
 */
export function parseCsvToRows(csvText: string): string[][] {
  const text = stripBom(String(csvText ?? ''));
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;
  let cur = '';
  let row: string[] = [];
  let inQuotes = false;
  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && text[i + 1] === '"') { cur += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cur += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(cur); cur = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
    cur += ch; i++;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/** Header cell -> comparable form: lowercase, punctuation collapsed to single spaces. */
export function normalizeHeaderLabel(label: unknown): string {
  return String(label || '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Generic-sheet header cell -> the field it feeds, or null when we do not recognise it. */
export function detectHeaderKey(label: unknown): string | null {
  const normalized = normalizeHeaderLabel(label);
  if (!normalized) return null;
  if (/^name$|^animal name$|^snake name$/.test(normalized)) return 'name';
  if (/^id$|^animal id$|^snake id$|^identifier$/.test(normalized)) return 'id';
  if (/(^|\s)(sex|gender)(\s|$)/.test(normalized)) return 'sex';
  if (/(^|\s)(morph|visual|combo)(s)?(\s|$)/.test(normalized)) return 'morphs';
  if (/(^|\s)(het|hetero)(s)?(\s|$)/.test(normalized)) return 'hets';
  if (/(^|\s)(genetic|gene|traits?)(s)?(\s|$)/.test(normalized)) return 'genetics';
  if (/(^|\s)(group|collection|category|rack)(s)?(\s|$)/.test(normalized)) return 'groups';
  if (/(^|\s)(tag|keyword)(s)?(\s|$)/.test(normalized)) return 'tags';
  if (/(^|\s)(birth|hatch|dob)(\s|$)/.test(normalized)) return 'birthDate';
  if (/^year$|^birth year$|^hatch year$/.test(normalized)) return 'year';
  if (/(^|\s)weight(\s|$)|(^|\s)grams?(\s|$)/.test(normalized)) return 'weight';
  if (/(^|\s)status(\s|$)/.test(normalized)) return 'status';
  if (/(^|\s)notes?(\s|$)|(^|\s)comments?(\s|$)/.test(normalized)) return 'notes';
  return null;
}
