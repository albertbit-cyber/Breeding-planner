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

const numberValue = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

const mergeRecordKey = (record: JsonRecord, label: string, index: number): string => {
  const explicit = [
    record.id,
    record.logId,
    record.uuid,
    record.appId,
    record.createdAt && `${record.createdAt}:${record.actionType || label}`,
    record.addedAt && `${record.addedAt}:${record.source || label}`,
  ].map(textValue).find(Boolean);
  if (explicit) return explicit;
  return [
    label,
    record.date,
    record.time,
    record.result || record.outcome,
    record.feed || record.food || record.prey,
    record.size || record.weight || record.grams,
    record.notes || record.note,
  ].map((part) => textValue(part) || "").join("|") || `${label}-${index + 1}`;
};

const mergeRecordArrays = (olderValue: unknown, newerValue: unknown, label: string): JsonRecord[] => {
  const rows = [
    ...(Array.isArray(olderValue) ? olderValue : []),
    ...(Array.isArray(newerValue) ? newerValue : []),
  ].map(asRecord).filter((item): item is JsonRecord => !!item);
  const merged = new Map<string, JsonRecord>();
  rows.forEach((row, index) => {
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

const mergePairingPayload = (existingPayload: unknown, incomingPayload: JsonRecord): JsonRecord => (
  mergeSnapshotPayload(existingPayload, incomingPayload, {
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
  })
);

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

export const listBreederSnapshot = async (ownerId: string) => {
  const [animals, pairings, clutches, plannerState] = await Promise.all([
    db.animal.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } }),
    db.pairing.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } }),
    db.clutch.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } }),
    db.breederPlannerState.findUnique({ where: { ownerId } }),
  ]);

  return {
    animals: animals.map(withBackendSyncMetadata),
    pairings: pairings.map(withBackendSyncMetadata),
    clutches: clutches.map(withBackendSyncMetadata),
    plannerState: plannerState ? withBackendSyncMetadata(plannerState) : null,
  };
};

export const upsertBreederSnapshot = async (ownerId: string, input: BreederSnapshotInput) => {
  const animals = normalizeArray(input.animals, "animals");
  const pairings = normalizeArray(input.pairings, "pairings");
  const explicitClutches = normalizeArray(input.clutches, "clutches");
  const plannerState = asRecord(input.plannerState);
  const nestedClutches = pairings.map(extractClutchFromPairing).filter((item): item is JsonRecord => !!item);
  const clutches = [...explicitClutches, ...nestedClutches];
  const animalAccess: any = await canAccessFeature({ id: ownerId }, "animals.create").catch((error) => {
    if (isOptionalBackendSchemaError(error)) {
      console.warn("[breeder-sync] subscription schema unavailable; allowing animal snapshot sync.", error);
      return { allowed: true, featureKey: "animals.create", source: "schema-unavailable", tier: "Unconfigured" };
    }
    throw error;
  });
  if (!animalAccess.allowed && animalAccess.reason === "Usage limit reached") {
    throw new HttpError(403, `${animalAccess.reason}: ${animalAccess.currentUsage || 0} / ${animalAccess.limit || 0} animals.`);
  }
  if (animalAccess.limit !== undefined && animalAccess.limit !== null && animals.length > Number(animalAccess.limit)) {
    throw new HttpError(403, `Animal limit reached: ${animals.length} / ${animalAccess.limit} animals.`);
  }

  await db.$transaction(async (tx: any) => {
    for (const [index, animal] of animals.entries()) {
      const appAnimalId = requireRecordId(animal, "animal", index);
      const existing = await tx.animal.findUnique({
        where: { ownerId_appAnimalId: { ownerId, appAnimalId } },
        select: { id: true, payload: true, updatedAt: true },
      });
      const data = {
        name: textValue(animal.name),
        sex: textValue(animal.sex),
        status: textValue(animal.status),
        payload: existing ? mergeAnimalPayload(existing.payload, animal) : animal,
      };
      if (!existing) {
        await tx.animal.create({
          data: {
            ownerId,
            appAnimalId,
            ...data,
          },
        });
      } else if (shouldApplyIncomingPayload(animal, existing)) {
        await tx.animal.update({
          where: { id: existing.id },
          data,
        });
      }
    }

    const pairingRowsByAppId = new Map<string, string>();
    for (const [index, pairing] of pairings.entries()) {
      const appPairingId = requireRecordId(pairing, "pairing", index);
      const existing = await tx.pairing.findUnique({
        where: { ownerId_appPairingId: { ownerId, appPairingId } },
        select: { id: true, payload: true, updatedAt: true },
      });
      const data = {
        label: textValue(pairing.label),
        maleAnimalAppId: textValue(pairing.maleId),
        femaleAnimalAppId: textValue(pairing.femaleId),
        status: textValue(pairing.status),
        startDate: textValue(pairing.startDate),
        payload: existing ? mergePairingPayload(existing.payload, pairing) : pairing,
      };
      const row = !existing
        ? await tx.pairing.create({
          data: {
            ownerId,
            appPairingId,
            ...data,
          },
        })
        : shouldApplyIncomingPayload(pairing, existing)
          ? await tx.pairing.update({
            where: { id: existing.id },
            data,
          })
          : existing;
      pairingRowsByAppId.set(appPairingId, row.id);
    }

    for (const [index, clutch] of clutches.entries()) {
      const appClutchId = requireRecordId(clutch, "clutch", index);
      const pairingAppId = textValue(clutch.pairingAppId) || textValue(clutch.pairingId);
      const existing = await tx.clutch.findUnique({
        where: { ownerId_appClutchId: { ownerId, appClutchId } },
        select: { id: true, payload: true, updatedAt: true },
      });
      const data = {
        pairingId: pairingAppId ? pairingRowsByAppId.get(pairingAppId) || null : null,
        clutchNumber: numberValue(clutch.clutchNumber),
        seasonYear: numberValue(clutch.seasonYear),
        laidDate: textValue(clutch.laidDate) || textValue(clutch.date),
        payload: existing ? mergeSnapshotPayload(existing.payload, clutch, { recordArrayKeys: ["photos"], mergeLogs: true }) : clutch,
      };
      if (!existing) {
        await tx.clutch.create({
          data: {
            ownerId,
            appClutchId,
            ...data,
          },
        });
      } else if (shouldApplyIncomingPayload(clutch, existing)) {
        await tx.clutch.update({
          where: { id: existing.id },
          data: {
            ...data,
            pairingId: data.pairingId || undefined,
          },
        });
      }
    }

    if (plannerState) {
      const existing = await tx.breederPlannerState.findUnique({
        where: { ownerId },
        select: { id: true, payload: true, updatedAt: true },
      });
      const data = {
        payload: existing
          ? mergeSnapshotPayload(existing.payload, plannerState, {
            stringArrayKeys: ["groups", "showGroups", "hiddenGroups", "customStatusTags", "removedStatusTags"],
          })
          : plannerState,
      };
      if (!existing) {
        await tx.breederPlannerState.create({
          data: {
            ownerId,
            ...data,
          },
        });
      } else if (shouldApplyIncomingPayload(plannerState, existing)) {
        await tx.breederPlannerState.update({
          where: { id: existing.id },
          data,
        });
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

  return savedSnapshot;
};
