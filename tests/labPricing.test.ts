import { describe, expect, it } from "vitest";
import { LAB_TEST_CATALOG_SEEDS, LAB_PRICING_EXAMPLE_ORDERS } from "../src/data/testCatalog";
import { calculateLabOrderPrice } from "../src/services/pricing/calculateLabOrderPrice";

const activeCatalog = LAB_TEST_CATALOG_SEEDS.map((entry) => ({
  id: entry.id,
  name: entry.name,
  category: entry.category,
  pricingType: entry.pricingType,
  active: entry.active,
  description: entry.description,
  sortOrder: entry.sortOrder,
}));

describe("calculateLabOrderPrice", () => {
  it("prices one animal with two morph tests in tier 1", () => {
    const order = LAB_PRICING_EXAMPLE_ORDERS[0];
    const breakdown = calculateLabOrderPrice(order, activeCatalog);

    expect(breakdown.animalCount).toBe(1);
    expect(breakdown.tier).toBe("1-9");
    expect(breakdown.total).toBe(5500);
    expect(breakdown.perAnimal[0]?.morphBaseCost).toBe(3500);
    expect(breakdown.perAnimal[0]?.additionalMorphCost).toBe(2000);
    expect(breakdown.perAnimal[0]?.sexCost).toBe(0);
  });

  it("prices one animal with three morph tests and sex in tier 1", () => {
    const order = LAB_PRICING_EXAMPLE_ORDERS[1];
    const breakdown = calculateLabOrderPrice(order, activeCatalog);

    expect(breakdown.total).toBe(10500);
    expect(breakdown.perAnimal[0]?.morphBaseCost).toBe(3500);
    expect(breakdown.perAnimal[0]?.additionalMorphCost).toBe(4000);
    expect(breakdown.perAnimal[0]?.sexCost).toBe(3000);
  });

  it("uses tier 2 prices when order has ten animals", () => {
    const order = Array.from({ length: 10 }, (_, index) => ({
      animalId: `animal-${index + 1}`,
      selectedTestIds: ["morph-clown", "sex-determination"],
    }));

    const breakdown = calculateLabOrderPrice(order, activeCatalog);

    expect(breakdown.tier).toBe("10-49");
    expect(breakdown.total).toBe(55000);
    expect(breakdown.perAnimal[0]?.morphBaseCost).toBe(3000);
    expect(breakdown.perAnimal[0]?.sexCost).toBe(2500);
  });
});
