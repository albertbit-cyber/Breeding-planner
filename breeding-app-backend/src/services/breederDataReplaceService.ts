import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { canAccessFeature } from "./subscriptionService";
import { ingestAllPairingsIntoReproductiveCycles } from "./reproductiveCycleService";
import {
  animalColumns,
  clutchColumns,
  extractClutchFromPairing,
  listBreederSnapshot,
  normalizeArray,
  pairingColumns,
  requireRecordId,
  stripDeviceLocalPlannerState,
  type BreederSnapshotInput,
} from "./breederDataService";
import {
  cycleAppId,
  cycleColumns,
  examAppId,
  examColumns,
  resolveActiveCycleConflicts,
  screenBreedingRecords,
  syncPlannedPairingReminders,
  withUnresolvedAnimalFlag,
  type SkippedBreedingRecord,
} from "./breedingCycleSyncService";
import { collapseDuplicateLogEntries, lockBreederAccount } from "./syncMerge";

/**
 * Full replace: one backup file becomes the whole of an account's cloud data.
 *
 * Every other write path merges, which is right for devices editing side by side and wrong for
 * "this file is the truth": a merge can only add. A replace instead
 *  - keeps the file's records and deletes (tombstones) every live record the file does not hold,
 *  - stamps everything it writes with the replace time, so no older copy wins a field merge,
 *  - raises the account's data generation, which makes every device drop its copy and reload
 *    (assertCurrentDataGeneration turns away saves made against an older generation),
 *  - and keeps the account as it was before, so the replace can be undone.
 */

type JsonRecord = Record<string, unknown>;

const db = prisma as any;

// The previous state of the account is kept for this many replaces, newest first.
export const REPLACEMENT_HISTORY_LIMIT = 10;

const REPLACE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 120_000,
};

export type DataSummary = {
  animals: number;
  pairings: number;
  clutches: number;
  breedingCycles: number;
  follicleExams: number;
  logEntries: number;
};

type PreparedReplace = {
  animals: Map<string, JsonRecord>;
  pairings: Map<string, JsonRecord>;
  clutches: Map<string, JsonRecord>;
  breedingCycles: Map<string, JsonRecord>;
  follicleExams: Map<string, JsonRecord>;
  plannerState: JsonRecord | null;
  summary: DataSummary;
  duplicateLogEntriesRemoved: number;
  skipped: SkippedBreedingRecord[];
};

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const countLogEntries = (logs: unknown): number => {
  const record = asRecord(logs);
  if (!record) return 0;
  return Object.values(record).reduce<number>((total, entries) => total + (Array.isArray(entries) ? entries.length : 0), 0);
};

// The replace time as the record's edit time, for the record as a whole. Every field of a device's
// older copy then loses the field merge to it, whatever times the backup file carried.
const stampReplaced = (record: JsonRecord, at: string): JsonRecord => {
  const metadata = asRecord(record.metadata) || {};
  return { ...record, updatedAt: at, fieldUpdatedAt: { "*": at }, metadata: { ...metadata, updatedAt: at } };
};

// Live records only, one per app id: tombstones in the file describe deletions on the device that
// made it, and in a replace a record is deleted simply by not being in the file.
const byAppId = (records: JsonRecord[], appIdOf: (record: JsonRecord, index: number) => string | null): Map<string, JsonRecord> => {
  const map = new Map<string, JsonRecord>();
  records.forEach((record, index) => {
    if (record.deletedAt) return;
    const appId = appIdOf(record, index);
    if (appId && !map.has(appId)) map.set(appId, record);
  });
  return map;
};

/** Reads a replace request (the snapshot upload shape) into the records it will write. */
export const prepareReplace = (input: BreederSnapshotInput, at: string): PreparedReplace => {
  let logEntriesBefore = 0;
  let logEntriesAfter = 0;
  const animals = byAppId(normalizeArray(input.animals, "animals"), (animal, index) => requireRecordId(animal, "animal", index));
  animals.forEach((animal, appId) => {
    logEntriesBefore += countLogEntries(animal.logs);
    const logs = collapseDuplicateLogEntries(animal.logs);
    logEntriesAfter += countLogEntries(logs);
    const cleaned = animal.logs === undefined ? animal : { ...animal, logs };
    animals.set(appId, stampReplaced({ ...cleaned, id: appId }, at));
  });

  const pairings = byAppId(normalizeArray(input.pairings, "pairings"), (pairing, index) => requireRecordId(pairing, "pairing", index));
  pairings.forEach((pairing, appId) => pairings.set(appId, stampReplaced({ ...pairing, id: appId }, at)));

  // Clutches arrive on their own and nested in their pairing, as on every sync.
  const clutchRecords = [
    ...normalizeArray(input.clutches, "clutches"),
    ...Array.from(pairings.values()).map(extractClutchFromPairing).filter((clutch): clutch is JsonRecord => !!clutch),
  ];
  const clutches = byAppId(clutchRecords, (clutch, index) => requireRecordId(clutch, "clutch", index));
  clutches.forEach((clutch, appId) => clutches.set(appId, stampReplaced(clutch, at)));

  // Cards must name animals of this account. The account after the replace is the file, so the
  // file's animals are the ones that count.
  const knownAnimalIds = new Set(animals.keys());
  const screened = screenBreedingRecords(
    normalizeArray(input.breedingCycles, "breedingCycles").filter((cycle) => !cycle.deletedAt),
    normalizeArray(input.follicleExams, "follicleExams").filter((exam) => !exam.deletedAt),
    knownAnimalIds,
  );
  const breedingCycles = byAppId(screened.cycles, (cycle, index) => cycleAppId(cycle) || `cycle-${index + 1}`);
  breedingCycles.forEach((cycle, appId) => {
    const flagged = withUnresolvedAnimalFlag(cycle, screened.unresolvedByCycleId.get(appId) || [], at);
    breedingCycles.set(appId, stampReplaced({ ...flagged, id: appId }, at));
  });
  // Two active cards for one female (possible in an old file) are settled the way a sync settles them.
  resolveActiveCycleConflicts(Array.from(breedingCycles.values()), at).forEach((payload, appId) => {
    if (breedingCycles.has(appId)) breedingCycles.set(appId, payload);
  });
  const follicleExams = byAppId(screened.exams, (exam, index) => examAppId(exam) || `exam-${index + 1}`);
  follicleExams.forEach((exam, appId) => follicleExams.set(appId, stampReplaced({ ...exam, id: appId }, at)));

  const plannerInput = asRecord(input.plannerState);
  const plannerState = plannerInput ? stampReplaced(stripDeviceLocalPlannerState(plannerInput), at) : null;

  return {
    animals,
    pairings,
    clutches,
    breedingCycles,
    follicleExams,
    plannerState,
    summary: {
      animals: animals.size,
      pairings: pairings.size,
      clutches: clutches.size,
      breedingCycles: breedingCycles.size,
      follicleExams: follicleExams.size,
      logEntries: logEntriesAfter,
    },
    duplicateLogEntriesRemoved: logEntriesBefore - logEntriesAfter,
    skipped: screened.skipped,
  };
};

const TABLES = [
  { key: "animals", model: "animal", appIdField: "appAnimalId" },
  { key: "pairings", model: "pairing", appIdField: "appPairingId" },
  { key: "clutches", model: "clutch", appIdField: "appClutchId" },
  { key: "breedingCycles", model: "breedingCycle", appIdField: "appCycleId" },
  { key: "follicleExams", model: "follicleExamination", appIdField: "appExamId" },
] as const;

type StoredRow = { id: string; appId: string; payload: JsonRecord; deletedAt: Date | null };

const loadRows = async (client: any, model: string, appIdField: string, ownerId: string): Promise<StoredRow[]> => {
  const rows = await client[model].findMany({
    where: { ownerId },
    select: { id: true, payload: true, deletedAt: true, [appIdField]: true },
  });
  return rows.map((row: any) => ({
    id: row.id,
    appId: String(row[appIdField] || ""),
    payload: asRecord(row.payload) || {},
    deletedAt: row.deletedAt ?? null,
  }));
};

const summarizeLive = (rowsByTable: Record<string, StoredRow[]>): DataSummary => {
  const live = (key: string) => (rowsByTable[key] || []).filter((row) => !row.deletedAt);
  return {
    animals: live("animals").length,
    pairings: live("pairings").length,
    clutches: live("clutches").length,
    breedingCycles: live("breedingCycles").length,
    follicleExams: live("follicleExams").length,
    logEntries: live("animals").reduce((total, row) => total + countLogEntries(row.payload.logs), 0),
  };
};

const loadAccount = async (client: any, ownerId: string) => {
  const [rows, plannerState] = await Promise.all([
    Promise.all(TABLES.map((table) => loadRows(client, table.model, table.appIdField, ownerId))),
    client.breederPlannerState.findUnique({ where: { ownerId } }),
  ]);
  const rowsByTable: Record<string, StoredRow[]> = {};
  TABLES.forEach((table, index) => {
    rowsByTable[table.key] = rows[index];
  });
  return { rowsByTable, plannerState };
};

// The animal cap of the keeper's tier, judged on the account the file leaves behind.
const assertAnimalCapacity = async (ownerId: string, animalCount: number): Promise<void> => {
  let access: any = null;
  try {
    access = await canAccessFeature({ id: ownerId }, "animals.create");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.warn("[breeder-replace] canAccessFeature error (proceeding without limit check):", error);
    return;
  }
  const limit = access?.limit;
  if (limit === undefined || limit === null || !Number.isFinite(Number(limit))) return;
  if (animalCount <= Number(limit)) return;
  const tierName = access.tier || access.currentTier || "Your plan";
  throw new HttpError(
    403,
    `${tierName} keeps ${limit} animals in the cloud and this file holds ${animalCount}, so nothing was replaced.`,
  );
};

export type ReplaceOptions = {
  dryRun?: boolean;
  reason?: "replace" | "undo";
};

export type ReplaceResult = {
  dryRun: boolean;
  before: DataSummary;
  after: DataSummary;
  /** Live records in the cloud that the file does not hold; the replace deletes them. */
  removed: DataSummary;
  duplicateLogEntriesRemoved: number;
  skipped: SkippedBreedingRecord[];
  dataGeneration: number;
  replacementId: string | null;
  replacedAt: string | null;
};

const removedSummary = (rowsByTable: Record<string, StoredRow[]>, prepared: PreparedReplace): DataSummary => {
  const missing = (key: keyof PreparedReplace & string) => {
    const incoming = prepared[key] as Map<string, JsonRecord>;
    return (rowsByTable[key] || []).filter((row) => !row.deletedAt && !incoming.has(row.appId));
  };
  return {
    animals: missing("animals").length,
    pairings: missing("pairings").length,
    clutches: missing("clutches").length,
    breedingCycles: missing("breedingCycles").length,
    follicleExams: missing("follicleExams").length,
    logEntries: missing("animals").reduce((total, row) => total + countLogEntries(row.payload.logs), 0),
  };
};

// The account in the snapshot upload shape, which is also what a replace reads: undoing a replace
// is a replace with this.
const previousSnapshot = (rowsByTable: Record<string, StoredRow[]>, plannerState: any): JsonRecord => {
  const live = (key: string) => (rowsByTable[key] || []).filter((row) => !row.deletedAt).map((row) => ({ ...row.payload, id: row.appId }));
  return {
    animals: live("animals"),
    pairings: live("pairings"),
    clutches: live("clutches"),
    breedingCycles: live("breedingCycles"),
    follicleExams: live("follicleExams"),
    plannerState: asRecord(plannerState?.payload),
  };
};

const columnsFor = (key: string, payload: JsonRecord, pairingRowId: (appId: string | null) => string | null) => {
  switch (key) {
    case "animals":
      return animalColumns(payload);
    case "pairings":
      return pairingColumns(payload);
    case "clutches": {
      const pairingAppId = (payload.pairingAppId ?? payload.pairingId) as string | undefined;
      return clutchColumns(payload, pairingRowId(pairingAppId ? String(pairingAppId) : null));
    }
    case "breedingCycles":
      return { ...cycleColumns(payload), payload };
    default:
      return { ...examColumns(payload), payload };
  }
};

/**
 * Replaces the account's cloud data with `input`. With `dryRun` it only reports what would change.
 * Refuses a file with no animals and no pairings (an empty or wrong file would otherwise wipe the
 * account), except when undoing a replace of an account that was empty before.
 */
export const replaceBreederData = async (
  ownerId: string,
  input: BreederSnapshotInput,
  options: ReplaceOptions = {},
): Promise<ReplaceResult> => {
  const reason = options.reason === "undo" ? "undo" : "replace";
  const at = new Date();
  const atIso = at.toISOString();
  const prepared = prepareReplace(input || {}, atIso);

  if (reason === "replace" && !prepared.animals.size && !prepared.pairings.size) {
    throw new HttpError(400, "This file holds no animals and no pairings, so nothing was replaced.");
  }
  await assertAnimalCapacity(ownerId, prepared.animals.size);

  if (options.dryRun) {
    const { rowsByTable, plannerState } = await loadAccount(db, ownerId);
    return {
      dryRun: true,
      before: summarizeLive(rowsByTable),
      after: prepared.summary,
      removed: removedSummary(rowsByTable, prepared),
      duplicateLogEntriesRemoved: prepared.duplicateLogEntriesRemoved,
      skipped: prepared.skipped,
      dataGeneration: Number(plannerState?.dataGeneration) || 0,
      replacementId: null,
      replacedAt: null,
    };
  }

  let before: DataSummary = prepared.summary;
  let removed: DataSummary = prepared.summary;
  let dataGeneration = 0;
  let replacementId: string | null = null;

  await db.$transaction(async (tx: any) => {
    // The same lock every sync takes, so no device save lands halfway through the replace.
    await lockBreederAccount(tx, ownerId);
    const { rowsByTable, plannerState } = await loadAccount(tx, ownerId);
    before = summarizeLive(rowsByTable);
    removed = removedSummary(rowsByTable, prepared);
    dataGeneration = (Number(plannerState?.dataGeneration) || 0) + 1;

    const replacement = await tx.breederDataReplacement.create({
      data: {
        ownerId,
        reason,
        dataGeneration,
        summary: { before, after: prepared.summary, removed, duplicateLogEntriesRemoved: prepared.duplicateLogEntriesRemoved },
        previous: previousSnapshot(rowsByTable, plannerState),
      },
      select: { id: true },
    });
    replacementId = replacement.id;

    const pairingRowIds = new Map<string, string>();
    (rowsByTable.pairings || []).forEach((row) => pairingRowIds.set(row.appId, row.id));

    for (const table of TABLES) {
      const incoming = prepared[table.key] as Map<string, JsonRecord>;
      const stored = new Map<string, StoredRow>();
      (rowsByTable[table.key] || []).forEach((row) => stored.set(row.appId, row));

      // Live rows the file does not hold become tombstones, which every device folds in.
      const goneIds = Array.from(stored.values())
        .filter((row) => !row.deletedAt && !incoming.has(row.appId))
        .map((row) => row.id);
      if (goneIds.length) {
        await tx[table.model].updateMany({ where: { id: { in: goneIds } }, data: { deletedAt: at } });
      }

      const creates: JsonRecord[] = [];
      for (const [appId, payload] of incoming) {
        const columns = columnsFor(table.key, payload, (pairingAppId) => (pairingAppId ? pairingRowIds.get(pairingAppId) || null : null));
        const existing = stored.get(appId);
        if (existing) {
          await tx[table.model].update({ where: { id: existing.id }, data: { ...columns, deletedAt: null } });
        } else {
          creates.push({ ownerId, [table.appIdField]: appId, ...columns });
        }
      }
      for (let index = 0; index < creates.length; index += 200) {
        await tx[table.model].createMany({ data: creates.slice(index, index + 200), skipDuplicates: true });
      }

      // Clutches point at pairing rows, so new pairings' row ids are needed before clutches run.
      if (table.key === "pairings" && creates.length) {
        const inserted = await tx.pairing.findMany({
          where: { ownerId, appPairingId: { in: creates.map((row) => String(row.appPairingId)) } },
          select: { id: true, appPairingId: true },
        });
        inserted.forEach((row: any) => pairingRowIds.set(String(row.appPairingId), row.id));
      }
    }

    // A file without planner state leaves the stored one as it was, but the generation still moves.
    const plannerPayload = prepared.plannerState || asRecord(plannerState?.payload) || {};
    if (plannerState) {
      await tx.breederPlannerState.update({
        where: { id: plannerState.id },
        data: { payload: plannerPayload, dataGeneration, dataReplacedAt: at },
      });
    } else {
      await tx.breederPlannerState.create({
        data: { ownerId, payload: plannerPayload, dataGeneration, dataReplacedAt: at },
      });
    }

    const stale = await tx.breederDataReplacement.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      skip: REPLACEMENT_HISTORY_LIMIT,
      select: { id: true },
    });
    if (stale.length) {
      await tx.breederDataReplacement.deleteMany({ where: { id: { in: stale.map((row: any) => row.id) } } });
    }
  }, REPLACE_TRANSACTION_OPTIONS);

  // The same follow-up work a sync triggers, fire-and-forget as there.
  const snapshot = await listBreederSnapshot(ownerId);
  ingestAllPairingsIntoReproductiveCycles(ownerId, snapshot.pairings as JsonRecord[], snapshot.clutches as JsonRecord[]).catch((err) => {
    console.error("[reproductive] ingestion error after replace:", err);
  });
  if (prepared.breedingCycles.size) {
    const animalNames = new Map<string, string>();
    prepared.animals.forEach((animal, appId) => animalNames.set(appId, String(animal.name || appId)));
    syncPlannedPairingReminders(ownerId, Array.from(prepared.breedingCycles.values()), animalNames).catch((err) => {
      console.error("[breeding] planned pairing reminder sync failed after replace:", err);
    });
  }

  console.log(
    `[breeder-replace] ${reason} user=${ownerId} generation=${dataGeneration} ` +
    `animals ${before.animals}->${prepared.summary.animals} pairings ${before.pairings}->${prepared.summary.pairings} ` +
    `duplicateLogsRemoved=${prepared.duplicateLogEntriesRemoved}`,
  );

  return {
    dryRun: false,
    before,
    after: prepared.summary,
    removed,
    duplicateLogEntriesRemoved: prepared.duplicateLogEntriesRemoved,
    skipped: prepared.skipped,
    dataGeneration,
    replacementId,
    replacedAt: atIso,
  };
};

/** The account's replace history, newest first, without the stored data. */
export const listBreederDataReplacements = async (ownerId: string) => {
  const rows = await db.breederDataReplacement.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take: REPLACEMENT_HISTORY_LIMIT,
    select: { id: true, reason: true, dataGeneration: true, summary: true, createdAt: true },
  });
  return rows.map((row: any) => ({
    id: row.id,
    reason: row.reason,
    dataGeneration: row.dataGeneration,
    summary: row.summary,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  }));
};

/** Puts the account back the way it was right before the given replace. Itself a replace. */
export const undoBreederDataReplacement = async (ownerId: string, replacementId: string): Promise<ReplaceResult> => {
  const row = await db.breederDataReplacement.findFirst({ where: { id: replacementId, ownerId } });
  if (!row) throw new HttpError(404, "That replace is not in this account's history.");
  return replaceBreederData(ownerId, (row.previous || {}) as BreederSnapshotInput, { reason: "undo" });
};
