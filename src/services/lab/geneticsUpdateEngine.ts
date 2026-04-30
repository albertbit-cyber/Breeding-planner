import { resolveCanonicalGene } from "../../genetics/geneDatabase";
import { normalizeGeneCandidate } from "../../genetics/geneLibrary";
import { createGeneticsChangeLogRecord } from "../../db/labStore";
import type { GeneticsSnapshot, TestOrder, TestResult } from "../../types/lab";
import type { ServiceActor } from "./testOrderService";

const SNAKES_STORAGE_KEY = "breedingPlannerSnakes";

type DecisiveOutcome = "positive" | "negative" | "carrierDetected" | "notDetected";

type GeneAction = "promoteHet" | "promoteVisual" | "removeUncertainHet";
type ConfirmedGeneOutcome = Extract<DecisiveOutcome, "positive" | "carrierDetected">;

type StoredLabGeneticsConfirmationMarker = {
  marker: string;
  outcome: ConfirmedGeneOutcome;
  orderId?: string;
  resultId?: string;
  confirmedAt: string;
};

type StoredLabGeneticsConfirmation = {
  source: "genetic-test";
  note: string;
  confirmedAt: string;
  markers: StoredLabGeneticsConfirmationMarker[];
};

type StoredSnake = {
  id: string;
  morphs?: unknown;
  hets?: unknown;
  possibleHets?: unknown;
  labGeneticsConfirmation?: StoredLabGeneticsConfirmation | null;
  [key: string]: unknown;
};

type ElectronBridge = {
  loadData?: () => Promise<Record<string, unknown> | null>;
  saveData?: (payload: Record<string, unknown>) => Promise<{ success?: boolean; error?: string } | undefined>;
};

export interface SnakeDataGateway {
  loadSnakes: () => Promise<StoredSnake[]>;
  saveSnakes: (snakes: StoredSnake[]) => Promise<void>;
}

export interface GeneticsUpdateEngineInput {
  actor: ServiceActor;
  order: TestOrder;
  result: TestResult;
}

export interface GeneticsUpdateEngineDeps {
  snakeDataGateway?: SnakeDataGateway;
  createChangeLog?: typeof createGeneticsChangeLogRecord;
  now?: () => string;
  makeId?: () => string;
  allowNonLabActor?: boolean;
}

export interface GeneticsUpdateEngineResult {
  applied: boolean;
  changedGeneKeys: string[];
  before: GeneticsSnapshot;
  after: GeneticsSnapshot;
  changeLogId?: string;
  reason: string;
}

type GeneDecision = {
  key: string;
  canonicalGene: string;
  action: GeneAction;
  outcome: DecisiveOutcome;
};

const decisiveOutcomes = new Set<DecisiveOutcome>([
  "positive",
  "negative",
  "carrierDetected",
  "notDetected",
]);

const nowIso = (): string => new Date().toISOString();

const makeId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `gcl_${crypto.randomUUID()}`;
  }
  return `gcl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const LAB_GENETICS_CONFIRMATION_NOTE = "Confirmed by shed test";

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  value.forEach((entry) => {
    const token = String(entry ?? "").trim();
    if (!token) return;
    const dedupeKey = `${normalizeGeneCandidate(token)}|${token}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push(token);
  });
  return out;
};

const serializeLabGeneticsConfirmation = (
  value: StoredLabGeneticsConfirmation | null | undefined
): string => JSON.stringify(value ?? null);

const parseBaseGeneToken = (raw: unknown): { key: string; canonical: string } => {
  const normalized = String(raw ?? "").trim();
  if (!normalized) return { key: "", canonical: "" };

  const stripped = normalized
    .replace(/^\d{1,3}%\s*/i, "")
    .replace(/^(?:pos(?:sible)?\s+)?het\s+/i, "")
    .replace(/\(possible\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const resolvedForKey = resolveCanonicalGene(stripped) || stripped;
  return {
    key: normalizeGeneCandidate(resolvedForKey),
    canonical: stripped,
  };
};

const isUncertainHetToken = (raw: unknown): boolean => {
  const normalized = String(raw ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  if (/^\d{1,3}%/.test(normalized)) return true;
  if (/^(?:pos(?:sible|siable|ible)?|probable|maybe|ph)\b/.test(normalized)) return true;
  return /\(possible\)/.test(normalized);
};

const buildNextLabGeneticsConfirmation = (
  currentValue: StoredLabGeneticsConfirmation | null | undefined,
  decisions: GeneDecision[],
  context: { orderId: string; resultId: string; confirmedAt: string }
): StoredLabGeneticsConfirmation | null => {
  const markersByKey = new Map<string, StoredLabGeneticsConfirmationMarker>();

  (Array.isArray(currentValue?.markers) ? currentValue.markers : []).forEach((entry) => {
    const parsed = parseBaseGeneToken(entry?.marker);
    if (!parsed.key) return;
    const outcome = entry?.outcome === "positive" || entry?.outcome === "carrierDetected"
      ? entry.outcome
      : null;
    if (!outcome) return;
    markersByKey.set(parsed.key, {
      marker: parsed.canonical || String(entry.marker || "").trim(),
      outcome,
      orderId: typeof entry.orderId === "string" ? entry.orderId : undefined,
      resultId: typeof entry.resultId === "string" ? entry.resultId : undefined,
      confirmedAt: String(entry.confirmedAt || "").trim() || context.confirmedAt,
    });
  });

  decisions.forEach((decision) => {
    markersByKey.delete(decision.key);
    if (decision.outcome !== "positive" && decision.outcome !== "carrierDetected") return;
    markersByKey.set(decision.key, {
      marker: decision.canonicalGene,
      outcome: decision.outcome,
      orderId: context.orderId,
      resultId: context.resultId,
      confirmedAt: context.confirmedAt,
    });
  });

  const markers = [...markersByKey.values()].sort((a, b) => a.marker.localeCompare(b.marker));
  if (!markers.length) return null;

  const latestConfirmedAt = markers.reduce(
    (latest, entry) => (entry.confirmedAt > latest ? entry.confirmedAt : latest),
    context.confirmedAt
  );

  return {
    source: "genetic-test",
    note: LAB_GENETICS_CONFIRMATION_NOTE,
    confirmedAt: latestConfirmedAt,
    markers,
  };
};

const sameSnapshot = (a: GeneticsSnapshot, b: GeneticsSnapshot): boolean => {
  const sameMorphs = JSON.stringify(a.morphs) === JSON.stringify(b.morphs);
  const sameHets = JSON.stringify(a.hets) === JSON.stringify(b.hets);
  const samePossible = JSON.stringify(a.possibleHets || []) === JSON.stringify(b.possibleHets || []);
  return sameMorphs && sameHets && samePossible;
};

const assertLabActor = (actor: ServiceActor, allowNonLabActor = false): void => {
  if (allowNonLabActor) {
    return;
  }
  if (actor.role !== "lab_staff" && actor.role !== "admin") {
    throw new Error("Access denied: only lab staff or admin can apply genetics updates.");
  }
};

const readBridge = (): ElectronBridge | null => {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & { electronAPI?: ElectronBridge };
  return w.electronAPI || null;
};

const defaultSnakeGateway: SnakeDataGateway = {
  async loadSnakes() {
    const bridge = readBridge();
    if (bridge?.loadData) {
      const payload = await bridge.loadData();
      const snakes = Array.isArray(payload?.snakes) ? payload?.snakes : [];
      return snakes.filter((entry): entry is StoredSnake => Boolean(entry) && typeof entry === "object");
    }

    if (typeof localStorage === "undefined") {
      throw new Error("Snake persistence is unavailable in this runtime.");
    }

    try {
      const raw = localStorage.getItem(SNAKES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const snakes = Array.isArray(parsed) ? parsed : [];
      return snakes.filter((entry): entry is StoredSnake => Boolean(entry) && typeof entry === "object");
    } catch {
      return [];
    }
  },

  async saveSnakes(snakes) {
    const safeSnakes = Array.isArray(snakes) ? snakes : [];
    const bridge = readBridge();
    if (bridge?.loadData && bridge?.saveData) {
      const currentPayload = await bridge.loadData();
      const basePayload = currentPayload && typeof currentPayload === "object" ? currentPayload : {};
      const result = await bridge.saveData({ ...basePayload, snakes: safeSnakes });
      if (result && result.success === false) {
        throw new Error(result.error || "Failed to persist snake genetics changes.");
      }
      return;
    }

    if (typeof localStorage === "undefined") {
      throw new Error("Snake persistence is unavailable in this runtime.");
    }

    localStorage.setItem(SNAKES_STORAGE_KEY, JSON.stringify(safeSnakes));
  },
};

const collectGeneDecisions = (result: TestResult): GeneDecision[] => {
  const decisions = new Map<string, GeneDecision>();

  (Array.isArray(result.findings) ? result.findings : []).forEach((finding) => {
    const outcome = String(finding?.outcome ?? "").trim() as DecisiveOutcome;
    if (!decisiveOutcomes.has(outcome)) return;

    const marker = String(finding?.marker ?? "").trim();
    if (!marker) return;

    const parsed = parseBaseGeneToken(marker);
    if (!parsed.key) return;

    const action: GeneAction = outcome === "positive"
      ? "promoteVisual"
      : outcome === "carrierDetected"
        ? "promoteHet"
        : "removeUncertainHet";

    const existing = decisions.get(parsed.key);
    if (existing && existing.action !== action) {
      throw new Error(`Conflicting confirmed outcomes for gene '${parsed.canonical}'.`);
    }

    decisions.set(parsed.key, {
      key: parsed.key,
      canonicalGene: parsed.canonical,
      action,
      outcome,
    });
  });

  return [...decisions.values()];
};

const applyDecisions = (snapshot: GeneticsSnapshot, decisions: GeneDecision[]): GeneticsSnapshot => {
  const morphs = normalizeStringArray(snapshot.morphs);
  const hets = normalizeStringArray(snapshot.hets);
  const possibleHets = normalizeStringArray(snapshot.possibleHets || []);

  let nextMorphs = [...morphs];
  let nextHets = [...hets];
  let nextPossibleHets = [...possibleHets];

  decisions.forEach((decision) => {
    const hasVisualAlready = nextMorphs.some((token) => parseBaseGeneToken(token).key === decision.key);

    if (decision.action === "promoteVisual") {
      nextMorphs = nextMorphs.filter((token) => parseBaseGeneToken(token).key !== decision.key);
      nextHets = nextHets.filter((token) => parseBaseGeneToken(token).key !== decision.key);
      nextPossibleHets = nextPossibleHets.filter((token) => parseBaseGeneToken(token).key !== decision.key);
      nextMorphs.push(decision.canonicalGene);
      return;
    }

    if (decision.action === "promoteHet") {
      nextHets = nextHets.filter((token) => parseBaseGeneToken(token).key !== decision.key);
      nextPossibleHets = nextPossibleHets.filter((token) => parseBaseGeneToken(token).key !== decision.key);
      if (!hasVisualAlready) {
        nextHets.push(decision.canonicalGene);
      }
      return;
    }

    nextHets = nextHets.filter((token) => {
      if (parseBaseGeneToken(token).key !== decision.key) return true;
      return !isUncertainHetToken(token);
    });
    nextPossibleHets = nextPossibleHets.filter((token) => parseBaseGeneToken(token).key !== decision.key);
  });

  return {
    morphs: normalizeStringArray(nextMorphs),
    hets: normalizeStringArray(nextHets),
    possibleHets: normalizeStringArray(nextPossibleHets),
  };
};

export const applyConfirmedResultGeneticsUpdate = async (
  input: GeneticsUpdateEngineInput,
  deps: GeneticsUpdateEngineDeps = {}
): Promise<GeneticsUpdateEngineResult> => {
  assertLabActor(input.actor, deps.allowNonLabActor === true);

  if (input.order.animalId !== input.result.animalId) {
    throw new Error("Invalid result linkage: result animal does not match test order animal.");
  }

  const decisions = collectGeneDecisions(input.result);
  const gateway = deps.snakeDataGateway || defaultSnakeGateway;
  const createLog = deps.createChangeLog || createGeneticsChangeLogRecord;
  const now = deps.now || nowIso;
  const nextId = deps.makeId || makeId;

  const snakes = await gateway.loadSnakes();
  const snakeIndex = snakes.findIndex((entry) => String(entry?.id ?? "") === input.order.animalId);
  if (snakeIndex < 0) {
    throw new Error(`Snake not found for genetics update (animalId: ${input.order.animalId}).`);
  }

  const currentSnake = snakes[snakeIndex];
  const before: GeneticsSnapshot = {
    morphs: normalizeStringArray(currentSnake.morphs),
    hets: normalizeStringArray(currentSnake.hets),
    possibleHets: normalizeStringArray(currentSnake.possibleHets || []),
  };

  if (!decisions.length) {
    return {
      applied: false,
      changedGeneKeys: [],
      before,
      after: before,
      reason: "No confirmed gene findings to apply.",
    };
  }

  const after = applyDecisions(before, decisions);
  const confirmedAt = now();
  const nextLabGeneticsConfirmation = buildNextLabGeneticsConfirmation(
    currentSnake.labGeneticsConfirmation,
    decisions,
    {
      orderId: input.order.id,
      resultId: input.result.id,
      confirmedAt,
    }
  );
  const geneticsChanged = !sameSnapshot(before, after);
  const confirmationChanged = serializeLabGeneticsConfirmation(currentSnake.labGeneticsConfirmation) !== serializeLabGeneticsConfirmation(nextLabGeneticsConfirmation);

  if (!geneticsChanged && !confirmationChanged) {
    return {
      applied: false,
      changedGeneKeys: decisions.map((entry) => entry.key),
      before,
      after,
      reason: "Confirmed findings did not change current snake genetics.",
    };
  }

  const nextSnake: StoredSnake = {
    ...currentSnake,
    morphs: [...after.morphs],
    hets: [...after.hets],
    possibleHets: [...(after.possibleHets || [])],
  };
  if (nextLabGeneticsConfirmation) {
    nextSnake.labGeneticsConfirmation = nextLabGeneticsConfirmation;
  } else {
    delete nextSnake.labGeneticsConfirmation;
  }

  const nextSnakes = [...snakes];
  nextSnakes[snakeIndex] = nextSnake;
  await gateway.saveSnakes(nextSnakes);

  if (!geneticsChanged) {
    return {
      applied: false,
      changedGeneKeys: decisions.map((entry) => entry.key),
      before,
      after,
      reason: "Confirmed findings were recorded for snake genetics verification.",
    };
  }

  const changedGenes = decisions.map((entry) => entry.canonicalGene);
  const reason = `auto_apply_confirmed_test_result:${changedGenes.join(",")}`;
  const changedAt = confirmedAt;
  const changeLog = createLog(
    {
      id: nextId(),
      labId: input.order.labId,
      animalId: input.order.animalId,
      status: "applied",
      source: "labResult",
      changeType: "replaceGeneticsSnapshot",
      before,
      after,
      orderId: input.order.id,
      resultId: input.result.id,
      changedAt,
      changedByUserId: input.actor.userId,
      reviewerUserId: input.actor.userId,
      reviewedAt: changedAt,
      reason,
      notes: `Confirmed findings applied: ${decisions
        .map((entry) => `${entry.canonicalGene}=${entry.outcome}`)
        .join("; ")}`,
    },
    { userId: input.actor.userId, role: input.actor.role }
  );

  return {
    applied: true,
    changedGeneKeys: decisions.map((entry) => entry.key),
    before,
    after,
    changeLogId: changeLog.id,
    reason,
  };
};
