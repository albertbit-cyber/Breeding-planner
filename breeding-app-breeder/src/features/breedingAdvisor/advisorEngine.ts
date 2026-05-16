import { suggestForCollections } from "../suggestions/api";
import type { Goal, Animal, Suggestion } from "../../types/pairing";
import type { AdvisorProgressReporter } from "./advisorProgressTypes";

export type AdvisorWeightOptions = {
  wDemand: number;
  wPrice: number;
  wNovelty: number;
  wRisk: number;
  wGoalFit: number;
};

const normalizeText = (value: unknown): string =>
  String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const truthy = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const token = normalizeText(value);
  if (!token) return false;
  return ["true", "yes", "y", "1", "ready", "available", "mature", "adult", "breedable", "ok"].includes(token);
};

const falsey = (value: unknown): boolean => {
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return value === 0;
  const token = normalizeText(value);
  if (!token) return false;
  return ["false", "no", "n", "0", "unavailable", "not ready", "hold", "retired", "juvenile", "immature"].includes(token);
};

export const isAnimalAvailableForBreeding = (animal: any): boolean => {
  const directSignals = [
    animal?.availableForBreeding,
    animal?.breedingAvailable,
    animal?.isAvailableForBreeding,
    animal?.available,
  ];

  const anyDirect = directSignals.some((value) => value !== undefined && value !== null && String(value).trim() !== "");
  if (anyDirect) {
    return directSignals.every((value) => value == null || value === "" || !falsey(value));
  }

  const statusSignals = [animal?.breedingStatus, animal?.status, animal?.availability];
  const anyStatus = statusSignals.some((value) => value !== undefined && value !== null && String(value).trim() !== "");
  if (!anyStatus) return true;

  return statusSignals.every((value) => {
    const token = normalizeText(value);
    if (!token) return true;
    return !(
      token.includes("unavailable") ||
      token.includes("not ready") ||
      token.includes("retired") ||
      token.includes("hold") ||
      token.includes("inactive")
    );
  });
};

export const isAnimalMatureForBreeding = (animal: any): boolean => {
  const matureSignals = [
    animal?.matureForBreeding,
    animal?.isMature,
    animal?.breedingMature,
    animal?.isAdult,
    animal?.adult,
  ];

  const anyMatureSignal = matureSignals.some((value) => value !== undefined && value !== null && String(value).trim() !== "");
  if (!anyMatureSignal) return true;

  return matureSignals.every((value) => value == null || value === "" || truthy(value));
};

export const runBreedingAdvisor = async (
  goals: Goal[],
  options: {
    males: Animal[];
    females: Animal[];
    weights: AdvisorWeightOptions;
    onProgress?: AdvisorProgressReporter;
  }
): Promise<Suggestion[]> => {
  return suggestForCollections(options.males, options.females, goals, options.weights, {
    onProgress: options.onProgress,
  });
};
