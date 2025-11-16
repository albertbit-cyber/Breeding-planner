// @ts-nocheck

import { describe, expect, it } from "vitest";
import { baseScore, finalScore } from "../src/rank/score";
import { applyRiskFlags } from "../src/rank/rules";
import { Animal, Demand, Goal, Outcome } from "../src/types/pairing";
import { cross } from "../src/genetics";

const weights = {
  wDemand: 1,
  wPrice: 1,
  wNovelty: 1,
  wRisk: 1,
  wGoalFit: 1,
};

const buildDemand = (index: number, priceBand: [number, number] | null = null): Demand => ({
  index,
  priceBand,
  signals: [],
  sources: [],
});

describe("score calculations", () => {
  it("reduces score when penalties are present", () => {
    const demand = buildDemand(5, [800, 1000]);
    const outcomes: Outcome[] = [
      { genotype: ["Pastel"], prob: 1, flags: [] },
    ];

    const riskFree = baseScore({ outcomes, demand, risks: { risks: [], penalty: 0 }, w: weights });
    const penalized = baseScore({ outcomes, demand, risks: { risks: ["High risk"], penalty: 0.5 }, w: weights });

    expect(penalized).toBeLessThan(riskFree);
  });

  it("scores higher demand index more favorably", () => {
    const demandLow = buildDemand(3, [500, 700]);
    const demandHigh = buildDemand(8, [500, 700]);
    const outcomes: Outcome[] = [
      { genotype: ["Pastel"], prob: 1, flags: [] },
    ];
    const risks = { risks: [], penalty: 0 };

    const lowScore = baseScore({ outcomes, demand: demandLow, risks, w: weights });
    const highScore = baseScore({ outcomes, demand: demandHigh, risks, w: weights });

    expect(highScore).toBeGreaterThan(lowScore);
  });

  it("improves final score when goal probability increases", () => {
    const male: Animal = { id: "m", sex: "M", hets: ["Clown"], morphs: [], possibleHets: [] };
    const female: Animal = { id: "f", sex: "F", hets: ["Clown"], morphs: [], possibleHets: [] };
    const visualFemale: Animal = { id: "f2", sex: "F", morphs: [{ name: "Clown", type: "recessive" }], hets: [], possibleHets: [] };

    const goal: Goal = { id: "visual-clown", name: "Visual Clown", requireAll: ["Clown"], recessiveState: "visual", weight: 1 };
    const demand = buildDemand(5, [1000, 1500]);
    const risks = applyRiskFlags("Clown x Clown", []);

    const hetPairOutcomes = cross(male, female);
    const visualPairOutcomes = cross(male, visualFemale);

    const hetScore = finalScore({ outcomes: hetPairOutcomes, demand, risks, goals: [goal], w: weights });
    const visualScore = finalScore({ outcomes: visualPairOutcomes, demand, risks, goals: [goal], w: weights });

    expect(visualScore.goalFit).toBeGreaterThan(hetScore.goalFit);
    expect(visualScore.score).toBeGreaterThan(hetScore.score);
  });
});
