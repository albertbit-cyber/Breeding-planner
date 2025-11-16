import { cross } from "../../genetics";
import { extractDemand } from "../../signals/extract";
import { getSearchProvider } from "../../signals/search";
import { applyRiskFlags } from "../../rank/rules";
import { finalScore } from "../../rank/score";
import { prefilterByGoal, probGoalForPair } from "../../goals/goal";
import { justify } from "../../justify/llm";
import { Animal, Goal, Suggestion, Demand, Outcome, MultiGenPlan, PlanStep } from "../../types/pairing";
import { inferMorphType } from "../../genetics/geneLibrary";

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

const defaultDemand = (): Demand => ({ index: 0, priceBand: null, signals: [], sources: [] });

const summarizeRationale = (score: number, demandIndex: number, goalSummary: string): string => {
  return `Projected score ${score.toFixed(2)} with demand index ${demandIndex}. ${goalSummary}`.trim();
};

const collectGoalProbabilities = (outcomes: Outcome[], goals: Goal[]): number[] => {
  return goals.map((goal) => probGoalForPair(outcomes, goal));
};

const bestGoalSummary = (goals: Goal[], probabilities: number[]): string => {
  if (!goals.length || !probabilities.length) return "No specific goal targets.";
  let bestIndex = 0;
  let bestProb = probabilities[0];
  probabilities.forEach((prob, idx) => {
    if (prob > bestProb) {
      bestProb = prob;
      bestIndex = idx;
    }
  });
  const goal = goals[bestIndex];
  return `${(bestProb * 100).toFixed(1)}% chance to hit goal '${goal.name}'.`;
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
    const watchouts = result.watchouts?.length ? ` Watchouts: ${result.watchouts.join("; ")}.` : "";
    const sourced = result.sources?.length ? ` Sources: ${result.sources.join(", ")}.` : "";
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

  const steps: PlanStep[] = [
    {
      generation: 1,
      title: `Generation 1: ${male.id} × ${female.id}`,
      summary: directProb > 0
        ? `Direct chance to reach the goal is ${(directProb * 100).toFixed(1)}%.`
        : `No direct visual expected; produce holdbacks carrying ${targetTraits.join(", ")}.`,
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
    summary: `Direct goal chance ${(directProb * 100).toFixed(1)}%. Prioritise producing holdbacks carrying ${holdbackLabel}.`,
  };

  steps.push({
    generation: 2,
    title: `Generation 2: Holdback × ${ensuredSecondStep.partnerId}`,
    summary:
      `Retain the ${ensuredSecondStep.holdbackSex === "F" ? "female" : "male"} holdback (${holdbackLabel}). ` +
      `Pair with ${ensuredSecondStep.partnerId} for ${(ensuredSecondStep.prob * 100).toFixed(1)}% chance at the goal.`,
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

export const suggestForCollections = async (
  males: Animal[],
  females: Animal[],
  goals: Goal[],
  w: WeightOptions
): Promise<Suggestion[]> => {
  const candidates: PairCandidate[] = [];

  males.forEach((male) => {
    females.forEach((female) => {
      if (shouldConsiderPair(male, female, goals)) {
        candidates.push({ male, female });
      }
    });
  });

  if (!candidates.length) return [];

  const concurrency = Math.max(1, DEFAULT_CONCURRENCY);
  const chunks = chunkedPairs(candidates, concurrency);
  const suggestions: Suggestion[] = [];

  for (const chunk of chunks) {
    const batch = await Promise.all(
      chunk.map(async ({ male, female }) => {
        try {
          return await suggestForPair(male, female, goals, w, {
            allMales: males,
            allFemales: females,
          });
        } catch (error) {
          return null;
        }
      })
    );
    batch.forEach((suggestion) => {
      if (suggestion) suggestions.push(suggestion);
    });
  }

  return suggestions.sort((a, b) => b.score - a.score);
};
