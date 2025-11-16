import { Demand, Goal, Outcome } from "../types/pairing";
import { goalScoreForPair } from "../goals/goal";

export interface ScoreWeights {
  wDemand: number;
  wPrice: number;
  wNovelty: number;
  wRisk: number;
  wGoalFit?: number;
}

export interface BaseScoreInput {
  outcomes: Outcome[];
  demand: Demand;
  risks: { risks: string[]; penalty: number };
  w: Pick<ScoreWeights, "wDemand" | "wPrice" | "wNovelty" | "wRisk">;
}

export interface FinalScoreInput {
  outcomes: Outcome[];
  demand: Demand;
  risks: { risks: string[]; penalty: number };
  goals: Goal[];
  w: ScoreWeights;
}

const clamp01 = (value: number): number => {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const demandScore = (demand: Demand): number => {
  const index = typeof demand?.index === "number" ? demand.index : 0;
  return clamp01(index / 10);
};

const priceScore = (demand: Demand): number => {
  const band = demand?.priceBand;
  if (!band || band.length !== 2) return 0;
  const [low, high] = band;
  const values = [low, high].filter((value) => typeof value === "number");
  if (!values.length) return 0;
  const average = values.reduce((sum, value) => sum + (value ?? 0), 0) / values.length;
  const normalized = average / (average + 5000);
  return clamp01(normalized);
};

const noveltyScore = (outcomes: Outcome[]): number => {
  if (!outcomes?.length) return 0;
  const uniqueGenotypes = new Set(outcomes.map((outcome) => outcome.genotype.slice().sort().join("|")));
  const normalized = (uniqueGenotypes.size - 1) / 3;
  return clamp01(normalized);
};

export const baseScore = ({ outcomes, demand, risks, w }: BaseScoreInput): number => {
  const demandComponent = w.wDemand * demandScore(demand);
  const priceComponent = w.wPrice * priceScore(demand);
  const noveltyComponent = w.wNovelty * noveltyScore(outcomes);
  const riskPenalty = w.wRisk * (risks?.penalty ?? 0);

  const total = demandComponent + priceComponent + noveltyComponent - riskPenalty;
  return Math.max(0, total);
};

export const finalScore = ({ outcomes, demand, risks, goals, w }: FinalScoreInput): { score: number; goalFit: number } => {
  const base = baseScore({ outcomes, demand, risks, w });
  const goalFit = goals?.length ? goalScoreForPair(outcomes, goals) : 0;
  const total = base + (w.wGoalFit ?? 1) * goalFit;
  return {
    score: Math.max(0, total),
    goalFit,
  };
};
