import {
  AVAILABILITIES,
  CATALOGUE_COLUMNS,
  TEST_KINDS,
  columnByHeader,
  normalizeHeader,
  type CatalogueColumn,
} from "./catalogueColumns";

/**
 * Reads a filled-in catalogue sheet into offerings the backend can store.
 *
 * Pure, and deliberately so: a laboratory's first act on this platform is
 * uploading this file, and it must be possible to say exactly what will happen
 * before anything is written.
 *
 * Forgiving about how people really fill in spreadsheets -- stray blank rows,
 * "€35.00" in a price column, a species column with semicolons instead of
 * commas -- and unforgiving about anything that would produce a test nobody can
 * order or a price nobody meant. A bad row is reported and skipped; it never
 * takes the file down with it.
 */

export type ParsedOffering = {
  name: string;
  testKind: "morph" | "sex" | "panel";
  pricingType: "morph" | "sex";
  category: string;
  speciesIds: string[];
  tierPricesCents: { t1: number; t2: number; t3: number };
  addonPriceCents?: number;
  geneTarget?: string;
  aliases: string[];
  availability: "available" | "coming_soon";
  turnaroundDays?: number;
  description?: string;
  sortOrder: number;
};

export type RowProblem = {
  /** 1-based row number as the laboratory sees it in the spreadsheet. */
  row: number;
  column?: string;
  message: string;
};

export type ParseResult = {
  offerings: ParsedOffering[];
  problems: RowProblem[];
  /** Headings present in the file that this importer does not understand. */
  unknownHeaders: string[];
  missingHeaders: string[];
};

const splitList = (value: unknown): string[] =>
  String(value ?? "")
    // Commas are what the template asks for, but semicolons, slashes and
    // newlines are what people type. All four mean the same thing here.
    .split(/[,;/\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Money as typed by a human: "35", "€35.00", "35,50", " 35 ".
 * Returns cents, or null when it is not a number at all.
 */
export const parseMoneyToCents = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  }
  const cleaned = String(value)
    .replace(/[^\d.,-]/g, "")
    .trim();
  if (!cleaned) return null;
  // A comma is a decimal separator across most of the continent, and a
  // thousands separator elsewhere. The last separator in the string is the
  // decimal one when it is followed by one or two digits.
  const normalized = /[.,]\d{1,2}$/.test(cleaned)
    ? cleaned.replace(/[.,](?=\d{1,2}$)/, ".").replace(/[.,](?!\d{1,2}$)/g, "")
    : cleaned.replace(/[.,]/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
};

const parseWholeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(String(value).replace(/[^\d-]/g, ""));
  return Number.isFinite(amount) ? Math.trunc(amount) : null;
};

const normalizeAvailability = (value: unknown): "available" | "coming_soon" | null => {
  const token = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (!token) return "available";
  if (token === "available") return "available";
  if (token === "coming soon") return "coming_soon";
  return null;
};

const normalizeKind = (value: unknown): "morph" | "sex" | "panel" | null => {
  const token = String(value ?? "").trim().toLowerCase();
  if (token === "morph" || token === "sex" || token === "panel") return token;
  // The words a price list actually uses.
  if (token === "trait" || token === "morph test") return "morph";
  if (token === "sexing" || token === "sex determination" || token === "sex test") return "sex";
  if (token === "bundle" || token === "combo") return "panel";
  return null;
};

/**
 * @param rows      Sheet rows as arrays of cells, header row included.
 * @param knownSpeciesIds  The platform taxonomy. A species outside it is refused
 *                         rather than stored, because a test tagged with a
 *                         species that does not exist matches no animal and
 *                         fails silently for good.
 */
export const parseCatalogueSheet = (
  rows: unknown[][],
  knownSpeciesIds: string[]
): ParseResult => {
  const problems: RowProblem[] = [];
  const offerings: ParsedOffering[] = [];

  const headerRowIndex = rows.findIndex((row) =>
    (row || []).some((cell) => normalizeHeader(cell) === normalizeHeader("Test name"))
  );
  if (headerRowIndex < 0) {
    return {
      offerings: [],
      problems: [
        {
          row: 1,
          message:
            'No "Test name" column found. This does not look like the catalogue template — '
            + "download a fresh copy and paste your tests into it.",
        },
      ],
      unknownHeaders: [],
      missingHeaders: CATALOGUE_COLUMNS.filter((c) => c.required).map((c) => c.header),
    };
  }

  const lookup = columnByHeader();
  const headerCells = (rows[headerRowIndex] || []).map(normalizeHeader);
  const columnAt = new Map<number, CatalogueColumn>();
  const unknownHeaders: string[] = [];
  headerCells.forEach((header, index) => {
    if (!header) return;
    const column = lookup.get(header);
    if (column) columnAt.set(index, column);
    else unknownHeaders.push(String((rows[headerRowIndex] || [])[index] ?? "").trim());
  });

  const present = new Set([...columnAt.values()].map((column) => column.key));
  const missingHeaders = CATALOGUE_COLUMNS.filter(
    (column) => column.required && !present.has(column.key)
  ).map((column) => column.header);
  if (missingHeaders.length) {
    return { offerings: [], problems, unknownHeaders, missingHeaders };
  }

  const speciesSet = new Set(knownSpeciesIds.map((id) => String(id).trim().toLowerCase()));
  const seenNames = new Map<string, number>();

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const cells = rows[index] || [];
    const rowNumber = index + 1;

    const valueOf = (key: string): unknown => {
      for (const [columnIndex, column] of columnAt) {
        if (column.key === key) return cells[columnIndex];
      }
      return undefined;
    };

    // A row with nothing in it is the empty remainder of the sheet, not a mistake.
    const hasAnything = [...columnAt.keys()].some(
      (columnIndex) => String(cells[columnIndex] ?? "").trim() !== ""
    );
    if (!hasAnything) continue;

    const name = String(valueOf("name") ?? "").trim();
    if (!name) {
      problems.push({ row: rowNumber, column: "Test name", message: "A test needs a name." });
      continue;
    }

    const nameKey = name.toLowerCase();
    const firstSeenAt = seenNames.get(nameKey);
    if (firstSeenAt) {
      problems.push({
        row: rowNumber,
        column: "Test name",
        message: `"${name}" is already on row ${firstSeenAt}. A laboratory cannot list the same test twice.`,
      });
      continue;
    }

    const testKind = normalizeKind(valueOf("testKind"));
    if (!testKind) {
      problems.push({
        row: rowNumber,
        column: "Kind",
        message: `"${String(valueOf("testKind") ?? "")}" is not a kind. Use one of: ${TEST_KINDS.join(", ")}.`,
      });
      continue;
    }

    const speciesRaw = splitList(valueOf("speciesIds"));
    if (!speciesRaw.length) {
      problems.push({
        row: rowNumber,
        column: "Species",
        message: "Name at least one species, or no breeder will ever be offered this test.",
      });
      continue;
    }
    const unknownSpecies = speciesRaw.filter((id) => !speciesSet.has(id.toLowerCase()));
    if (unknownSpecies.length) {
      problems.push({
        row: rowNumber,
        column: "Species",
        message:
          `Not on the species list: ${unknownSpecies.join(", ")}. `
          + "Copy the ids from the Reference sheet exactly.",
      });
      continue;
    }

    const tiers: Array<["priceTier1" | "priceTier2" | "priceTier3", string]> = [
      ["priceTier1", "Price 1-9 animals"],
      ["priceTier2", "Price 10-49 animals"],
      ["priceTier3", "Price 50+ animals"],
    ];
    const cents: number[] = [];
    let priceProblem = false;
    for (const [key, header] of tiers) {
      const parsed = parseMoneyToCents(valueOf(key));
      if (parsed === null) {
        problems.push({
          row: rowNumber,
          column: header,
          message: "A price is required. Repeat the same figure if you do not discount by volume.",
        });
        priceProblem = true;
        break;
      }
      if (parsed < 0) {
        problems.push({ row: rowNumber, column: header, message: "A price cannot be negative." });
        priceProblem = true;
        break;
      }
      cents.push(parsed);
    }
    if (priceProblem) continue;

    const availability = normalizeAvailability(valueOf("availability"));
    if (!availability) {
      problems.push({
        row: rowNumber,
        column: "Availability",
        message: `Use one of: ${AVAILABILITIES.join(", ")}, or leave it blank.`,
      });
      continue;
    }

    const addonPriceCents = parseMoneyToCents(valueOf("addonPrice"));
    if (addonPriceCents !== null && testKind !== "sex") {
      problems.push({
        row: rowNumber,
        column: "Add-on price",
        message: "Only a sex test has an add-on price. Leave it blank for a morph test or a panel.",
      });
      continue;
    }

    const turnaroundDays = parseWholeNumber(valueOf("turnaroundDays"));

    seenNames.set(nameKey, rowNumber);
    offerings.push({
      name,
      testKind,
      // The tier table understands two buckets. A panel is flat-priced and sits
      // outside them, but still has to declare which one it belongs to.
      pricingType: testKind === "sex" ? "sex" : "morph",
      category: testKind === "sex" ? "sex" : testKind,
      speciesIds: speciesRaw.map((id) => id.toLowerCase()),
      tierPricesCents: { t1: cents[0], t2: cents[1], t3: cents[2] },
      ...(addonPriceCents !== null ? { addonPriceCents } : {}),
      ...(String(valueOf("geneTarget") ?? "").trim()
        ? { geneTarget: String(valueOf("geneTarget")).trim() }
        : {}),
      aliases: splitList(valueOf("aliases")),
      availability,
      ...(turnaroundDays !== null && turnaroundDays > 0 ? { turnaroundDays } : {}),
      ...(String(valueOf("description") ?? "").trim()
        ? { description: String(valueOf("description")).trim() }
        : {}),
      sortOrder: offerings.length + 1,
    });
  }

  return { offerings, problems, unknownHeaders, missingHeaders: [] };
};
