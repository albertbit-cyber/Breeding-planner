/**
 * How a confirmed laboratory result changes an animal's recorded genetics.
 *
 * Pure on purpose. The same rules have to run in two places that share no
 * context:
 *
 *  1. `labGeneticsService`, when a laboratory submits a result — the moment the
 *     finding becomes true.
 *  2. `breederDataService.mergeAnimalPayload`, on every cloud-sync push — because
 *     the sync merges `morphs`, `hets` and `possibleHets` as a *union* of both
 *     sides. Additions survive that merge; removals do not. Without re-applying
 *     the decisions afterwards, a phone still holding "50% het Albino" would
 *     resurrect it the next time it synced, days after the lab proved the animal
 *     does not carry it.
 *
 * That is why the confirmation stores its decisions rather than only its
 * conclusions: the decision list is what makes the removal durable.
 */

export type LabGeneticsOutcome = "positive" | "carrierDetected" | "notDetected" | "negative";

/** A gene the laboratory settled, and which way. */
export type LabGeneticsDecision = {
  /** Normalized match key — what we compare the breeder's own tokens against. */
  key: string;
  /** The gene's name as it should be written onto the animal. */
  gene: string;
  outcome: LabGeneticsOutcome;
};

export type GeneticsSnapshot = {
  morphs: string[];
  hets: string[];
  possibleHets: string[];
};

export type LabGeneticsConfirmationMarker = {
  marker: string;
  outcome: "positive" | "carrierDetected";
  orderId?: string;
  resultId?: string;
  confirmedAt: string;
};

export type LabGeneticsConfirmation = {
  source: "genetic-test";
  note: string;
  confirmedAt: string;
  /** Genes the laboratory found. Displayed to the breeder as "confirmed by shed test". */
  markers: LabGeneticsConfirmationMarker[];
  /**
   * Every decision, including the negatives that only ever remove a token.
   * Replayed after a sync merge; see the note at the top of this file.
   */
  decisions: LabGeneticsDecision[];
};

export const LAB_GENETICS_CONFIRMATION_NOTE = "Confirmed by shed test";

const DECISIVE_OUTCOMES = new Set<LabGeneticsOutcome>([
  "positive",
  "carrierDetected",
  "notDetected",
  "negative",
]);

export const normalizeGeneKey = (raw: unknown): string =>
  String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/**
 * The words a breeder writes in front of a gene name. Any number of them, in
 * any order: "66% poss het Clown", "possible Fire", "ph Pinstripe", "Super Fire".
 */
const QUALIFIER_PREFIX =
  /^(?:\d{1,3}\s*%\s*|(?:pos(?:s|sible|siable|ible)?|probable|maybe|ph|p\.h\.)\s+|het(?:ero(?:zygous)?)?\s+|super\s+)+/i;

/**
 * Strip the qualifiers a breeder writes around a gene name so "66% poss het
 * Piebald", "het Piebald", "possible Fire", "Super Fire" and "Fire" all share
 * one key. The qualifiers apply to every inheritance type: a breeder writes
 * "possible Pinstripe" for a dominant gene as readily as "66% het Clown" for a
 * recessive one, and a test of that gene settles all of them.
 *
 * `canonical` keeps a super form's "Super " prefix, because that is a different
 * genotype to write onto the animal; every other qualifier is dropped.
 */
export const parseGeneToken = (raw: unknown): { key: string; canonical: string; isSuper: boolean } => {
  const normalized = String(raw ?? "").replace(/\(possible\)/gi, "").replace(/\s+/g, " ").trim();
  if (!normalized) return { key: "", canonical: "", isSuper: false };

  const prefix = normalized.match(QUALIFIER_PREFIX)?.[0] || "";
  const isSuper = /\bsuper\s/i.test(prefix);
  const base = normalized.slice(prefix.length).trim();
  const key = normalizeGeneKey(base);
  if (!key) return { key: "", canonical: "", isSuper: false };
  return { key, canonical: isSuper ? `Super ${base}` : base, isSuper };
};

/** A gene the breeder is guessing at, rather than one they know. */
export const isUncertainToken = (raw: unknown): boolean => {
  const normalized = String(raw ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  if (/^\d{1,3}\s*%/.test(normalized)) return true;
  if (/^(?:pos(?:s|sible|siable|ible)?|probable|maybe|ph|p\.h\.)\b/.test(normalized)) return true;
  return /\(possible\)/.test(normalized);
};

/** @deprecated Use isUncertainToken; kept for callers that predate dominant-gene guesses. */
export const isUncertainHetToken = isUncertainToken;

export const normalizeTokenList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  value.forEach((entry) => {
    const token = String(entry ?? "").trim();
    if (!token) return;
    const dedupeKey = token.toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push(token);
  });
  return out;
};

export const readSnapshot = (source: Record<string, unknown> | null | undefined): GeneticsSnapshot => ({
  morphs: normalizeTokenList(source?.morphs),
  hets: normalizeTokenList(source?.hets),
  possibleHets: normalizeTokenList(source?.possibleHets),
});

export const sameSnapshot = (a: GeneticsSnapshot, b: GeneticsSnapshot): boolean =>
  JSON.stringify(a.morphs) === JSON.stringify(b.morphs)
  && JSON.stringify(a.hets) === JSON.stringify(b.hets)
  && JSON.stringify(a.possibleHets) === JSON.stringify(b.possibleHets);

/**
 * Turn a result's findings into one decision per gene.
 *
 * `resolveGene` maps the name the laboratory sells the test under onto the gene
 * it actually reads — a lab may list "Pied" for what the keeper recorded as
 * "Piebald". The caller builds it from the ordered offering's `geneTarget` and
 * aliases, which is data the platform owns, rather than guessing at trade names.
 *
 * A gene tested twice in one result with contradictory outcomes is refused: it
 * means the laboratory submitted something incoherent, and silently picking one
 * would write a genetics change nobody could account for.
 */
export const collectDecisions = (
  findings: unknown,
  resolveGene: (marker: string) => string | null = () => null
): LabGeneticsDecision[] => {
  const decisions = new Map<string, LabGeneticsDecision>();

  (Array.isArray(findings) ? findings : []).forEach((finding) => {
    const outcome = String((finding as any)?.outcome ?? "").trim() as LabGeneticsOutcome;
    if (!DECISIVE_OUTCOMES.has(outcome)) return;

    const marker = String((finding as any)?.marker ?? "").trim();
    if (!marker) return;

    // `genotype` is what the laboratory says the animal carries, written the
    // way it goes onto the animal ("Super Fire"). Older findings have only the
    // marker, which is the test name mapped onto the gene it reads.
    const genotype = String((finding as any)?.genotype ?? "").trim();
    const resolved = genotype || resolveGene(marker);
    const parsed = parseGeneToken(resolved || marker);
    if (!parsed.key) return;

    const existing = decisions.get(parsed.key);
    if (existing && existing.outcome !== outcome) {
      throw new Error(
        `Conflicting outcomes for gene '${parsed.canonical}' in one result: ${existing.outcome} and ${outcome}.`
      );
    }

    decisions.set(parsed.key, { key: parsed.key, gene: parsed.canonical, outcome });
  });

  return [...decisions.values()];
};

/**
 * The laboratory's answer replaces whatever the breeder had written for that
 * gene, certain or not. A positive makes the animal visual (or super) for the
 * gene, a carrier makes it a known het, and a negative removes the gene from
 * the animal entirely: "Fire", "possible Fire", "66% het Clown" and "100% het
 * Clown" all go when the test says the gene is not there.
 *
 * This used to spare a het the breeder had recorded as certain. The owner
 * decided on 2026-10-08 that a test of exactly that gene is the stronger fact:
 * a breeder who disagrees can re-add it, and the result history still shows
 * what the laboratory found.
 */
export const applyDecisions = (
  snapshot: GeneticsSnapshot,
  decisions: LabGeneticsDecision[]
): GeneticsSnapshot => {
  let morphs = normalizeTokenList(snapshot.morphs);
  let hets = normalizeTokenList(snapshot.hets);
  let possibleHets = normalizeTokenList(snapshot.possibleHets);

  const withoutKey = (tokens: string[], key: string): string[] =>
    tokens.filter((token) => parseGeneToken(token).key !== key);

  decisions.forEach((decision) => {
    morphs = withoutKey(morphs, decision.key);
    hets = withoutKey(hets, decision.key);
    possibleHets = withoutKey(possibleHets, decision.key);

    if (decision.outcome === "positive") {
      morphs.push(decision.gene);
      return;
    }

    if (decision.outcome === "carrierDetected") {
      // The het list holds bare gene names; the apps add "het" when they show it.
      hets.push(parseGeneToken(decision.gene).canonical || decision.gene);
    }

    // notDetected / negative: the removal above is the whole decision.
  });

  return {
    morphs: normalizeTokenList(morphs),
    hets: normalizeTokenList(hets),
    possibleHets: normalizeTokenList(possibleHets),
  };
};

const isConfirmedOutcome = (value: unknown): value is "positive" | "carrierDetected" =>
  value === "positive" || value === "carrierDetected";

/**
 * Fold this result's decisions into whatever the animal already carried, keyed by
 * gene so a later test supersedes an earlier one rather than appending to it.
 */
export const buildConfirmation = (
  current: unknown,
  decisions: LabGeneticsDecision[],
  context: { orderId: string; resultId: string; confirmedAt: string }
): LabGeneticsConfirmation | null => {
  const currentRecord = (current && typeof current === "object" ? current : {}) as Partial<LabGeneticsConfirmation>;

  const markersByKey = new Map<string, LabGeneticsConfirmationMarker>();
  (Array.isArray(currentRecord.markers) ? currentRecord.markers : []).forEach((entry) => {
    const parsed = parseGeneToken(entry?.marker);
    if (!parsed.key || !isConfirmedOutcome(entry?.outcome)) return;
    markersByKey.set(parsed.key, {
      marker: parsed.canonical || String(entry.marker || "").trim(),
      outcome: entry.outcome,
      orderId: typeof entry.orderId === "string" ? entry.orderId : undefined,
      resultId: typeof entry.resultId === "string" ? entry.resultId : undefined,
      confirmedAt: String(entry.confirmedAt || "").trim() || context.confirmedAt,
    });
  });

  const decisionsByKey = new Map<string, LabGeneticsDecision>();
  (Array.isArray(currentRecord.decisions) ? currentRecord.decisions : []).forEach((entry) => {
    const key = normalizeGeneKey(entry?.key || entry?.gene);
    if (!key || !DECISIVE_OUTCOMES.has(entry?.outcome as LabGeneticsOutcome)) return;
    decisionsByKey.set(key, {
      key,
      gene: String(entry.gene || "").trim() || key,
      outcome: entry.outcome as LabGeneticsOutcome,
    });
  });

  decisions.forEach((decision) => {
    decisionsByKey.set(decision.key, decision);
    markersByKey.delete(decision.key);
    if (!isConfirmedOutcome(decision.outcome)) return;
    markersByKey.set(decision.key, {
      marker: decision.gene,
      outcome: decision.outcome,
      orderId: context.orderId,
      resultId: context.resultId,
      confirmedAt: context.confirmedAt,
    });
  });

  const markers = [...markersByKey.values()].sort((a, b) => a.marker.localeCompare(b.marker));
  const allDecisions = [...decisionsByKey.values()].sort((a, b) => a.gene.localeCompare(b.gene));

  if (!markers.length && !allDecisions.length) return null;

  const confirmedAt = markers.reduce(
    (latest, entry) => (entry.confirmedAt > latest ? entry.confirmedAt : latest),
    context.confirmedAt
  );

  return {
    source: "genetic-test",
    note: LAB_GENETICS_CONFIRMATION_NOTE,
    confirmedAt,
    markers,
    decisions: allDecisions,
  };
};

/**
 * What a confirmation *says*, with the timestamps left out.
 *
 * Used to decide whether re-submitting a result is worth a write. A laboratory
 * correcting a typo and saving again reaches the same verdict on the same genes;
 * rewriting the animal for a fresh `confirmedAt` would bump its sync timestamp
 * and push a no-op change to every one of the breeder's devices.
 */
export const confirmationSignature = (confirmation: unknown): string => {
  const record = (confirmation && typeof confirmation === "object" ? confirmation : null) as
    | Partial<LabGeneticsConfirmation>
    | null;
  if (!record) return "";
  const markers = (Array.isArray(record.markers) ? record.markers : [])
    .map((entry) => `${normalizeGeneKey(entry?.marker)}=${entry?.outcome}`)
    .sort();
  const decisions = (Array.isArray(record.decisions) ? record.decisions : [])
    .map((entry) => `${normalizeGeneKey(entry?.key || entry?.gene)}=${entry?.outcome}`)
    .sort();
  return JSON.stringify({ markers, decisions });
};

/**
 * Re-assert a stored confirmation over a genetics snapshot.
 *
 * Called after the cloud sync's union merge, where a stale device can otherwise
 * reintroduce a token the laboratory already cleared. Applying the decisions
 * again is idempotent — running it on an already-correct snapshot changes
 * nothing.
 */
export const reapplyConfirmation = (
  snapshot: GeneticsSnapshot,
  confirmation: unknown
): GeneticsSnapshot => {
  const record = (confirmation && typeof confirmation === "object" ? confirmation : null) as
    | Partial<LabGeneticsConfirmation>
    | null;
  const stored = Array.isArray(record?.decisions) ? record.decisions : [];
  if (!stored.length) return snapshot;

  const decisions = stored
    .map((entry) => {
      const key = normalizeGeneKey(entry?.key || entry?.gene);
      if (!key || !DECISIVE_OUTCOMES.has(entry?.outcome as LabGeneticsOutcome)) return null;
      return {
        key,
        gene: String(entry?.gene || "").trim() || key,
        outcome: entry?.outcome as LabGeneticsOutcome,
      };
    })
    .filter((entry): entry is LabGeneticsDecision => entry !== null);

  if (!decisions.length) return snapshot;
  return applyDecisions(snapshot, decisions);
};
