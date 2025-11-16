import { Animal, Goal, Outcome } from "../types/pairing";

type RecessiveState = Goal["recessiveState"];

const normalize = (value: string): string => value.trim().toLowerCase();

const traitMatches = (label: string, target: string): boolean => {
  const normalizedLabel = normalize(label);
  const normalizedTarget = normalize(target);
  if (!normalizedTarget) return false;
  if (normalizedLabel === normalizedTarget) return true;
  return normalizedLabel.includes(normalizedTarget);
};

const expandAliases = (label: string, goal: Goal): string[] => {
  const trimmed = label.trim();
  if (!trimmed) return [];
  const aliases = new Set<string>();
  aliases.add(trimmed);

  const lower = trimmed.toLowerCase();
  const explicitHet = lower.startsWith("het ") || lower.includes("het ");
  const explicitPossible = lower.includes("possible het");

  if (!explicitHet && !explicitPossible) {
    aliases.add(`Super ${trimmed}`);

    const state: RecessiveState = goal.recessiveState;
    if (state === "het" || state === "possibleHet") {
      aliases.add(`het ${trimmed}`);
      aliases.add(`possible het ${trimmed}`);
    }
  }

  return Array.from(aliases);
};

const phenotypeMatches = (phenotype: string[], label: string, goal: Goal): boolean => {
  const aliases = expandAliases(label, goal);
  return aliases.some((alias) => phenotype.some((entry) => traitMatches(entry, alias)));
};

const carriesRecessivePotential = (animal: Animal, gene: string): boolean => {
  const match = (value: string | undefined): boolean => {
    if (!value) return false;
    return traitMatches(value, gene) || traitMatches(value, `het ${gene}`);
  };

  if (animal.morphs?.some((morph) => traitMatches(morph.name, gene))) return true;
  if (animal.hets?.some((het) => traitMatches(het, gene))) return true;
  if (animal.possibleHets?.some((entry) => match(entry))) return true;
  return false;
};

const hasVisualTrait = (animal: Animal, trait: string): boolean => {
  return animal.morphs?.some((morph) => traitMatches(morph.name, trait)) ?? false;
};

const normalizeRecessiveLabel = (label: string): string => {
  let cleaned = label.trim();
  cleaned = cleaned.replace(/^(?:het|possible het|pos het)\s+/i, "");
  return cleaned.trim();
};

export const matchesGoal = (phenotype: string[], goal: Goal): boolean => {
  const items = phenotype || [];
  if (goal.avoid?.some((trait) => items.some((entry) => traitMatches(entry, trait)))) {
    return false;
  }

  if (goal.requireAll?.length) {
    const allSatisfied = goal.requireAll.every((label) => phenotypeMatches(items, label, goal));
    if (!allSatisfied) return false;
  }

  if (goal.requireAny?.length) {
    const anySatisfied = goal.requireAny.some((label) => phenotypeMatches(items, label, goal));
    if (!anySatisfied) return false;
  }

  return true;
};

export const probGoalForPair = (outcomes: Outcome[], goal: Goal): number => {
  return outcomes.reduce((total, outcome) => {
    if (matchesGoal(outcome.genotype, goal)) {
      return total + outcome.prob;
    }
    return total;
  }, 0);
};

export const goalScoreForPair = (outcomes: Outcome[], goals: Goal[]): number => {
  return goals.reduce((score, goal) => {
    const probability = probGoalForPair(outcomes, goal);
    if (goal.minProb && probability < goal.minProb) {
      return score;
    }
    const weight = goal.weight ?? 1;
    return score + probability * weight;
  }, 0);
};

export const prefilterByGoal = (a: Animal, b: Animal, goal: Goal): boolean => {
  if (goal.avoid?.length) {
    const avoidHit = goal.avoid.some((trait) => hasVisualTrait(a, trait) || hasVisualTrait(b, trait));
    if (avoidHit) return false;
  }

  if (goal.recessiveState === "visual" && goal.requireAll?.length) {
    return goal.requireAll.every((label) => {
      const base = normalizeRecessiveLabel(label);
      if (!base) return true;
      return carriesRecessivePotential(a, base) && carriesRecessivePotential(b, base);
    });
  }

  return true;
};
