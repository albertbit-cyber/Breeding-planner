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
 * Strip the qualifiers a breeder writes around a gene name so "66% poss het
 * Piebald", "het Piebald" and "Piebald" all compare equal.
 */
export const parseGeneToken = (raw: unknown): { key: string; canonical: string } => {
  const normalized = String(raw ?? "").trim();
  if (!normalized) return { key: "", canonical: "" };

  const stripped = normalized
    .replace(/^\d{1,3}%\s*/i, "")
    .replace(/^(?:pos(?:s|sible|siable|ible)?\s+)?het\s+/i, "")
    .replace(/\(possible\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return { key: normalizeGeneKey(stripped), canonical: stripped };
};

/** A het the breeder is guessing at, rather than one they know. */
export const isUncertainHetToken = (raw: unknown): boolean => {
  const normalized = String(raw ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  if (/^\d{1,3}%/.test(normalized)) return true;
  if (/^(?:pos(?:sible|siable|ible)?|probable|maybe|ph)\b/.test(normalized)) return true;
  return /\(possible\)/.test(normalized);
};

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

    const resolved = resolveGene(marker);
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
 * A positive makes the animal visual for that gene, a carrier makes it a known
 * het, and a negative clears only what the breeder was *guessing* — a het they
 * recorded as certain is theirs and is left alone. Removing a keeper's own
 * stated fact because one test disagreed is not ours to do.
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
    if (decision.outcome === "positive") {
      morphs = withoutKey(morphs, decision.key);
      hets = withoutKey(hets, decision.key);
      possibleHets = withoutKey(possibleHets, decision.key);
      morphs.push(decision.gene);
      return;
    }

    if (decision.outcome === "carrierDetected") {
      const alreadyVisual = morphs.some((token) => parseGeneToken(token).key === decision.key);
      hets = withoutKey(hets, decision.key);
      possibleHets = withoutKey(possibleHets, decision.key);
      if (!alreadyVisual) hets.push(decision.gene);
      return;
    }

    // notDetected / negative
    hets = hets.filter((token) => {
      if (parseGeneToken(token).key !== decision.key) return true;
      return !isUncertainHetToken(token);
    });
    possibleHets = withoutKey(possibleHets, decision.key);
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
