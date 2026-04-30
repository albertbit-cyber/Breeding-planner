import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";

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

  return listBreederSnapshot(ownerId);
};
