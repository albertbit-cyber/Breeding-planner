import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";

// ── Shape returned to the frontend ──────────────────────────

export type FamilyTreeAnimal = {
  id: string;
  globalId: string | null;
  localId: string;
  name: string | null;
  species: string | null;
  sex: string;
  genetics: string[];
  breederId: string;
  breederName: string | null;
  currentOwnerId: string;
  clutchId: string | null;
  hatchDate: string | null;
  status: string | null;
  privacyLevel: string;
  photoUrl: string | null;
  /** Why the animal left the collection (sold, died, deleted...), or null while it is kept. */
  departure: { kind: "archived" | "removed"; reason: string; date: string | null } | null;
};

export type FamilyTreeRelationship = {
  id: string;
  childId: string;
  parentId: string;
  role: string;
  confidence: string;
};

export type OwnershipRecord = {
  id: string;
  snakeId: string;
  ownerId: string;
  ownerName: string | null;
  fromDate: string;
  toDate: string | null;
  transferType: string;
};

// ── Helpers ──────────────────────────────────────────────────

const animalWithOwner = {
  owner: {
    select: {
      id: true,
      fullName: true,
      profile: { select: { breederName: true } },
    },
  },
} as const;

function normalizeSex(raw: string | null | undefined): string {
  if (!raw) return "unknown";
  const v = String(raw).trim().toUpperCase();
  if (v === "M" || v === "MALE")   return "male";
  if (v === "F" || v === "FEMALE") return "female";
  return "unknown";
}

function extractPayloadGenetics(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const morphs  = Array.isArray(p.morphs)  ? (p.morphs  as string[]) : [];
  const hets    = Array.isArray(p.hets)    ? (p.hets    as string[]).map((h) => `het ${h}`) : [];
  return [...morphs, ...hets];
}

const ARCHIVE_REASONS = new Set(["sold", "died", "given_away", "traded", "lost", "other"]);

/**
 * Why an animal is no longer in the collection. A deleted row (or a deleted snake kept as a
 * lineage card) is "removed"; a sold or dead one still on file is "archived". Pedigrees keep both:
 * a dead sire is still the sire of his offspring.
 */
function departureOf(animal: any, payload: Record<string, unknown>): FamilyTreeAnimal["departure"] {
  const removed = payload.removed && typeof payload.removed === "object" ? (payload.removed as Record<string, unknown>) : null;
  const archive = payload.archive && typeof payload.archive === "object" ? (payload.archive as Record<string, unknown>) : null;
  const status = String(animal.status ?? payload.status ?? "").trim().toLowerCase();
  const reasonOf = (value: unknown) => (ARCHIVE_REASONS.has(String(value)) ? String(value) : "other");
  const fromStatus = status === "sold" ? "sold" : status === "deceased" ? "died" : "other";
  if (removed || animal.deletedAt || status === "removed") {
    return {
      kind: "removed",
      reason: reasonOf(removed?.reason ?? archive?.reason ?? fromStatus),
      date: (removed?.date as string) ?? (animal.deletedAt ? new Date(animal.deletedAt).toISOString().slice(0, 10) : null),
    };
  }
  if (archive?.reason || status === "sold" || status === "deceased" || status === "archived") {
    return {
      kind: "archived",
      reason: reasonOf(archive?.reason ?? fromStatus),
      date: (archive?.date as string) ?? null,
    };
  }
  return null;
}

function formatAnimal(animal: any): FamilyTreeAnimal {
  const payload  = (animal.payload as Record<string, unknown>) ?? {};
  const genetics = extractPayloadGenetics(payload);
  const sex      = normalizeSex(animal.sex ?? (payload.sex as string));
  const breederName =
    animal.owner?.profile?.breederName ||
    animal.owner?.fullName ||
    null;

  return {
    id:             animal.id,
    globalId:       animal.globalId ?? null,
    localId:        animal.appAnimalId,
    name:           animal.name ?? (payload.name as string) ?? null,
    species:        (payload.species as string) ?? null,
    sex,
    genetics,
    breederId:      animal.ownerId,
    breederName,
    currentOwnerId: animal.ownerId,
    clutchId:       (payload.clutchId as string) ?? null,
    hatchDate:      (payload.hatchDate as string) ?? null,
    status:         animal.status ?? (payload.status as string) ?? null,
    privacyLevel:   animal.privacyLevel ?? "private",
    photoUrl:       (payload.photoUrl as string) ?? null,
    departure:      departureOf(animal, payload),
  };
}

function isVisible(animal: FamilyTreeAnimal, requesterId: string): boolean {
  if (animal.privacyLevel === "public")  return true;
  if (animal.privacyLevel === "shared")  return true;
  if (animal.privacyLevel === "private") return animal.breederId === requesterId;
  return false; // anonymous
}

function anonymize(animal: FamilyTreeAnimal): FamilyTreeAnimal {
  return {
    ...animal,
    globalId:  null,
    localId:   "anon",
    name:      "Anonymous",
    genetics:  [],
    breederName: "Hidden",
    photoUrl:  null,
    privacyLevel: "anonymous",
  };
}

function applyVisibility(animals: FamilyTreeAnimal[], requesterId: string): FamilyTreeAnimal[] {
  return animals.map((a) =>
    isVisible(a, requesterId) ? a : anonymize(a)
  );
}

// ── Service functions ─────────────────────────────────────────

/**
 * Returns the authenticated user's animals with their database IDs
 * for use in the Family Tree animal picker.
 */
export async function listMyAnimals(userId: string): Promise<FamilyTreeAnimal[]> {
  // The picker lists animals to open a tree from. A fully deleted row is a sync tombstone, not
  // an animal, so it is left out here; it still appears inside pedigrees as a parent or offspring.
  const animals = await prisma.animal.findMany({
    where:   { ownerId: userId, deletedAt: null },
    include: animalWithOwner,
    orderBy: { updatedAt: "desc" },
  });
  return animals.map(formatAnimal);
}

/**
 * Returns the full pedigree for a given animal:
 *   Gen -2  (grandparents)  ← 2 ancestor levels
 *   Gen -1  (parents)
 *   Gen  0  (selected snake)
 *   Gen +1  (direct offspring)
 */
export async function getSnakePedigree(animalId: string, requesterId: string) {
  // Accept either the database UUID or the app-local appAnimalId (snake.id in the frontend)
  let animal = await (prisma as any).animal.findUnique({
    where:   { id: animalId },
    include: animalWithOwner,
  });
  if (!animal) {
    animal = await (prisma as any).animal.findFirst({
      where:   { appAnimalId: animalId, ownerId: requesterId },
      include: animalWithOwner,
    });
  }
  if (!animal) throw new HttpError(404, "Animal not found");

  const selected = formatAnimal(animal);
  // Relationships are keyed by the database id. The caller may have passed the app id, which
  // matched no relationship at all and returned a pedigree with no parents or offspring.
  const rowId = animal.id;
  if (!isVisible(selected, requesterId)) {
    throw new HttpError(403, "This animal is private");
  }

  // Gen -1: direct parents
  const parentRels = await (prisma as any).parentRelationship.findMany({
    where:   { childId: rowId },
    include: { parent: { include: animalWithOwner } },
  });

  // Gen -2: grandparents (parents of parents)
  const parentIds = parentRels.map((r: any) => r.parentId);
  const grandparentRels = parentIds.length
    ? await (prisma as any).parentRelationship.findMany({
        where:   { childId: { in: parentIds } },
        include: { parent: { include: animalWithOwner } },
      })
    : [];

  // Gen +1: direct offspring
  const offspringRels = await (prisma as any).parentRelationship.findMany({
    where:   { parentId: rowId },
    include: { child: { include: animalWithOwner } },
  });

  // Ownership history for the selected animal
  const ownershipRaw = await (prisma as any).ownershipHistory.findMany({
    where:   { animalId: rowId },
    orderBy: { fromDate: "desc" },
  });

  // Clutches: look up via pairings where this animal's appAnimalId matches
  const pairingWhere =
    animal.sex?.toUpperCase() === "M"
      ? { maleAnimalAppId: animal.appAnimalId }
      : { femaleAnimalAppId: animal.appAnimalId };

  const pairings = await (prisma as any).pairing.findMany({
    where:   { ownerId: requesterId, deletedAt: null, ...pairingWhere },
    include: { clutches: { where: { deletedAt: null } } },
  });

  const clutches = pairings.flatMap((p: any) =>
    (p.clutches || []).map((c: any) => ({
      id:         c.id,
      displayId:  c.appClutchId ?? null,
      sireId:     null,
      damId:      null,
      breederId:  c.ownerId,
      hatchDate:  c.laidDate ?? null,
      eggCount:   (c.payload as any)?.eggCount ?? null,
      hatchCount: (c.payload as any)?.hatchCount ?? null,
      notes:      (c.payload as any)?.notes ?? null,
    }))
  );

  // Build deduplicated snake list
  const animalMap = new Map<string, FamilyTreeAnimal>();
  const relationships: FamilyTreeRelationship[] = [];

  animalMap.set(selected.id, selected);

  for (const r of parentRels) {
    animalMap.set(r.parent.id, formatAnimal(r.parent));
    relationships.push({ id: r.id, childId: r.childId, parentId: r.parentId, role: r.role, confidence: r.confidence });
  }
  for (const r of grandparentRels) {
    animalMap.set(r.parent.id, formatAnimal(r.parent));
    relationships.push({ id: r.id, childId: r.childId, parentId: r.parentId, role: r.role, confidence: r.confidence });
  }
  for (const r of offspringRels) {
    animalMap.set(r.child.id, formatAnimal(r.child));
    relationships.push({ id: r.id, childId: r.childId, parentId: r.parentId, role: r.role, confidence: r.confidence });
  }

  const snakes = applyVisibility(Array.from(animalMap.values()), requesterId);

  const ownershipHistory: OwnershipRecord[] = ownershipRaw.map((o: any) => ({
    id:           o.id,
    snakeId:      o.animalId,
    ownerId:      o.ownerId,
    ownerName:    o.ownerName ?? null,
    fromDate:     o.fromDate.toISOString().slice(0, 10),
    toDate:       o.toDate ? o.toDate.toISOString().slice(0, 10) : null,
    transferType: o.transferType,
  }));

  return { selectedSnakeId: animalId, snakes, relationships, clutches, ownershipHistory };
}

/**
 * Loads N more ancestor generations above a given animal.
 * Returns additional snakes and relationships not already in the client's graph.
 */
export async function getMoreAncestors(animalId: string, depth: number, requesterId: string) {
  depth = Math.min(Math.max(depth, 1), 4);

  const knownIds = new Set<string>([animalId]);
  const frontier = [animalId];
  const relationships: FamilyTreeRelationship[] = [];
  const animalMap = new Map<string, FamilyTreeAnimal>();

  for (let i = 0; i < depth; i++) {
    if (!frontier.length) break;
    const rels = await (prisma as any).parentRelationship.findMany({
      where:   { childId: { in: frontier } },
      include: { parent: { include: animalWithOwner } },
    });
    frontier.length = 0;
    for (const r of rels) {
      relationships.push({ id: r.id, childId: r.childId, parentId: r.parentId, role: r.role, confidence: r.confidence });
      if (!knownIds.has(r.parentId)) {
        knownIds.add(r.parentId);
        frontier.push(r.parentId);
        animalMap.set(r.parentId, formatAnimal(r.parent));
      }
    }
  }

  return {
    snakes:        applyVisibility(Array.from(animalMap.values()), requesterId),
    relationships,
  };
}

/**
 * Loads N more descendant generations below a given animal.
 */
export async function getMoreDescendants(animalId: string, depth: number, requesterId: string) {
  depth = Math.min(Math.max(depth, 1), 4);

  const knownIds = new Set<string>([animalId]);
  const frontier = [animalId];
  const relationships: FamilyTreeRelationship[] = [];
  const animalMap = new Map<string, FamilyTreeAnimal>();

  for (let i = 0; i < depth; i++) {
    if (!frontier.length) break;
    const rels = await (prisma as any).parentRelationship.findMany({
      where:   { parentId: { in: frontier } },
      include: { child: { include: animalWithOwner } },
    });
    frontier.length = 0;
    for (const r of rels) {
      relationships.push({ id: r.id, childId: r.childId, parentId: r.parentId, role: r.role, confidence: r.confidence });
      if (!knownIds.has(r.childId)) {
        knownIds.add(r.childId);
        frontier.push(r.childId);
        animalMap.set(r.childId, formatAnimal(r.child));
      }
    }
  }

  return {
    snakes:        applyVisibility(Array.from(animalMap.values()), requesterId),
    relationships,
  };
}

/**
 * Aggregate stats for the stats bar.
 * Counts are approximate — no expensive recursive queries.
 */
export async function getTreeStats(userId: string) {
  const [totalSnakes, totalClutches, totalBreeders, totalRelationships] = await Promise.all([
    (prisma as any).animal.count({ where: { ownerId: userId } }),
    (prisma as any).clutch.count({ where: { ownerId: userId } }),
    (prisma as any).user.count({ where: { role: "breeder" } }),
    (prisma as any).parentRelationship.count(),
  ]);

  return {
    totalSnakes,
    totalClutches,
    totalBreeders,
    totalBloodlines: totalRelationships,
    generationsTracked: totalRelationships > 0 ? 3 : 0,
    networkStatus: "online",
  };
}
