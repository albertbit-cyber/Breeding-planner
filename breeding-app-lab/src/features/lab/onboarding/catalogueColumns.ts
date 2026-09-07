/**
 * The one description of a catalogue spreadsheet's columns.
 *
 * Both halves of the import read this: the generator that writes the empty
 * template a laboratory downloads, and the parser that reads the filled-in file
 * back. Keeping them on one definition is the point -- a template offering a
 * column the parser ignores, or a parser demanding one the template never
 * produced, is the failure this design exists to prevent.
 *
 * A laboratory fills this in once, in Excel, Google Sheets or Numbers, instead
 * of adding sixty-eight tests one at a time through a form.
 */

export type ColumnKind = "text" | "number" | "money" | "list" | "species";

export type CatalogueColumn = {
  /** The heading as it appears in the sheet. Matched case- and space-insensitively. */
  header: string;
  key: string;
  kind: ColumnKind;
  required: boolean;
  /** Accepted values, for the ones that are a fixed set. Becomes a dropdown. */
  options?: string[];
  /** Shown on the Reference sheet, and in the review screen's error messages. */
  help: string;
  /** Width in characters, so the generated sheet is readable without dragging. */
  width: number;
};

export const TEST_KINDS = ["morph", "sex", "panel"] as const;
export const AVAILABILITIES = ["available", "coming soon"] as const;

/**
 * Prices are read in whole currency units, because that is what a laboratory's
 * own price list is written in. Cents are an implementation detail of the
 * database and asking anyone to type 3500 for €35 invites exactly one kind of
 * mistake.
 */
export const CATALOGUE_COLUMNS: CatalogueColumn[] = [
  {
    header: "Test name",
    key: "name",
    kind: "text",
    required: true,
    help: "What the test is called on your price list. Must be unique within your catalogue.",
    width: 28,
  },
  {
    header: "Kind",
    key: "testKind",
    kind: "list",
    required: true,
    options: [...TEST_KINDS],
    help: "morph = a trait test. sex = sex determination. panel = a bundle sold at one price.",
    width: 10,
  },
  {
    header: "Species",
    key: "speciesIds",
    kind: "species",
    required: true,
    help:
      "Which animals this test is for, from the Reference sheet. Separate several with commas. "
      + "A test with no species matches no animal and no breeder will ever see it.",
    width: 34,
  },
  {
    header: "Price 1-9 animals",
    key: "priceTier1",
    kind: "money",
    required: true,
    help: "Your price per test on an order of 1 to 9 animals, in whole currency units.",
    width: 17,
  },
  {
    header: "Price 10-49 animals",
    key: "priceTier2",
    kind: "money",
    required: true,
    help: "Your price on an order of 10 to 49 animals. Same as the first column if you do not discount by volume.",
    width: 19,
  },
  {
    header: "Price 50+ animals",
    key: "priceTier3",
    kind: "money",
    required: true,
    help: "Your price on an order of 50 or more animals.",
    width: 17,
  },
  {
    header: "Add-on price",
    key: "addonPrice",
    kind: "money",
    required: false,
    help:
      "For a sex test only: the reduced price when it is ordered alongside a morph test on the same "
      + "animal, where the sample and extraction are shared. Leave blank to charge the full price.",
    width: 14,
  },
  {
    header: "Gene",
    key: "geneTarget",
    kind: "text",
    required: false,
    help:
      "The gene this test reads, if it reads one. Filling it in is what lets a confirmed result update "
      + "the animal's genetics automatically. Leave blank for a test that simply reports a finding.",
    width: 18,
  },
  {
    header: "Also known as",
    key: "aliases",
    kind: "list",
    required: false,
    help:
      "Other names the same test is asked for under, comma separated -- \"Yb\", \"HGW\". Used to match what "
      + "a keeper has written on an animal against what you offer, which rarely agree on spelling.",
    width: 26,
  },
  {
    header: "Availability",
    key: "availability",
    kind: "list",
    required: false,
    options: [...AVAILABILITIES],
    help: "Blank means available. \"coming soon\" is published so breeders can see it is on the way, but cannot be ordered.",
    width: 14,
  },
  {
    header: "Turnaround days",
    key: "turnaroundDays",
    kind: "number",
    required: false,
    help: "Working days from sample received to result, if this test differs from your usual turnaround.",
    width: 16,
  },
  {
    header: "Description",
    key: "description",
    kind: "text",
    required: false,
    help: "Shown to breeders under the test name. Optional.",
    width: 44,
  },
];

/** Column headings vary by a space or a capital; nobody should lose a file to that. */
export const normalizeHeader = (value: unknown): string =>
  String(value ?? "")
    .replace(/﻿/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");

export const columnByHeader = (): Map<string, CatalogueColumn> =>
  new Map(CATALOGUE_COLUMNS.map((column) => [normalizeHeader(column.header), column]));

export const REQUIRED_HEADERS = CATALOGUE_COLUMNS.filter((c) => c.required).map((c) => c.header);
