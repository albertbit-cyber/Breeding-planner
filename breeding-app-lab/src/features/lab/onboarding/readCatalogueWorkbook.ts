import * as XLSX from "xlsx";

import { EXAMPLE_MARKER } from "./buildCatalogueTemplate";

/**
 * Turns the file a laboratory actually drops on the upload screen into the rows
 * the parser reads.
 *
 * Everything awkward about a real upload lives here rather than in the screen:
 * the workbook may be .xlsx, .xls or a CSV exported from Google Sheets; the
 * sheet may be called "Tests" or may be the only sheet in a file someone built
 * themselves; and it very often still contains the three example rows, because
 * nobody deletes the examples.
 */

/** The sheet the template writes the tests on. Matched case-insensitively. */
const TESTS_SHEET = "tests";

/** Sheets the template writes that are never the list of tests. */
const REFERENCE_SHEETS = new Set(["pricing rules", "reference"]);

export type WorkbookRead = {
  /** The sheet the rows were taken from, as it is named in the file. */
  sheetName: string;
  /** Every sheet in the file, so the screen can offer a different one. */
  sheetNames: string[];
  /** Rows as the parser wants them: arrays of cells, header row included. */
  rows: unknown[][];
  /** The same rows with the template's example rows removed. */
  rowsWithoutExamples: unknown[][];
  /** How many example rows survived into the uploaded file. */
  exampleRowCount: number;
};

/**
 * Which sheet holds the tests.
 *
 * "Tests" by name when it is there. Otherwise the first sheet that is not one of
 * the template's reference sheets — a laboratory that rebuilt the file in its own
 * workbook still gets read, and one that uploads the untouched template never
 * has its price list read off the Reference tab.
 */
export const pickTestsSheet = (sheetNames: string[]): string => {
  const named = sheetNames.find((name) => name.trim().toLowerCase() === TESTS_SHEET);
  if (named) return named;
  const usable = sheetNames.find((name) => !REFERENCE_SHEETS.has(name.trim().toLowerCase()));
  return usable || sheetNames[0] || "";
};

/** True for the template's own example rows, which are marked for deletion. */
export const isExampleRow = (row: unknown[]): boolean =>
  (row || []).some((cell) => String(cell ?? "").includes(EXAMPLE_MARKER));

export const readCatalogueWorkbook = (
  input: ArrayBuffer | Uint8Array,
  sheetNameOverride?: string
): WorkbookRead => {
  const workbook = XLSX.read(input, { type: "array" });
  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) {
    throw new Error("There are no sheets in this file.");
  }

  const sheetName = sheetNameOverride && sheetNames.includes(sheetNameOverride)
    ? sheetNameOverride
    : pickTestsSheet(sheetNames);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`This file has no sheet called "${sheetName}".`);

  // `defval` keeps blank cells as empty strings so a row stays aligned with its
  // headers; without it a gap in the middle of a row shifts every column after it.
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  const examples = rows.filter(isExampleRow);

  return {
    sheetName,
    sheetNames,
    rows,
    rowsWithoutExamples: rows.filter((row) => !isExampleRow(row)),
    exampleRowCount: examples.length,
  };
};
