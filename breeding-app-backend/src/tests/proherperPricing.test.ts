import { describe, expect, it } from "vitest";
import { calculateOrderBreakdown } from "../services/pricingService";

/**
 * Prices checked against ProHerper Labs' published price list
 * (https://www.proherper.com/en/genetic-tests, captured 2026-08-30).
 *
 * Loading a real catalogue is what showed the pricing engine could not express
 * three things a laboratory actually sells: flat-priced panels, a test priced on
 * its own scale, and a sex test sold cheaply alongside a morph test. These are
 * the cases that would have quoted a customer the wrong amount.
 */

const TIERS = {
  id: "pricing_proherper",
  currency: "EUR",
  morphTier1to9FirstTest: 35,
  morphTier1to9AdditionalTest: 20,
  morphTier10to49FirstTest: 30,
  morphTier10to49AdditionalTest: 20,
  morphTier50PlusFirstTest: 25,
  morphTier50PlusAdditionalTest: 20,
  sexTier1to9: 30,
  sexTier10to49: 25,
  sexTier50Plus: 20,
};

const CATALOG = [
  { id: "clown", name: "Clown", pricingType: "morph" as const, active: true, testKind: "morph" },
  { id: "pied", name: "Pied", pricingType: "morph" as const, active: true, testKind: "morph" },
  { id: "puzzle", name: "Puzzle", pricingType: "morph" as const, active: true, testKind: "morph" },
  {
    id: "black_pastel",
    name: "Black pastel",
    pricingType: "morph" as const,
    active: true,
    testKind: "morph",
    availability: "coming_soon",
  },
  {
    id: "sex_bp",
    name: "Sex determination — Ball python",
    pricingType: "sex" as const,
    active: true,
    testKind: "sex",
    addonPriceCents: 1000,
  },
  {
    id: "sex_gtp",
    name: "Sex determination — Green tree python",
    pricingType: "sex" as const,
    active: true,
    testKind: "sex",
    tierPricesJson: { t1: 6500, t2: 6000, t3: 5500 },
  },
  {
    id: "panel_full",
    name: "Full panel test",
    pricingType: "morph" as const,
    active: true,
    testKind: "panel",
    priceModel: "flat",
    priceCents: 12500,
  },
  {
    id: "panel_dinker",
    name: "Dinker panel test",
    pricingType: "morph" as const,
    active: true,
    testKind: "panel",
    priceModel: "flat",
    priceCents: 19500,
  },
];

const animals = (count: number, selectedTestIds: string[]) =>
  Array.from({ length: count }, (_, i) => ({
    animalId: `animal-${i + 1}`,
    animalName: `Animal ${i + 1}`,
    selectedTestIds,
  }));

const price = (count: number, tests: string[]) =>
  calculateOrderBreakdown(animals(count, tests), CATALOG as any, TIERS as any);

describe("morph tests price from the tier table", () => {
  it("charges 35 for one test on one animal", () => {
    expect(price(1, ["clown"]).total).toBe(35);
  });

  it("charges 20 for each additional test on the same animal", () => {
    // 35 + 20 + 20
    expect(price(1, ["clown", "pied", "puzzle"]).total).toBe(75);
  });

  it("drops to 30 per first test at ten animals", () => {
    expect(price(10, ["clown"]).total).toBe(300);
  });

  it("drops to 25 per first test at fifty animals", () => {
    expect(price(50, ["clown"]).total).toBe(1250);
  });

  it("keeps the additional-test price at 20 across every tier", () => {
    // 50 animals x (25 + 20)
    expect(price(50, ["clown", "pied"]).total).toBe(2250);
  });
});

describe("sex determination", () => {
  it("charges the full 30 when ordered on its own", () => {
    expect(price(1, ["sex_bp"]).total).toBe(30);
  });

  it("charges only the 10 add-on alongside a morph test", () => {
    // 35 + 10, not 35 + 30. The sample and extraction are already paid for.
    const result = price(1, ["clown", "sex_bp"]);
    expect(result.total).toBe(45);
    expect(result.perAnimal[0].sexCost).toBe(10);
  });

  it("charges the add-on alongside a panel too", () => {
    // A panel is morph work, so the same logic applies: 125 + 10.
    expect(price(1, ["panel_full", "sex_bp"]).total).toBe(135);
  });

  it("prices the green tree python test on its own scale", () => {
    // 65, not the 30 the laboratory's standard sex tier would give.
    expect(price(1, ["sex_gtp"]).total).toBe(65);
  });

  it("applies quantity discounts to that own scale", () => {
    expect(price(10, ["sex_gtp"]).total).toBe(600);
    expect(price(50, ["sex_gtp"]).total).toBe(2750);
  });

  it("does not discount a test that has its own scale down to the add-on", () => {
    // The green tree python test has no add-on price, so it stays full price
    // even beside a morph test: 35 + 65.
    expect(price(1, ["clown", "sex_gtp"]).total).toBe(100);
  });
});

describe("panels are flat-priced", () => {
  it("charges 125 for the full panel", () => {
    expect(price(1, ["panel_full"]).total).toBe(125);
  });

  it("charges 195 for the dinker panel", () => {
    expect(price(1, ["panel_dinker"]).total).toBe(195);
  });

  it("does not discount a panel by order size", () => {
    // The whole point of a flat price. 50 x 125, not 50 x some tier rate.
    expect(price(50, ["panel_full"]).total).toBe(6250);
  });

  it("records the panel separately from tiered work on the invoice", () => {
    const row = price(1, ["panel_full", "clown"]).perAnimal[0];
    expect(row.panelCost).toBe(125);
    expect(row.morphBaseCost).toBe(35);
    expect(row.total).toBe(160);
  });

  it("does not let a panel absorb the first-test tier price", () => {
    // A panel beside one morph test must be 125 + 35, not 125 + 20 — the panel
    // is not "the first morph test" for tier purposes.
    expect(price(1, ["panel_full", "clown"]).total).toBe(160);
  });
});

describe("availability", () => {
  it("refuses to quote a test that is not released yet", () => {
    expect(() => price(1, ["black_pastel"])).toThrow(/not available to order yet/i);
  });

  it("refuses an unknown test rather than pricing it as free", () => {
    expect(() => price(1, ["not-a-test"])).toThrow(/invalid or inactive/i);
  });
});
