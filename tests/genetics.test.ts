// @ts-nocheck

import { describe, expect, it } from "vitest";
import { cross } from "../src/genetics";
import { Animal } from "../src/types/pairing";

const makeAnimal = (overrides: Partial<Animal>): Animal => ({
  id: overrides.id ?? "generated",
  sex: overrides.sex ?? "F",
  morphs: overrides.morphs ?? [],
  hets: overrides.hets ?? [],
  possibleHets: overrides.possibleHets,
});

const findProb = (outcomes: ReturnType<typeof cross>, labels: string[]): number => {
  const target = labels.slice().sort().join("|");
  const entry = outcomes.find((outcome) => outcome.genotype.slice().sort().join("|") === target);
  return entry?.prob ?? 0;
};

describe("punnettCross", () => {
  it("returns expected ratios for het x het", () => {
    const male = makeAnimal({ id: "m1", sex: "M", hets: ["Clown"] });
    const female = makeAnimal({ id: "f1", sex: "F", hets: ["Clown"] });

    const outcomes = cross(male, female);

    expect(findProb(outcomes, ["Clown"])).toBeCloseTo(0.25, 5);
    expect(findProb(outcomes, ["het Clown"])).toBeCloseTo(0.5, 5);
    expect(findProb(outcomes, [])).toBeCloseTo(0.25, 5);
    expect(outcomes.reduce((sum, entry) => sum + entry.prob, 0)).toBeCloseTo(1, 5);
  });

  it("returns expected ratios for visual x het", () => {
    const male = makeAnimal({ id: "m2", sex: "M", morphs: [{ name: "Clown", type: "recessive" }] });
    const female = makeAnimal({ id: "f2", sex: "F", hets: ["Clown"] });

    const outcomes = cross(male, female);

    expect(findProb(outcomes, ["Clown"])).toBeCloseTo(0.5, 5);
    expect(findProb(outcomes, ["het Clown"])).toBeCloseTo(0.5, 5);
    expect(findProb(outcomes, [])).toBeCloseTo(0, 5);
    expect(outcomes.reduce((sum, entry) => sum + entry.prob, 0)).toBeCloseTo(1, 5);
  });

  it("returns 100% het for visual x normal", () => {
    const male = makeAnimal({ id: "m3", sex: "M", morphs: [{ name: "Clown", type: "recessive" }] });
    const female = makeAnimal({ id: "f3", sex: "F" });

    const outcomes = cross(male, female);

    expect(findProb(outcomes, ["Clown"])).toBeCloseTo(0, 6);
    expect(findProb(outcomes, ["het Clown"])).toBeCloseTo(1, 6);
    expect(findProb(outcomes, [])).toBeCloseTo(0, 6);
  });

  it("weights possible het probability", () => {
    const male = makeAnimal({ id: "m4", sex: "M", morphs: [{ name: "Clown", type: "recessive" }] });
    const female = makeAnimal({ id: "f4", sex: "F", possibleHets: ["66% het Clown"] });

    const outcomes = cross(male, female);

    expect(findProb(outcomes, ["Clown"])).toBeCloseTo(2 / 6, 6);
    expect(findProb(outcomes, ["het Clown"])).toBeCloseTo(4 / 6, 6);
    expect(findProb(outcomes, [])).toBeCloseTo(0, 6);
  });
});
