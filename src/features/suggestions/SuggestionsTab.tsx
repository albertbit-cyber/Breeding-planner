// @ts-nocheck

import React, { useMemo, useState, useCallback } from "react";
import { suggestForCollections } from "./api";
import { inferMorphType, normalizeGeneCandidate, getGeneDisplayGroup } from "../../genetics/geneLibrary";

const normalizeString = (value: unknown): string => {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
};

const normalizeSexValue = (value: unknown): "M" | "F" | null => {
  const raw = normalizeString(value).toLowerCase();
  if (!raw) return null;
  if (raw === "m" || raw === "male" || /^1[\s.:/]*0$/.test(raw) || raw.startsWith("m")) return "M";
  if (raw === "f" || raw === "female" || /^0[\s.:/]*1$/.test(raw) || raw.startsWith("f")) return "F";
  return null;
};

const normalizeGeneticToken = (value: unknown): string => {
  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "name") && value.name != null) {
      return normalizeString((value as any).name);
    }
    if (Object.prototype.hasOwnProperty.call(value, "label") && value.label != null) {
      return normalizeString((value as any).label);
    }
  }
  return normalizeString(value);
};

const splitLooseTokens = (value: string): string[] =>
  value
    .split(/[\n\r,;|/+]+/)
    .map((entry) => normalizeString(entry))
    .filter(Boolean);

const normalizeGeneticArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeGeneticToken(entry))
      .filter(Boolean);
  }
  const single = normalizeGeneticToken(value);
  if (!single) return [];
  return splitLooseTokens(single);
};

const formatMorphName = (raw: unknown): string => {
  const trimmed = normalizeString(raw);
  if (!trimmed) return "";
  return trimmed
    .split(" ")
    .map((word) => {
      if (!word) return word;
      if (word.length <= 2) return word.toUpperCase();
      if (/^[A-Z0-9-]+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

const buildMorphObjects = (tokens: unknown): { name: string; type: string }[] => {
  const list = normalizeGeneticArray(tokens);
  const seen = new Set<string>();
  const result: { name: string; type: string }[] = [];
  list.forEach((token) => {
    const name = formatMorphName(token);
    const key = normalizeGeneCandidate(name);
    if (!name || !key || seen.has(key)) return;
    seen.add(key);
    result.push({ name, type: inferMorphType(name) });
  });
  return result;
};

const normalizeHetInputToken = (token: unknown): string | null => {
  if (!token) return null;
  let working = normalizeString(token);
  if (!working) return null;

  let percent = "";
  const percentMatch = working.match(/^(\d{1,3}%)(?:\s*)(.*)$/i);
  if (percentMatch) {
    percent = percentMatch[1].toUpperCase();
    working = percentMatch[2].trim();
  }

  let qualifier = "";
  const qualifierMatch = working.match(/^(pos(?:s?i?a?ble)?|probable|maybe|ph)(?:\s*)(.*)$/i);
  if (qualifierMatch) {
    qualifier = qualifierMatch[1].toLowerCase();
    working = qualifierMatch[2].trim();
  }

  working = working
    .replace(/\bhet\b/gi, " ")
    .replace(/^het(?=[A-Za-z])/i, "")
    .trim();

  const qualifierMap: Record<string, string> = {
    pos: "Possible",
    ph: "Possible",
    possible: "Possible",
    possiable: "Possible",
    posible: "Possible",
    probable: "Probable",
    maybe: "Maybe",
  };

  const qualifierText = qualifierMap[qualifier] || "";

  const base = formatMorphName(working);
  if (!base) return null;

  const parts: string[] = [];
  if (percent) parts.push(percent);
  if (qualifierText) parts.push(qualifierText);
  parts.push("Het");
  parts.push(base);
  const result = parts.join(" ").replace(/\s+/g, " ").trim();
  return result || null;
};

const partitionHetTokens = (hetsValue: unknown, possibleValue: unknown) => {
  const certain: string[] = [];
  const possible: string[] = [];
  const certainSet = new Set<string>();
  const possibleSet = new Set<string>();

  const push = (raw: unknown, forcePossible = false) => {
    const normalized = normalizeHetInputToken(raw);
    if (!normalized) return;
    const lower = normalized.toLowerCase();
    const probabilistic =
      forcePossible ||
      /^\d{1,3}%/.test(normalized) ||
      /^(?:possible|probable|maybe)\b/i.test(normalized);
    if (probabilistic) {
      if (!possibleSet.has(lower)) {
        possibleSet.add(lower);
        possible.push(normalized);
      }
    } else if (!certainSet.has(lower)) {
      certainSet.add(lower);
      certain.push(normalized);
    }
  };

  normalizeGeneticArray(hetsValue).forEach((token) => push(token, false));
  normalizeGeneticArray(possibleValue).forEach((token) => push(token, true));

  return { certain, possible };
};

const buildAdvisorAnimal = (snake: any) => {
  if (!snake || !snake.id) return null;
  const sex = normalizeSexValue(snake.sex);
  if (!sex) return null;

  const morphs = buildMorphObjects(snake.morphs);
  const { certain: hets, possible: possibleHets } = partitionHetTokens(snake.hets, snake.possibleHets);

  return {
    id: String(snake.id),
    sex,
    morphs,
    hets,
    possibleHets: possibleHets.length ? possibleHets : undefined,
  };
};

const REQUIRED_GROUP = "breeders";
const HIGH_CONFIDENCE_THRESHOLD = 0.6;

const DEFAULT_WEIGHTS = {
  wDemand: 1,
  wPrice: 0.8,
  wNovelty: 0.4,
  wRisk: 0.6,
  wGoalFit: 1.2,
};

const formatPercent = (value, digits = 0) => `${(value * 100).toFixed(digits)}%`;

const formatPriceBand = (band) => {
  if (!band || band.length !== 2) return null;
  const [low, high] = band;
  if (low == null || high == null) return null;
  return `$${Number(low).toLocaleString()} – $${Number(high).toLocaleString()}`;
};

const HET_GENE_COLOR_CLASSES = "bg-violet-200 border border-violet-300 text-violet-800";

const GENE_GROUP_COLOR_CLASSES = {
  Het: HET_GENE_COLOR_CLASSES,
  Recessive: "bg-violet-300 border border-violet-400",
  "Incomplete Dominant": "bg-rose-300 border border-rose-400",
  Dominant: "bg-sky-300 border border-sky-400",
  Other: "bg-emerald-300 border border-emerald-400",
};

const isHetDescriptorToken = (token) => {
  if (!token) return false;
  const lower = String(token).toLowerCase();
  if (lower.includes("het")) return true;
  if (/(^|\s)(pos(?:s?i?a?ble)?|probable|maybe|ph)(\s|$)/i.test(lower)) return true;
  if (/\d{1,3}%/.test(lower)) return true;
  return false;
};

const isHetGeneToken = (token) => {
  if (!token) return false;
  const normalizedRaw = String(token).replace(/\s+/g, " ").trim();
  if (!normalizedRaw) return false;
  const lower = normalizedRaw.toLowerCase();
  const hetPrefixPattern = /^(?:\d{1,3}%\s*)?(?:(?:pos(?:s?i?a?ble)?|probable|maybe|ph)\s+)?het\b/;
  if (hetPrefixPattern.test(lower)) {
    return true;
  }
  return isHetDescriptorToken(token);
};

const getGeneChipClasses = (token) => {
  if (isHetGeneToken(token)) {
    return GENE_GROUP_COLOR_CLASSES.Het;
  }
  const group = getGeneDisplayGroup(token);
  return GENE_GROUP_COLOR_CLASSES[group] || GENE_GROUP_COLOR_CLASSES.Other;
};

const uniqueGeneTokens = (tokens = []) => {
  const seen = new Set();
  const result = [];
  tokens.forEach((token) => {
    if (token == null) return;
    const value = String(token).trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });
  return result;
};

const stripGeneModifiers = (token: string) =>
  String(token || "")
    .replace(/^(?:\d{1,3}%\s*)?(?:(?:pos(?:s?i?a?ble)?|probable|maybe|ph)\s+)?het\s+/i, "")
    .replace(/^visual\s+/i, "")
    .replace(/^super\s+/i, "")
    .trim();

const extractBaseGeneKey = (token) => {
  const cleaned = stripGeneModifiers(normalizeString(token));
  if (!cleaned) return "";
  return normalizeGeneCandidate(cleaned);
};

const splitGeneTokens = (tokens = [], allowedBaseGenes?: Set<string>) => {
  const visuals = [];
  const hets = [];
  tokens.forEach((token) => {
    const value = normalizeString(token);
    if (!value) return;
    const baseKey = extractBaseGeneKey(value);
    if (allowedBaseGenes && allowedBaseGenes.size > 0) {
      if (!baseKey || !allowedBaseGenes.has(baseKey)) return;
    }
    if (isHetGeneToken(value)) {
      hets.push(value);
    } else {
      visuals.push(value);
    }
  });
  return {
    visuals: uniqueGeneTokens(visuals),
    hets: uniqueGeneTokens(hets),
  };
};

const collectOutcomeTokenGroups = (outcomes = [], limit = 3, allowedBaseGenes?: Set<string>) => {
  const tokens = [];
  (outcomes || [])
    .slice(0, limit)
    .forEach((outcome) => {
      (outcome?.genotype || []).forEach((token) => {
        const value = normalizeString(token);
        if (value) tokens.push(value);
      });
    });
  return splitGeneTokens(tokens, allowedBaseGenes);
};

const collectGoalTokens = (goals = []) => {
  const tokens: string[] = [];
  goals.forEach((goal) => {
    if (goal?.requireAll?.length) tokens.push(...goal.requireAll);
    if (goal?.requireAny?.length) tokens.push(...goal.requireAny);
  });
  return tokens;
};

const buildGoalGeneInfo = (goals = []) => {
  const tokens = collectGoalTokens(goals);
  const baseSet = new Set<string>();
  tokens.forEach((token) => {
    const key = extractBaseGeneKey(token);
    if (key) baseSet.add(key);
  });
  return {
    tokens,
    baseGeneKeys: baseSet,
    groups: splitGeneTokens(tokens),
  };
};

const matchesGoalGeneTargets = (suggestion, baseGeneKeys: Set<string>) => {
  if (!baseGeneKeys || baseGeneKeys.size === 0) return true;
  const fromOutcomes = collectOutcomeTokenGroups(suggestion?.outcomes || [], 6, baseGeneKeys);
  if (fromOutcomes.visuals.length || fromOutcomes.hets.length) return true;

  const holdbackGroups = splitGeneTokens(suggestion?.plan?.holdbackTraits ?? [], baseGeneKeys);
  if (holdbackGroups.visuals.length || holdbackGroups.hets.length) return true;

  const planFocusTokens = (suggestion?.plan?.steps || []).flatMap((step) => step?.focusTraits || []);
  const focusGroups = splitGeneTokens(planFocusTokens, baseGeneKeys);
  if (focusGroups.visuals.length || focusGroups.hets.length) return true;

  return false;
};

const STATUS_LABELS = {
  visual: "Visual",
  het: "Het",
  possibleHet: "Possible het",
  none: "Normal",
};

const isHoldbackId = (id: string) => typeof id === "string" && id.includes("-holdback-");

const deriveStatusFromAnimal = (animal, baseGeneKey: string) => {
  if (!animal || !baseGeneKey) return "none";
  const hasVisual = (animal.morphs || []).some((morph) => extractBaseGeneKey(morph?.name) === baseGeneKey);
  if (hasVisual) return "visual";
  const hasHet = (animal.hets || []).some((het) => extractBaseGeneKey(het) === baseGeneKey);
  if (hasHet) return "het";
  const hasPossibleHet = (animal.possibleHets || []).some((het) => extractBaseGeneKey(het) === baseGeneKey);
  if (hasPossibleHet) return "possibleHet";
  return "none";
};

const deriveStatusFromHoldback = (holdbackTraits = [], baseGeneKey: string) => {
  if (!holdbackTraits || !holdbackTraits.length || !baseGeneKey) return "none";
  let status = "none";
  holdbackTraits.forEach((token) => {
    const value = normalizeString(token);
    if (!value) return;
    const key = extractBaseGeneKey(value);
    if (key !== baseGeneKey) return;
    if (/possible\s+het/i.test(value) || /probable\s+het/i.test(value)) {
      status = "possibleHet";
      return;
    }
    if (isHetGeneToken(value)) {
      status = "het";
      return;
    }
    status = "visual";
  });
  return status;
};

const deriveGeneStatusForParticipant = (participantId, baseGeneKey: string, context) => {
  if (!baseGeneKey) return "none";
  if (participantId && context?.advisorAnimals?.has(participantId)) {
    return deriveStatusFromAnimal(context.advisorAnimals.get(participantId), baseGeneKey);
  }
  if (isHoldbackId(participantId)) {
    return deriveStatusFromHoldback(context?.plan?.holdbackTraits ?? [], baseGeneKey);
  }
  return "none";
};

const describeHetExpectation = (statusA: string, statusB: string) => {
  const pair = [statusA, statusB].sort().join("-");
  if (pair === "none-visual") return "100% het";
  if (pair === "het-het") return "≈66% het";
  if (pair === "het-none") return "≈50% het";
  return null;
};

const firstDisplayLabelForGene = (tokens = [], baseGeneKey: string) => {
  const match = (tokens || []).find((token) => extractBaseGeneKey(token) === baseGeneKey);
  if (match) {
    return formatMorphName(stripGeneModifiers(match));
  }
  return formatMorphName(baseGeneKey);
};

const buildHetNotesForStep = (step, baseGeneKeys: Set<string>, context) => {
  if (!step?.focusTraits?.length || !baseGeneKeys?.size) return [];
  const targetKeys = new Set<string>();
  (step.focusTraits || []).forEach((token) => {
    const key = extractBaseGeneKey(token);
    if (key && baseGeneKeys.has(key)) {
      targetKeys.add(key);
    }
  });

  const notes: string[] = [];
  targetKeys.forEach((geneKey) => {
    const statusA = deriveGeneStatusForParticipant(step.maleId, geneKey, context);
    const statusB = deriveGeneStatusForParticipant(step.femaleId, geneKey, context);
    const expectation = describeHetExpectation(statusA, statusB);
    if (!expectation) return;
    const geneLabel = firstDisplayLabelForGene(step.focusTraits, geneKey);
    const maleLabel = STATUS_LABELS[statusA] || STATUS_LABELS.none;
    const femaleLabel = STATUS_LABELS[statusB] || STATUS_LABELS.none;
    notes.push(`${geneLabel}: ${maleLabel} × ${femaleLabel} → ${expectation}`);
  });

  return notes;
};

const GeneTagRow = ({ label, tokens }) => {
  const list = uniqueGeneTokens(tokens).slice(0, 12);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-neutral-600">
      <span className="uppercase tracking-wide text-[10px] text-neutral-500 mr-1">{label}:</span>
      {list.map((token) => (
        <span
          key={`${label}-${token}`}
          className={`inline-flex items-center rounded-md font-medium ${getGeneChipClasses(token)} text-xs px-2 py-0.5`}
        >
          {token}
        </span>
      ))}
    </div>
  );
};

const defaultGoals = () => [];

const buildAnimalMap = (animals) => {
  const map = new Map();
  (animals || []).forEach((animal) => {
    if (animal?.id) map.set(animal.id, animal);
  });
  return map;
};

const extractGroups = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => (typeof entry === "string" ? entry : String(entry ?? "")))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof raw === "string") {
    return [raw.trim()].filter(Boolean);
  }

  return [];
};

const filterBreeders = (animals = []) =>
  animals.filter((animal) =>
    extractGroups(animal?.groups).some((group) => group.toLowerCase() === REQUIRED_GROUP)
  );

const keyForSuggestion = (suggestion) => `${suggestion.maleId}::${suggestion.femaleId}`;

export const SuggestionsTab = ({
  males = [],
  females = [],
  initialGoals = [],
  initialWeights = DEFAULT_WEIGHTS,
}) => {
  const initialPrimaryGoal = initialGoals[0];
  const initialGoalName = initialPrimaryGoal?.name ?? "";
  const initialGoalTraits = (initialPrimaryGoal?.requireAll ?? []).join(", ");
  const initialGoalInputValue = [initialGoalName, initialGoalTraits]
    .filter(Boolean)
    .join(initialGoalName && initialGoalTraits ? ": " : "");

  const breederMales = useMemo(() => filterBreeders(males), [males]);
  const breederFemales = useMemo(() => filterBreeders(females), [females]);
  const advisorMales = useMemo(
    () => breederMales.map(buildAdvisorAnimal).filter(Boolean),
    [breederMales]
  );
  const advisorFemales = useMemo(
    () => breederFemales.map(buildAdvisorAnimal).filter(Boolean),
    [breederFemales]
  );

  const [goals, setGoals] = useState(initialGoals.length ? initialGoals : defaultGoals());
  const [goalInput, setGoalInput] = useState(initialGoalInputValue);
  const [weights] = useState(initialWeights);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeRunGoals, setActiveRunGoals] = useState(initialGoals.length ? initialGoals : []);

  const maleMap = useMemo(() => buildAnimalMap(breederMales), [breederMales]);
  const femaleMap = useMemo(() => buildAnimalMap(breederFemales), [breederFemales]);
  const advisorAnimalMap = useMemo(() => {
    const map = new Map();
    advisorMales.forEach((animal) => {
      if (animal?.id) map.set(animal.id, animal);
    });
    advisorFemales.forEach((animal) => {
      if (animal?.id) map.set(animal.id, animal);
    });
    return map;
  }, [advisorMales, advisorFemales]);

  const getDisplayNameForAnimal = useCallback(
    (id: string) => {
      if (!id) return "Unknown";
      const record = maleMap.get(id) || femaleMap.get(id);
      if (record?.name) return record.name;
      if (record?.displayName) return record.displayName;
      if (record?.display_name) return record.display_name;
      if (isHoldbackId(id)) {
        const [, suffix] = id.split("-holdback-");
        const sexLabel = suffix === "m" ? "Holdback Male" : suffix === "f" ? "Holdback Female" : "Holdback";
        return sexLabel;
      }
      return id;
    },
    [maleMap, femaleMap]
  );

  const sortedSuggestions = useMemo(
    () =>
      suggestions
        .slice()
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [suggestions]
  );

  const confidentSuggestions = useMemo(
    () =>
      sortedSuggestions.filter((entry) => (entry.goalProb ?? 0) >= HIGH_CONFIDENCE_THRESHOLD),
    [sortedSuggestions]
  );

  const supportingSuggestions = useMemo(
    () =>
      sortedSuggestions.filter((entry) => (entry.goalProb ?? 0) < HIGH_CONFIDENCE_THRESHOLD),
    [sortedSuggestions]
  );

  const goalGeneInfo = useMemo(() => buildGoalGeneInfo(activeRunGoals), [activeRunGoals]);
  const goalTokenGroups = goalGeneInfo.groups;
  const goalGeneBaseSet = goalGeneInfo.baseGeneKeys;

  const updatePrimaryGoal = useCallback(
    (updater: (current: any) => any) => {
      setGoals((currentGoals) => {
        if (!currentGoals.length) {
          const baseGoal = defaultGoals()[0] ?? {
            id: `goal-${Date.now().toString(36)}`,
            name: "Custom goal",
            requireAll: [],
            weight: 1,
          };
          return [updater(baseGoal)];
        }
        const [primary, ...rest] = currentGoals;
        return [updater(primary), ...rest];
      });
    },
    []
  );

  const parseGoalTraits = useCallback((raw: string) => {
    return raw
      .split(/[,\n]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }, []);

  const parseGoalInputValue = useCallback(
    (raw: string) => {
      const trimmed = (raw ?? "").trim();
      if (!trimmed) {
        return { name: "", traits: [] };
      }

      if (trimmed.includes(":")) {
        const [namePart, traitPart = ""] = trimmed.split(/:/, 2);
        return {
          name: namePart.trim(),
          traits: parseGoalTraits(traitPart),
        };
      }

      if (trimmed.includes(" - ")) {
        const [namePart, traitPart = ""] = trimmed.split(" - ", 2);
        return {
          name: namePart.trim(),
          traits: parseGoalTraits(traitPart),
        };
      }

      if (trimmed.includes(",")) {
        return {
          name: "",
          traits: parseGoalTraits(trimmed),
        };
      }

      return {
        name: trimmed,
        traits: [],
      };
    },
    [parseGoalTraits]
  );

  const applyGoalInput = useCallback(
    (value: string) => {
      const { name, traits } = parseGoalInputValue(value);
      updatePrimaryGoal((current) => ({
        ...current,
        name: name || current?.name || "Custom goal",
        requireAll: traits,
      }));
    },
    [parseGoalInputValue, updatePrimaryGoal]
  );

  const handleGoalInputChange = (event) => {
    const value = event.target.value;
    setGoalInput(value);
    if (error) {
      setError("");
    }
    applyGoalInput(value);
  };

  const handleResetAdvisor = () => {
    setGoalInput("");
    setGoals(defaultGoals());
    setActiveRunGoals([]);
    setSuggestions([]);
    setError("");
    setLoading(false);
  };

  const runSuggestions = async () => {
    if (!advisorMales.length || !advisorFemales.length) {
      setError("Add animals to the Breeders group to see advisor recommendations.");
      return;
    }
    const activeGoals = goals.filter((goal) => (goal.requireAll?.length ?? 0) > 0 || (goal.requireAny?.length ?? 0) > 0);
    if (!activeGoals.length) {
      setError("Add goal traits before running the advisor.");
      return;
    }

    setActiveRunGoals(activeGoals);
    setLoading(true);
    setError("");
    try {
      const goalInfo = buildGoalGeneInfo(activeGoals);
      const result = await suggestForCollections(advisorMales, advisorFemales, activeGoals, weights);
      const filtered = result
        .filter((entry) => matchesGoalGeneTargets(entry, goalInfo.baseGeneKeys))
        .filter((entry) => (entry.goalProb ?? 0) > 0);
      setSuggestions(filtered);
    } catch (err) {
      setError(err?.message || "Failed to generate suggestions");
    } finally {
      setLoading(false);
    }
  };

  const renderPairLabel = (suggestion) => {
    return (
      <div className="font-semibold text-neutral-900">
        {getDisplayNameForAnimal(suggestion.maleId)} × {getDisplayNameForAnimal(suggestion.femaleId)}
      </div>
    );
  };

  const advisorSummary = () => {
    if (loading) return "Crunching punnett squares…";
    if (error) return error;
    if (!suggestions.length) return "Run the advisor to discover promising pairings.";
    if (!confidentSuggestions.length && supportingSuggestions.length)
      return `No pairs meet the high-confidence bar yet, but here are ${supportingSuggestions.length} options to review.`;
    if (!confidentSuggestions.length)
      return "No pairings crossed the confidence bar. Try adjusting your collections or goals.";
    return `${confidentSuggestions.length} pairing${
      confidentSuggestions.length === 1 ? "" : "s"
    } meet the ≥ ${formatPercent(HIGH_CONFIDENCE_THRESHOLD)} goal confidence target.`;
  };

  const topOutcomeLabel = (suggestion) => {
    const outcome = suggestion.outcomes?.[0];
    if (!outcome) return "No projection available.";
    const genotype = outcome.genotype?.join(" ") || "Unknown morph";
    return `${genotype} (${formatPercent(outcome.prob, 0)} appearance chance)`;
  };

  const renderSuggestionCard = (suggestion, confidenceTier: "high" | "supporting") => {
    const key = keyForSuggestion(suggestion);
    const highConfidence = confidenceTier === "high";
    const goalProb = suggestion.goalProb ?? 0;
    const plan = suggestion.plan;
    const planSteps = plan?.steps ?? [];
    const outcomeTokenGroups = collectOutcomeTokenGroups(suggestion.outcomes || [], 6, goalGeneBaseSet);
    const holdbackTokenGroups = splitGeneTokens(plan?.holdbackTraits ?? [], goalGeneBaseSet);
    const nextGenFocusTokens = planSteps
      .slice(1)
      .reduce<string[]>((acc, step) => {
        if (step?.focusTraits?.length) {
          acc.push(...step.focusTraits);
        }
        return acc;
      }, []);
    const nextGenFocusGroups = splitGeneTokens(nextGenFocusTokens, goalGeneBaseSet);
    const geneRows: { label: string; tokens: string[] }[] = [];

    if (goalTokenGroups.visuals.length) {
      geneRows.push({ label: "Goal Visuals", tokens: goalTokenGroups.visuals });
    }
    if (goalTokenGroups.hets.length) {
      geneRows.push({ label: "Goal Hets", tokens: goalTokenGroups.hets });
    }
    if (outcomeTokenGroups.visuals.length) {
      geneRows.push({ label: "Projected Visuals", tokens: outcomeTokenGroups.visuals });
    }
    if (outcomeTokenGroups.hets.length) {
      geneRows.push({ label: "Projected Hets", tokens: outcomeTokenGroups.hets });
    }
    if (holdbackTokenGroups.visuals.length) {
      geneRows.push({ label: "Holdback Visuals", tokens: holdbackTokenGroups.visuals });
    }
    if (holdbackTokenGroups.hets.length) {
      geneRows.push({ label: "Holdback Hets", tokens: holdbackTokenGroups.hets });
    }
    if (nextGenFocusGroups.visuals.length) {
      geneRows.push({ label: "Next-Gen Visuals", tokens: nextGenFocusGroups.visuals });
    }
    if (nextGenFocusGroups.hets.length) {
      geneRows.push({ label: "Next-Gen Hets", tokens: nextGenFocusGroups.hets });
    }

    const demandSignals = suggestion.demand?.signals?.slice(0, 2) ?? [];
    const priceBandLabel = formatPriceBand(suggestion.demand?.priceBand);

    return (
      <div
        key={key}
        className={`rounded-xl border ${
          highConfidence ? "border-emerald-200 bg-emerald-50" : "border-neutral-200 bg-white"
        } p-4 shadow-sm`}
      >
        <div className="flex flex-col gap-2">
          {renderPairLabel(suggestion)}
          <div className="text-sm text-neutral-600">{topOutcomeLabel(suggestion)}</div>
          {geneRows.length > 0 && (
            <div className="flex flex-col gap-1">
              {geneRows.map(({ label, tokens }, index) => (
                <GeneTagRow key={`${key}-${label}-${index}`} label={label} tokens={tokens} />
              ))}
            </div>
          )}
          <div className="text-sm text-neutral-600">
            Goal success chance: {" "}
            <span className={`font-semibold ${highConfidence ? "text-emerald-600" : "text-amber-600"}`}>
              {formatPercent(goalProb, 0)}
            </span>
            {!highConfidence && <span className="ml-1 text-xs text-neutral-500">(below confidence target)</span>}
          </div>
          {!!demandSignals.length && (
            <div className="text-sm text-neutral-600">
              Demand signals: {demandSignals.join(" • ")}
            </div>
          )}
          {priceBandLabel && (
            <div className="text-sm text-neutral-600">{priceBandLabel}</div>
          )}
          {suggestion.rationale && (
            <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">{suggestion.rationale}</div>
          )}
          {!!suggestion.sources?.length && (
            <div className="text-xs text-neutral-500">
              Sources: {suggestion.sources.slice(0, 3).map((source) => source.title || source.url).join(", ")}
            </div>
          )}
          {plan && (
            <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-sm text-sky-900">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  Multi-generation plan ({plan.strategy === "multi" ? "2-step" : "direct"})
                </div>
                <div className="text-xs font-semibold text-emerald-700">
                  Combined ≈ {formatPercent(plan.cumulativeProb ?? 0, 1)}
                </div>
              </div>
              <div className="mt-3 space-y-3">
                {planSteps.map((step) => {
                  const maleName = getDisplayNameForAnimal(step.maleId);
                  const femaleName = getDisplayNameForAnimal(step.femaleId);
                  const context = { advisorAnimals: advisorAnimalMap, plan };
                  const hetNotes = buildHetNotesForStep(step, goalGeneBaseSet, context);
                  const stepGroups = splitGeneTokens(step?.focusTraits || [], goalGeneBaseSet);
                  const stepRows: { label: string; tokens: string[] }[] = [];
                  if (stepGroups.visuals.length) {
                    stepRows.push({ label: "Focus Visuals", tokens: stepGroups.visuals });
                  }
                  if (stepGroups.hets.length) {
                    stepRows.push({ label: "Focus Hets", tokens: stepGroups.hets });
                  }
                  return (
                    <div key={`${key}-plan-${step.generation}`} className="rounded-lg border border-sky-200 bg-white p-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-wide text-sky-600">
                          Generation {step.generation}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-medium text-sky-700">
                          {step.prerequisiteProb != null && (
                            <span>Prereq ≈ {formatPercent(step.prerequisiteProb, 1)}</span>
                          )}
                          {step.successProb != null && (
                            <span>Goal ≈ {formatPercent(step.successProb, 1)}</span>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-sky-900">
                        {maleName} × {femaleName}
                      </div>
                      <div className="mt-1 text-xs text-sky-800">{step.summary}</div>
                      {stepRows.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                          {stepRows.map(({ label, tokens }, rowIdx) => (
                            <GeneTagRow key={`${key}-step-${step.generation}-${label}-${rowIdx}`} label={label} tokens={tokens} />
                          ))}
                        </div>
                      )}
                      {hetNotes.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                          {hetNotes.map((note, idx) => (
                            <div
                              key={`${key}-het-${step.generation}-${idx}`}
                              className="inline-flex items-center rounded-md bg-violet-100 px-2 py-1 text-[11px] font-medium text-violet-900"
                            >
                              {note}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-sky-700">
                {plan.holdbackProb != null && (
                  <span>Holdback ≈ {formatPercent(plan.holdbackProb, 1)}</span>
                )}
                {plan.holdbackTraits?.length ? (
                  <span>
                    Holdback genes: {[...holdbackTokenGroups.visuals, ...holdbackTokenGroups.hets].join(", ") || plan.holdbackTraits.join(", ")}
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Breeding Advisor</h2>
            <p className="text-sm text-neutral-600">
              We only look at animals tagged in the <strong>Breeders</strong> group and surface pairings that
              have a very high chance of producing your selected morph goal.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 flex flex-col gap-1 text-sm text-neutral-700">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Goal (Name and Traits)</span>
              <input
                value={goalInput}
                onChange={handleGoalInputChange}
                placeholder="Visual Clown: Clown, het Desert Ghost"
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              />
              <span className="text-xs text-neutral-500">Format tip: "Goal Name: trait one, trait two". If you only list traits, we’ll build a generic goal.</span>
            </label>
          </div>

          <div className="flex flex-col gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
            <div className="font-medium">Status</div>
            <div>{advisorSummary()}</div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
            <span>{`${breederMales.length} breeder male${breederMales.length === 1 ? "" : "s"}`}</span>
            <span>•</span>
            <span>{`${breederFemales.length} breeder female${breederFemales.length === 1 ? "" : "s"}`}</span>
            <span>•</span>
            <span>Confidence bar ≥ {formatPercent(HIGH_CONFIDENCE_THRESHOLD)}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runSuggestions}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800"
            >
              {loading ? "Generating..." : "Run Advisor"}
            </button>
            <button
              type="button"
              onClick={handleResetAdvisor}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Reset Advisor
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {confidentSuggestions.map((suggestion) => renderSuggestionCard(suggestion, "high"))}

        {supportingSuggestions.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-neutral-700">Additional pairings worth reviewing</div>
            {supportingSuggestions.map((suggestion) => renderSuggestionCard(suggestion, "supporting"))}
          </div>
        )}

        {!suggestions.length && !loading && !error && (
          <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Ready when you are—click <strong>Run Advisor</strong> to discover your strongest breeder pairings.
          </div>
        )}
      </div>
    </div>
  );
};

export default SuggestionsTab;
