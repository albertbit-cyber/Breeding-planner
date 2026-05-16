import { describe, expect, it } from "vitest";
import { calculateLabOrderPrice } from "./calculateLabOrderPrice";

const catalog = [
  { id: "morph-a", name: "Morph A", category: "morph", pricingType: "morph", active: true, visibleInBreederApp: true },
  { id: "morph-b", name: "Morph B", category: "morph", pricingType: "morph", active: true, visibleInBreederApp: true },
  { id: "morph-c", name: "Morph C", category: "morph", pricingType: "morph", active: true, visibleInBreederApp: true },
  { id: "sex", name: "Sex Determination", category: "sex-determination", pricingType: "sex", active: true, visibleInBreederApp: true },
];

const buildAnimals = (count, selectedTestIds) =>
  Array.from({ length: count }, (_, index) => ({
    animalId: `animal-${index + 1}`,
    selectedTestIds: [...selectedTestIds],
  }));

describe("calculateLabOrderPrice", () => {
  it("Test 1: 1 animal, 1 morph = 35 EUR", () => {
    const result = calculateLabOrderPrice(buildAnimals(1, ["morph-a"]), catalog);
    expect(result.total).toBe(3500);
  });

  it("Test 2: 1 animal, 2 morphs = 55 EUR", () => {
    const result = calculateLabOrderPrice(buildAnimals(1, ["morph-a", "morph-b"]), catalog);
    expect(result.total).toBe(5500);
  });

  it("Test 3: 1 animal, 3 morphs = 75 EUR", () => {
    const result = calculateLabOrderPrice(buildAnimals(1, ["morph-a", "morph-b", "morph-c"]), catalog);
    expect(result.total).toBe(7500);
  });

  it("Test 4: 1 animal, sex only = 30 EUR", () => {
    const result = calculateLabOrderPrice(buildAnimals(1, ["sex"]), catalog);
    expect(result.total).toBe(3000);
  });

  it("Test 5: 1 animal, 1 morph + sex = 45 EUR", () => {
    const result = calculateLabOrderPrice(buildAnimals(1, ["morph-a", "sex"]), catalog);
    expect(result.total).toBe(4500);
    expect(result.perAnimal[0].sexAddOnCost).toBe(1000);
    expect(result.perAnimal[0].sexOnlyCost).toBe(0);
  });

  it("Test 6: 1 animal, 3 morphs + sex = 85 EUR", () => {
    const result = calculateLabOrderPrice(buildAnimals(1, ["morph-a", "morph-b", "morph-c", "sex"]), catalog);
    expect(result.total).toBe(8500);
  });

  it("Test 7: 10 animals, 1 morph each = 30 EUR per animal", () => {
    const result = calculateLabOrderPrice(buildAnimals(10, ["morph-a"]), catalog);
    expect(result.tier).toBe("10-49");
    expect(result.perAnimal.every((entry) => entry.total === 3000)).toBe(true);
    expect(result.total).toBe(30000);
  });

  it("Test 8: 10 animals, sex only = 25 EUR per animal", () => {
    const result = calculateLabOrderPrice(buildAnimals(10, ["sex"]), catalog);
    expect(result.tier).toBe("10-49");
    expect(result.perAnimal.every((entry) => entry.total === 2500)).toBe(true);
    expect(result.total).toBe(25000);
  });

  it("Test 9: 10 animals, one animal with 2 morphs + sex = 60 EUR for that animal", () => {
    const animals = buildAnimals(10, ["morph-a"]);
    animals[0] = { animalId: "animal-1", selectedTestIds: ["morph-a", "morph-b", "sex"] };
    const result = calculateLabOrderPrice(animals, catalog);
    expect(result.perAnimal[0].total).toBe(6000);
  });

  it("Test 10: 50 animals, 1 morph each = 25 EUR per animal", () => {
    const result = calculateLabOrderPrice(buildAnimals(50, ["morph-a"]), catalog);
    expect(result.tier).toBe("50+");
    expect(result.perAnimal.every((entry) => entry.total === 2500)).toBe(true);
    expect(result.total).toBe(125000);
  });

  it("Test 11: 50 animals, sex only = 20 EUR per animal", () => {
    const result = calculateLabOrderPrice(buildAnimals(50, ["sex"]), catalog);
    expect(result.tier).toBe("50+");
    expect(result.perAnimal.every((entry) => entry.total === 2000)).toBe(true);
    expect(result.total).toBe(100000);
  });

  it("Test 12: 50 animals, one animal with 2 morphs + sex = 55 EUR for that animal", () => {
    const animals = buildAnimals(50, ["morph-a"]);
    animals[0] = { animalId: "animal-1", selectedTestIds: ["morph-a", "morph-b", "sex"] };
    const result = calculateLabOrderPrice(animals, catalog);
    expect(result.perAnimal[0].total).toBe(5500);
  });
});
