import { cross } from "../../genetics";
import { extractDemand } from "../../signals/extract";
import { getSearchProvider } from "../../signals/search";
import { applyRiskFlags } from "../../rank/rules";
import { finalScore } from "../../rank/score";
import { matchesGoal, prefilterByGoal, probGoalForPair } from "../../goals/goal";
import { justify } from "../../justify/llm";
import {
  Animal,
  Goal,
  Suggestion,
  Demand,
  Outcome,
  MultiGenPlan,
  PlanStep,
  PlanProbabilityEntry,
  PlanHoldbackSelection,
  BreedingFlowchartGraph,
  BreedingFlowchartNode,
} from "../../types/pairing";
import { inferMorphType } from "../../genetics/geneLibrary";
import i18n from "../../i18n";
import type { AdvisorProgressReporter } from "../breedingAdvisor/advisorProgressTypes";

const advisorNamespace = "advisor";
const tAdvisor = (key: string, defaultValue: string, options: Record<string, unknown> = {}) =>
  i18n.t(key, { ns: advisorNamespace, defaultValue, ...options });

type WeightOptions = {
  wDemand: number;
  wPrice: number;
  wNovelty: number;
  wRisk: number;
  wGoalFit: number;
};

const DEFAULT_SEARCH_LIMIT = 6;
const DEFAULT_CONCURRENCY = (() => {
  if (typeof process !== "undefined" && process && process.env && process.env.SUGGESTION_CONCURRENCY) {
    const parsed = Number(process.env.SUGGESTION_CONCURRENCY);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 3;
})();

const FILTER_BATCH_SIZE = 200;
const PAIRING_MALE_BATCH_SIZE = 6;

const yieldToUi = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => unknown }).requestAnimationFrame;
    if (typeof raf === "function") {
      raf(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
};

const uniqueStrings = (values: (string | undefined | null)[]): string[] => {
  const seen = new Set<string>();
  values
    .filter((value): value is string => Boolean(value && value.trim()))
    .forEach((value) => {
      const trimmed = value.trim();
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
      }
    });
  return Array.from(seen);
};

const collectKeywords = (a: Animal, b: Animal, outcomes: Outcome[]): string[] => {
  const keywords: string[] = [];

  const collectMorphs = (animal: Animal) => {
    animal.morphs?.forEach((morph) => keywords.push(morph.name));
    animal.hets?.forEach((het) => keywords.push(`${het}`));
    animal.possibleHets?.forEach((het) => keywords.push(het));
  };

  collectMorphs(a);
  collectMorphs(b);

  outcomes.slice(0, 4).forEach((outcome) => {
    if (outcome.genotype?.length) {
      keywords.push(outcome.genotype.join(" "));
    }
  });

  return uniqueStrings(keywords).slice(0, 6);
};

const buildQuery = (keywords: string[]): string => {
  if (!keywords.length) return "ball python morph";
  return `ball python ${keywords.join(" ")}`.trim();
};

const formatAnimalLabel = (animal: Animal): string => {
  const morphs = animal.morphs?.map((morph) => morph.name).join(" ") || "Normal";
  return `${animal.sex === "M" ? "Male" : "Female"} ${morphs}`;
};

const formatPercent = (value: number, digits = 0): string => `${(Number(value || 0) * 100).toFixed(digits)}%`;

const defaultDemand = (): Demand => ({ index: 0, priceBand: null, signals: [], sources: [] });

const summarizeRationale = (score: number, demandIndex: number, goalSummary: string): string =>
  tAdvisor("api.rationaleSummary", "Projected score {{score}} with demand index {{demand}}. {{goalSummary}}", {
    score: score.toFixed(2),
    demand: demandIndex,
    goalSummary,
  }).trim();

const collectGoalProbabilities = (outcomes: Outcome[], goals: Goal[]): number[] => {
  return goals.map((goal) => probGoalForPair(outcomes, goal));
};

const bestGoalSummary = (goals: Goal[], probabilities: number[]): string => {
  if (!goals.length || !probabilities.length) {
    return tAdvisor("api.noGoalTargets", "No specific goal targets.");
  }
  let bestIndex = 0;
  let bestProb = probabilities[0];
  probabilities.forEach((prob, idx) => {
    if (prob > bestProb) {
      bestProb = prob;
      bestIndex = idx;
    }
  });
  const goal = goals[bestIndex];
  return tAdvisor("api.goalSummary", "{{prob}}% chance to hit goal '{{goal}}'.", {
    prob: (bestProb * 100).toFixed(1),
    goal: goal.name,
  });
};

const safeJustify = async (
  context: {
    a: Animal;
    b: Animal;
    outcomes: Outcome[];
    demand: Demand;
    risks: string[];
    goals: Goal[];
  },
  fallback: string
): Promise<string> => {
  try {
    const result = await justify(context);
    const watchouts = result.watchouts?.length
      ? tAdvisor("api.watchouts", " Watchouts: {{list}}.", {
          list: result.watchouts.join("; "),
        })
      : "";
    const sourced = result.sources?.length
      ? tAdvisor("api.sources", " Sources: {{list}}.", {
          list: result.sources.join(", "),
        })
      : "";
    return `${result.why_good}${watchouts}${sourced}`.trim();
  } catch (error) {
    return fallback;
  }
};

const normalizeToken = (value: string): string => value.toLowerCase().replace(/\s+/g, " ").trim();

const stripPrefixes = (value: string): string =>
  value
    .replace(/^(?:het|possible het|pos het)\s+/i, "")
    .replace(/^visual\s+/i, "")
    .replace(/^super\s+/i, "")
    .trim();

const cleanGoalTrait = (value: string): string => stripPrefixes(value);

const gatherTargetTraits = (goals: Goal[]): string[] => {
  const traits = new Set<string>();
  goals.forEach((goal) => {
    (goal.requireAll || []).forEach((label) => {
      const cleaned = cleanGoalTrait(label);
      if (cleaned) traits.add(cleaned);
    });
  });
  return Array.from(traits);
};

const tokenizeOutcome = (outcome: Outcome): string[] => outcome.genotype?.map((token) => token.trim()).filter(Boolean) ?? [];

const tokenizeAnimalGenetics = (animal: Animal): string[] => {
  const tokens: string[] = [];
  (animal.morphs || []).forEach((morph) => {
    if (morph?.name) tokens.push(morph.name);
  });
  (animal.hets || []).forEach((het) => {
    if (!het) return;
    const trimmed = String(het).trim();
    if (!trimmed) return;
    tokens.push(/^het\s+/i.test(trimmed) ? trimmed : `het ${trimmed}`);
  });
  (animal.possibleHets || []).forEach((het) => {
    if (!het) return;
    const trimmed = String(het).trim();
    if (!trimmed) return;
    tokens.push(/^possible het\s+/i.test(trimmed) ? trimmed : `possible het ${trimmed}`);
  });
  return tokens;
};

const parseOutcomeGenetics = (tokens: string[]) => {
  const morphs: Animal["morphs"] = [];
  const hets: string[] = [];
  const possibleHets: string[] = [];
  const display: string[] = [];

  tokens.forEach((token) => {
    const trimmed = token.trim();
    if (!trimmed) return;
    const normalized = normalizeToken(trimmed);
    if (normalized.startsWith("possible het")) {
      const gene = stripPrefixes(trimmed);
      if (gene) {
        possibleHets.push(gene);
        display.push(`possible het ${gene}`);
      }
      return;
    }
    if (normalized.startsWith("het ")) {
      const gene = stripPrefixes(trimmed);
      if (gene) {
        hets.push(gene);
        display.push(`het ${gene}`);
      }
      return;
    }
    morphs.push({ name: trimmed, type: inferMorphType(trimmed) });
    display.push(trimmed);
  });

  return { morphs, hets, possibleHets, displayTokens: display };
};

const evaluateOutcomeForTraits = (tokens: string[], targetTraits: string[]) => {
  const normalizedTokens = tokens.map(normalizeToken);
  let visualMatches = 0;
  let hetMatches = 0;

  targetTraits.forEach((trait) => {
    const normalizedTrait = normalizeToken(trait);
    const visual = normalizedTokens.some((token) => {
      if (token.startsWith("het ") || token.startsWith("possible het ")) return false;
      return token.includes(normalizedTrait);
    });

    if (visual) {
      visualMatches += 1;
      return;
    }

    const het = normalizedTokens.some((token) => {
      if (token.startsWith("het ")) {
        return token.replace(/^het\s+/, "").includes(normalizedTrait);
      }
      if (token.startsWith("possible het ")) {
        return token.replace(/^possible het\s+/, "").includes(normalizedTrait);
      }
      return false;
    });

    if (het) {
      hetMatches += 1;
    }
  });

  const score = visualMatches * 2 + hetMatches;
  return { score, visualMatches, hetMatches };
};

const collectMatchedGenes = (tokens: string[], targetTraits: string[]): string[] => {
  const matched = new Set<string>();

  targetTraits.forEach((trait) => {
    const normalizedTrait = normalizeToken(cleanGoalTrait(trait));
    if (!normalizedTrait) return;

    const isMatch = tokens.some((token) => {
      const normalizedToken = normalizeToken(cleanGoalTrait(token));
      return normalizedToken.includes(normalizedTrait) || normalizedTrait.includes(normalizedToken);
    });

    if (isMatch) {
      matched.add(cleanGoalTrait(trait));
    }
  });

  return Array.from(matched);
};

const buildHoldbackAnimals = (tokens: string[], pairLabel: string) => {
  const parsed = parseOutcomeGenetics(tokens);
  const base = {
    morphs: parsed.morphs,
    hets: parsed.hets,
    possibleHets: parsed.possibleHets,
  };

  const female: Animal = {
    id: `${pairLabel}-holdback-f`,
    sex: "F",
    morphs: base.morphs,
    hets: base.hets,
    possibleHets: base.possibleHets,
  };
  const male: Animal = {
    id: `${pairLabel}-holdback-m`,
    sex: "M",
    morphs: base.morphs,
    hets: base.hets,
    possibleHets: base.possibleHets,
  };

  return { female, male, traits: parsed.displayTokens };
};

type SuggestionContext = {
  allMales: Animal[];
  allFemales: Animal[];
};

type CandidateAssessment = {
  outcome: Outcome;
  score: number;
  visualMatches: number;
  hetMatches: number;
};

type SecondStepPlan = {
  prob: number;
  partnerId: string;
  partnerSex: "M" | "F";
  holdbackSex: "M" | "F";
  outcomes: Outcome[];
};

type PlannerAnimal = Animal & {
  plannerKey: string;
  sourceNodeId: string;
  generation: number;
  isSynthetic?: boolean;
};

type FlowchartPlannerOptions = {
  allMales: Animal[];
  allFemales: Animal[];
  threshold?: number;
  generationLimit?: number;
  branchLimit?: number;
};

type FlowchartPairCandidate = {
  signature: string;
  generation: number;
  male: PlannerAnimal;
  female: PlannerAnimal;
  outcomes: Outcome[];
  goalProb: number;
  displayProbabilities: PlanProbabilityEntry[];
  selectedOutcome: Outcome | null;
  selectedOutcomeScore: number;
  selectedOutcomeTokens: string[];
  selectedOutcomeProb: number;
  score: number;
};

type FlowchartContinuation = {
  outcome: Outcome | null;
  tokens: string[];
  score: number;
};

const FLOWCHART_GOAL_THRESHOLD = 0.7;
const FLOWCHART_GENERATION_LIMIT = 5;
const FLOWCHART_BRANCH_LIMIT = 3;
const FLOWCHART_OUTCOME_LIMIT = 4;

const outcomeDisplayLabel = (outcome: Outcome): string => outcome.genotype?.join(" ") || "Unknown morph";

const buildOutcomeProbabilityEntries = (outcomes: Outcome[], goals: Goal[]): PlanProbabilityEntry[] => {
  return [...(outcomes || [])]
    .map((outcome) => ({
      label: outcomeDisplayLabel(outcome),
      probability: outcome.prob,
      isGoal: goals.some((goal) => matchesGoal(outcome.genotype, goal)),
    }))
    .sort((a, b) => Number(Boolean(b.isGoal)) - Number(Boolean(a.isGoal)) || b.probability - a.probability)
    .slice(0, FLOWCHART_OUTCOME_LIMIT);
};

const selectContinuationOutcome = (
  outcomes: Outcome[],
  goals: Goal[],
  targetTraits: string[]
): FlowchartContinuation => {
  let bestOutcome: Outcome | null = null;
  let bestScore = -1;
  let bestTokens: string[] = [];

  (outcomes || []).forEach((outcome) => {
    const tokens = tokenizeOutcome(outcome);
    const assessment = evaluateOutcomeForTraits(tokens, targetTraits);
    const goalHit = goals.some((goal) => matchesGoal(outcome.genotype, goal));
    const score = (goalHit ? 1000 : 0) + assessment.score * 10 + outcome.prob * 100;
    if (score > bestScore) {
      bestScore = score;
      bestOutcome = outcome;
      bestTokens = tokens;
    }
  });

  return {
    outcome: bestOutcome,
    tokens: bestTokens,
    score: bestScore,
  };
};

const createPlannerCollectionAnimal = (animal: Animal): PlannerAnimal => ({
  ...animal,
  plannerKey: `collection:${animal.id}`,
  sourceNodeId: `collection:${animal.id}`,
  generation: 0,
  isSynthetic: false,
});

const createSyntheticPlannerAnimals = (tokens: string[], sourceNodeId: string, generation: number): { male: PlannerAnimal; female: PlannerAnimal; traits: string[] } => {
  const holdback = buildHoldbackAnimals(tokens, `${sourceNodeId}-g${generation}`);
  return {
    male: {
      ...holdback.male,
      plannerKey: `${sourceNodeId}:male`,
      sourceNodeId,
      generation,
      isSynthetic: true,
    },
    female: {
      ...holdback.female,
      plannerKey: `${sourceNodeId}:female`,
      sourceNodeId,
      generation,
      isSynthetic: true,
    },
    traits: holdback.traits,
  };
};

const buildFlowchartStepSummary = (candidate: FlowchartPairCandidate, threshold: number): string => {
  const topOutcome = candidate.displayProbabilities[0];
  if (!topOutcome) {
    return `Goal chance ${formatPercent(candidate.goalProb, 1)}.`;
  }
  if (candidate.goalProb >= threshold) {
    return `${topOutcome.label} with goal chance ${formatPercent(candidate.goalProb, 1)} reaches the plan target.`;
  }
  return `${topOutcome.label} with goal chance ${formatPercent(candidate.goalProb, 1)} keeps the project moving.`;
};

const scoreFlowchartCandidate = (
  candidate: Omit<FlowchartPairCandidate, "score">,
  initialSignature: string,
  generation: number
): number => {
  const directGoalBonus = candidate.goalProb * 100;
  const continuationBonus = candidate.selectedOutcomeScore > 0 ? candidate.selectedOutcomeScore : 0;
  const probabilityBonus = candidate.selectedOutcomeProb * 50;
  const generationPenalty = generation * 8;
  const branchBonus = candidate.signature === initialSignature && generation === 1 ? 75 : 0;
  const syntheticBlendBonus = Number(Boolean(candidate.male.isSynthetic)) * 10 + Number(Boolean(candidate.female.isSynthetic)) * 10;
  return directGoalBonus + continuationBonus + probabilityBonus + branchBonus + syntheticBlendBonus - generationPenalty;
};

const selectGenerationCandidates = (
  candidates: FlowchartPairCandidate[],
  generation: number,
  branchLimit: number,
  initialSignature: string
): FlowchartPairCandidate[] => {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const selected: FlowchartPairCandidate[] = [];
  const seen = new Set<string>();

  if (generation === 1) {
    const initial = sorted.find((candidate) => candidate.signature === initialSignature);
    if (initial) {
      selected.push(initial);
      seen.add(initial.signature);
    }
  }

  for (const candidate of sorted) {
    if (selected.length >= branchLimit) break;
    if (seen.has(candidate.signature)) continue;
    selected.push(candidate);
    seen.add(candidate.signature);
  }

  return selected;
};

const buildMultiGenerationPlan = (
  baseSuggestion: Suggestion,
  male: Animal,
  female: Animal,
  goals: Goal[],
  context?: SuggestionContext
): MultiGenPlan | undefined => {
  if (!goals.length) return undefined;

  const targetTraits = gatherTargetTraits(goals);
  if (!targetTraits.length) return undefined;

  const directProb = baseSuggestion.goalProb ?? 0;

  const targetTraitsLabel = targetTraits.join(", ");
  const steps: PlanStep[] = [
    {
      generation: 1,
      title: tAdvisor("api.plan.stepTitle", "Generation {{generation}}: {{male}} × {{female}}", {
        generation: 1,
        male: male.id,
        female: female.id,
      }),
      summary:
        directProb > 0
          ? tAdvisor("api.plan.directSummary", "Direct chance to reach the goal is {{chance}}%.", {
              chance: (directProb * 100).toFixed(1),
            })
          : tAdvisor("api.plan.holdbackSummary", "No direct visual expected; produce holdbacks carrying {{traits}}.", {
              traits: targetTraitsLabel,
            }),
      maleId: male.id,
      femaleId: female.id,
      focusTraits: targetTraits,
      successProb: directProb,
    },
  ];

  if (!context || directProb >= 0.25) {
    return {
      strategy: "direct",
      steps,
      cumulativeProb: Math.max(directProb, 0),
    };
  }

  const candidateOutcomes = baseSuggestion.outcomes.slice(0, 8).filter((outcome) => outcome.prob > 0.01);
  let bestCandidate: CandidateAssessment | null = null;

  candidateOutcomes.forEach((outcome) => {
    const tokens = tokenizeOutcome(outcome);
    const assessment = evaluateOutcomeForTraits(tokens, targetTraits);
    if (assessment.score <= 0) return;
    const enriched: CandidateAssessment = { outcome, ...assessment };
    if (!bestCandidate) {
      bestCandidate = enriched;
      return;
    }
    if (enriched.score > bestCandidate.score) {
      bestCandidate = enriched;
      return;
    }
    if (enriched.score === bestCandidate.score && outcome.prob > bestCandidate.outcome.prob) {
      bestCandidate = enriched;
    }
  });

  if (!bestCandidate) {
    return {
      strategy: "direct",
      steps,
      cumulativeProb: Math.max(directProb, 0),
    };
  }

  const ensuredCandidate = bestCandidate as CandidateAssessment;

  const pairLabel = `${male.id}-${female.id}`;
  const holdback = buildHoldbackAnimals(tokenizeOutcome(ensuredCandidate.outcome), pairLabel);
  const holdbackTraits = holdback.traits.filter((token) => {
    const cleaned = cleanGoalTrait(token);
    if (!cleaned) return false;
    return targetTraits.some((trait) => normalizeToken(cleaned).includes(normalizeToken(trait)));
  });

  let bestSecondStep: SecondStepPlan | null = null;

  context.allMales?.forEach((partner) => {
    if (partner.id === male.id) return;
    const outcomes = cross(partner, holdback.female);
    const probabilities = collectGoalProbabilities(outcomes, goals);
    const bestProb = probabilities.length ? Math.max(...probabilities) : 0;
    if (bestProb <= 0) return;
    if (!bestSecondStep || bestProb > bestSecondStep.prob) {
      bestSecondStep = {
        prob: bestProb,
        partnerId: partner.id,
        partnerSex: "M",
        holdbackSex: "F",
        outcomes,
      };
    }
  });

  context.allFemales?.forEach((partner) => {
    if (partner.id === female.id) return;
    const outcomes = cross(holdback.male, partner);
    const probabilities = collectGoalProbabilities(outcomes, goals);
    const bestProb = probabilities.length ? Math.max(...probabilities) : 0;
    if (bestProb <= 0) return;
    if (!bestSecondStep || bestProb > bestSecondStep.prob) {
      bestSecondStep = {
        prob: bestProb,
        partnerId: partner.id,
        partnerSex: "F",
        holdbackSex: "M",
        outcomes,
      };
    }
  });

  if (!bestSecondStep) {
    return {
      strategy: "direct",
      steps,
      cumulativeProb: Math.max(directProb, 0),
      holdbackTraits,
      holdbackProb: ensuredCandidate.outcome.prob,
    };
  }

  const ensuredSecondStep = bestSecondStep as SecondStepPlan;

  const holdbackLabel = holdbackTraits.length ? holdbackTraits.join(", ") : targetTraits.join(", ");

  const holdbackMaleId = holdback.male.id;
  const holdbackFemaleId = holdback.female.id;

  steps[0] = {
    ...steps[0],
    summary: tAdvisor("api.plan.adjustedSummary", "Direct goal chance {{chance}}%. Prioritize producing holdbacks carrying {{holdback}}.", {
      chance: (directProb * 100).toFixed(1),
      holdback: holdbackLabel,
    }),
  };

  const holdbackSexLabel = ensuredSecondStep.holdbackSex === "F"
    ? tAdvisor("api.plan.holdbackSex.female", "female")
    : tAdvisor("api.plan.holdbackSex.male", "male");
  steps.push({
    generation: 2,
    title: tAdvisor("api.plan.secondTitle", "Generation {{generation}}: Holdback × {{partner}}", {
      generation: 2,
      partner: ensuredSecondStep.partnerId,
    }),
    summary: tAdvisor(
      "api.plan.secondSummary",
      "Retain the {{sex}} holdback ({{holdback}}). Pair with {{partner}} for {{chance}}% chance at the goal.",
      {
        sex: holdbackSexLabel,
        holdback: holdbackLabel,
        partner: ensuredSecondStep.partnerId,
        chance: (ensuredSecondStep.prob * 100).toFixed(1),
      }
    ),
    maleId: ensuredSecondStep.holdbackSex === "F" ? ensuredSecondStep.partnerId : holdbackMaleId,
    femaleId: ensuredSecondStep.holdbackSex === "F" ? holdbackFemaleId : ensuredSecondStep.partnerId,
    focusTraits: targetTraits,
    successProb: ensuredSecondStep.prob,
    prerequisiteProb: ensuredCandidate.outcome.prob,
  });

  const cumulativeProb = ensuredCandidate.outcome.prob * ensuredSecondStep.prob;

  return {
    strategy: "multi",
    steps,
    cumulativeProb,
    holdbackTraits,
    holdbackProb: ensuredCandidate.outcome.prob,
  };
};

export const suggestForPair = async (
  a: Animal,
  b: Animal,
  goals: Goal[],
  w: WeightOptions,
  context?: SuggestionContext
): Promise<Suggestion> => {
  const outcomes = cross(a, b);
  const keywords = collectKeywords(a, b, outcomes);
  const query = buildQuery(keywords);

  let demand = defaultDemand();
  let searchResults: { title: string; url: string }[] = [];

  try {
    const provider = getSearchProvider();
    searchResults = await provider.search(query, DEFAULT_SEARCH_LIMIT);
  } catch (error) {
    // ignore search errors, fallback to defaults
  }

  const urls = searchResults.map((result) => result.url);

  try {
    if (urls.length) {
      demand = await extractDemand(urls);
    }
  } catch (error) {
    demand = defaultDemand();
  }

  const pairLabel = `${formatAnimalLabel(a)} x ${formatAnimalLabel(b)}`;
  const riskResult = applyRiskFlags(pairLabel, outcomes);

  const goalProbabilities = collectGoalProbabilities(outcomes, goals);
  const bestGoalProb = goalProbabilities.length ? Math.max(...goalProbabilities) : 0;

  const scoring = finalScore({ outcomes, demand, risks: riskResult, goals, w });

  const goalSummary = bestGoalSummary(goals, goalProbabilities);
  let rationale = summarizeRationale(scoring.score, demand.index, goalSummary);
  rationale = await safeJustify(
    {
      a,
      b,
      outcomes,
      demand,
      risks: riskResult.risks,
      goals,
    },
    rationale
  );

  const sources = demand.sources.length
    ? demand.sources
    : searchResults.map((entry) => ({ title: entry.title, url: entry.url }));

  const suggestion: Suggestion = {
    maleId: a.id,
    femaleId: b.id,
    outcomes,
    score: scoring.score,
    demand,
    risks: riskResult.risks,
    sources,
    rationale,
    goalProb: bestGoalProb,
    goalFit: scoring.goalFit,
  };

  const plan = buildMultiGenerationPlan(suggestion, a, b, goals, context);
  if (plan) {
    suggestion.plan = plan;
  }

  return suggestion;
};

interface PairCandidate {
  male: Animal;
  female: Animal;
}

const chunkedPairs = (pairs: PairCandidate[], limit: number): PairCandidate[][] => {
  const chunks: PairCandidate[][] = [];
  for (let i = 0; i < pairs.length; i += limit) {
    chunks.push(pairs.slice(i, i + limit));
  }
  return chunks;
};

const shouldConsiderPair = (male: Animal, female: Animal, goals: Goal[]): boolean => {
  if (!goals.length) return true;
  return goals.every((goal) => prefilterByGoal(male, female, goal));
};

const parseGoalStage = async (
  goals: Goal[],
  report?: AdvisorProgressReporter
): Promise<{ goalGenes: Set<string>; targetGeneList: string[] }> => {
  report?.({
    type: "stage-start",
    stepId: "parse-goal",
    label: "Reading breeding goal…",
  });

  const goalGenes = extractGoalBaseGenes(goals);
  const targetGeneList = Array.from(goalGenes);

  report?.({
    type: "stage-complete",
    stepId: "parse-goal",
    label: "Breeding goal parsed",
    meta: { geneCount: targetGeneList.length, genes: targetGeneList },
  });

  await yieldToUi();
  return { goalGenes, targetGeneList };
};

const resolveTargetGenesStage = async (goals: Goal[], report?: AdvisorProgressReporter): Promise<string[]> => {
  report?.({
    type: "stage-start",
    stepId: "resolve-target-genes",
    label: "Resolving target genes…",
  });

  const targetTraits = gatherTargetTraits(goals);

  report?.({
    type: "stage-complete",
    stepId: "resolve-target-genes",
    label: "Target genes resolved",
    meta: { traitCount: targetTraits.length, traits: targetTraits },
  });

  await yieldToUi();
  return targetTraits;
};

const filterRelevantSnakesStage = async (
  males: Animal[],
  females: Animal[],
  goalGenes: Set<string>,
  report?: AdvisorProgressReporter
): Promise<{ relevantMales: Animal[]; relevantFemales: Animal[] }> => {
  report?.({
    type: "stage-start",
    stepId: "filter-relevant-snakes",
    label: "Filtering relevant snakes…",
    meta: { totalMales: males.length, totalFemales: females.length },
  });

  if (!goalGenes.size) {
    report?.({
      type: "stage-complete",
      stepId: "filter-relevant-snakes",
      label: "Relevant snakes identified",
      meta: {
        totalMales: males.length,
        relevantMales: males.length,
        totalFemales: females.length,
        relevantFemales: females.length,
      },
    });
    await yieldToUi();
    return { relevantMales: males, relevantFemales: females };
  }

  const relevantMales: Animal[] = [];
  for (let i = 0; i < males.length; i += FILTER_BATCH_SIZE) {
    const batch = males.slice(i, i + FILTER_BATCH_SIZE);
    batch.forEach((animal) => {
      if (animalHasGoalGene(animal, goalGenes)) {
        relevantMales.push(animal);
      }
    });
    report?.({
      type: "stage-update",
      stepId: "filter-relevant-snakes",
      label: "Filtering relevant snakes…",
      meta: {
        processedMales: Math.min(i + FILTER_BATCH_SIZE, males.length),
        totalMales: males.length,
        relevantMales: relevantMales.length,
      },
    });
    await yieldToUi();
  }

  const relevantFemales: Animal[] = [];
  for (let i = 0; i < females.length; i += FILTER_BATCH_SIZE) {
    const batch = females.slice(i, i + FILTER_BATCH_SIZE);
    batch.forEach((animal) => {
      if (animalHasGoalGene(animal, goalGenes)) {
        relevantFemales.push(animal);
      }
    });
    report?.({
      type: "stage-update",
      stepId: "filter-relevant-snakes",
      label: "Filtering relevant snakes…",
      meta: {
        processedFemales: Math.min(i + FILTER_BATCH_SIZE, females.length),
        totalFemales: females.length,
        relevantFemales: relevantFemales.length,
      },
    });
    await yieldToUi();
  }

  report?.({
    type: "stage-complete",
    stepId: "filter-relevant-snakes",
    label: "Relevant snakes identified",
    meta: {
      totalMales: males.length,
      relevantMales: relevantMales.length,
      totalFemales: females.length,
      relevantFemales: relevantFemales.length,
    },
  });

  await yieldToUi();
  return { relevantMales, relevantFemales };
};

const partitionBySexStage = async (
  relevantMales: Animal[],
  relevantFemales: Animal[],
  report?: AdvisorProgressReporter
): Promise<void> => {
  report?.({
    type: "stage-start",
    stepId: "partition-by-sex",
    label: "Partitioning breeders by sex…",
  });
  report?.({
    type: "stage-complete",
    stepId: "partition-by-sex",
    label: "Breeders partitioned",
    meta: { males: relevantMales.length, females: relevantFemales.length },
  });
  await yieldToUi();
};

const generatePairingsStage = async (
  relevantMales: Animal[],
  relevantFemales: Animal[],
  goals: Goal[],
  report?: AdvisorProgressReporter
): Promise<PairCandidate[]> => {
  report?.({
    type: "stage-start",
    stepId: "generate-pairings",
    label: "Building valid pairing candidates…",
  });

  const candidates: PairCandidate[] = [];
  for (let maleIndex = 0; maleIndex < relevantMales.length; maleIndex += 1) {
    const male = relevantMales[maleIndex];
    for (const female of relevantFemales) {
      if (shouldConsiderPair(male, female, goals)) {
        candidates.push({ male, female });
      }
    }

    if ((maleIndex + 1) % PAIRING_MALE_BATCH_SIZE === 0 || maleIndex === relevantMales.length - 1) {
      report?.({
        type: "stage-update",
        stepId: "generate-pairings",
        label: "Building valid pairing candidates…",
        meta: {
          processedMales: maleIndex + 1,
          totalMales: relevantMales.length,
          pairingsGenerated: candidates.length,
        },
      });
      await yieldToUi();
    }
  }

  report?.({
    type: "stage-complete",
    stepId: "generate-pairings",
    label: candidates.length ? "Pairing candidates ready" : "No valid pairings found",
    meta: { count: candidates.length },
  });

  await yieldToUi();
  return candidates;
};

/**
 * Strip all gene qualifiers (super / het / possible het / percentage) from a
 * trait label and return a lower-cased base gene name, e.g.:
 *   "Super Clown"       → "clown"
 *   "Het Desert Ghost"  → "desert ghost"
 *   "66% het Pied"      → "pied"
 */
const normalizeBaseGeneName = (trait: string): string =>
  trait
    .replace(/^\d+(?:\.\d+)?%\s*/i, "")
    .replace(/^super\s+/i, "")
    .replace(/^(?:possible het|pos het)\s+/i, "")
    .replace(/^het\s+/i, "")
    .trim()
    .toLowerCase();

/** Collect all distinct base gene names that appear in any goal's trait lists. */
const extractGoalBaseGenes = (goals: Goal[]): Set<string> => {
  const genes = new Set<string>();
  goals.forEach((goal) => {
    [...(goal.requireAll ?? []), ...(goal.requireAny ?? [])].forEach((trait) => {
      const base = normalizeBaseGeneName(trait);
      if (base) genes.add(base);
    });
  });
  return genes;
};

/**
 * Returns true when the animal carries at least one goal gene in any form
 * (visual morph, het, or possible het).
 */
const animalHasGoalGene = (animal: Animal, goalGenes: Set<string>): boolean => {
  if (!goalGenes.size) return true;
  for (const morph of animal.morphs ?? []) {
    if (goalGenes.has(normalizeBaseGeneName(morph.name ?? ""))) return true;
  }
  for (const het of animal.hets ?? []) {
    if (goalGenes.has(normalizeBaseGeneName(het ?? ""))) return true;
  }
  for (const phet of animal.possibleHets ?? []) {
    if (goalGenes.has(normalizeBaseGeneName(phet ?? ""))) return true;
  }
  return false;
};

/**
 * Filter an animal list down to only those that carry at least one gene
 * relevant to the supplied goals.
 */
export const filterAnimalsForGoals = (animals: Animal[], goals: Goal[]): Animal[] => {
  if (!goals.length) return animals;
  const goalGenes = extractGoalBaseGenes(goals);
  if (!goalGenes.size) return animals;
  return animals.filter((animal) => animalHasGoalGene(animal, goalGenes));
};

export const buildBreedingFlowchartPlan = (
  baseSuggestion: Suggestion,
  goals: Goal[],
  options: FlowchartPlannerOptions
): MultiGenPlan | undefined => {
  if (!goals.length) return undefined;

  const targetTraits = gatherTargetTraits(goals);
  if (!targetTraits.length) return undefined;

  const threshold = options.threshold ?? FLOWCHART_GOAL_THRESHOLD;
  const generationLimit = options.generationLimit ?? FLOWCHART_GENERATION_LIMIT;
  const branchLimit = options.branchLimit ?? FLOWCHART_BRANCH_LIMIT;
  const relevantMales = filterAnimalsForGoals(options.allMales || [], goals);
  const relevantFemales = filterAnimalsForGoals(options.allFemales || [], goals);

  if (!relevantMales.length || !relevantFemales.length) return undefined;

  const nodes: BreedingFlowchartGraph["nodes"] = [];
  const edges: BreedingFlowchartGraph["edges"] = [];
  const steps: PlanStep[] = [];
  const selectedHoldbacks: PlanHoldbackSelection[] = [];
  const seenPairings = new Set<string>();

  const malePool: PlannerAnimal[] = relevantMales.map(createPlannerCollectionAnimal);
  const femalePool: PlannerAnimal[] = relevantFemales.map(createPlannerCollectionAnimal);

  malePool.forEach((animal) => {
    const matchedGenes = collectMatchedGenes(tokenizeAnimalGenetics(animal), targetTraits);
    nodes.push({
      id: animal.sourceNodeId,
      generation: 0,
      kind: "collection",
      title: animal.id,
      subtitle: formatAnimalLabel(animal),
      animalId: animal.id,
      expectedGenetics: tokenizeAnimalGenetics(animal),
      matchedGenes,
    });
  });
  femalePool.forEach((animal) => {
    if (nodes.some((node: BreedingFlowchartNode) => node.id === animal.sourceNodeId)) return;
    const matchedGenes = collectMatchedGenes(tokenizeAnimalGenetics(animal), targetTraits);
    nodes.push({
      id: animal.sourceNodeId,
      generation: 0,
      kind: "collection",
      title: animal.id,
      subtitle: formatAnimalLabel(animal),
      animalId: animal.id,
      expectedGenetics: tokenizeAnimalGenetics(animal),
      matchedGenes,
    });
  });

  const initialSignature = `${baseSuggestion.maleId}::${baseSuggestion.femaleId}`;
  let bestGoalProbability = baseSuggestion.goalProb ?? 0;
  let goalReached = bestGoalProbability >= threshold;
  let goalReachedGeneration: number | null = goalReached ? 1 : null;
  let bestHoldbackTraits: string[] = [];
  let bestHoldbackProb: number | undefined;

  for (let generation = 1; generation <= generationLimit; generation += 1) {
    const generationCandidates: FlowchartPairCandidate[] = [];

    malePool.forEach((male) => {
      femalePool.forEach((female) => {
        if (!male?.id || !female?.id) return;
        const signature = `${male.plannerKey}::${female.plannerKey}`;
        const naturalSignature = `${male.id}::${female.id}`;
        if (seenPairings.has(signature)) return;
        if (generation > 1 && !male.isSynthetic && !female.isSynthetic) return;

        const outcomes = cross(male, female);
        const goalProbabilities = collectGoalProbabilities(outcomes, goals);
        const goalProb = goalProbabilities.length ? Math.max(...goalProbabilities) : 0;
        const displayProbabilities = buildOutcomeProbabilityEntries(outcomes, goals);
        const continuation = selectContinuationOutcome(outcomes, goals, targetTraits);
        if (!displayProbabilities.length && !continuation.outcome) return;

        const candidateBase: Omit<FlowchartPairCandidate, "score"> = {
          signature,
          generation,
          male,
          female,
          outcomes,
          goalProb,
          displayProbabilities,
          selectedOutcome: continuation.outcome,
          selectedOutcomeScore: continuation.score,
          selectedOutcomeTokens: continuation.tokens,
          selectedOutcomeProb: continuation.outcome ? continuation.outcome.prob : 0,
        };

        const candidate: FlowchartPairCandidate = {
          ...candidateBase,
          score: scoreFlowchartCandidate(candidateBase, initialSignature === naturalSignature ? signature : initialSignature, generation),
        };

        if (candidate.goalProb <= 0 && candidate.selectedOutcomeScore <= 0) return;
        generationCandidates.push(candidate);
      });
    });

    if (!generationCandidates.length) {
      break;
    }

    const selectedCandidates = selectGenerationCandidates(generationCandidates, generation, branchLimit, initialSignature);
    if (!selectedCandidates.length) {
      break;
    }

    const nextSyntheticMales: PlannerAnimal[] = [];
    const nextSyntheticFemales: PlannerAnimal[] = [];

    selectedCandidates.forEach((candidate, candidateIndex) => {
      seenPairings.add(candidate.signature);

      const pairNodeId = `pairing:g${generation}:${candidateIndex}:${candidate.male.plannerKey}:${candidate.female.plannerKey}`;
      const outcomeNodeId = `outcome:g${generation}:${candidateIndex}:${candidate.male.plannerKey}:${candidate.female.plannerKey}`;
      const matchedGenes = collectMatchedGenes(candidate.selectedOutcomeTokens, targetTraits);

      nodes.push({
        id: pairNodeId,
        generation,
        kind: "pairing",
        title: `${candidate.male.id} × ${candidate.female.id}`,
        subtitle: `Goal chance ${formatPercent(candidate.goalProb, 1)}`,
        maleId: candidate.male.id,
        femaleId: candidate.female.id,
        goalProbability: candidate.goalProb,
        isSelected: generation === 1 && `${candidate.male.id}::${candidate.female.id}` === initialSignature,
        matchedGenes,
      });
      nodes.push({
        id: outcomeNodeId,
        generation,
        kind: "outcome",
        title: candidate.displayProbabilities[0]?.label || "Projected offspring",
        subtitle: buildFlowchartStepSummary(candidate, threshold),
        expectedGenetics: candidate.displayProbabilities.map((entry) => entry.label),
        probabilities: candidate.displayProbabilities,
        goalProbability: candidate.goalProb,
        isGoal: candidate.goalProb >= threshold || candidate.displayProbabilities.some((entry) => entry.isGoal),
        matchedGenes,
      });

      edges.push(
        { id: `${candidate.male.sourceNodeId}->${pairNodeId}`, source: candidate.male.sourceNodeId, target: pairNodeId },
        { id: `${candidate.female.sourceNodeId}->${pairNodeId}`, source: candidate.female.sourceNodeId, target: pairNodeId },
        { id: `${pairNodeId}->${outcomeNodeId}`, source: pairNodeId, target: outcomeNodeId, label: `G${generation}` }
      );

      steps.push({
        generation,
        title: `Generation ${generation}: ${candidate.male.id} × ${candidate.female.id}`,
        summary: buildFlowchartStepSummary(candidate, threshold),
        maleId: candidate.male.id,
        femaleId: candidate.female.id,
        focusTraits: targetTraits,
        successProb: candidate.goalProb,
        prerequisiteProb: candidate.selectedOutcomeProb || undefined,
      });

      if (candidate.selectedOutcome && candidate.selectedOutcomeTokens.length) {
        const synthetic = createSyntheticPlannerAnimals(candidate.selectedOutcomeTokens, outcomeNodeId, generation);
        const holdbackMatchedGenes = collectMatchedGenes(synthetic.traits, targetTraits);
        nextSyntheticMales.push(synthetic.male);
        nextSyntheticFemales.push(synthetic.female);
        selectedHoldbacks.push({
          id: `holdback:${outcomeNodeId}`,
          generation,
          pairingTitle: `${candidate.male.id} × ${candidate.female.id}`,
          sourcePairingNodeId: pairNodeId,
          sourceOutcomeNodeId: outcomeNodeId,
          maleId: synthetic.male.id,
          femaleId: synthetic.female.id,
          traits: synthetic.traits,
          probability: candidate.selectedOutcomeProb,
          matchedGenes: holdbackMatchedGenes,
        });

        const pairNode = nodes.find((node: BreedingFlowchartNode) => node.id === pairNodeId);
        if (pairNode) {
          pairNode.holdbackTraits = synthetic.traits;
          pairNode.matchedGenes = holdbackMatchedGenes;
        }

        const outcomeNode = nodes.find((node: BreedingFlowchartNode) => node.id === outcomeNodeId);
        if (outcomeNode) {
          outcomeNode.holdbackTraits = synthetic.traits;
          outcomeNode.matchedGenes = holdbackMatchedGenes;
        }

        if (!bestHoldbackTraits.length || candidate.selectedOutcomeProb > (bestHoldbackProb ?? 0)) {
          bestHoldbackTraits = synthetic.traits;
          bestHoldbackProb = candidate.selectedOutcomeProb;
        }
      }

      if (candidate.goalProb > bestGoalProbability) {
        bestGoalProbability = candidate.goalProb;
      }
      if (!goalReached && candidate.goalProb >= threshold) {
        goalReached = true;
        goalReachedGeneration = generation;
      }
    });

    malePool.push(...nextSyntheticMales);
    femalePool.push(...nextSyntheticFemales);

    if (goalReached) {
      break;
    }
  }

  return {
    strategy: goalReachedGeneration && goalReachedGeneration > 1 ? "multi" : "direct",
    steps,
    cumulativeProb: bestGoalProbability,
    holdbackTraits: bestHoldbackTraits.length ? bestHoldbackTraits : undefined,
    holdbackProb: bestHoldbackProb,
    matchedGenes: Array.from(new Set(selectedHoldbacks.flatMap((selection) => selection.matchedGenes || []))),
    selectedHoldbacks,
    threshold,
    generationLimit,
    goalReached,
    goalReachedGeneration,
    flowchart: { nodes, edges },
  };
};

export const suggestForCollections = async (
  males: Animal[],
  females: Animal[],
  goals: Goal[],
  w: WeightOptions,
  options?: { onProgress?: AdvisorProgressReporter }
): Promise<Suggestion[]> => {
  const report = options?.onProgress;

  const emitStageFailed = (stepId: string, label: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    report?.({
      type: "stage-failed",
      stepId,
      label,
      details: message,
      meta: { message },
    });
  };

  const runStage = async <T>(stepId: string, label: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      emitStageFailed(stepId, label, error);
      throw error;
    }
  };

  const { goalGenes, targetGeneList } = await runStage("parse-goal", "Reading breeding goal…", () =>
    parseGoalStage(goals, report)
  );
  await runStage("resolve-target-genes", "Resolving target genes…", () => resolveTargetGenesStage(goals, report));
  const { relevantMales, relevantFemales } = await runStage("filter-relevant-snakes", "Filtering relevant snakes…", () =>
    filterRelevantSnakesStage(males, females, goalGenes, report)
  );
  await runStage("partition-by-sex", "Partitioning breeders by sex…", () =>
    partitionBySexStage(relevantMales, relevantFemales, report)
  );
  const candidates = await runStage("generate-pairings", "Building valid pairing candidates…", () =>
    generatePairingsStage(relevantMales, relevantFemales, goals, report)
  );

  if (!candidates.length) {
    report?.({
      type: "summary",
      stepId: "final-summary",
      label: "Advisor finished",
      meta: {
        totalSnakesScanned: males.length + females.length,
        relevantCandidates: relevantMales.length + relevantFemales.length,
        validMales: relevantMales.length,
        validFemales: relevantFemales.length,
        pairingsGenerated: 0,
        strongPairings: 0,
        targetGenes: targetGeneList,
      },
    });
    return [];
  }
  report?.({
    type: "stage-complete",
    stepId: "generate-pairings",
    label: "Pairing candidates ready",
    meta: { count: candidates.length },
  });

  const suggestions = await runStage("calculate-genetics", "Calculating genetics for each pairing…", async () => {
    report?.({
      type: "stage-start",
      stepId: "calculate-genetics",
      label: "Calculating genetics for each pairing…",
      meta: { total: candidates.length },
    });
    const concurrency = Math.max(1, DEFAULT_CONCURRENCY);
    const chunks = chunkedPairs(candidates, concurrency);
    const stageSuggestions: Suggestion[] = [];
    let completedPairs = 0;

    for (const chunk of chunks) {
      const batch = await Promise.all(
        chunk.map(async ({ male, female }) => {
          try {
            return await suggestForPair(male, female, goals, w, {
              allMales: relevantMales,
              allFemales: relevantFemales,
            });
          } catch (error) {
            return null;
          }
        })
      );
      batch.forEach((suggestion) => {
        if (suggestion) stageSuggestions.push(suggestion);
      });
      completedPairs += chunk.length;
      report?.({
        type: "stage-update",
        stepId: "calculate-genetics",
        label: "Calculating genetics…",
        meta: { completed: completedPairs, total: candidates.length },
      });
    }

    report?.({
      type: "stage-complete",
      stepId: "calculate-genetics",
      label: "Genetics calculated",
      meta: { completed: completedPairs, total: candidates.length },
    });
    return stageSuggestions;
  });

  const ranked = await runStage("rank-pairings", "Ranking pairings by score…", async () => {
    report?.({
      type: "stage-start",
      stepId: "rank-pairings",
      label: "Ranking pairings by score…",
    });
    const sorted = suggestions.sort((a, b) => b.score - a.score);
    report?.({
      type: "stage-complete",
      stepId: "rank-pairings",
      label: "Pairings ranked",
      meta: { count: sorted.length },
    });
    return sorted;
  });

  await runStage("finalize-results", "Finalizing results…", async () => {
    report?.({
      type: "stage-start",
      stepId: "finalize-results",
      label: "Finalizing results…",
    });
    report?.({
      type: "stage-complete",
      stepId: "finalize-results",
      label: "Results ready",
      meta: { count: ranked.length },
    });
  });

  const strongPairings = ranked.filter((entry) => (entry.goalProb ?? 0) >= 0.5).length;
  report?.({
    type: "summary",
    stepId: "final-summary",
    label: "Advisor finished",
    meta: {
      totalSnakesScanned: males.length + females.length,
      relevantCandidates: relevantMales.length + relevantFemales.length,
      validMales: relevantMales.length,
      validFemales: relevantFemales.length,
      pairingsGenerated: candidates.length,
      strongPairings,
      targetGenes: targetGeneList,
    },
  });

  return ranked;
};
