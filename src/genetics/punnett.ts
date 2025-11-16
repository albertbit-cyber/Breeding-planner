import { Animal, Morph, Outcome } from "../types/pairing";

type GeneCategory = "recessive" | "co-dom" | "dominant";

type AlleleDistribution = { 0: number; 1: number; 2: number };

interface ParentGeneEntry {
  gene: string;
  type?: GeneCategory;
  distribution: AlleleDistribution;
  level: number;
}

interface GeneBundle {
  gene: string;
  type: GeneCategory;
  parentA: AlleleDistribution;
  parentB: AlleleDistribution;
}

const EPSILON = 1e-6;

const emptyDistribution = (): AlleleDistribution => ({ 0: 0, 1: 0, 2: 0 });

const cloneDistribution = (dist: AlleleDistribution): AlleleDistribution => ({
  0: dist[0] ?? 0,
  1: dist[1] ?? 0,
  2: dist[2] ?? 0,
});

const DEFAULT_DISTRIBUTION: AlleleDistribution = Object.freeze({ 0: 1, 1: 0, 2: 0 });

const normalizeKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, " ");

const normalizeGeneLabel = (raw: string): string => {
  let value = raw.trim();
  if (!value) return "";
  value = value.replace(/\(([^)]*)\)/g, " $1 ");
  value = value.replace(/\b(?:possible|pos|probable|het|ph|carrier)\b/gi, "");
  value = value.replace(/\d+(?:\.\d+)?\s*%/g, "");
  value = value.replace(/\s+/g, " ").trim();
  if (!value) value = raw.trim();
  const words = value.split(" ");
  const formatted = words
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2) {
        return word.toUpperCase();
      }
      if (/^[A-Z]+$/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
  return formatted || raw.trim();
};

const distributionLevel = (dist: AlleleDistribution): number => {
  if (Math.abs(dist[2] - 1) < EPSILON) return 3; // homozygous/visual
  if (Math.abs(dist[1] - 1) < EPSILON) return 2; // guaranteed het/single allele
  if (dist[1] > EPSILON) return 1; // probabilistic het/allele
  return 0; // no allele
};

const combineProbabilistic = (existing: AlleleDistribution, next: AlleleDistribution): AlleleDistribution => {
  const p1 = existing[1] ?? 0;
  const p2 = next[1] ?? 0;
  const combined = 1 - (1 - p1) * (1 - p2);
  const dist = emptyDistribution();
  dist[1] = combined;
  dist[0] = 1 - combined;
  return dist;
};

const updateEntry = (
  entry: ParentGeneEntry | undefined,
  gene: string,
  type: GeneCategory,
  dist: AlleleDistribution
): ParentGeneEntry => {
  const newLevel = distributionLevel(dist);
  if (!entry) {
    return {
      gene,
      type,
      distribution: cloneDistribution(dist),
      level: newLevel,
    };
  }

  if (newLevel > entry.level) {
    entry.distribution = cloneDistribution(dist);
    entry.level = newLevel;
  } else if (newLevel === entry.level && newLevel === 1) {
    entry.distribution = combineProbabilistic(entry.distribution, dist);
    entry.level = distributionLevel(entry.distribution);
  }

  if (type === "recessive" || !entry.type) {
    entry.type = type;
  } else if (entry.type !== type) {
    // Prefer co-dom over dominant when conflicting metadata
    if (type === "co-dom" && entry.type === "dominant") {
      entry.type = type;
    }
  }

  return entry;
};

const parseCodomMorph = (name: string): { gene: string; alleleCount: 1 | 2 } => {
  const trimmed = name.trim();
  if (/^super\s+/i.test(trimmed)) {
    return { gene: trimmed.replace(/^super\s+/i, "").trim(), alleleCount: 2 };
  }
  return { gene: trimmed, alleleCount: 1 };
};

const parsePossibleProbability = (label: string): number | undefined => {
  const percentMatch = label.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    const value = Number(percentMatch[1]);
    if (!Number.isNaN(value)) {
      return Math.max(0, Math.min(1, value / 100));
    }
  }
  return undefined;
};

const gatherAnimalGenes = (animal: Animal): Map<string, ParentGeneEntry> => {
  const data = new Map<string, ParentGeneEntry>();

  const assign = (gene: string, type: GeneCategory, distribution: AlleleDistribution) => {
    const label = normalizeGeneLabel(gene);
    const key = normalizeKey(label);
    const existing = data.get(key);
    data.set(key, updateEntry(existing, label, type, distribution));
  };

  (animal.morphs || []).forEach((morph: Morph) => {
    if (!morph?.name) return;
    const name = morph.name.trim();
    if (!name) return;
    if (morph.type === "recessive") {
      const dist = emptyDistribution();
      dist[2] = 1;
      assign(name, "recessive", dist);
    } else if (morph.type === "co-dom") {
      const parsed = parseCodomMorph(name);
      const dist = emptyDistribution();
      dist[parsed.alleleCount] = 1;
      assign(parsed.gene, "co-dom", dist);
    } else if (morph.type === "dominant" || morph.type === "polygenic" || morph.type === "co-dom") {
      const dist = emptyDistribution();
      dist[1] = 1;
      assign(name, "dominant", dist);
    } else {
      const dist = emptyDistribution();
      dist[1] = 1;
      assign(name, "dominant", dist);
    }
  });

  (animal.hets || []).forEach((het) => {
    if (!het) return;
    const dist = emptyDistribution();
    dist[1] = 1;
    assign(het, "recessive", dist);
  });

  (animal.possibleHets || []).forEach((raw) => {
    if (!raw) return;
    const probability = parsePossibleProbability(raw) ?? 0.5;
    const dist = emptyDistribution();
    dist[1] = probability;
    dist[0] = 1 - probability;
    assign(raw, "recessive", dist);
  });

  return data;
};

const gameteMutProb = (count: number): number => {
  if (count <= 0) return 0;
  if (count >= 2) return 1;
  return 0.5;
};

const computeChildAlleleDistribution = (parentA: AlleleDistribution, parentB: AlleleDistribution): AlleleDistribution => {
  const result = emptyDistribution();
  const statesA: Array<[number, number]> = [
    [0, parentA[0] ?? 0],
    [1, parentA[1] ?? 0],
    [2, parentA[2] ?? 0],
  ];
  const statesB: Array<[number, number]> = [
    [0, parentB[0] ?? 0],
    [1, parentB[1] ?? 0],
    [2, parentB[2] ?? 0],
  ];

  statesA.forEach(([countA, probA]) => {
    if (probA <= EPSILON) return;
    statesB.forEach(([countB, probB]) => {
      if (probB <= EPSILON) return;
      const weight = probA * probB;
      const pA = gameteMutProb(countA);
      const pB = gameteMutProb(countB);
      const visual = pA * pB;
      const singleFromA = pA * (1 - pB);
      const singleFromB = (1 - pA) * pB;
      const het = singleFromA + singleFromB;
      const normal = (1 - pA) * (1 - pB);
      result[2] += weight * visual;
      result[1] += weight * het;
      result[0] += weight * normal;
    });
  });

  const total = result[0] + result[1] + result[2];
  if (total > EPSILON) {
    result[0] /= total;
    result[1] /= total;
    result[2] /= total;
  }

  return result;
};

const translateDistributionToPhenotypes = (
  gene: string,
  type: GeneCategory,
  distribution: AlleleDistribution
): Array<{ labels: string[]; prob: number }> => {
  const results: Array<{ labels: string[]; prob: number }> = [];

  const pushIf = (prob: number, labels: string[]) => {
    if (prob > EPSILON) {
      results.push({ labels, prob });
    }
  };

  if (type === "recessive") {
    pushIf(distribution[2] ?? 0, [gene]);
    pushIf(distribution[1] ?? 0, [`het ${gene}`]);
    pushIf(distribution[0] ?? 0, []);
  } else if (type === "co-dom") {
    pushIf(distribution[2] ?? 0, [`Super ${gene}`]);
    pushIf(distribution[1] ?? 0, [gene]);
    pushIf(distribution[0] ?? 0, []);
  } else {
    const expressed = (distribution[1] ?? 0) + (distribution[2] ?? 0);
    pushIf(expressed, [gene]);
    pushIf(distribution[0] ?? 0, []);
  }

  return results.length ? results : [{ labels: [], prob: 1 }];
};

const buildGeneBundles = (a: Animal, b: Animal): GeneBundle[] => {
  const genesA = gatherAnimalGenes(a);
  const genesB = gatherAnimalGenes(b);
  const keys = new Set<string>([...genesA.keys(), ...genesB.keys()]);

  return Array.from(keys).map((key) => {
    const entryA = genesA.get(key);
    const entryB = genesB.get(key);
    const geneName = entryA?.gene ?? entryB?.gene ?? key;
    const type: GeneCategory = entryA?.type ?? entryB?.type ?? "recessive";
    const parentA = entryA ? entryA.distribution : cloneDistribution(DEFAULT_DISTRIBUTION);
    const parentB = entryB ? entryB.distribution : cloneDistribution(DEFAULT_DISTRIBUTION);
    return { gene: geneName, type, parentA, parentB };
  });
};

const combineGeneOutcomes = (bundles: GeneBundle[]): Outcome[] => {
  let combined: Array<{ labels: string[]; prob: number }> = [
    { labels: [], prob: 1 },
  ];

  bundles.forEach((bundle) => {
    const distribution = computeChildAlleleDistribution(bundle.parentA, bundle.parentB);
    const phenotypes = translateDistributionToPhenotypes(bundle.gene, bundle.type, distribution);

    const next: Array<{ labels: string[]; prob: number }> = [];
    phenotypes.forEach((variant) => {
      combined.forEach((current) => {
        const prob = current.prob * variant.prob;
        if (prob <= EPSILON) return;
        next.push({ labels: [...current.labels, ...variant.labels], prob });
      });
    });
    combined = next.length ? next : combined;
  });

  const aggregated = new Map<string, { labels: string[]; prob: number }>();
  combined.forEach((entry) => {
    const sorted = entry.labels.slice().sort((a, b) => a.localeCompare(b));
    const key = sorted.join("|");
    const existing = aggregated.get(key);
    if (existing) {
      existing.prob += entry.prob;
    } else {
      aggregated.set(key, { labels: sorted, prob: entry.prob });
    }
  });

  let total = 0;
  aggregated.forEach((value) => {
    total += value.prob;
  });
  if (total > EPSILON && Math.abs(total - 1) > 1e-6) {
    aggregated.forEach((value) => {
      value.prob = value.prob / total;
    });
  }

  const outcomes: Outcome[] = Array.from(aggregated.values())
    .filter((value) => value.prob > EPSILON)
    .map((value) => ({
      genotype: value.labels,
      prob: value.prob,
      flags: [],
    }))
    .sort((a, b) => b.prob - a.prob);

  if (!outcomes.length) {
    return [
      {
        genotype: [],
        prob: 1,
        flags: [],
      },
    ];
  }

  return outcomes;
};

export const punnettCross = (a: Animal, b: Animal): Outcome[] => {
  const bundles = buildGeneBundles(a, b);
  if (!bundles.length) {
    return [
      {
        genotype: [],
        prob: 1,
        flags: [],
      },
    ];
  }
  return combineGeneOutcomes(bundles);
};
