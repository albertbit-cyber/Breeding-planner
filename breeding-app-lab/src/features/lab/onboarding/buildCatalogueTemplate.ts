import * as XLSX from "xlsx";

import { CATALOGUE_COLUMNS, AVAILABILITIES, TEST_KINDS } from "./catalogueColumns";

/**
 * The empty catalogue workbook a laboratory downloads, fills in, and uploads.
 *
 * Three sheets, in the order someone works through them:
 *
 *   Tests           one row per test. The work.
 *   Pricing rules   the fallback grid, and the one rule a per-test price cannot
 *                   express.
 *   Reference       the species ids to copy from, and what every column means.
 *
 * The example rows are real ones, not lorem: someone filling this in copies the
 * shape of the row above far more reliably than they read instructions, so the
 * examples have to be right. They are marked for deletion and the importer
 * ignores them by name if they survive.
 */

export const EXAMPLE_MARKER = "EXAMPLE — delete this row";

type SpeciesOption = { id: string; name: string };

const sheetFromRows = (rows: unknown[][], widths: number[]): XLSX.WorkSheet => {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = widths.map((width) => ({ wch: width }));
  return sheet;
};

const buildTestsSheet = (species: SpeciesOption[]): XLSX.WorkSheet => {
  const headers = CATALOGUE_COLUMNS.map((column) => column.header);
  const firstSpecies = species[0]?.id || "ball-python";
  const secondSpecies = species[1]?.id || "corn-snake";

  // Three examples covering the three kinds, because the differences between
  // them (add-on price, flat panel) are exactly what a first-time filler gets
  // wrong.
  const examples: unknown[][] = [
    [
      "Clown",
      "morph",
      firstSpecies,
      35, 30, 25,
      "",
      "Clown",
      "",
      "available",
      "",
      `${EXAMPLE_MARKER} — a normal trait test`,
    ],
    [
      "Sex determination",
      "sex",
      `${firstSpecies}, ${secondSpecies}`,
      30, 25, 20,
      15,
      "",
      "Sexing",
      "available",
      "",
      `${EXAMPLE_MARKER} — add-on price applies when ordered with a morph test`,
    ],
    [
      "Recessive panel",
      "panel",
      firstSpecies,
      120, 110, 100,
      "",
      "",
      "",
      "coming soon",
      21,
      `${EXAMPLE_MARKER} — a bundle sold at one price`,
    ],
  ];

  return sheetFromRows(
    [headers, ...examples],
    CATALOGUE_COLUMNS.map((column) => column.width)
  );
};

const buildPricingSheet = (): XLSX.WorkSheet => {
  const rows: unknown[][] = [
    ["Pricing rules"],
    [],
    ["Every test on the Tests sheet states its own price, so these are not used for those tests."],
    ["They cover two things a per-test price cannot:"],
    ["  1. Any test you leave a price blank on — the import will reject that, so this is a safety net."],
    ["  2. The discount for the second and later morph tests on the SAME animal."],
    [],
    ["Leave these as they are unless you know you want them different.", ""],
    [],
    ["Rule", "1-9 animals", "10-49 animals", "50+ animals"],
    ["Morph test — first on an animal", 35, 30, 25],
    ["Morph test — each additional on the same animal", 20, 20, 20],
    ["Sex determination", 30, 25, 20],
    [],
    ["Currency", "EUR"],
  ];
  return sheetFromRows(rows, [46, 15, 15, 15]);
};

const buildReferenceSheet = (species: SpeciesOption[]): XLSX.WorkSheet => {
  const rows: unknown[][] = [
    ["Reference — read only"],
    [],
    ["WHAT EACH COLUMN MEANS"],
    ["Column", "Required", "What to put in it"],
    ...CATALOGUE_COLUMNS.map((column) => [
      column.header,
      column.required ? "required" : "optional",
      column.help,
    ]),
    [],
    ["ACCEPTED VALUES"],
    ["Kind", TEST_KINDS.join(", ")],
    ["Availability", `${AVAILABILITIES.join(", ")}, or leave blank for available`],
    [],
    ["SPECIES — copy an id exactly into the Species column"],
    ["Id", "Animal"],
    ...species.map((entry) => [entry.id, entry.name]),
  ];
  return sheetFromRows(rows, [26, 12, 82]);
};

/**
 * @param species The platform taxonomy, so the Reference sheet lists the ids
 *                that will actually validate rather than a copy that drifts.
 */
export const buildCatalogueTemplate = (species: SpeciesOption[]): XLSX.WorkBook => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildTestsSheet(species), "Tests");
  XLSX.utils.book_append_sheet(workbook, buildPricingSheet(), "Pricing rules");
  XLSX.utils.book_append_sheet(workbook, buildReferenceSheet(species), "Reference");
  return workbook;
};

export const CATALOGUE_TEMPLATE_FILENAME = "laboratory-catalogue-template.xlsx";

/** Writes the workbook to bytes, for a browser download or a test to read back. */
export const catalogueTemplateBytes = (species: SpeciesOption[]): ArrayBuffer =>
  XLSX.write(buildCatalogueTemplate(species), { bookType: "xlsx", type: "array" });
