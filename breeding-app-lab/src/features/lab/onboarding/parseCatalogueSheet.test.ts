import { describe, expect, it } from "vitest";

import { parseCatalogueSheet, parseMoneyToCents } from "./parseCatalogueSheet";

const SPECIES = ["ball-python", "corn-snake", "hognose-snake"];

const HEADER = [
  "Test name",
  "Kind",
  "Species",
  "Price 1-9 animals",
  "Price 10-49 animals",
  "Price 50+ animals",
  "Add-on price",
  "Gene",
  "Also known as",
  "Availability",
  "Turnaround days",
  "Description",
];

const row = (over: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = {
    "Test name": "Clown",
    Kind: "morph",
    Species: "ball-python",
    "Price 1-9 animals": 35,
    "Price 10-49 animals": 30,
    "Price 50+ animals": 25,
  };
  const merged = { ...base, ...over };
  return HEADER.map((header) => (header in merged ? merged[header] : ""));
};

const parse = (rows: unknown[][]) => parseCatalogueSheet([HEADER, ...rows], SPECIES);

describe("parseMoneyToCents", () => {
  it("reads money the way a price list is actually written", () => {
    expect(parseMoneyToCents(35)).toBe(3500);
    expect(parseMoneyToCents("35")).toBe(3500);
    expect(parseMoneyToCents("€35.00")).toBe(3500);
    expect(parseMoneyToCents("  35,50 ")).toBe(3550);
    expect(parseMoneyToCents("1.234,50")).toBe(123450);
    expect(parseMoneyToCents("1,234.50")).toBe(123450);
  });

  it("treats an empty cell as unanswered rather than free", () => {
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents(null)).toBeNull();
    expect(parseMoneyToCents("n/a")).toBeNull();
  });
});

describe("parseCatalogueSheet", () => {
  it("reads a filled-in row into an offering", () => {
    const result = parse([row()]);
    expect(result.problems).toEqual([]);
    expect(result.offerings).toHaveLength(1);
    expect(result.offerings[0]).toMatchObject({
      name: "Clown",
      testKind: "morph",
      pricingType: "morph",
      speciesIds: ["ball-python"],
      tierPricesCents: { t1: 3500, t2: 3000, t3: 2500 },
      availability: "available",
    });
  });

  it("accepts several species however they were separated", () => {
    const result = parse([row({ Species: "ball-python; corn-snake / hognose-snake" })]);
    expect(result.problems).toEqual([]);
    expect(result.offerings[0].speciesIds).toEqual(["ball-python", "corn-snake", "hognose-snake"]);
  });

  it("ignores the empty remainder of the sheet", () => {
    const result = parse([row(), [], ["", "", ""], []]);
    expect(result.offerings).toHaveLength(1);
    expect(result.problems).toEqual([]);
  });

  it("skips a bad row and keeps the good ones", () => {
    const result = parse([
      row({ "Test name": "Clown" }),
      row({ "Test name": "Broken", "Price 10-49 animals": "" }),
      row({ "Test name": "Piebald" }),
    ]);
    expect(result.offerings.map((o) => o.name)).toEqual(["Clown", "Piebald"]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatchObject({ row: 3, column: "Price 10-49 animals" });
  });

  it("refuses a species the platform does not have", () => {
    const result = parse([row({ Species: "ball-python, python-regius" })]);
    expect(result.offerings).toEqual([]);
    // The scientific name is the mistake a laboratory actually makes, and a test
    // tagged with it would match no animal and fail silently forever.
    expect(result.problems[0].message).toContain("python-regius");
  });

  it("refuses the same test twice and says where the first one was", () => {
    const result = parse([row(), row()]);
    expect(result.offerings).toHaveLength(1);
    expect(result.problems[0].message).toContain("row 2");
  });

  it("refuses an add-on price on anything but a sex test", () => {
    const morph = parse([row({ "Add-on price": 15 })]);
    expect(morph.offerings).toEqual([]);
    expect(morph.problems[0].column).toBe("Add-on price");

    const sex = parse([row({ "Test name": "Sexing", Kind: "sex", "Add-on price": 15 })]);
    expect(sex.problems).toEqual([]);
    expect(sex.offerings[0]).toMatchObject({ pricingType: "sex", addonPriceCents: 1500 });
  });

  it("understands the words a real price list uses for a kind", () => {
    const result = parse([
      row({ "Test name": "A", Kind: "Sex determination" }),
      row({ "Test name": "B", Kind: "bundle" }),
    ]);
    expect(result.problems).toEqual([]);
    expect(result.offerings.map((o) => o.testKind)).toEqual(["sex", "panel"]);
  });

  it("reads coming soon, and defaults a blank to available", () => {
    const result = parse([
      row({ "Test name": "A", Availability: "Coming Soon" }),
      row({ "Test name": "B", Availability: "" }),
    ]);
    expect(result.offerings.map((o) => o.availability)).toEqual(["coming_soon", "available"]);
  });

  it("names the columns it needs when the file is the wrong shape", () => {
    const result = parseCatalogueSheet([["Name", "Price"], ["Clown", 35]], SPECIES);
    expect(result.offerings).toEqual([]);
    expect(result.problems[0].message).toContain("does not look like the catalogue template");
  });

  it("reports headings it does not understand rather than silently dropping them", () => {
    const header = [...HEADER, "Internal notes"];
    const result = parseCatalogueSheet([header, [...row(), "ignore me"]], SPECIES);
    expect(result.unknownHeaders).toEqual(["Internal notes"]);
    expect(result.offerings).toHaveLength(1);
  });

  it("survives a column order nobody kept to", () => {
    const shuffled = ["Species", "Price 50+ animals", "Test name", "Kind", "Price 1-9 animals", "Price 10-49 animals"];
    const result = parseCatalogueSheet(
      [shuffled, ["corn-snake", 25, "Amel", "morph", 35, 30]],
      SPECIES
    );
    expect(result.problems).toEqual([]);
    expect(result.offerings[0]).toMatchObject({
      name: "Amel",
      speciesIds: ["corn-snake"],
      tierPricesCents: { t1: 3500, t2: 3000, t3: 2500 },
    });
  });
});
