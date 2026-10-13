import { prisma } from "../lib/prisma";
import { readSnapshot, reapplyConfirmation } from "./labGeneticsRules";
import { HttpError } from "../utils/errors";
import { canAccessFeature } from "./subscriptionService";
import { countedAnimalWhere, isArchivedAnimalStatus, isRemovedAnimalPayload } from "./animalArchive";
import { ingestAllPairingsIntoReproductiveCycles } from "./reproductiveCycleService";
import {
  screenBreedingRecords,
  withUnresolvedAnimalFlag,
  type SkippedBreedingRecord,
  cycleAppId as breedingCycleAppId,
  examAppId as follicleExamAppId,
  cycleColumns,
  examColumns,
  mergeBreedingCyclePayload,
  mergeFollicleExamPayload,
  resolveActiveCycleConflicts,
  syncPlannedPairingReminders,
} from "./breedingCycleSyncService";
import {
  SYNC_ENTRY_ARRAYS,
  lockBreederAccount,
  mergeSyncRecord,
  recordTime,
  sameSyncContent,
} from "./syncMerge";

type JsonRecord = Record<string, unknown>;

export type BreederSnapshotInput = {
  animals?: unknown[];
  pairings?: unknown[];
  clutches?: unknown[];
  plannerState?: unknown;
  /** Female breeding cards (SBR-02). Same sync contract as pairings: app ids, tombstones, timestamps. */
  breedingCycles?: unknown[];
  /** Follicle examinations, owned by the female and optionally linked to a cycle. */
  follicleExams?: unknown[];
};

const db = prisma as any;
const SNAPSHOT_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
};

const asRecord = (value: unknown): JsonRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
};

const textValue = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

const completionReasons = new Set([
  "eggs_laid",
  "live_birth",
  "no_ovulation_observed",
  "follicles_reabsorbed",
  "ovulated_no_eggs",
  "season_skipped",
  "season_ended",
  "pairing_unsuccessful",
  "health_reason",
  "breeding_stopped",
  "unknown_outcome",
  "other",
  // Written by the app when the female is moved to the animal archive.
  "female_sold",
  "female_died",
  "female_left_collection",
]);

const outcomeConfidences = new Set(["confirmed", "likely", "unknown"]);
const workflowStatuses = new Set(["active", "completed", "archived"]);

const enumTextValue = (value: unknown, allowed: Set<string>): string | null => {
  const text = textValue(value)?.toLowerCase() ?? null;
  return text && allowed.has(text) ? text : null;
};

const numberValue = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const intValue = (value: unknown): number | null => {
  const n = numberValue(value);
  return n !== null ? Math.round(n) : null;
};


const requireRecordId = (record: JsonRecord, fallbackPrefix: string, index: number): string => {
  return textValue(record.id) || textValue(record.appId) || `${fallbackPrefix}-${index + 1}`;
};

const isoDateValue = (value: unknown): string | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const text = textValue(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const withBackendSyncMetadata = (row: { payload: unknown; createdAt?: unknown; updatedAt?: unknown }) => {
  const payload = asRecord(row.payload);
  if (!payload) return row.payload;

  const createdAt = isoDateValue(row.createdAt);
  const updatedAt = isoDateValue(row.updatedAt);
  const payloadMetadata = asRecord(payload.metadata);
  const result: JsonRecord = { ...payload };

  if (!textValue(result.createdAt) && createdAt) result.createdAt = createdAt;
  if (updatedAt) {
    result.updatedAt = updatedAt;
  } else if (!textValue(result.updatedAt) && createdAt) {
    result.updatedAt = createdAt;
  }

  const metadata: JsonRecord = payloadMetadata ? { ...payloadMetadata } : {};
  if (createdAt) metadata.backendCreatedAt = createdAt;
  if (updatedAt) {
    metadata.backendUpdatedAt = updatedAt;
    metadata.updatedAt = updatedAt;
  }
  if (payloadMetadata || Object.keys(metadata).length) result.metadata = metadata;

  return result;
};

const timestampMs = (value: unknown): number => {
  const iso = isoDateValue(value);
  return iso ? new Date(iso).getTime() : 0;
};

const nestedUpdatedAtMs = (value: unknown, depth = 0): number => {
  if (!value || depth > 5) return 0;
  if (Array.isArray(value)) {
    return value.reduce((max, item) => Math.max(max, nestedUpdatedAtMs(item, depth + 1)), 0);
  }
  const record = asRecord(value);
  if (!record) return 0;
  const metadata = asRecord(record.metadata);
  let max = Math.max(
    timestampMs(record.updatedAt),
    timestampMs(record.modifiedAt),
    timestampMs(record.lastModifiedAt),
    timestampMs(record.createdAt),
    timestampMs(record.addedAt),
    timestampMs(record.date),
    timestampMs(metadata?.updatedAt),
    timestampMs(metadata?.modifiedAt),
    timestampMs(metadata?.backendUpdatedAt),
    timestampMs(metadata?.backendCreatedAt),
  );
  Object.entries(record).forEach(([key, entry]) => {
    if (
      key === "logs" ||
      key === "photos" ||
      key === "locks" ||
      key === "appointments" ||
      key.endsWith("Logs")
    ) {
      max = Math.max(max, nestedUpdatedAtMs(entry, depth + 1));
    }
  });
  return max;
};

const payloadUpdatedAtMs = (payload: JsonRecord | null): number => {
  if (!payload) return 0;
  const metadata = asRecord(payload.metadata);
  return Math.max(
    timestampMs(payload.updatedAt),
    timestampMs(payload.modifiedAt),
    timestampMs(payload.lastModifiedAt),
    timestampMs(payload.createdAt),
    timestampMs(metadata?.updatedAt),
    timestampMs(metadata?.modifiedAt),
    timestampMs(metadata?.backendUpdatedAt),
    timestampMs(metadata?.backendCreatedAt),
    nestedUpdatedAtMs(payload.logs),
    nestedUpdatedAtMs(payload.photos),
    nestedUpdatedAtMs(payload.locks),
    nestedUpdatedAtMs(payload.appointments),
    nestedUpdatedAtMs(payload.mobileOvulationLogs),
    nestedUpdatedAtMs(payload.mobilePreLayShedLogs),
    nestedUpdatedAtMs(payload.mobileClutchLogs),
    nestedUpdatedAtMs(payload.mobileHatchLogs),
  );
};

const rowUpdatedAtMs = (row: { payload?: unknown; updatedAt?: unknown } | null): number => {
  if (!row) return 0;
  return Math.max(timestampMs(row.updatedAt), payloadUpdatedAtMs(asRecord(row.payload)));
};

// Breeding cards and examinations keep their own merge (breedingCycleSyncService) and the
// record-level rule below. Animals, pairings, clutches and planner state merge field by field
// through syncMerge, which needs no such gate.
const shouldApplyIncomingPayload = (
  incoming: JsonRecord,
  existing: { payload?: unknown; updatedAt?: unknown } | null,
): boolean => {
  if (!existing) return true;
  const existingTimestamp = rowUpdatedAtMs(existing);
  if (!existingTimestamp) return true;
  const incomingTimestamp = payloadUpdatedAtMs(incoming);
  if (!incomingTimestamp) return false;
  return incomingTimestamp >= existingTimestamp;
};

// The stored copy as a device sees it: the row's own write time stands for the record's time. A
// device echoing back what it last read then carries exactly the stored time, ties, and changes
// nothing; comparing against the bare payload instead let the echo look newer than a lab result or
// a sale the server had written since.
const storedRecord = (row: { payload?: unknown; updatedAt?: unknown }): JsonRecord => {
  const record = withBackendSyncMetadata({ payload: row.payload, updatedAt: row.updatedAt });
  return asRecord(record) || {};
};

const mergeAnimalPayload = (existing: JsonRecord, incomingPayload: JsonRecord): JsonRecord => {
  // A deleted snake kept as a lineage card wins whole. Merging it with the full copy would
  // union the erased logs and photos straight back in. Two cards: the later one.
  const existingRemoved = isRemovedAnimalPayload(existing);
  const incomingRemoved = isRemovedAnimalPayload(incomingPayload);
  if (existingRemoved || incomingRemoved) {
    if (existingRemoved && incomingRemoved) {
      return payloadUpdatedAtMs(incomingPayload) >= payloadUpdatedAtMs(existing) ? incomingPayload : existing;
    }
    return incomingRemoved ? incomingPayload : existing;
  }
  const merged = mergeSyncRecord(existing, incomingPayload, { entryArrays: SYNC_ENTRY_ARRAYS.animal, mergeLogs: true });

  // A device that has not synced since the test still holds the animal's pre-test genetics, and
  // if it saves last its list now wins outright — reintroducing exactly what a laboratory just
  // disproved, "50% het Albino" reappearing days after the result came back negative. The lab's
  // verdict outranks any single device's copy, so the stored decisions are re-asserted here.
  // Idempotent: an already correct payload passes through untouched.
  const confirmation = merged.labGeneticsConfirmation;
  if (confirmation) {
    const corrected = reapplyConfirmation(readSnapshot(merged), confirmation);
    merged.morphs = corrected.morphs;
    merged.hets = corrected.hets;
    merged.possibleHets = corrected.possibleHets;
  }

  return merged;
};

const mergePairingPayload = (existing: JsonRecord, incomingPayload: JsonRecord): JsonRecord => {
  const merged = mergeSyncRecord(existing, incomingPayload, { entryArrays: SYNC_ENTRY_ARRAYS.pairing, mergeLogs: true });
  // hatchlingsGeneratedThrough is a monotonic high-water mark within one reset generation: it
  // stops the hatch wizard duplicating an already-created litter, so a stale write must not lower
  // it. hatchlingsResetCount is bumped when the keeper deletes a batch to re-log it, and then the
  // newer generation's mark wins outright. Pinning the max across generations (the old rule) put
  // the old mark back and blocked re-logging that clutch for good. Same rule as the app.
  const existingHatch = asRecord(existing?.hatch);
  const incomingHatch = asRecord(incomingPayload?.hatch);
  if (existingHatch || incomingHatch) {
    const existingReset = Number(existingHatch?.hatchlingsResetCount) || 0;
    const incomingReset = Number(incomingHatch?.hatchlingsResetCount) || 0;
    const existingThrough = Number(existingHatch?.hatchlingsGeneratedThrough) || 0;
    const incomingThrough = Number(incomingHatch?.hatchlingsGeneratedThrough) || 0;
    const hatchlingsGeneratedThrough = existingReset === incomingReset
      ? Math.max(existingThrough, incomingThrough)
      : (incomingReset > existingReset ? incomingThrough : existingThrough);
    const hatchlingsResetCount = Math.max(existingReset, incomingReset);
    merged.hatch = {
      ...asRecord(merged.hatch),
      hatchlingsGeneratedThrough,
      ...(hatchlingsResetCount ? { hatchlingsResetCount } : {}),
    };
  }
  return merged;
};

const mergeClutchPayload = (existing: JsonRecord, incomingPayload: JsonRecord): JsonRecord =>
  mergeSyncRecord(existing, incomingPayload, { entryArrays: ["photos"], mergeLogs: true });

// Per-device bookkeeping that used to ride along in the planner state: every device's automatic
// backup rewrote `lastRun`, which made each backup a planner-state change that overwrote the other
// devices' copy.
const DEVICE_LOCAL_PLANNER_KEYS = ["lastRun"];

const stripDeviceLocalPlannerState = (state: JsonRecord): JsonRecord => {
  const backupSettings = asRecord(state.backupSettings);
  if (!backupSettings) return state;
  const cleaned = { ...backupSettings };
  DEVICE_LOCAL_PLANNER_KEYS.forEach((key) => delete cleaned[key]);
  return { ...state, backupSettings: cleaned };
};

const mergePlannerStatePayload = (existing: JsonRecord, incomingPayload: JsonRecord): JsonRecord =>
  mergeSyncRecord(existing, stripDeviceLocalPlannerState(incomingPayload), { entryArrays: SYNC_ENTRY_ARRAYS.planner, sortEntries: false });

const extractClutchFromPairing = (pairing: JsonRecord): JsonRecord | null => {
  const clutch = asRecord(pairing.clutch);
  if (!clutch) return null;
  const recorded = clutch.recorded === true || !!textValue(clutch.date);
  if (!recorded) return null;
  return {
    ...clutch,
    id: textValue(clutch.id) || `pairing-${requireRecordId(pairing, "pairing", 0)}-clutch`,
    pairingAppId: requireRecordId(pairing, "pairing", 0),
    clutchNumber: clutch.clutchNumber ?? pairing.clutchNumber ?? pairing.sortIndex,
    seasonYear: clutch.seasonYear ?? pairing.cycleYear,
    laidDate: clutch.date,
  };
};

const normalizeArray = (value: unknown[] | undefined, label: string): JsonRecord[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new HttpError(400, `${label} must be an array.`);
  return value.map(asRecord).filter((item): item is JsonRecord => !!item);
};

const validatePairingCompletion = (pairing: JsonRecord, index: number): void => {
  const status = enumTextValue(pairing.workflowStatus ?? pairing.status, workflowStatuses);
  const reason = enumTextValue(pairing.completionReason, completionReasons);
  const confidence = enumTextValue(pairing.outcomeConfidence, outcomeConfidences);
  if (status === "completed" && !reason) {
    throw new HttpError(400, `pairings[${index}].completionReason is required when workflowStatus is completed.`);
  }
  if (reason === "other" && !textValue(pairing.completionNote)) {
    throw new HttpError(400, `pairings[${index}].completionNote is required when completionReason is other.`);
  }
  if (reason && !confidence) {
    throw new HttpError(400, `pairings[${index}].outcomeConfidence must be confirmed, likely, or unknown.`);
  }
};


// Deleted rows, by app id, with the time the server recorded the deletion. A full snapshot
// carries all of them: a device that was closed when another one deleted an animal still holds
// it, and "absent from the list" could not tell it whether the animal was deleted or simply never
// uploaded, so the old copy survived the merge and was uploaded again on every sync.
const SNAPSHOT_TABLES = [
  { key: "animals", model: "animal", appIdField: "appAnimalId" },
  { key: "pairings", model: "pairing", appIdField: "appPairingId" },
  { key: "clutches", model: "clutch", appIdField: "appClutchId" },
  { key: "breedingCycles", model: "breedingCycle", appIdField: "appCycleId" },
  { key: "follicleExams", model: "follicleExamination", appIdField: "appExamId" },
] as const;

export const listBreederSnapshot = async (ownerId: string, options: { since?: Date | null } = {}) => {
  const since = options.since && Number.isFinite(options.since.getTime()) ? options.since : null;

  // Captured before the reads, not after: anything written while these queries run then falls
  // inside the next window rather than slipping between the two. Re-sending a record costs
  // nothing (the merge is idempotent); missing one loses data. Clients also ask from a little
  // before this time (see the app's SYNC_CURSOR_OVERLAP_MS), because a write can commit after a
  // read that started later than the write's own timestamp.
  const serverTime = new Date().toISOString();

  const liveWhere = since
    ? { ownerId, deletedAt: null, updatedAt: { gt: since } }
    : { ownerId, deletedAt: null };
  // A deletion's window is judged by when the server wrote it (updatedAt), never by the deleting
  // device's own clock: a delete made offline and uploaded hours later is older than every other
  // device's cursor and was never reported to them.
  const deletedWhere = since
    ? { ownerId, deletedAt: { not: null }, updatedAt: { gt: since } }
    : { ownerId, deletedAt: { not: null } };

  const [animals, pairings, clutches, plannerState, breedingCycles, follicleExams] = await Promise.all([
    db.animal.findMany({ where: liveWhere, orderBy: { updatedAt: "desc" } }),
    db.pairing.findMany({ where: liveWhere, orderBy: { updatedAt: "desc" } }),
    db.clutch.findMany({ where: liveWhere, orderBy: { updatedAt: "desc" } }),
    db.breederPlannerState.findUnique({ where: { ownerId } }),
    db.breedingCycle.findMany({ where: liveWhere, orderBy: { updatedAt: "desc" } }),
    db.follicleExamination.findMany({ where: liveWhere, orderBy: { updatedAt: "desc" } }),
  ]);

  const deletedRows = await Promise.all(SNAPSHOT_TABLES.map((table) => (
    db[table.model].findMany({ where: deletedWhere, select: { [table.appIdField]: true, updatedAt: true } })
  )));
  const tombstones: Record<string, Record<string, string>> = {};
  const deleted: Record<string, string[]> = {};
  SNAPSHOT_TABLES.forEach((table, index) => {
    const byId: Record<string, string> = {};
    (deletedRows[index] || []).forEach((row: any) => {
      const appId = textValue(row[table.appIdField]);
      if (appId) byId[appId] = isoDateValue(row.updatedAt) || serverTime;
    });
    tombstones[table.key] = byId;
    deleted[table.key] = Object.keys(byId);
  });

  const snapshot: JsonRecord = {
    animals: animals.map(withBackendSyncMetadata),
    pairings: pairings.map(withBackendSyncMetadata),
    clutches: clutches.map(withBackendSyncMetadata),
    plannerState: plannerState ? withBackendSyncMetadata(plannerState) : null,
    breedingCycles: breedingCycles.map(withBackendSyncMetadata),
    follicleExams: follicleExams.map(withBackendSyncMetadata),
    tombstones,
    serverTime,
  };

  if (!since) return snapshot;

  snapshot.since = since.toISOString();
  snapshot.partial = true;
  snapshot.deleted = deleted;
  return snapshot;
};

type ExistingRow = { id: string; payload: unknown; updatedAt: unknown; deletedAt: unknown };
type PlannedUpdate = { id: string; appId: string; data: JsonRecord };

// One query per table, keyed by the app-side id, replacing a findUnique per incoming record.
const loadExistingByAppId = async (
  model: any,
  ownerId: string,
  appIdField: string,
): Promise<Map<string, ExistingRow>> => {
  const rows = await model.findMany({
    where: { ownerId },
    select: { id: true, payload: true, updatedAt: true, deletedAt: true, [appIdField]: true },
  });
  const byAppId = new Map<string, ExistingRow>();
  for (const row of rows) {
    const appId = textValue(row[appIdField]);
    if (appId) byAppId.set(appId, { id: row.id, payload: row.payload, updatedAt: row.updatedAt, deletedAt: row.deletedAt ?? null });
  }
  return byAppId;
};

// What a tombstone does to the stored row. Both rules compare edit times with edit times: the
// deletion time a device sends against when the record's content was last edited (its payload
// stamps), never against the row's own write time, which is the server's clock and moves for
// reasons a keeper never sees.
//  - "skip" when the row is already deleted: every device re-sends its tombstones on each sync,
//    and re-deleting bumped the row on every one of them, so each sync reported the same deletions
//    to every other device again.
//  - "skip" when the record was edited after the deletion happened: a device deleted its copy
//    while another kept editing, and the later edit stands, exactly as it would for a field.
//  - "create" when the server never had the record, so other devices still learn of the deletion.
const planTombstone = (existing: ExistingRow | null, tombstoneAt: string): "delete" | "create" | "skip" => {
  if (!existing) return "create";
  if (existing.deletedAt) return "skip";
  return new Date(tombstoneAt).getTime() >= recordTime(existing.payload) ? "delete" : "skip";
};

// A live copy of a deleted row comes back only if it was edited after the deletion. A stale copy
// (a device that had not heard about the deletion and re-sent what it held) carries the time it
// last read the row, which is before the deletion, and stays deleted.
const shouldResurrect = (incoming: JsonRecord, existing: ExistingRow): boolean =>
  recordTime(incoming) > Math.max(timestampMs(existing.deletedAt), recordTime(existing.payload));

// Inserts in batches to stay well under Postgres' bind-parameter ceiling. skipDuplicates keeps a
// concurrent sync from turning a racing insert into a failed request; the loser's data arrives on
// the next sync, which is how every other conflict in this file already resolves.
const createManyChunked = async (model: any, rows: JsonRecord[], chunkSize = 200): Promise<void> => {
  for (let index = 0; index < rows.length; index += chunkSize) {
    await model.createMany({ data: rows.slice(index, index + chunkSize), skipDuplicates: true });
  }
};

const wasArchivedBefore = (existingAnimals: Map<string, ExistingRow>, appId: string): boolean => (
  isArchivedAnimalStatus(asRecord(existingAnimals.get(appId)?.payload)?.status)
);

type ArchiveTransition = { rowId: string; appId: string; archived: boolean; payload: JsonRecord | null };

/** Animals this save moves into the archive (archived: true) or back out of it (false). */
const planArchiveTransitions = (animalUpdates: PlannedUpdate[], existingAnimals: Map<string, ExistingRow>): ArchiveTransition[] => (
  animalUpdates
    .filter((update) => !update.data.deletedAt && update.data.status !== undefined)
    .map((update) => ({
      rowId: update.id,
      appId: update.appId,
      archived: isArchivedAnimalStatus(update.data.status),
      before: wasArchivedBefore(existingAnimals, update.appId),
      payload: asRecord(update.data.payload),
    }))
    .filter((row) => row.archived !== row.before)
    .map(({ before, ...row }) => row)
);

/**
 * Keep the ownership history (shown on the pedigree passport) in step with the archive: leaving
 * closes the keeper's period, returning opens a new one. A marketplace sale already did this
 * itself, and its animal arrives here already "Sold", so it is not a transition and is skipped.
 * The buyer's name is deliberately not copied here: it lives in the archive record, where the
 * keeper can erase it, and nowhere else.
 */
const recordArchiveOwnership = async (ownerId: string, transitions: ArchiveTransition[]): Promise<void> => {
  for (const transition of transitions) {
    const archive = asRecord(transition.payload?.archive);
    if (transition.archived) {
      const leftAt = new Date(isoDateValue(archive?.date) || isoDateValue(asRecord(transition.payload?.removed)?.date) || new Date().toISOString());
      const removed = asRecord(transition.payload?.removed);
      const reason = (textValue(archive?.reason) || textValue(removed?.reason))?.replace(/_/g, " ") || "archived";
      const history = await db.ownershipHistory.findMany({ where: { animalId: transition.rowId }, orderBy: { fromDate: "asc" } });
      const open = history.find((row: any) => row.ownerId === ownerId && !row.toDate);
      if (open) {
        await db.ownershipHistory.update({ where: { id: open.id }, data: { toDate: leftAt } });
      } else if (!history.some((row: any) => row.ownerId === ownerId)) {
        const animal = await db.animal.findUnique({ where: { id: transition.rowId }, select: { createdAt: true } });
        const fromDate = animal?.createdAt && animal.createdAt < leftAt ? animal.createdAt : leftAt;
        await db.ownershipHistory.create({
          data: { animalId: transition.rowId, ownerId, fromDate, toDate: leftAt, transferType: "owned", notes: `Left the collection: ${reason}.` },
        });
      }
    } else {
      const history = Array.isArray(transition.payload?.archiveHistory) ? (transition.payload?.archiveHistory as unknown[]) : [];
      const lastReturn = asRecord(history[history.length - 1]);
      const returnedAt = new Date(isoDateValue(lastReturn?.returnDate) || new Date().toISOString());
      await db.ownershipHistory.create({
        data: { animalId: transition.rowId, ownerId, fromDate: returnedAt, transferType: "owned", notes: "Returned to the collection." },
      });
    }
  }
};

/**
 * The tier's animal cap, judged on what this save leaves in the cloud.
 *
 * The app uploads only changed records, so the request size says nothing about the
 * collection: comparing it to the limit let a keeper pass the cap in small steps, and
 * the usage check that sat beside it counted deleted rows and refused every save --
 * edits included -- once an account reached its limit exactly. Only animals entering the
 * collection can push an account over -- new ones, and archived ones returning -- so a save
 * without any always goes through: edits, deletions, archiving and pairings are never held
 * hostage to the cap. Archived animals (sold, died, given away...) do not count at all.
 */
const assertAnimalCapacity = async (
  tx: any,
  ownerId: string,
  access: any,
  animalCreates: JsonRecord[],
  animalUpdates: PlannedUpdate[],
  existingAnimals: Map<string, ExistingRow>,
): Promise<void> => {
  const limit = access?.limit;
  if (limit === undefined || limit === null || !Number.isFinite(Number(limit))) return;
  const wasArchived = (appId: string) => wasArchivedBefore(existingAnimals, appId);
  const created = animalCreates.filter((row) => !row.deletedAt && !isArchivedAnimalStatus(row.status)).length;
  // Entering the collection: a deleted row brought back live (its data clears deletedAt), or an
  // archived animal returning. Either way only when the animal it now is counts.
  const entering = animalUpdates.filter((update) => {
    if (update.data.deletedAt) return false;
    if (update.data.status === undefined || isArchivedAnimalStatus(update.data.status)) return false;
    const resurrected = "deletedAt" in update.data && update.data.deletedAt === null;
    return resurrected || wasArchived(update.appId);
  }).length;
  const added = created + entering;
  if (!added) return;

  // Room made in the same save: animals deleted, or moved to the archive. countedAnimalWhere only
  // matches rows that count now, so a row already deleted or archived frees nothing twice.
  const leavingIds = animalUpdates
    .filter((update) => update.data.deletedAt || (isArchivedAnimalStatus(update.data.status) && !wasArchived(update.appId)))
    .map((update) => update.appId);
  const [liveNow, liveLeaving] = await Promise.all([
    tx.animal.count({ where: countedAnimalWhere(ownerId) }),
    leavingIds.length
      ? tx.animal.count({ where: countedAnimalWhere(ownerId, { appAnimalId: { in: leavingIds } }) })
      : Promise.resolve(0),
  ]);
  const liveAfter = liveNow - liveLeaving + added;
  if (liveAfter <= Number(limit)) return;

  const tierName = access.tier || access.currentTier || "Your plan";
  throw new HttpError(
    403,
    `${tierName} keeps ${limit} animals in the cloud. This save would bring it to ${liveAfter}, so it was not saved. Every animal is still on this device.`,
  );
};

export const upsertBreederSnapshot = async (ownerId: string, input: BreederSnapshotInput) => {
  const animals = normalizeArray(input.animals, "animals");
  const pairings = normalizeArray(input.pairings, "pairings");
  pairings.forEach(validatePairingCompletion);
  const explicitClutches = normalizeArray(input.clutches, "clutches");
  const plannerState = asRecord(input.plannerState);
  const nestedClutches = pairings.map(extractClutchFromPairing).filter((item): item is JsonRecord => !!item);
  const clutches = [...explicitClutches, ...nestedClutches];
  const incomingCycles = normalizeArray(input.breedingCycles, "breedingCycles");
  const incomingExams = normalizeArray(input.follicleExams, "follicleExams");
  let skippedBreedingRecords: SkippedBreedingRecord[] = [];
  let animalAccess: any = { allowed: true, featureKey: "animals.create", source: "default", tier: "Unconfigured" };
  try {
    animalAccess = await canAccessFeature({ id: ownerId }, "animals.create");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.warn("[breeder-sync] canAccessFeature error (proceeding without limit check):", error);
  }

  // What this request wrote, recorded for the response below.
  const touched = {
    animals: new Set<string>(),
    pairings: new Set<string>(),
    clutches: new Set<string>(),
    breedingCycles: new Set<string>(),
    follicleExams: new Set<string>(),
  };
  let plannerStateWritten = false;
  let cycleChangesForReminders = false;
  // Animals this save moves into or out of the archive, for the ownership history written after.
  let archiveTransitions: ArchiveTransition[] = [];

  // One transaction for the whole save, reads included, holding the account's sync lock. Reading
  // the stored rows before the transaction (the old shape) let two devices saving at once merge
  // against the same stale copy, and the second write erased whatever the first had added. The
  // reads are still one bulk query per table, so a sync of thousands of records stays well inside
  // the transaction budget.
  await db.$transaction(async (tx: any) => {
    await lockBreederAccount(tx, ownerId);

    const [existingAnimals, existingPairings, existingClutches, existingPlannerState, existingCycles, existingExams] = await Promise.all([
      loadExistingByAppId(tx.animal, ownerId, "appAnimalId"),
      loadExistingByAppId(tx.pairing, ownerId, "appPairingId"),
      loadExistingByAppId(tx.clutch, ownerId, "appClutchId"),
      tx.breederPlannerState.findUnique({
        where: { ownerId },
        select: { id: true, payload: true, updatedAt: true },
      }),
      loadExistingByAppId(tx.breedingCycle, ownerId, "appCycleId"),
      loadExistingByAppId(tx.follicleExamination, ownerId, "appExamId"),
    ]);

    // Every animal a card names should be one of this owner's rows (deleted rows count, so archiving
    // an animal keeps its breeding history), or arrive in this very request. A card naming any other
    // id is kept with a review flag and a malformed record is left out on its own; neither blocks
    // the rest of the save any more (screenBreedingRecords).
    const knownAnimalAppIds = new Set<string>(existingAnimals.keys());
    animals.forEach((animal, index) => knownAnimalAppIds.add(requireRecordId(animal, "animal", index)));
    const screened = screenBreedingRecords(incomingCycles, incomingExams, knownAnimalAppIds);
    const breedingCycles = screened.cycles;
    const follicleExams = screened.exams;
    skippedBreedingRecords = screened.skipped;
    const flagged = (appId: string, payload: JsonRecord) => withUnresolvedAnimalFlag(payload, screened.unresolvedByCycleId.get(appId) || []);
    if (skippedBreedingRecords.length) {
      console.warn("[breeder-sync] left out malformed breeding records", { ownerId, skipped: skippedBreedingRecords });
    }

    const cycleCreates: JsonRecord[] = [];
    const cycleUpdates: PlannedUpdate[] = [];
    // The payload each live cycle will hold after this save, keyed by app id, so the
    // one-active-cycle rule can be judged over the whole account rather than this request.
    const resultingCyclePayloads = new Map<string, JsonRecord>();
    existingCycles.forEach((row, appId) => {
      const payload = asRecord(row.payload);
      if (payload && !row.deletedAt && !payload.deletedAt) resultingCyclePayloads.set(appId, payload);
    });
    for (const [index, cycle] of breedingCycles.entries()) {
      const appId = breedingCycleAppId(cycle) || `cycle-${index + 1}`;
      const existing = existingCycles.get(appId) || null;
      const tombstoneAt = isoDateValue(cycle.deletedAt);
      if (tombstoneAt) {
        const plan = planTombstone(existing, tombstoneAt);
        if (plan === "delete") {
          cycleUpdates.push({ id: existing!.id, appId, data: { deletedAt: new Date(tombstoneAt) } });
          resultingCyclePayloads.delete(appId);
        } else if (plan === "create") {
          cycleCreates.push({ ownerId, appCycleId: appId, femaleAnimalAppId: textValue(cycle.femaleId) || "", payload: { ...cycle }, deletedAt: new Date(tombstoneAt) });
        }
        continue;
      }
      if (!existing) {
        const payload = flagged(appId, cycle);
        cycleCreates.push({ ownerId, appCycleId: appId, ...cycleColumns(payload), payload });
        resultingCyclePayloads.set(appId, payload);
        continue;
      }
      if (existing.deletedAt) {
        if (!shouldResurrect(cycle, existing)) continue;
        const payload = flagged(appId, cycle);
        cycleUpdates.push({ id: existing.id, appId, data: { ...cycleColumns(payload), payload, deletedAt: null } });
        resultingCyclePayloads.set(appId, payload);
        continue;
      }
      if (!shouldApplyIncomingPayload(cycle, existing)) continue;
      const payload = flagged(appId, mergeBreedingCyclePayload(existing.payload, cycle));
      if (sameSyncContent(payload, existing.payload)) continue;
      cycleUpdates.push({ id: existing.id, appId, data: { ...cycleColumns(payload), payload } });
      resultingCyclePayloads.set(appId, payload);
    }
    // A stored card flagged for an animal the account lacked is re-checked on every save, sent in
    // this request or not: once the animal has arrived the flag clears itself, without waiting for
    // some device to edit that card.
    existingCycles.forEach((row, appId) => {
      if (row.deletedAt || cycleCreates.some((c) => c.appCycleId === appId) || cycleUpdates.some((u) => u.appId === appId)) return;
      const stored = asRecord(row.payload);
      const open = (Array.isArray(stored?.reviewFlags) ? stored!.reviewFlags : [])
        .map(asRecord)
        .find((flag) => flag?.kind === "unresolved_animal_reference" && !flag.resolvedAt);
      if (!stored || !open) return;
      const stillUnknown = (Array.isArray(open.animalIds) ? open.animalIds : [])
        .map((id) => String(id))
        .filter((id) => !knownAnimalAppIds.has(id));
      const payload = withUnresolvedAnimalFlag(stored, stillUnknown);
      if (payload === stored) return;
      cycleUpdates.push({ id: row.id, appId, data: { ...cycleColumns(payload), payload } });
      resultingCyclePayloads.set(appId, payload);
    });

    // Two devices can each start a card for the same female while offline. The earlier card stays
    // active; the other is paused with a review flag so the keeper decides, and the save succeeds.
    const conflictChanges = resolveActiveCycleConflicts(Array.from(resultingCyclePayloads.values()));
    conflictChanges.forEach((payload, appId) => {
      const planned = cycleCreates.find((row) => row.appCycleId === appId);
      if (planned) {
        Object.assign(planned, cycleColumns(payload), { payload });
        return;
      }
      const update = cycleUpdates.find((row) => row.appId === appId);
      if (update) {
        update.data = { ...update.data, ...cycleColumns(payload), payload };
        return;
      }
      const existing = existingCycles.get(appId);
      if (existing) cycleUpdates.push({ id: existing.id, appId, data: { ...cycleColumns(payload), payload } });
    });

    const examCreates: JsonRecord[] = [];
    const examUpdates: PlannedUpdate[] = [];
    for (const [index, exam] of follicleExams.entries()) {
      const appId = follicleExamAppId(exam) || `exam-${index + 1}`;
      const existing = existingExams.get(appId) || null;
      const tombstoneAt = isoDateValue(exam.deletedAt);
      if (tombstoneAt) {
        const plan = planTombstone(existing, tombstoneAt);
        if (plan === "delete") {
          examUpdates.push({ id: existing!.id, appId, data: { deletedAt: new Date(tombstoneAt) } });
        } else if (plan === "create") {
          examCreates.push({ ownerId, appExamId: appId, femaleAnimalAppId: textValue(exam.femaleId) || "", payload: { ...exam }, deletedAt: new Date(tombstoneAt) });
        }
        continue;
      }
      if (!existing) {
        examCreates.push({ ownerId, appExamId: appId, ...examColumns(exam), payload: exam });
        continue;
      }
      if (existing.deletedAt) {
        if (shouldResurrect(exam, existing)) {
          examUpdates.push({ id: existing.id, appId, data: { ...examColumns(exam), payload: exam, deletedAt: null } });
        }
        continue;
      }
      if (!shouldApplyIncomingPayload(exam, existing)) continue;
      const payload = mergeFollicleExamPayload(existing.payload, exam);
      if (sameSyncContent(payload, existing.payload)) continue;
      examUpdates.push({ id: existing.id, appId, data: { ...examColumns(payload), payload } });
    }

    const animalColumns = (payload: JsonRecord) => ({
      name: textValue(payload.name),
      sex: textValue(payload.sex),
      status: textValue(payload.status),
      species: textValue(payload.species),
      payload,
    });
    const animalCreates: JsonRecord[] = [];
    const animalUpdates: PlannedUpdate[] = [];
    for (const [index, animal] of animals.entries()) {
      const appAnimalId = requireRecordId(animal, "animal", index);
      const existing = existingAnimals.get(appAnimalId) || null;
      const tombstoneAt = isoDateValue(animal.deletedAt);
      if (tombstoneAt) {
        const plan = planTombstone(existing, tombstoneAt);
        if (plan === "delete") {
          animalUpdates.push({ id: existing!.id, appId: appAnimalId, data: { deletedAt: new Date(tombstoneAt) } });
        } else if (plan === "create") {
          animalCreates.push({ ownerId, appAnimalId, payload: {}, deletedAt: new Date(tombstoneAt) });
        }
        continue;
      }
      if (!existing) {
        animalCreates.push({ ownerId, appAnimalId, ...animalColumns(animal) });
        continue;
      }
      if (existing.deletedAt) {
        // Deleted here, but this copy was edited after the deletion: a real edit made on a device
        // that had not heard about it yet, or a new animal that reuses the id. It comes back as
        // sent, not merged with the dead row's payload.
        if (!shouldResurrect(animal, existing)) continue;
        animalUpdates.push({ id: existing.id, appId: appAnimalId, data: { ...animalColumns(animal), deletedAt: null } });
        continue;
      }
      const merged = mergeAnimalPayload(storedRecord(existing), animal);
      if (sameSyncContent(merged, existing.payload)) continue;
      animalUpdates.push({ id: existing.id, appId: appAnimalId, data: animalColumns(merged) });
    }

    await assertAnimalCapacity(
      tx,
      ownerId,
      animalAccess,
      animalCreates,
      animalUpdates,
      existingAnimals,
    );
    archiveTransitions = planArchiveTransitions(animalUpdates, existingAnimals);

    const pairingColumns = (payload: JsonRecord) => ({
      label: textValue(payload.label),
      maleAnimalAppId: textValue(payload.maleId),
      femaleAnimalAppId: textValue(payload.femaleId),
      status: textValue(payload.status),
      workflowStatus: enumTextValue(payload.workflowStatus ?? payload.status, workflowStatuses),
      completionReason: enumTextValue(payload.completionReason, completionReasons),
      outcomeConfidence: enumTextValue(payload.outcomeConfidence, outcomeConfidences),
      completedAt: isoDateValue(payload.completedAt) ? new Date(isoDateValue(payload.completedAt) as string) : null,
      completedByUserId: textValue(payload.completedBy),
      completionNote: textValue(payload.completionNote),
      reopenedAt: isoDateValue(payload.reopenedAt) ? new Date(isoDateValue(payload.reopenedAt) as string) : null,
      reopenedByUserId: textValue(payload.reopenedBy),
      startDate: textValue(payload.startDate),
      payload,
    });
    // Row ids for every pairing the clutch loop may reference. Pairings created by this request
    // have no id until after the insert, so those are resolved in a single lookup below.
    const pairingRowsByAppId = new Map<string, string>();
    const pairingCreates: JsonRecord[] = [];
    const pairingUpdates: PlannedUpdate[] = [];
    const createdPairingAppIds: string[] = [];
    for (const [index, pairing] of pairings.entries()) {
      const appPairingId = requireRecordId(pairing, "pairing", index);
      const existing = existingPairings.get(appPairingId) || null;
      if (existing) pairingRowsByAppId.set(appPairingId, existing.id);
      const tombstoneAt = isoDateValue(pairing.deletedAt);
      if (tombstoneAt) {
        const plan = planTombstone(existing, tombstoneAt);
        if (plan === "delete") {
          pairingUpdates.push({ id: existing!.id, appId: appPairingId, data: { deletedAt: new Date(tombstoneAt) } });
        } else if (plan === "create") {
          pairingCreates.push({ ownerId, appPairingId, payload: {}, deletedAt: new Date(tombstoneAt) });
          pairingRowsByAppId.set(appPairingId, "");
        }
        continue;
      }
      if (!existing) {
        pairingCreates.push({ ownerId, appPairingId, ...pairingColumns(pairing) });
        createdPairingAppIds.push(appPairingId);
        pairingRowsByAppId.set(appPairingId, "");
        continue;
      }
      if (existing.deletedAt) {
        if (shouldResurrect(pairing, existing)) {
          pairingUpdates.push({ id: existing.id, appId: appPairingId, data: { ...pairingColumns(pairing), deletedAt: null } });
        }
        continue;
      }
      const merged = mergePairingPayload(storedRecord(existing), pairing);
      if (sameSyncContent(merged, existing.payload)) continue;
      pairingUpdates.push({ id: existing.id, appId: appPairingId, data: pairingColumns(merged) });
    }

    await createManyChunked(tx.animal, animalCreates);
    for (const update of animalUpdates) {
      await tx.animal.update({ where: { id: update.id }, data: update.data });
    }

    await createManyChunked(tx.pairing, pairingCreates);
    for (const update of pairingUpdates) {
      await tx.pairing.update({ where: { id: update.id }, data: update.data });
    }

    await createManyChunked(tx.breedingCycle, cycleCreates);
    for (const update of cycleUpdates) {
      await tx.breedingCycle.update({ where: { id: update.id }, data: update.data });
    }
    await createManyChunked(tx.follicleExamination, examCreates);
    for (const update of examUpdates) {
      await tx.follicleExamination.update({ where: { id: update.id }, data: update.data });
    }

    if (createdPairingAppIds.length) {
      const insertedPairings = await tx.pairing.findMany({
        where: { ownerId, appPairingId: { in: createdPairingAppIds } },
        select: { id: true, appPairingId: true },
      });
      for (const row of insertedPairings) {
        pairingRowsByAppId.set(String(row.appPairingId), row.id);
      }
    }

    // Planned here rather than alongside the others because a clutch's pairingId can point at a
    // pairing that only just received its row id. No queries run in this loop.
    const clutchCreates: JsonRecord[] = [];
    const clutchUpdates: PlannedUpdate[] = [];
    for (const [index, clutch] of clutches.entries()) {
      const appClutchId = requireRecordId(clutch, "clutch", index);
      const pairingAppId = textValue(clutch.pairingAppId) || textValue(clutch.pairingId);
      const existing = existingClutches.get(appClutchId) || null;
      if (existing?.deletedAt) continue;
      const payload = existing ? mergeClutchPayload(storedRecord(existing), clutch) : clutch;
      const data = {
        pairingId: pairingAppId ? pairingRowsByAppId.get(pairingAppId) || null : null,
        clutchNumber: intValue(payload.clutchNumber),
        seasonYear: intValue(payload.seasonYear),
        laidDate: textValue(payload.laidDate) || textValue(payload.date),
        payload,
      };
      if (!existing) {
        clutchCreates.push({ ownerId, appClutchId, ...data });
        touched.clutches.add(appClutchId);
      } else if (!sameSyncContent(payload, existing.payload)) {
        clutchUpdates.push({ id: existing.id, appId: appClutchId, data: { ...data, pairingId: data.pairingId || undefined } });
        touched.clutches.add(appClutchId);
      }
    }

    await createManyChunked(tx.clutch, clutchCreates);
    for (const update of clutchUpdates) {
      await tx.clutch.update({ where: { id: update.id }, data: update.data });
    }

    if (plannerState) {
      if (!existingPlannerState) {
        await tx.breederPlannerState.create({ data: { ownerId, payload: stripDeviceLocalPlannerState(plannerState) } });
        plannerStateWritten = true;
      } else {
        const payload = mergePlannerStatePayload(storedRecord(existingPlannerState), plannerState);
        if (!sameSyncContent(payload, existingPlannerState.payload)) {
          await tx.breederPlannerState.update({ where: { id: existingPlannerState.id }, data: { payload } });
          plannerStateWritten = true;
        }
      }
    }

    animalCreates.forEach((row) => touched.animals.add(String(row.appAnimalId)));
    animalUpdates.forEach((row) => touched.animals.add(row.appId));
    pairingCreates.forEach((row) => touched.pairings.add(String(row.appPairingId)));
    pairingUpdates.forEach((row) => touched.pairings.add(row.appId));
    cycleCreates.forEach((row) => touched.breedingCycles.add(String(row.appCycleId)));
    cycleUpdates.forEach((row) => touched.breedingCycles.add(row.appId));
    examCreates.forEach((row) => touched.follicleExams.add(String(row.appExamId)));
    examUpdates.forEach((row) => touched.follicleExams.add(row.appId));
    cycleChangesForReminders = cycleCreates.length > 0 || cycleUpdates.length > 0;
  }, SNAPSHOT_TRANSACTION_OPTIONS);

  if (archiveTransitions.length) {
    // Best effort, after the save: a passport history problem must never cost the keeper a sync.
    await recordArchiveOwnership(ownerId, archiveTransitions).catch((err) => {
      console.error("[archive] ownership history update failed:", err);
    });
  }

  const savedSnapshot = await listBreederSnapshot(ownerId);

  // No marketplace write here. The snapshot used to mirror every animal tagged
  // for sale into the legacy listings table; that table is retired, and the one
  // listing pipeline is the breeder app's explicit publish
  // (POST /marketplace/listings). A sync must never put an animal on sale.

  // Ingest reproductive events from all female pairings into the intelligence tables.
  // Fire-and-forget: don't let ingestion failures block the snapshot response.
  ingestAllPairingsIntoReproductiveCycles(
    ownerId,
    savedSnapshot.pairings as JsonRecord[],
    savedSnapshot.clutches as JsonRecord[],
  ).catch((err) => {
    console.error("[reproductive] ingestion error:", err);
  });

  // Planned-pairing reminders ride on the email queue, idempotent per planned entry. Only run
  // when this request carried cards; fire-and-forget like the ingestion above.
  if (cycleChangesForReminders) {
    const animalNames = new Map<string, string>();
    (Array.isArray(savedSnapshot.animals) ? savedSnapshot.animals : []).forEach((animal: any) => {
      const record = asRecord(animal);
      const id = record ? textValue(record.id) : null;
      if (id) animalNames.set(id, textValue(record?.name) || id);
    });
    const touchedCycleIds = touched.breedingCycles;
    const touchedCycles = (Array.isArray(savedSnapshot.breedingCycles) ? savedSnapshot.breedingCycles : [])
      .map(asRecord)
      .filter((record): record is JsonRecord => !!record && touchedCycleIds.has(String(record.id)));
    syncPlannedPairingReminders(ownerId, touchedCycles, animalNames).catch((err) => {
      console.error("[breeding] planned pairing reminder sync failed:", err);
    });
  }

  // The rows this request actually wrote, in the same shape as a snapshot so a caller can treat
  // either response the same way. On a routine sync this is a handful of records instead of the
  // account's entire dataset; callers opt in with ?ack=changed so older installed builds, which
  // expect the full snapshot back, keep getting exactly what they got before.
  const pickTouched = (records: unknown, ids: Set<string>): JsonRecord[] => (
    (Array.isArray(records) ? records : [])
      .map(asRecord)
      .filter((record): record is JsonRecord => !!record && ids.has(String(record.id)))
  );

  const changed = {
    animals: pickTouched(savedSnapshot.animals, touched.animals),
    pairings: pickTouched(savedSnapshot.pairings, touched.pairings),
    clutches: pickTouched(savedSnapshot.clutches, touched.clutches),
    breedingCycles: pickTouched(savedSnapshot.breedingCycles, touched.breedingCycles),
    follicleExams: pickTouched(savedSnapshot.follicleExams, touched.follicleExams),
    plannerState: plannerStateWritten ? savedSnapshot.plannerState : null,
    tombstones: savedSnapshot.tombstones,
    // Records this save left out, so the app can say which card or examination did not sync.
    skipped: skippedBreedingRecords,
    serverTime: savedSnapshot.serverTime,
    partial: true,
  };

  return { snapshot: savedSnapshot, changed };
};
