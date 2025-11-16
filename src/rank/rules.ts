import rulesConfig from "../config/rules.json";
import { Outcome } from "../types/pairing";

type RiskRule = {
  pattern: string;
  flag: string;
  penalty: number;
};

type RiskResult = {
  risks: string[];
  penalty: number;
};

const normalize = (value: string): string => value.trim().toLowerCase();

const riskRules: RiskRule[] = Array.isArray((rulesConfig as any)?.risk_rules)
  ? ((rulesConfig as any).risk_rules as RiskRule[]).map((rule) => ({
      pattern: rule.pattern,
      flag: rule.flag,
      penalty: rule.penalty ?? 0,
    }))
  : [];

const unique = <T>(values: T[]): T[] => {
  const seen = new Set<T>();
  values.forEach((value) => seen.add(value));
  return Array.from(seen);
};

const matchRule = (pairLabel: string, rule: RiskRule): boolean => {
  if (!pairLabel) return false;
  const normalizedPattern = normalize(rule.pattern);
  const normalizedPair = normalize(pairLabel);
  return normalizedPair.includes(normalizedPattern);
};

export const applyRiskFlags = (pairLabel: string, _outcomes: Outcome[]): RiskResult => {
  let penalty = 0;
  const flags: string[] = [];

  riskRules.forEach((rule) => {
    if (matchRule(pairLabel, rule)) {
      flags.push(rule.flag);
      penalty += rule.penalty;
    }
  });

  const boundedPenalty = Math.min(1, Math.max(0, penalty));
  return {
    risks: unique(flags),
    penalty: boundedPenalty,
  };
};
