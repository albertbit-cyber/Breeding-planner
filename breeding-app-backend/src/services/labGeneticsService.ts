import {
  applyDecisions,
  buildConfirmation,
  collectDecisions,
  confirmationSignature,
  normalizeGeneKey,
  readSnapshot,
  sameSnapshot,
  type GeneticsSnapshot,
  type LabGeneticsDecision,
} from "./labGeneticsRules";

/**
 * Writing a confirmed laboratory result onto the breeder's animal.
 *
 * This used to run in the breeder's browser, when they happened to open the
 * order. A result nobody opened never reached the animal, which made the
 * genetics silently dependent on someone clicking. It belongs here, in the same
 * transaction that stores the result: the finding and its consequence land
 * together or not at all.
 */

export type LabGeneticsApplication = {
  animalId: string;
  applied: boolean;
  reason: string;
  changedGenes: string[];
  before?: GeneticsSnapshot;
  after?: GeneticsSnapshot;
};

type OrderAnimalTest = {
  offeringId?: string | null;
  testNameSnapshot?: string | null;
};

type OrderForGenetics = {
  id: string;
  breederId: string;
  animals: Array<{ animalId: string; tests?: OrderAnimalTest[] }>;
};

type ResultForGenetics = {
  id: string;
  animalId: string;
  findingsJson: unknown;
};

/**
 * What the laboratory calls the test, mapped to the gene it actually reads.
 *
 * Built from the ordered offerings rather than from a name-matching heuristic:
 * `geneTarget` is the laboratory's own statement of which gene a test reports,
 * and `aliases` are the trade names the same gene is sold under. A test with no
 * gene mapped falls back to its own name, which is what a custom test that
 * simply reports a finding should do.
 */
const buildGeneResolver = async (
  tx: any,
  order: OrderForGenetics
): Promise<(marker: string) => string | null> => {
  const offeringIds = Array.from(
    new Set(
      order.animals
        .flatMap((animal) => (Array.isArray(animal.tests) ? animal.tests : []))
        .map((test) => String(test?.offeringId || "").trim())
        .filter(Boolean)
    )
  );

  const offerings = offeringIds.length
    ? await tx.labTestOffering.findMany({
        where: { id: { in: offeringIds } },
        select: { id: true, name: true, geneTarget: true, aliases: true },
      })
    : [];

  const byMarker = new Map<string, string>();
  offerings.forEach((offering: any) => {
    const gene = String(offering?.geneTarget || "").trim() || String(offering?.name || "").trim();
    if (!gene) return;
    const names = [offering?.name, ...(Array.isArray(offering?.aliases) ? offering.aliases : [])];
    names.forEach((name) => {
      const key = normalizeGeneKey(name);
      if (key && !byMarker.has(key)) byMarker.set(key, gene);
    });
  });

  return (marker: string) => byMarker.get(normalizeGeneKey(marker)) || null;
};

/**
 * Apply every confirmed finding in `results` to the breeder's animals.
 *
 * Runs inside the caller's transaction. Deliberately tolerant in one direction
 * only: an animal the backend has never seen is skipped rather than treated as
 * an error, because a breeder who has not synced their collection is a normal
 * state and the laboratory's work must not fail on it. Anything else — a
 * contradictory result, a write failure — propagates and rolls the result back
 * with it.
 */
export const applyConfirmedResultGenetics = async (
  tx: any,
  params: { order: OrderForGenetics; results: ResultForGenetics[]; actorUserId: string }
): Promise<LabGeneticsApplication[]> => {
  const { order, results } = params;
  if (!results.length) return [];

  const resolveGene = await buildGeneResolver(tx, order);

  const decisionsByAnimal = new Map<string, { decisions: LabGeneticsDecision[]; resultId: string }>();
  results.forEach((result) => {
    const animalId = String(result?.animalId || "").trim();
    if (!animalId) return;
    const decisions = collectDecisions(result.findingsJson, resolveGene);
    if (!decisions.length) return;
    decisionsByAnimal.set(animalId, { decisions, resultId: String(result.id || "") });
  });

  if (!decisionsByAnimal.size) {
    return results.map((result) => ({
      animalId: String(result?.animalId || ""),
      applied: false,
      reason: "No decisive findings to apply.",
      changedGenes: [],
    }));
  }

  const animalRows = await tx.animal.findMany({
    where: {
      ownerId: order.breederId,
      appAnimalId: { in: [...decisionsByAnimal.keys()] },
      deletedAt: null,
    },
    select: { id: true, appAnimalId: true, payload: true },
  });

  const rowsByAppId = new Map<string, any>(
    animalRows.map((row: any) => [String(row.appAnimalId), row])
  );

  const confirmedAt = new Date().toISOString();
  const applications: LabGeneticsApplication[] = [];

  for (const [animalId, entry] of decisionsByAnimal) {
    const row = rowsByAppId.get(animalId);
    if (!row) {
      applications.push({
        animalId,
        applied: false,
        reason: "Animal is not in the breeder's synced collection.",
        changedGenes: [],
      });
      continue;
    }

    const payload = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>;
    const before = readSnapshot(payload);
    const after = applyDecisions(before, entry.decisions);
    const confirmation = buildConfirmation(payload.labGeneticsConfirmation, entry.decisions, {
      orderId: order.id,
      resultId: entry.resultId,
      confirmedAt,
    });

    const geneticsChanged = !sameSnapshot(before, after);
    // Compared by what the confirmation says rather than byte-for-byte, so a
    // laboratory resubmitting the same verdict does not bump the animal's sync
    // timestamp and push a no-op change to all of the breeder's devices.
    const confirmationChanged =
      confirmationSignature(payload.labGeneticsConfirmation) !== confirmationSignature(confirmation);

    if (!geneticsChanged && !confirmationChanged) {
      applications.push({
        animalId,
        applied: false,
        reason: "Findings matched what the animal already recorded.",
        changedGenes: [],
        before,
        after,
      });
      continue;
    }

    const nextPayload: Record<string, unknown> = {
      ...payload,
      morphs: after.morphs,
      hets: after.hets,
      possibleHets: after.possibleHets,
      // The sync accepts an incoming snapshot only when its payload timestamp is
      // at least as new as the stored row's. Stamping it here is what stops a
      // device that still holds the pre-test genetics from overwriting this.
      updatedAt: confirmedAt,
    };
    if (confirmation) {
      nextPayload.labGeneticsConfirmation = confirmation;
    } else {
      delete nextPayload.labGeneticsConfirmation;
    }

    await tx.animal.update({ where: { id: row.id }, data: { payload: nextPayload as any } });

    applications.push({
      animalId,
      applied: geneticsChanged,
      reason: geneticsChanged
        ? `Applied confirmed findings: ${entry.decisions.map((d) => `${d.gene}=${d.outcome}`).join("; ")}`
        : "Findings recorded against the animal without changing its genetics.",
      changedGenes: entry.decisions.map((decision) => decision.gene),
      before,
      after,
    });
  }

  return applications;
};
