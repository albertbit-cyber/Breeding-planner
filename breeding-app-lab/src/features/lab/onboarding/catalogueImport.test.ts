import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { catalogueTemplateBytes, EXAMPLE_MARKER } from "./buildCatalogueTemplate";
import { noticesFor, toImportPayload, toOfferingPayload } from "./offeringPayload";
import { parseCatalogueSheet, type ParsedOffering } from "./parseCatalogueSheet";
import { isExampleRow, pickTestsSheet, readCatalogueWorkbook } from "./readCatalogueWorkbook";

/**
 * The upload path end to end, on bytes rather than on a hand-written array:
 * download the template, read it back the way the screen reads a dropped file,
 * parse it, and turn it into the body the import endpoint stores.
 *
 * The round-trip test next door proves the template and the parser agree. This
 * one covers the step after it, where the two vocabularies stop matching — the
 * sheet's `panel` is not a category the offerings API accepts, and a panel's
 * price is not read from the tier table at all.
 */

const SPECIES = [
  { id: "ball-python", name: "Ball Pythons" },
  { id: "corn-snake", name: "Corn Snakes" },
];
const SPECIES_IDS = SPECIES.map((entry) => entry.id);

const templateBytes = () => catalogueTemplateBytes(SPECIES);

const parseTemplate = (options: { keepExamples?: boolean } = {}) => {
  const read = readCatalogueWorkbook(templateBytes());
  return parseCatalogueSheet(options.keepExamples ? read.rows : read.rowsWithoutExamples, SPECIES_IDS);
};

/** A filled-in file, as a laboratory would hand it over: examples deleted. */
const uploadOf = (rows: unknown[][]): ArrayBuffer => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Tests");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
};

const headerRow = (): unknown[] => readCatalogueWorkbook(templateBytes()).rows[0];

describe("reading the file a laboratory actually uploads", () => {
  it("takes the tests off the Tests sheet, not the reference tabs", () => {
    const read = readCatalogueWorkbook(templateBytes());
    expect(read.sheetName).toBe("Tests");
    expect(read.sheetNames).toEqual(["Tests", "Pricing rules", "Reference"]);
  });

  // A laboratory that rebuilt the file in its own workbook still gets read.
  it("falls back to the first sheet that is not a reference tab", () => {
    expect(pickTestsSheet(["Our price list 2026"])).toBe("Our price list 2026");
    expect(pickTestsSheet(["Reference", "Sheet1"])).toBe("Sheet1");
    expect(pickTestsSheet(["Pricing rules", "Tests"])).toBe("Tests");
  });

  // Nobody deletes the examples. The screen has to know they are there.
  it("counts the template's example rows and can set them aside", () => {
    const read = readCatalogueWorkbook(templateBytes());
    expect(read.exampleRowCount).toBe(3);
    expect(read.rows).toHaveLength(4);
    expect(read.rowsWithoutExamples).toHaveLength(1);
    expect(read.rowsWithoutExamples.every((row) => !isExampleRow(row))).toBe(true);
  });

  it("finds the tests in a file with only one unnamed sheet", () => {
    const read = readCatalogueWorkbook(uploadOf([headerRow(), ["Amel", "morph", "corn-snake", 40, 35, 30]]));
    const result = parseCatalogueSheet(read.rows, SPECIES_IDS);
    expect(result.problems).toEqual([]);
    expect(result.offerings).toHaveLength(1);
  });

  // The screen tells a laboratory it may upload a .csv, which is what Google
  // Sheets and Numbers export first. That claim has to be true.
  it("reads a CSV export as readily as a workbook", () => {
    const csv = [
      "Test name,Kind,Species,Price 1-9 animals,Price 10-49 animals,Price 50+ animals",
      "Amel,morph,corn-snake,40,35,30",
    ].join("\n");
    const read = readCatalogueWorkbook(new TextEncoder().encode(csv));
    const result = parseCatalogueSheet(read.rows, SPECIES_IDS);
    expect(result.missingHeaders).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(result.offerings[0]).toMatchObject({ name: "Amel", speciesIds: ["corn-snake"] });
  });

  it("an untouched template with its examples deleted has nothing to import", () => {
    const result = parseTemplate();
    expect(result.problems).toEqual([]);
    expect(result.offerings).toEqual([]);
  });

  it("keeps a marked example row recognisable once it is back in the rows", () => {
    expect(isExampleRow(["Clown", "morph", `${EXAMPLE_MARKER} — a normal trait test`])).toBe(true);
    expect(isExampleRow(["Clown", "morph", "ball-python"])).toBe(false);
  });
});

describe("the sheet's words and the offerings API's words are translated, not assumed", () => {
  const byName = (offerings: ParsedOffering[], name: string) =>
    offerings.find((offering) => offering.name === name) as ParsedOffering;

  const examples = () => parseTemplate({ keepExamples: true }).offerings;

  // The API's `category` accepts morph, sex-determination or other. The sheet
  // says morph, sex or panel. Sending the sheet's word straight through is a 400.
  it("maps each kind onto a category the API accepts", () => {
    const [morph, sex, panel] = examples();
    expect(toOfferingPayload(morph).category).toBe("morph");
    expect(toOfferingPayload(sex).category).toBe("sex-determination");
    expect(toOfferingPayload(panel).category).toBe("other");
  });

  it("prices a tiered test from its own three figures", () => {
    const payload = toOfferingPayload(byName(examples(), "Clown"));
    expect(payload).toMatchObject({
      priceModel: "tier",
      priceCents: null,
      tierPrices: { t1: 3500, t2: 3000, t3: 2500 },
    });
  });

  // The pricing engine reads `priceCents` for a panel and never looks at the
  // tier table, so a panel sent without one is a bundle that costs nothing.
  it("gives a panel the flat price the engine will actually charge", () => {
    const payload = toOfferingPayload(byName(examples(), "Recessive panel"));
    expect(payload).toMatchObject({ priceModel: "flat", priceCents: 12000 });
  });

  it("carries the add-on price a sex test is really sold at", () => {
    expect(toOfferingPayload(byName(examples(), "Sex determination"))).toMatchObject({
      pricingType: "sex",
      addonPriceCents: 1500,
    });
  });

  // An optional column a laboratory cleared has to be sent as empty, not left
  // out: the import states each test in full, so an omission would silently keep
  // whatever the previous upload said.
  it("states every optional field, empty ones included", () => {
    const parsed = parseCatalogueSheet(
      [headerRow(), ["Amel", "morph", "corn-snake", 40, 35, 30]],
      SPECIES_IDS
    );
    const payload = toOfferingPayload(parsed.offerings[0]);
    expect(payload.addonPriceCents).toBeNull();
    expect(payload.description).toBeNull();
    expect(payload.turnaroundDays).toBeNull();
    expect(payload.geneTarget).toBeNull();
    expect(payload.aliases).toEqual([]);
  });

  it("asks for a plan rather than a write when the screen is only previewing", () => {
    const offerings = examples();
    expect(toImportPayload(offerings, { dryRun: true }).dryRun).toBe(true);
    expect(toImportPayload(offerings)).not.toHaveProperty("dryRun");
    expect(toImportPayload(offerings).offerings).toHaveLength(3);
  });
});

describe("what a laboratory should be told before it publishes", () => {
  const parseOne = (cells: unknown[]): ParsedOffering => {
    const result = parseCatalogueSheet([headerRow(), cells], SPECIES_IDS);
    expect(result.problems).toEqual([]);
    return result.offerings[0];
  };

  // Not an error — it imports — but the second and third figures will never be
  // charged, and a laboratory that thinks it has volume pricing on a bundle
  // should find that out here rather than from an invoice.
  it("warns that a panel's second and third prices are never used", () => {
    const notices = noticesFor(parseOne(["Recessive panel", "panel", "ball-python", 120, 110, 100]));
    expect(notices.some((line) => line.includes("one price"))).toBe(true);
  });

  it("says nothing about a panel priced consistently", () => {
    const notices = noticesFor(parseOne(["Recessive panel", "panel", "ball-python", 120, 120, 120]));
    expect(notices.some((line) => line.includes("one price"))).toBe(false);
  });

  it("says when a morph test will not update an animal's genetics", () => {
    const notices = noticesFor(parseOne(["Clown", "morph", "ball-python", 35, 30, 25]));
    expect(notices.some((line) => line.includes("genetics"))).toBe(true);

    const mapped = noticesFor(
      parseOne(["Clown", "morph", "ball-python", 35, 30, 25, "", "Clown"])
    );
    expect(mapped.some((line) => line.includes("genetics"))).toBe(false);
  });

  it("says when a sex test will be charged in full alongside a morph test", () => {
    const notices = noticesFor(parseOne(["Sexing", "sex", "ball-python", 30, 25, 20]));
    expect(notices.some((line) => line.includes("add-on"))).toBe(true);
  });

  it("says when a test is published but not orderable", () => {
    const notices = noticesFor(
      parseOne(["Soon", "morph", "ball-python", 35, 30, 25, "", "soon", "", "coming soon"])
    );
    expect(notices.some((line) => line.includes("cannot be ordered"))).toBe(true);
  });
});
