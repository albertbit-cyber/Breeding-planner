import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { canAccessFeature } from "./subscriptionService";
import { ingestAllPairingsIntoReproductiveCycles } from "./reproductiveCycleService";

type JsonRecord = Record<string, unknown>;

export type BreederSnapshotInput = {
  animals?: unknown[];
  pairings?: unknown[];
  clutches?: unknown[];
};

const db = prisma as any;

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

export const listBreederSnapshot = async (ownerId: string) => {
  const [animals, pairings, clutches] = await Promise.all([
    db.animal.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } }),
    db.pairing.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } }),
    db.clutch.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } }),
  ]);

  return {
    animals: animals.map((row: any) => row.payload),
    pairings: pairings.map((row: any) => row.payload),
    clutches: clutches.map((row: any) => row.payload),
  };
};

export const upsertBreederSnapshot = async (ownerId: string, input: BreederSnapshotInput) => {
  const animals = normalizeArray(input.animals, "animals");
  const pairings = normalizeArray(input.pairings, "pairings");
  const explicitClutches = normalizeArray(input.clutches, "clutches");
  const nestedClutches = pairings.map(extractClutchFromPairing).filter((item): item is JsonRecord => !!item);
  const clutches = [...explicitClutches, ...nestedClutches];
  const animalAccess = await canAccessFeature({ id: ownerId }, "animals.create");
  if (!animalAccess.allowed && animalAccess.reason === "Usage limit reached") {
    throw new HttpError(403, `${animalAccess.reason}: ${animalAccess.currentUsage || 0} / ${animalAccess.limit || 0} animals.`);
  }
  if (animalAccess.limit !== undefined && animalAccess.limit !== null && animals.length > Number(animalAccess.limit)) {
    throw new HttpError(403, `Animal limit reached: ${animals.length} / ${animalAccess.limit} animals.`);
  }

  await db.$transaction(async (tx: any) => {
    for (const [index, animal] of animals.entries()) {
      const appAnimalId = requireRecordId(animal, "animal", index);
      await tx.animal.upsert({
        where: { ownerId_appAnimalId: { ownerId, appAnimalId } },
        create: {
          ownerId,
          appAnimalId,
          name: textValue(animal.name),
          sex: textValue(animal.sex),
          status: textValue(animal.status),
          payload: animal,
        },
        update: {
          name: textValue(animal.name),
          sex: textValue(animal.sex),
          status: textValue(animal.status),
          payload: animal,
        },
      });
    }

    const saleListings = animals
      .map((animal, index) => (isSaleAnimal(animal) && isPublishedToMarketplace(animal))
        ? buildAutoListing(ownerId, animal, index)
        : null)
      .filter((item): item is ReturnType<typeof buildAutoListing> => !!item);
    const saleListingIds = saleListings.map((listing) => listing.appListingId);

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

    const pairingRowsByAppId = new Map<string, string>();
    for (const [index, pairing] of pairings.entries()) {
      const appPairingId = requireRecordId(pairing, "pairing", index);
      const row = await tx.pairing.upsert({
        where: { ownerId_appPairingId: { ownerId, appPairingId } },
        create: {
          ownerId,
          appPairingId,
          label: textValue(pairing.label),
          maleAnimalAppId: textValue(pairing.maleId),
          femaleAnimalAppId: textValue(pairing.femaleId),
          status: textValue(pairing.status),
          startDate: textValue(pairing.startDate),
          payload: pairing,
        },
        update: {
          label: textValue(pairing.label),
          maleAnimalAppId: textValue(pairing.maleId),
          femaleAnimalAppId: textValue(pairing.femaleId),
          status: textValue(pairing.status),
          startDate: textValue(pairing.startDate),
          payload: pairing,
        },
      });
      pairingRowsByAppId.set(appPairingId, row.id);
    }

    for (const [index, clutch] of clutches.entries()) {
      const appClutchId = requireRecordId(clutch, "clutch", index);
      const pairingAppId = textValue(clutch.pairingAppId) || textValue(clutch.pairingId);
      await tx.clutch.upsert({
        where: { ownerId_appClutchId: { ownerId, appClutchId } },
        create: {
          ownerId,
          pairingId: pairingAppId ? pairingRowsByAppId.get(pairingAppId) || null : null,
          appClutchId,
          clutchNumber: numberValue(clutch.clutchNumber),
          seasonYear: numberValue(clutch.seasonYear),
          laidDate: textValue(clutch.laidDate) || textValue(clutch.date),
          payload: clutch,
        },
        update: {
          pairingId: pairingAppId ? pairingRowsByAppId.get(pairingAppId) || undefined : undefined,
          clutchNumber: numberValue(clutch.clutchNumber),
          seasonYear: numberValue(clutch.seasonYear),
          laidDate: textValue(clutch.laidDate) || textValue(clutch.date),
          payload: clutch,
        },
      });
    }
  });

  // Ingest reproductive events from all female pairings into the intelligence tables.
  // Fire-and-forget: don't let ingestion failures block the snapshot response.
  ingestAllPairingsIntoReproductiveCycles(ownerId, pairings, clutches).catch((err) => {
    console.error("[reproductive] ingestion error:", err);
  });

  return listBreederSnapshot(ownerId);
};
