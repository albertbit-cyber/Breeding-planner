// @ts-nocheck

import { describe, expect, it } from "vitest";
import { cross } from "../src/genetics";
import { Goal, Animal, Outcome } from "../src/types/pairing";
import { goalScoreForPair, matchesGoal, prefilterByGoal, probGoalForPair } from "../src/goals/goal";

const makeAnimal = (overrides: Partial<Animal>): Animal => ({
  id: overrides.id ?? "generated",
  sex: overrides.sex ?? "F",
  morphs: overrides.morphs ?? [],
  hets: overrides.hets ?? [],
  possibleHets: overrides.possibleHets,
});

describe("goal utilities", () => {
  it("calculates visual clown probability for het x het", () => {
    const male = makeAnimal({ id: "m1", sex: "M", hets: ["Clown"] });
    const female = makeAnimal({ id: "f1", sex: "F", hets: ["Clown"] });
    const goal: Goal = { id: "visual-clown", name: "Visual Clown", requireAll: ["Clown"], recessiveState: "visual" };

    const outcomes = cross(male, female);

    expect(prefilterByGoal(male, female, goal)).toBe(true);
    expect(probGoalForPair(outcomes, goal)).toBeCloseTo(0.25, 5);
  });

  it("calculates visual clown probability for visual x het", () => {
    const male = makeAnimal({ id: "m2", sex: "M", morphs: [{ name: "Clown", type: "recessive" }] });
    const female = makeAnimal({ id: "f2", sex: "F", hets: ["Clown"] });
    const goal: Goal = { id: "visual-clown", name: "Visual Clown", requireAll: ["Clown"], recessiveState: "visual" };

    const outcomes = cross(male, female);

    expect(probGoalForPair(outcomes, goal)).toBeCloseTo(0.5, 5);
  });

  it("ignores outcomes containing avoided traits", () => {
    const goal: Goal = { id: "avoid-spider", name: "Avoid Spider", requireAll: ["Pastel"], avoid: ["Spider"] };
    const outcomes: Outcome[] = [
      { genotype: ["Pastel", "Spider"], prob: 0.6, flags: [] },
      { genotype: ["Pastel"], prob: 0.4, flags: [] },
    ];

    expect(matchesGoal(["Pastel", "Spider"], goal)).toBe(false);
    expect(probGoalForPair(outcomes, goal)).toBeCloseTo(0.4, 5);
  });

  it("computes weighted goal score for multiple goals", () => {
    const male = makeAnimal({ id: "m3", sex: "M", hets: ["Clown"] });
    const female = makeAnimal({ id: "f3", sex: "F", hets: ["Clown"] });
    const outcomes = cross(male, female);

    const visualGoal: Goal = { id: "visual", name: "Visual", requireAll: ["Clown"], recessiveState: "visual", weight: 2 };
    const hetGoal: Goal = { id: "het", name: "Het", requireAll: ["het Clown"], weight: 1 };

    expect(goalScoreForPair(outcomes, [visualGoal, hetGoal])).toBeCloseTo(1, 5);
  });
});
