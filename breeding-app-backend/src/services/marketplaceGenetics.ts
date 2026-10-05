/**
 * A listing's genetics, read the way the hobby writes them.
 *
 * Sellers type one free-text line -- "Clown het Pied 66% het Hypo", "Super
 * Pastel, ph Albino" -- and every reader used to treat it as a bag of
 * substrings. That made "Clown" match a het Clown, "Albino" match a Lavender
 * Albino, and rendered a lab-confirmed het exactly like a guessed one.
 *
 * Here each trait becomes a claim with a zygosity (visual, het, possible het)
 * and a provenance (observed, predicted, lab-confirmed). The two are kept
 * apart on purpose: a buyer pays for the difference between "66% het" and
 * "het, shed-tested", and one badge for both would erase it.
 */

export type Zygosity = "visual" | "het" | "possible_het";
export type ClaimProvenance = "observed" | "predicted" | "lab_confirmed";
export type LabCall = "visual" | "het" | "negative" | "inconclusive";

export type GeneticClaim = {
  /** As the seller wrote it, or as the certificate states it. */
  label: string;
  gene: string;
  zygosity: Zygosity;
  /** Super forms: homozygous for an incomplete dominant. Still a visual. */
  homozygous: boolean;
  /** 66 for "66% het". 100 for a stated "100% het". Null when not stated. */
  percent: number | null;
  provenance: ClaimProvenance;
  /** Where the claim comes from: the seller's text, or the certificate alone. */
  source: "seller" | "lab";
  lab: { call: LabCall; result: string; certificateNumber: string | null } | null;
  /** The certificate says something other than the seller's claim. */
  labDisagrees: boolean;
};

export type CertifiedLine = { test: string; result: string };

const POSSIBLE_WORDS = new Set(["pos", "pos.", "poss", "poss.", "possible"]);

const isPercent = (word: string) => /^\d{1,3}%$/.test(word);

const isQualifier = (word: string): boolean => {
  const lower = word.toLowerCase();
  return (
    isPercent(lower) ||
    POSSIBLE_WORDS.has(lower) ||
    lower === "ph" ||
    lower === "het" ||
    lower === "dh" ||
    lower === "super" ||
    lower === "visual"
  );
};

const normalizeGene = (value: string): string => value.replace(/\s+/g, " ").trim();

export const geneKey = (value: string): string => normalizeGene(value).toLowerCase();

type Chunk = { qualifiers: string[]; gene: string[] };

const toClaim = (chunk: Chunk): Omit<GeneticClaim, "provenance" | "source" | "lab" | "labDisagrees"> | null => {
  const gene = normalizeGene(chunk.gene.join(" "));
  if (!gene) return null;
  const qualifiers = chunk.qualifiers.map((word) => word.toLowerCase());
  const percentWord = qualifiers.find(isPercent);
  const percent = percentWord ? Math.min(100, Number(percentWord.replace("%", ""))) : null;
  const het = qualifiers.includes("het") || qualifiers.includes("dh");
  const possible = qualifiers.some((word) => POSSIBLE_WORDS.has(word)) || qualifiers.includes("ph");

  let zygosity: Zygosity = "visual";
  if (qualifiers.includes("ph") && !het) zygosity = "possible_het";
  else if (het && (possible || (percent !== null && percent < 100))) zygosity = "possible_het";
  else if (het) zygosity = "het";

  return {
    label: [...chunk.qualifiers, ...chunk.gene].join(" "),
    gene,
    zygosity,
    homozygous: zygosity === "visual" && qualifiers.includes("super"),
    percent: zygosity === "visual" ? null : percent,
  };
};

/**
 * Splits on the separators people use (commas, slashes, " + ") and then on the
 * qualifiers themselves, so "Clown het Pied" is two claims, not one gene
 * called "Clown het Pied".
 */
const chunksOf = (text: string): Chunk[] => {
  const chunks: Chunk[] = [];
  String(text || "")
    .replace(/(\d{1,3})\s*%/g, "$1%")
    .split(/[,;/]|\s\+\s/)
    .forEach((part) => {
      let current: Chunk = { qualifiers: [], gene: [] };
      part
        .split(/\s+/)
        .filter(Boolean)
        .forEach((word) => {
          if (isQualifier(word)) {
            if (current.gene.length) {
              chunks.push(current);
              current = { qualifiers: [], gene: [] };
            }
            current.qualifiers.push(word);
          } else {
            current.gene.push(word);
          }
        });
      if (current.gene.length) chunks.push(current);
    });
  return chunks;
};

/** The seller's claims, before any certificate is consulted. */
export const parseGeneticClaims = (genetics: unknown): GeneticClaim[] =>
  chunksOf(String(genetics ?? ""))
    .map(toClaim)
    .filter((claim): claim is NonNullable<ReturnType<typeof toClaim>> => Boolean(claim))
    .slice(0, 24)
    .map((claim) => ({
      ...claim,
      // A visual is something the keeper can see; a het is carried and
      // invisible, so without a test it is only ever an inference from the
      // pairing.
      provenance: claim.zygosity === "visual" ? "observed" : "predicted",
      source: "seller",
      lab: null,
      labDisagrees: false,
    }));

/** One gene token from a search box or URL, read with the same rules. */
export const parseGeneToken = (token: unknown) => {
  const [claim] = parseGeneticClaims(token);
  return claim || null;
};

/**
 * Gene names that are more than one word. A visual is usually written as one
 * run of genes -- "Pastel Clown" -- so a search for "Clown" has to find a whole
 * word inside it; these are what stop "Albino" being found inside "Lavender
 * Albino", which is a different gene.
 */
const MULTI_WORD_GENES = [
  "lavender albino",
  "toffee albino",
  "caramel albino",
  "candy albino",
  "desert ghost",
  "yellow belly",
  "black pastel",
  "black head",
  "black lace",
  "red axanthic",
  "vpi axanthic",
  "tsk axanthic",
  "mj axanthic",
  "jolliff axanthic",
  "orange dream",
  "orange ghost",
  "coral glow",
  "white belly",
  "genetic stripe",
  "scaleless head",
].map((gene) => gene.split(" "));

/** Word ranges of `words` that belong to a known multi-word gene. */
const coveredRanges = (words: string[]): Array<[number, number]> => {
  const ranges: Array<[number, number]> = [];
  for (let start = 0; start < words.length; start += 1) {
    const hit = MULTI_WORD_GENES.find(
      (gene) => gene.length > 1 && gene.every((word, offset) => words[start + offset] === word)
    );
    if (hit) {
      ranges.push([start, start + hit.length]);
      start += hit.length - 1;
    }
  }
  return ranges;
};

/** True when `gene` names one of the genes inside the claim's gene phrase. */
export const claimHasGene = (claimGene: string, gene: string): boolean => {
  const words = geneKey(claimGene).split(" ");
  const wanted = geneKey(gene).split(" ");
  if (!wanted[0]) return false;
  const ranges = coveredRanges(words);
  for (let start = 0; start + wanted.length <= words.length; start += 1) {
    if (!wanted.every((word, offset) => words[start + offset] === word)) continue;
    const end = start + wanted.length;
    // Either it is exactly a known multi-word gene, or it does not cut into one.
    const exact = ranges.some(([from, to]) => from === start && to === end);
    const overlaps = ranges.some(([from, to]) => start < to && end > from);
    if (exact || !overlaps) return true;
  }
  return false;
};

/**
 * Does this listing satisfy one gene filter?
 *
 * The gene must be the same gene, not a substring of another ("Albino" is not
 * "Lavender Albino"), and the zygosity must be what was asked for: "Clown"
 * means a visual Clown, "het Clown" a proven het, and "pos het Clown" takes
 * either kind of het.
 */
export const geneticsMatchToken = (genetics: unknown, token: unknown): boolean => {
  const wanted = parseGeneToken(token);
  if (!wanted) return false;
  return parseGeneticClaims(genetics).some((claim) => {
    if (!claimHasGene(claim.gene, wanted.gene)) return false;
    if (wanted.zygosity === "visual") return claim.zygosity === "visual";
    if (wanted.zygosity === "het") return claim.zygosity === "het";
    return claim.zygosity === "het" || claim.zygosity === "possible_het";
  });
};

/** The certificate's own wording ("Clown", "Het Clown", "Negative") as a call. */
export const labCallOf = (line: CertifiedLine): LabCall => {
  const result = normalizeGene(line.result);
  if (/^het\s/i.test(result)) return "het";
  if (geneKey(result) === geneKey(line.test)) return "visual";
  if (/^negative$/i.test(result)) return "negative";
  return "inconclusive";
};

/**
 * Lays a certificate over the seller's claims.
 *
 * A claim the lab supports becomes lab-confirmed. A claim the lab contradicts
 * keeps its own provenance and is marked as disputed -- the buyer sees both
 * statements rather than the platform quietly picking one. A gene the lab
 * found that the seller never mentioned is added as a lab-sourced claim.
 */
export const withLabResults = (
  claims: GeneticClaim[],
  lines: CertifiedLine[] | null | undefined,
  certificateNumber: string | null = null
): GeneticClaim[] => {
  if (!lines?.length) return claims;
  const byGene = new Map<string, CertifiedLine>();
  lines.forEach((line) => {
    if (line?.test && !byGene.has(geneKey(line.test))) byGene.set(geneKey(line.test), line);
  });

  const used = new Set<string>();
  const merged = claims.map((claim) => {
    const line = byGene.get(geneKey(claim.gene));
    if (!line) return claim;
    used.add(geneKey(claim.gene));
    const call = labCallOf(line);
    const lab = { call, result: line.result, certificateNumber };
    const supports =
      (call === "visual" && claim.zygosity === "visual") ||
      (call === "het" && claim.zygosity !== "visual");
    const disagrees = call === "negative" || (call === "visual" && claim.zygosity !== "visual") || (call === "het" && claim.zygosity === "visual");
    return {
      ...claim,
      provenance: supports ? ("lab_confirmed" as const) : claim.provenance,
      lab,
      labDisagrees: disagrees,
    };
  });

  byGene.forEach((line, key) => {
    if (used.has(key)) return;
    const call = labCallOf(line);
    if (call !== "visual" && call !== "het") return;
    merged.push({
      label: line.result,
      gene: normalizeGene(line.test),
      zygosity: call === "het" ? "het" : "visual",
      homozygous: false,
      percent: null,
      provenance: "lab_confirmed",
      source: "lab",
      lab: { call, result: line.result, certificateNumber },
      labDisagrees: false,
    });
  });

  return merged;
};
