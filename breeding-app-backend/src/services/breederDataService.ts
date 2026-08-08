import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { canAccessFeature } from "./subscriptionService";
import { ingestAllPairingsIntoReproductiveCycles } from "./reproductiveCycleService";

type JsonRecord = Record<string, unknown>;

export type BreederSnapshotInput = {
  animals?: unknown[];
  pairings?: unknown[];
  clutches?: unknown[];
  plannerState?: unknown;
};

const db = prisma as any;
const SNAPSHOT_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
};

const isOptionalBackendSchemaError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "P2021" || code === "P2022";
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

const centsValue = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!text || /inquire|ask|contact/i.test(text)) return null;
  const parsed = Number(text.replace(/[^\d.,-]/g, "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
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

const mergeStringArrays = (...values: unknown[]): string[] => {
  const merged: string[] = [];
  const seen = new Set<string>();
  values.flatMap((value) => Array.isArray(value) ? value : []).forEach((item) => {
    const text = textValue(item);
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(text);
  });
  return merged;
};

const explicitRecordId = (record: JsonRecord, label: string): string | null => (
  [
    record.id,
    record.logId,
    record.uuid,
    record.appId,
    record.createdAt && `${record.createdAt}:${record.actionType || label}`,
    record.addedAt && `${record.addedAt}:${record.source || label}`,
  ].map(textValue).find(Boolean) || null
);

// Identity of an entry that carries no id of its own, derived from the fields a breeder actually
// fills in. The client derives its backfilled ids from the same fields, so both sides agree on
// what counts as "the same reading".
const recordContentSignature = (record: JsonRecord, label: string): string => [
  label,
  record.date,
  record.time,
  record.result || record.outcome,
  record.feed || record.food || record.prey,
  record.size || record.weight || record.grams,
  record.notes || record.note,
].map((part) => textValue(part) || "").join("|");

const mergeRecordKey = (record: JsonRecord, label: string, index: number): string => {
  const explicit = explicitRecordId(record, label);
  if (explicit) return explicit;
  return recordContentSignature(record, label) || `${label}-${index + 1}`;
};

const mergeRecordArrays = (olderValue: unknown, newerValue: unknown, label: string): JsonRecord[] => {
  const rows = [
    ...(Array.isArray(olderValue) ? olderValue : []),
    ...(Array.isArray(newerValue) ? newerValue : []),
  ].map(asRecord).filter((item): item is JsonRecord => !!item);

  // An id-less entry and an identical entry that has since been given an id are the same reading,
  // and keying them separately is what let one account accumulate 222k weight entries for 116 real
  // readings: the id-less original survived every merge, and each sync minted a fresh id for it.
  // Whenever both forms are present, the one carrying an id wins and the bare copy is dropped.
  const identified = new Set<string>();
  for (const row of rows) {
    if (explicitRecordId(row, label)) identified.add(recordContentSignature(row, label));
  }

  const merged = new Map<string, JsonRecord>();
  rows.forEach((row, index) => {
    if (!explicitRecordId(row, label) && identified.has(recordContentSignature(row, label))) return;
    const key = mergeRecordKey(row, label, index);
    const existing = merged.get(key);
    if (!existing || payloadUpdatedAtMs(row) >= payloadUpdatedAtMs(existing)) {
      merged.set(key, existing ? { ...existing, ...row } : row);
    }
  });
  return Array.from(merged.values()).sort((a, b) => payloadUpdatedAtMs(b) - payloadUpdatedAtMs(a));
};

const mergeLogsObject = (olderValue: unknown, newerValue: unknown): JsonRecord => {
  const older = asRecord(olderValue) || {};
  const newer = asRecord(newerValue) || {};
  const result: JsonRecord = {};
  const keys = Array.from(new Set([...Object.keys(older), ...Object.keys(newer)]));
  keys.forEach((key) => {
    result[key] = mergeRecordArrays(older[key], newer[key], key);
  });
  return result;
};

const mergePayloadMetadata = (older: JsonRecord, newer: JsonRecord): JsonRecord | undefined => {
  const olderMetadata = asRecord(older.metadata) || {};
  const newerMetadata = asRecord(newer.metadata) || {};
  const metadata = { ...olderMetadata, ...newerMetadata };
  return Object.keys(metadata).length ? metadata : undefined;
};

const mergeSnapshotPayload = (
  existingPayload: unknown,
  incomingPayload: JsonRecord,
  options: { stringArrayKeys?: string[]; recordArrayKeys?: string[]; mergeLogs?: boolean } = {},
): JsonRecord => {
  const existing = asRecord(existingPayload) || {};
  const incomingTime = payloadUpdatedAtMs(incomingPayload);
  const existingTime = payloadUpdatedAtMs(existing);
  const newer = incomingTime >= existingTime ? incomingPayload : existing;
  const older = incomingTime >= existingTime ? existing : incomingPayload;
  const merged: JsonRecord = { ...older, ...newer };
  (options.stringArrayKeys || []).forEach((key) => {
    merged[key] = mergeStringArrays(older[key], newer[key]);
  });
  (options.recordArrayKeys || []).forEach((key) => {
    merged[key] = mergeRecordArrays(older[key], newer[key], key);
  });
  if (options.mergeLogs) {
    merged.logs = mergeLogsObject(older.logs, newer.logs);
  }
  const metadata = mergePayloadMetadata(older, newer);
  if (metadata) merged.metadata = metadata;
  return merged;
};

const mergeAnimalPayload = (existingPayload: unknown, incomingPayload: JsonRecord): JsonRecord => (
  mergeSnapshotPayload(existingPayload, incomingPayload, {
    stringArrayKeys: ["morphs", "hets", "possibleHets", "tags", "groups"],
    recordArrayKeys: ["photos"],
    mergeLogs: true,
  })
);

const mergePairingPayload = (existingPayload: unknown, incomingPayload: JsonRecord): JsonRecord => {
  const merged = mergeSnapshotPayload(existingPayload, incomingPayload, {
    stringArrayKeys: ["goals", "tags"],
    recordArrayKeys: [
      "locks",
      "lockLogs",
      "appointments",
      "mobileOvulationLogs",
      "mobilePreLayShedLogs",
      "mobileClutchLogs",
      "mobileHatchLogs",
    ],
    mergeLogs: true,
  });
  // hatchlingsGeneratedThrough is a monotonic high-water mark used to stop the hatch
  // wizard from duplicating an already-created litter. mergeSnapshotPayload otherwise
  // replaces the whole `hatch` object with whichever side is newer, which could regress
  // this value if two devices write concurrently, so pin it to the max of both sides.
  const existingHatch = asRecord(asRecord(existingPayload)?.hatch);
  const incomingHatch = asRecord(incomingPayload?.hatch);
  if (existingHatch || incomingHatch) {
    const hatchlingsGeneratedThrough = Math.max(
      Number(existingHatch?.hatchlingsGeneratedThrough) || 0,
      Number(incomingHatch?.hatchlingsGeneratedThrough) || 0,
    );
    merged.hatch = { ...asRecord(merged.hatch), hatchlingsGeneratedThrough };
  }
  return merged;
};

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

const listValue = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  const text = textValue(value);
  return text ? [text] : [];
};

const buildGeneticsText = (animal: JsonRecord): string => {
  const tokens = [
    ...listValue(animal.morphs),
    ...listValue(animal.hets).map((entry) => /^het\b/i.test(entry) ? entry : `het ${entry}`),
    ...listValue(animal.possibleHets).map((entry) => /^possible/i.test(entry) ? entry : `possible het ${entry}`),
  ];
  return tokens.length ? tokens.join(", ") : "Genetics available on inquiry";
};

const isSaleAnimal = (animal: JsonRecord): boolean => {
  const tokens = [
    ...listValue(animal.tags),
    ...listValue(animal.status),
    ...listValue(animal.availability),
  ].map((entry) => entry.toLowerCase());
  return tokens.some((entry) => (
    entry === "for sale"
    || entry === "sale"
    || entry === "available for sale"
    || entry === "available"
    || entry === "inquire"
  ));
};

const isPublishedToMarketplace = (animal: JsonRecord): boolean => (
  animal.marketplacePublished === true
  || !!textValue(animal.marketplacePublishedAt)
  || animal.publishedToMarketplace === true
);

const primaryImageUrl = (animal: JsonRecord): string | null => {
  const direct = textValue(animal.imageUrl) || textValue(animal.photoUrl) || textValue(animal.pictureUrl);
  if (direct) return direct;
  const photos = Array.isArray(animal.photos) ? animal.photos : [];
  for (const photo of [...photos].reverse()) {
    const record = asRecord(photo);
    const url = record ? textValue(record.url) || textValue(record.src) : null;
    if (url) return url;
  }
  return null;
};

const buildAutoListing = (ownerId: string, animal: JsonRecord, index: number) => {
  const appAnimalId = requireRecordId(animal, "animal", index);
  const genetics = buildGeneticsText(animal);
  const price = textValue(animal.price) || textValue(animal.salePrice) || textValue(animal.askingPrice) || "Inquire";
  return {
    ownerId,
    appListingId: `auto-animal-${appAnimalId}`,
    animalAppId: appAnimalId,
    title: genetics,
    status: "available",
    priceCents: centsValue(price),
    currency: textValue(animal.currency) || "EUR",
    payload: {
      id: `auto-animal-${appAnimalId}`,
      animalAppId: appAnimalId,
      title: genetics,
      status: "available",
      price,
      currency: textValue(animal.currency) || "EUR",
      genetics,
      imageUrl: primaryImageUrl(animal),
      marketplacePublished: true,
      marketplacePublishedAt: textValue(animal.marketplacePublishedAt),
      source: "breeder-animal-tag",
    },
  };
};

const syncMarketplaceAutoListings = async (ownerId: string, animals: JsonRecord[]) => {
  const saleListings = animals
    .map((animal, index) => (isSaleAnimal(animal) && isPublishedToMarketplace(animal))
      ? buildAutoListing(ownerId, animal, index)
      : null)
    .filter((item): item is ReturnType<typeof buildAutoListing> => !!item);
  const saleListingIds = saleListings.map((listing) => listing.appListingId);

  await db.$transaction(async (tx: any) => {
    await tx.listing.updateMany({
      where: {
        ownerId,
        appListingId: { startsWith: "auto-animal-" },
        ...(saleListingIds.length ? { NOT: { appListingId: { in: saleListingIds } } } : {}),
      },
      data: { status: "hidden" },
    });

    for (const listing of saleListings) {
      await tx.listing.upsert({
        where: { ownerId_appListingId: { ownerId, appListingId: listing.appListingId } },
        create: listing,
        update: {
          animalAppId: listing.animalAppId,
          title: listing.title,
          status: listing.status,
          priceCents: listing.priceCents,
          currency: listing.currency,
          payload: listing.payload,
        },
      });
    }
  }, SNAPSHOT_TRANSACTION_OPTIONS);
};

export const listBreederSnapshot = async (ownerId: string, options: { since?: Date | null } = {}) => {
  const since = options.since && Number.isFinite(options.since.getTime()) ? options.since : null;

  // Captured before the reads, not after: anything written while these queries run then falls
  // inside the next window rather than slipping between the two. Re-sending a record costs
  // nothing (the merge is idempotent); missing one loses data.
  const serverTime = new Date().toISOString();

  const liveWhere = since
    ? { ownerId, deletedAt: null, updatedAt: { gt: since } }
    : { ownerId, deletedAt: null };

  const [animals, pairings, clutches, plannerState] = await Promise.all([
    db.animal.findMany({ where: liveWhere, orderBy: { updatedAt: "desc" } }),
    db.pairing.findMany({ where: liveWhere, orderBy: { updatedAt: "desc" } }),
    db.clutch.findMany({ where: liveWhere, orderBy: { updatedAt: "desc" } }),
    db.breederPlannerState.findUnique({ where: { ownerId } }),
  ]);

  const snapshot: JsonRecord = {
    animals: animals.map(withBackendSyncMetadata),
    pairings: pairings.map(withBackendSyncMetadata),
    clutches: clutches.map(withBackendSyncMetadata),
    plannerState: plannerState ? withBackendSyncMetadata(plannerState) : null,
    serverTime,
  };

  if (!since) return snapshot;

  // A full snapshot conveys a deletion by omission; an incremental one cannot, so tombstones
  // raised inside the window have to be named explicitly.
  const [deletedAnimals, deletedPairings, deletedClutches] = await Promise.all([
    db.animal.findMany({ where: { ownerId, deletedAt: { gt: since } }, select: { appAnimalId: true } }),
    db.pairing.findMany({ where: { ownerId, deletedAt: { gt: since } }, select: { appPairingId: true } }),
    db.clutch.findMany({ where: { ownerId, deletedAt: { gt: since } }, select: { appClutchId: true } }),
  ]);

  snapshot.since = since.toISOString();
  snapshot.partial = true;
  snapshot.deleted = {
    animals: deletedAnimals.map((row: any) => row.appAnimalId).filter(Boolean),
    pairings: deletedPairings.map((row: any) => row.appPairingId).filter(Boolean),
    clutches: deletedClutches.map((row: any) => row.appClutchId).filter(Boolean),
  };
  return snapshot;
};

type ExistingRow = { id: string; payload: unknown; updatedAt: unknown };
type PlannedUpdate = { id: string; appId: string; data: JsonRecord };

// One query per table, keyed by the app-side id, replacing a findUnique per incoming record.
const loadExistingByAppId = async (
  model: any,
  ownerId: string,
  appIdField: string,
): Promise<Map<string, ExistingRow>> => {
  const rows = await model.findMany({
    where: { ownerId },
    select: { id: true, payload: true, updatedAt: true, [appIdField]: true },
  });
  const byAppId = new Map<string, ExistingRow>();
  for (const row of rows) {
    const appId = textValue(row[appIdField]);
    if (appId) byAppId.set(appId, { id: row.id, payload: row.payload, updatedAt: row.updatedAt });
  }
  return byAppId;
};

// Inserts in batches to stay well under Postgres' bind-parameter ceiling. skipDuplicates keeps a
// concurrent sync from turning a racing insert into a failed request; the loser's data arrives on
// the next sync, which is how every other conflict in this file already resolves.
const createManyChunked = async (model: any, rows: JsonRecord[], chunkSize = 200): Promise<void> => {
  for (let index = 0; index < rows.length; index += chunkSize) {
    await model.createMany({ data: rows.slice(index, index + chunkSize), skipDuplicates: true });
  }
};

export const upsertBreederSnapshot = async (ownerId: string, input: BreederSnapshotInput) => {
  const animals = normalizeArray(input.animals, "animals");
  const pairings = normalizeArray(input.pairings, "pairings");
  pairings.forEach(validatePairingCompletion);
  const explicitClutches = normalizeArray(input.clutches, "clutches");
  const plannerState = asRecord(input.plannerState);
  const nestedClutches = pairings.map(extractClutchFromPairing).filter((item): item is JsonRecord => !!item);
  const clutches = [...explicitClutches, ...nestedClutches];
  let animalAccess: any = { allowed: true, featureKey: "animals.create", source: "default", tier: "Unconfigured" };
  try {
    animalAccess = await canAccessFeature({ id: ownerId }, "animals.create");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.warn("[breeder-sync] canAccessFeature error (proceeding without limit check):", error);
  }
  if (!animalAccess.allowed && animalAccess.reason === "Usage limit reached") {
    throw new HttpError(403, `${animalAccess.reason}: ${animalAccess.currentUsage || 0} / ${animalAccess.limit || 0} animals.`);
  }
  if (animalAccess.limit !== undefined && animalAccess.limit !== null && animals.length > Number(animalAccess.limit)) {
    throw new HttpError(403, `Animal limit reached: ${animals.length} / ${animalAccess.limit} animals.`);
  }

  // Read the owner's current rows in bulk, outside the write transaction. The previous
  // implementation issued a findUnique per incoming record *inside* the transaction, so a sync
  // cost two sequential round-trips per record. Past a few thousand records that exceeded the
  // transaction budget: Prisma closed the transaction mid-flight and the next query failed with
  // P2028, surfacing to the app as a bare 500. Almost all of those reads were wasted anyway --
  // on a routine sync nothing has changed, and the row was read only to decide not to write it.
  const [existingAnimals, existingPairings, existingClutches, existingPlannerState] = await Promise.all([
    loadExistingByAppId(db.animal, ownerId, "appAnimalId"),
    loadExistingByAppId(db.pairing, ownerId, "appPairingId"),
    loadExistingByAppId(db.clutch, ownerId, "appClutchId"),
    db.breederPlannerState.findUnique({
      where: { ownerId },
      select: { id: true, payload: true, updatedAt: true },
    }),
  ]);

  const animalCreates: JsonRecord[] = [];
  const animalUpdates: PlannedUpdate[] = [];
  for (const [index, animal] of animals.entries()) {
    const appAnimalId = requireRecordId(animal, "animal", index);
    const existing = existingAnimals.get(appAnimalId) || null;
    const tombstoneAt = isoDateValue(animal.deletedAt);
    if (tombstoneAt) {
      if (existing) {
        animalUpdates.push({ id: existing.id, appId: appAnimalId, data: { deletedAt: new Date(tombstoneAt) } });
      } else {
        animalCreates.push({ ownerId, appAnimalId, payload: {}, deletedAt: new Date(tombstoneAt) });
      }
      continue;
    }
    const data = {
      name: textValue(animal.name),
      sex: textValue(animal.sex),
      status: textValue(animal.status),
      payload: existing ? mergeAnimalPayload(existing.payload, animal) : animal,
    };
    if (!existing) {
      animalCreates.push({ ownerId, appAnimalId, ...data });
    } else if (shouldApplyIncomingPayload(animal, existing)) {
      animalUpdates.push({ id: existing.id, appId: appAnimalId, data });
    }
  }

  // Row ids for every pairing the clutch loop may reference. Pairings created by this request
  // have no id until after the insert, so those are resolved in a single lookup below.
  const pairingRowsByAppId = new Map<string, string>();
  const pairingCreates: JsonRecord[] = [];
  const pairingUpdates: PlannedUpdate[] = [];
  const createdPairingAppIds: string[] = [];
  for (const [index, pairing] of pairings.entries()) {
    const appPairingId = requireRecordId(pairing, "pairing", index);
    const existing = existingPairings.get(appPairingId) || null;
    const tombstoneAt = isoDateValue(pairing.deletedAt);
    if (tombstoneAt) {
      if (existing) {
        pairingUpdates.push({ id: existing.id, appId: appPairingId, data: { deletedAt: new Date(tombstoneAt) } });
      } else {
        pairingCreates.push({ ownerId, appPairingId, payload: {}, deletedAt: new Date(tombstoneAt) });
      }
      pairingRowsByAppId.set(appPairingId, existing?.id || "");
      continue;
    }
    const mergedPairingPayload = existing ? mergePairingPayload(existing.payload, pairing) : pairing;
    const data = {
      label: textValue(pairing.label),
      maleAnimalAppId: textValue(pairing.maleId),
      femaleAnimalAppId: textValue(pairing.femaleId),
      status: textValue(mergedPairingPayload.status),
      workflowStatus: enumTextValue(mergedPairingPayload.workflowStatus ?? mergedPairingPayload.status, workflowStatuses),
      completionReason: enumTextValue(mergedPairingPayload.completionReason, completionReasons),
      outcomeConfidence: enumTextValue(mergedPairingPayload.outcomeConfidence, outcomeConfidences),
      completedAt: isoDateValue(mergedPairingPayload.completedAt) ? new Date(isoDateValue(mergedPairingPayload.completedAt) as string) : null,
      completedByUserId: textValue(mergedPairingPayload.completedBy),
      completionNote: textValue(mergedPairingPayload.completionNote),
      reopenedAt: isoDateValue(mergedPairingPayload.reopenedAt) ? new Date(isoDateValue(mergedPairingPayload.reopenedAt) as string) : null,
      reopenedByUserId: textValue(mergedPairingPayload.reopenedBy),
      startDate: textValue(pairing.startDate),
      payload: mergedPairingPayload,
    };
    if (!existing) {
      pairingCreates.push({ ownerId, appPairingId, ...data });
      createdPairingAppIds.push(appPairingId);
      pairingRowsByAppId.set(appPairingId, "");
    } else {
      if (shouldApplyIncomingPayload(pairing, existing)) {
        pairingUpdates.push({ id: existing.id, appId: appPairingId, data });
      }
      pairingRowsByAppId.set(appPairingId, existing.id);
    }
  }

  // Clutches and planner state are planned inside the transaction (they depend on row ids created
  // there), so what they wrote is recorded out here for the response below.
  const clutchAppIdsWritten: string[] = [];
  let plannerStateWritten = false;

  await db.$transaction(async (tx: any) => {
    await createManyChunked(tx.animal, animalCreates);
    for (const update of animalUpdates) {
      await tx.animal.update({ where: { id: update.id }, data: update.data });
    }

    await createManyChunked(tx.pairing, pairingCreates);
    for (const update of pairingUpdates) {
      await tx.pairing.update({ where: { id: update.id }, data: update.data });
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
      const data = {
        pairingId: pairingAppId ? pairingRowsByAppId.get(pairingAppId) || null : null,
        clutchNumber: intValue(clutch.clutchNumber),
        seasonYear: intValue(clutch.seasonYear),
        laidDate: textValue(clutch.laidDate) || textValue(clutch.date),
        payload: existing ? mergeSnapshotPayload(existing.payload, clutch, { recordArrayKeys: ["photos"], mergeLogs: true }) : clutch,
      };
      if (!existing) {
        clutchCreates.push({ ownerId, appClutchId, ...data });
        clutchAppIdsWritten.push(appClutchId);
      } else if (shouldApplyIncomingPayload(clutch, existing)) {
        clutchUpdates.push({ id: existing.id, appId: appClutchId, data: { ...data, pairingId: data.pairingId || undefined } });
        clutchAppIdsWritten.push(appClutchId);
      }
    }

    await createManyChunked(tx.clutch, clutchCreates);
    for (const update of clutchUpdates) {
      await tx.clutch.update({ where: { id: update.id }, data: update.data });
    }

    if (plannerState) {
      const data = {
        payload: existingPlannerState
          ? mergeSnapshotPayload(existingPlannerState.payload, plannerState, {
            stringArrayKeys: ["groups", "showGroups", "hiddenGroups", "customStatusTags", "removedStatusTags"],
          })
          : plannerState,
      };
      if (!existingPlannerState) {
        await tx.breederPlannerState.create({ data: { ownerId, ...data } });
        plannerStateWritten = true;
      } else if (shouldApplyIncomingPayload(plannerState, existingPlannerState)) {
        await tx.breederPlannerState.update({ where: { id: existingPlannerState.id }, data });
        plannerStateWritten = true;
      }
    }
  }, SNAPSHOT_TRANSACTION_OPTIONS);

  const savedSnapshot = await listBreederSnapshot(ownerId);

  await syncMarketplaceAutoListings(ownerId, savedSnapshot.animals as JsonRecord[]).catch((error) => {
    if (isOptionalBackendSchemaError(error)) {
      console.warn("[breeder-sync] marketplace listing schema unavailable; skipped auto-listing sync.", error);
      return;
    }
    console.warn("[breeder-sync] marketplace auto-listing sync failed; breeder snapshot was saved.", error);
  });

  // Ingest reproductive events from all female pairings into the intelligence tables.
  // Fire-and-forget: don't let ingestion failures block the snapshot response.
  ingestAllPairingsIntoReproductiveCycles(
    ownerId,
    savedSnapshot.pairings as JsonRecord[],
    savedSnapshot.clutches as JsonRecord[],
  ).catch((err) => {
    console.error("[reproductive] ingestion error:", err);
  });

  // The rows this request actually wrote, in the same shape as a snapshot so a caller can treat
  // either response the same way. On a routine sync this is a handful of records instead of the
  // account's entire dataset; callers opt in with ?ack=changed so older installed builds, which
  // expect the full snapshot back, keep getting exactly what they got before.
  const touchedAnimals = new Set<string>([
    ...animalCreates.map((row) => String(row.appAnimalId)),
    ...animalUpdates.map((row) => row.appId),
  ]);
  const touchedPairings = new Set<string>([
    ...pairingCreates.map((row) => String(row.appPairingId)),
    ...pairingUpdates.map((row) => row.appId),
  ]);
  const touchedClutches = new Set<string>(clutchAppIdsWritten);

  const pickTouched = (records: unknown, touched: Set<string>): JsonRecord[] => (
    (Array.isArray(records) ? records : [])
      .map(asRecord)
      .filter((record): record is JsonRecord => !!record && touched.has(String(record.id)))
  );

  const changed = {
    animals: pickTouched(savedSnapshot.animals, touchedAnimals),
    pairings: pickTouched(savedSnapshot.pairings, touchedPairings),
    clutches: pickTouched(savedSnapshot.clutches, touchedClutches),
    plannerState: plannerStateWritten ? savedSnapshot.plannerState : null,
    serverTime: savedSnapshot.serverTime,
    partial: true,
  };

  return { snapshot: savedSnapshot, changed };
};
