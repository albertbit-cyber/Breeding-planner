import { prisma } from "../lib/prisma";

/**
 * The marketplace's differentiator: a listing can carry the animal's real
 * husbandry record, and the seller decides how much of it is published.
 *
 * `MarketplaceListing.animalId` holds the breeder's own `Animal.appAnimalId`.
 * Everything a buyer sees here is gated twice -- once by the listing's
 * `publicDataSettings`, and once by whether the underlying record actually
 * exists. A switch turned on over an empty log publishes nothing and fills no
 * provenance segment, so the meter cannot be inflated by toggling.
 */

const db = prisma as any;

export type ProvenanceFlags = {
  photos: boolean;
  weights: boolean;
  lineage: boolean;
  verifiedGenetics: boolean;
};

export type Provenance = ProvenanceFlags & {
  /** 0-4. The number of filled segments the card renders. */
  filled: number;
};

export type ListingRecord = {
  provenance: Provenance;
  weights: Array<{ date: string; grams: number }>;
  feeding: { count: number; lastFedAt: string | null; refusalsSince: number } | null;
  lineage: { clutchId: string | null; parents: Array<{ role: string; label: string }> } | null;
  certificate: {
    certificateNumber: string;
    verificationCode: string;
    issuedAt: Date;
    labName: string | null;
  } | null;
};

const EMPTY: ListingRecord = {
  provenance: { photos: false, weights: false, lineage: false, verifiedGenetics: false, filled: 0 },
  weights: [],
  feeding: null,
  lineage: null,
  certificate: null,
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const settingOn = (settings: Record<string, any>, ...keys: string[]): boolean =>
  keys.some((key) => settings[key] === true || String(settings[key]).toLowerCase() === "true");

const toGrams = (entry: any): number | null => {
  const raw = entry?.grams ?? entry?.weight ?? entry?.weightGrams ?? entry?.value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toDate = (entry: any): string | null => {
  const raw = entry?.date || entry?.at || entry?.createdAt || entry?.loggedAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const countFilled = (flags: ProvenanceFlags): number =>
  Number(flags.photos) + Number(flags.weights) + Number(flags.lineage) + Number(flags.verifiedGenetics);

/**
 * Batch-resolve the record for a page of listings. One animal query and one
 * certificate query for the whole page rather than two per row -- browse renders
 * 24 cards and each one shows a provenance meter.
 */
export const buildListingRecords = async (
  listings: any[]
): Promise<Map<string, ListingRecord>> => {
  const out = new Map<string, ListingRecord>();
  if (!Array.isArray(listings) || !listings.length) return out;

  const keyed = listings.filter((listing) => listing?.animalId && listing?.sellerUserId);

  // Photos never need the animal record.
  listings.forEach((listing) => {
    const flags: ProvenanceFlags = {
      photos: asArray(listing?.images).length >= 2,
      weights: false,
      lineage: false,
      verifiedGenetics: false,
    };
    out.set(listing.id, { ...EMPTY, provenance: { ...flags, filled: countFilled(flags) } });
  });

  if (!keyed.length) return out;

  const owners = Array.from(new Set(keyed.map((listing) => listing.sellerUserId)));
  const appIds = Array.from(new Set(keyed.map((listing) => String(listing.animalId))));

  const [animals, certificates] = await Promise.all([
    db.animal.findMany({
      where: { ownerId: { in: owners }, appAnimalId: { in: appIds }, deletedAt: null },
      select: { id: true, ownerId: true, appAnimalId: true, payload: true },
    }),
    db.shedTestCertificate.findMany({
      where: { breederId: { in: owners }, animalAppId: { in: appIds } },
      orderBy: { issuedAt: "desc" },
      select: {
        breederId: true,
        animalAppId: true,
        certificateNumber: true,
        verificationCode: true,
        issuedAt: true,
        labOrganization: { select: { name: true } },
      },
    }),
  ]);

  const animalByKey = new Map<string, any>();
  animals.forEach((animal: any) => animalByKey.set(`${animal.ownerId}::${animal.appAnimalId}`, animal));

  const certByKey = new Map<string, any>();
  certificates.forEach((cert: any) => {
    const key = `${cert.breederId}::${cert.animalAppId}`;
    if (!certByKey.has(key)) certByKey.set(key, cert); // newest wins, list is desc
  });

  // Lineage needs the internal animal id, which we only have after the lookup.
  const animalIds = animals.map((animal: any) => animal.id);
  const parentRows = animalIds.length
    ? await db.parentRelationship.findMany({
        where: { childId: { in: animalIds } },
        select: { childId: true, role: true, parent: { select: { appAnimalId: true, name: true } } },
      })
    : [];

  const parentsByAnimal = new Map<string, Array<{ role: string; label: string }>>();
  parentRows.forEach((row: any) => {
    const list = parentsByAnimal.get(row.childId) || [];
    list.push({
      role: String(row.role || "parent"),
      label: row.parent?.name || row.parent?.appAnimalId || "Unknown",
    });
    parentsByAnimal.set(row.childId, list);
  });

  keyed.forEach((listing) => {
    const key = `${listing.sellerUserId}::${listing.animalId}`;
    const animal = animalByKey.get(key);
    const cert = certByKey.get(key);
    const settings = asRecord(listing.publicDataSettingsJson);
    const base = out.get(listing.id) || { ...EMPTY };

    const payload = asRecord(animal?.payload);
    const logs = asRecord(payload.logs);

    const weightEntries = asArray(logs.weights)
      .map((entry: any) => ({ date: toDate(entry), grams: toGrams(entry) }))
      .filter((entry): entry is { date: string; grams: number } => Boolean(entry.date && entry.grams))
      .sort((a, b) => a.date.localeCompare(b.date));

    const feeds = asArray(logs.feeds);
    const lastFeed = feeds
      .map((entry: any) => toDate(entry))
      .filter(Boolean)
      .sort()
      .pop() || null;
    const refusals = feeds.filter(
      (entry: any) => /refus|declin|no\s*feed/i.test(String(entry?.result || entry?.outcome || entry?.status || ""))
    ).length;

    const parents = parentsByAnimal.get(animal?.id) || [];
    const clutchId = payload.clutchId ? String(payload.clutchId) : null;

    const showWeights = settingOn(settings, "showWeightHistory");
    const showFeeding = settingOn(settings, "showFeedingHistory");
    const showLineage = settingOn(settings, "showLineage", "showParents");
    const showGenetics = settingOn(settings, "showGeneticTestResult");

    const flags: ProvenanceFlags = {
      photos: base.provenance.photos,
      weights: showWeights && weightEntries.length >= 3,
      lineage: showLineage && (parents.length > 0 || Boolean(clutchId)),
      verifiedGenetics: showGenetics && Boolean(cert),
    };

    out.set(listing.id, {
      provenance: { ...flags, filled: countFilled(flags) },
      weights: showWeights ? weightEntries.slice(-24) : [],
      feeding: showFeeding && feeds.length
        ? { count: feeds.length, lastFedAt: lastFeed, refusalsSince: refusals }
        : null,
      lineage: showLineage && (parents.length || clutchId) ? { clutchId, parents } : null,
      certificate: showGenetics && cert
        ? {
            certificateNumber: cert.certificateNumber,
            verificationCode: cert.verificationCode,
            issuedAt: cert.issuedAt,
            labName: cert.labOrganization?.name || null,
          }
        : null,
    });
  });

  return out;
};

export const buildListingRecord = async (listing: any): Promise<ListingRecord> => {
  const map = await buildListingRecords([listing]);
  return map.get(listing?.id) || EMPTY;
};

/**
 * What the seller could publish but has not. Powers the "publish the test"
 * prompt on the dashboard and the strength hint in the sell flow -- the system
 * can see an unpublished certificate and say so.
 */
export const findUnpublishedEvidence = async (listing: any): Promise<string[]> => {
  if (!listing?.animalId || !listing?.sellerUserId) return [];
  const settings = asRecord(listing.publicDataSettingsJson);
  const [animal, cert] = await Promise.all([
    db.animal.findFirst({
      where: { ownerId: listing.sellerUserId, appAnimalId: String(listing.animalId), deletedAt: null },
      select: { id: true, payload: true },
    }),
    db.shedTestCertificate.findFirst({
      where: { breederId: listing.sellerUserId, animalAppId: String(listing.animalId) },
      orderBy: { issuedAt: "desc" },
      select: { certificateNumber: true },
    }),
  ]);

  const missing: string[] = [];
  const logs = asRecord(asRecord(animal?.payload).logs);

  if (cert && !settingOn(settings, "showGeneticTestResult")) missing.push("geneticTest");
  if (asArray(logs.weights).length >= 3 && !settingOn(settings, "showWeightHistory")) missing.push("weightHistory");
  if (asArray(logs.feeds).length >= 3 && !settingOn(settings, "showFeedingHistory")) missing.push("feedingHistory");

  if (animal?.id && !settingOn(settings, "showLineage", "showParents")) {
    const parentCount = await db.parentRelationship.count({ where: { childId: animal.id } });
    if (parentCount > 0) missing.push("lineage");
  }

  return missing;
};
