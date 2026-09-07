import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { catalogueTemplateBytes, EXAMPLE_MARKER } from "./buildCatalogueTemplate";
import { parseCatalogueSheet } from "./parseCatalogueSheet";

const SPECIES = [
  { id: "ball-python", name: "Ball Pythons" },
  { id: "corn-snake", name: "Corn Snakes" },
];

const readTestsSheet = (): unknown[][] => {
  const workbook = XLSX.read(catalogueTemplateBytes(SPECIES), { type: "array" });
  return XLSX.utils.sheet_to_json(workbook.Sheets.Tests, { header: 1, defval: "" }) as unknown[][];
};

describe("the template and the importer agree", () => {
  it("produces the three sheets someone works through", () => {
    const workbook = XLSX.read(catalogueTemplateBytes(SPECIES), { type: "array" });
    expect(workbook.SheetNames).toEqual(["Tests", "Pricing rules", "Reference"]);
  });

  it("parses its own example rows without a single complaint", () => {
    // The whole point of one column definition: a template offering a column the
    // parser ignores, or a parser demanding one the template never wrote, is the
    // failure this catches.
    const result = parseCatalogueSheet(readTestsSheet(), SPECIES.map((s) => s.id));
    expect(result.missingHeaders).toEqual([]);
    expect(result.unknownHeaders).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(result.offerings).toHaveLength(3);
  });

  it("gets the three kinds right, including the ones people fill in wrongly", () => {
    const { offerings } = parseCatalogueSheet(readTestsSheet(), SPECIES.map((s) => s.id));
    const [morph, sex, panel] = offerings;

    expect(morph).toMatchObject({
      testKind: "morph",
      pricingType: "morph",
      tierPricesCents: { t1: 3500, t2: 3000, t3: 2500 },
    });
    // The add-on price is the example's reason for existing.
    expect(sex).toMatchObject({ testKind: "sex", pricingType: "sex", addonPriceCents: 1500 });
    expect(panel).toMatchObject({ testKind: "panel", pricingType: "morph", availability: "coming_soon" });
    expect(sex.speciesIds).toEqual(["ball-python", "corn-snake"]);
  });

  it("lists only species ids that will actually validate", () => {
    const workbook = XLSX.read(catalogueTemplateBytes(SPECIES), { type: "array" });
    const reference = XLSX.utils.sheet_to_json(workbook.Sheets.Reference, {
      header: 1,
      defval: "",
    }) as unknown[][];
    const listed = reference.map((row) => String(row[0] ?? "")).filter((id) => id.includes("-"));
    for (const id of SPECIES.map((s) => s.id)) expect(listed).toContain(id);
  });

  it("marks the example rows so they are recognisable as disposable", () => {
    const rows = readTestsSheet();
    const marked = rows.filter((row) => row.some((cell) => String(cell).includes(EXAMPLE_MARKER)));
    expect(marked).toHaveLength(3);
  });

  it("still reads correctly once the examples are deleted, which is the real first use", () => {
    const rows = readTestsSheet();
    const header = rows[0];
    const filled = [header, ["Amel", "morph", "corn-snake", 40, 35, 30]];
    const result = parseCatalogueSheet(filled, SPECIES.map((s) => s.id));
    expect(result.problems).toEqual([]);
    expect(result.offerings).toHaveLength(1);
    expect(result.offerings[0]).toMatchObject({ name: "Amel", speciesIds: ["corn-snake"] });
  });
});
