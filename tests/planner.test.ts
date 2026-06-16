// @ts-nocheck

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/signals/extract", () => ({
  extractDemand: async () => ({ index: 0, priceBand: null, signals: [], sources: [] }),
}));

vi.mock("../src/signals/search", () => ({
  getSearchProvider: () => ({
    search: async () => [],
  }),
}));

vi.mock("../src/justify/llm", () => ({
  justify: async () => ({ why_good: "", watchouts: [], sources: [] }),
}));

vi.mock("../src/i18n", () => ({
  default: {
    t: (_key: string, options: Record<string, unknown> = {}) => options.defaultValue || _key,
  },
}));

import { cross } from "../src/genetics";
import { probGoalForPair } from "../src/goals/goal";
import { buildBreedingFlowchartPlan } from "../src/features/suggestions/api";
import { Animal, Goal, Suggestion } from "../src/types/pairing";

const makeAnimal = (overrides: Partial<Animal>): Animal => ({
  id: overrides.id ?? "generated",
  sex: overrides.sex ?? "F",
  morphs: overrides.morphs ?? [],
  hets: overrides.hets ?? [],
  possibleHets: overrides.possibleHets ?? [],
});

const recessiveMorph = (name: string) => ({ name, type: "recessive" as const });

const albinoClownGoal: Goal = {
  id: "albino-clown",
  name: "Albino Clown",
  requireAll: ["Albino", "Clown"],
  avoid: ["het"],
  recessiveState: "visual",
};

const buildSuggestion = (male: Animal, female: Animal, goal: Goal): Suggestion => {
  const outcomes = cross(male, female);
  return {
    maleId: male.id,
    femaleId: female.id,
    outcomes,
    score: 0,
    demand: { index: 0, priceBand: null, signals: [], sources: [] },
    risks: [],
    sources: [],
    rationale: "",
    goalProb: probGoalForPair(outcomes, goal),
    goalFit: 0,
  };
};

const lowerTokens = (tokens: string[] = []) => tokens.map((token) => token.toLowerCase());

describe("buildBreedingFlowchartPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the Clown x Albino to double het to Albino Clown path", () => {
    const clownMale = makeAnimal({ id: "clown-male", sex: "M", morphs: [recessiveMorph("Clown")] });
    const albinoFemale = makeAnimal({ id: "albino-female", sex: "F", morphs: [recessiveMorph("Albino")] });
    const suggestion = buildSuggestion(clownMale, albinoFemale, albinoClownGoal);

    const plan = buildBreedingFlowchartPlan(suggestion, [albinoClownGoal], {
      allMales: [clownMale],
      allFemales: [albinoFemale],
      threshold: 0.05,
      generationLimit: 4,
    });

    expect(plan).toBeDefined();
    expect(plan.goalReached).toBe(true);
    expect(plan.goalReachedGeneration).toBe(2);
    expect(plan.cumulativeProb).toBeCloseTo(0.0625, 5);
    expect(plan.steps.some((step) => step.generation === 1)).toBe(true);
    expect(plan.steps.some((step) => step.generation === 2)).toBe(true);
    expect(Math.max(...plan.steps.map((step) => step.generation))).toBe(2);
    expect(lowerTokens(plan.matchedGenes)).toEqual(expect.arrayContaining(["albino", "clown"]));
    expect((plan.selectedHoldbacks || []).length).toBeGreaterThan(0);
    expect(
      (plan.selectedHoldbacks || []).some((holdback) => {
        const traits = lowerTokens(holdback.traits);
        return traits.includes("het albino") && traits.includes("het clown");
      })
    ).toBe(true);
    expect(
      (plan.selectedHoldbacks || []).some((holdback) => {
        const matches = lowerTokens(holdback.matchedGenes);
        return matches.includes("albino") && matches.includes("clown");
      })
    ).toBe(true);
    expect(
      plan.flowchart?.nodes.some(
        (node) => node.kind === "outcome" && lowerTokens(node.holdbackTraits).includes("het clown")
      )
    ).toBe(true);
  });

  it("respects a one-generation limit even when a later holdback path exists", () => {
    const clownMale = makeAnimal({ id: "clown-male", sex: "M", morphs: [recessiveMorph("Clown")] });
    const albinoFemale = makeAnimal({ id: "albino-female", sex: "F", morphs: [recessiveMorph("Albino")] });
    const suggestion = buildSuggestion(clownMale, albinoFemale, albinoClownGoal);

    const plan = buildBreedingFlowchartPlan(suggestion, [albinoClownGoal], {
      allMales: [clownMale],
      allFemales: [albinoFemale],
      threshold: 0.05,
      generationLimit: 1,
    });

    expect(plan).toBeDefined();
    expect(plan.steps).toHaveLength(1);
    expect(plan.goalReached).toBe(false);
    expect(plan.goalReachedGeneration).toBeNull();
    expect(plan.selectedHoldbacks).toHaveLength(1);
    expect(plan.steps[0].generation).toBe(1);
  });

  it("tracks multiple holdback branches when more than one relevant starting pair exists", () => {
    const clownMale = makeAnimal({ id: "clown-male", sex: "M", morphs: [recessiveMorph("Clown")] });
    const albinoMale = makeAnimal({ id: "albino-male", sex: "M", morphs: [recessiveMorph("Albino")] });
    const albinoFemale = makeAnimal({ id: "albino-female", sex: "F", morphs: [recessiveMorph("Albino")] });
    const clownFemale = makeAnimal({ id: "clown-female", sex: "F", morphs: [recessiveMorph("Clown")] });
    const suggestion = buildSuggestion(clownMale, albinoFemale, albinoClownGoal);

    const plan = buildBreedingFlowchartPlan(suggestion, [albinoClownGoal], {
      allMales: [clownMale, albinoMale],
      allFemales: [albinoFemale, clownFemale],
      threshold: 0.5,
      generationLimit: 2,
    });

    expect(plan).toBeDefined();
    expect((plan.selectedHoldbacks || []).length).toBeGreaterThan(1);
    expect(lowerTokens(plan.matchedGenes)).toEqual(expect.arrayContaining(["albino", "clown"]));
    expect(
      (plan.selectedHoldbacks || []).every((holdback) =>
        lowerTokens(holdback.matchedGenes).includes("albino") || lowerTokens(holdback.matchedGenes).includes("clown")
      )
    ).toBe(true);
  });
});
