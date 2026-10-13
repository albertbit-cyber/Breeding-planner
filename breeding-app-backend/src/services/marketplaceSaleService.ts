import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../types/auth";
import { HttpError } from "../utils/errors";
import { createNotification } from "./notificationService";
import { lockBreederAccount, stampServerEdit } from "./syncMerge";
import { parseGeneticClaims, withLabResults, geneKey, type GeneticClaim } from "./marketplaceGenetics";
import { summarizeTests, type CertifiedTestLine } from "./publicCertificateService";

/**
 * A sale that carries the record.
 *
 * On MorphMarket an animal's history does not travel with it; the buyer starts
 * a blank card. Here the seller marks a listing sold to a buyer and the buyer's
 * account receives a copy of the animal's record as it stood at the sale: the
 * genetics with where each claim comes from, the weights, feeds, sheds and
 * health entries, a lineage summary, and references to every shed-test
 * certificate the lab issued for it, each with the code /verify checks.
 *
 * Three rules shape this file:
 *
 *  - Provenance survives the transfer. A visual is observed, a het is predicted,
 *    and only the laboratory makes either lab-confirmed. The buyer's copy keeps
 *    the seller's morphs / hets / possibleHets exactly as they were; nothing
 *    moves from "possible het" to "het" on the way.
 *  - Only this animal travels. The seller's notes, groups, tags, pairings,
 *    other animals and other certificates stay with the seller. The copy is
 *    built field by field from an allowlist, never by spreading the payload.
 *  - The seller keeps their history. Their animal is marked Sold, not deleted,
 *    and its ownership history is closed rather than rewritten.
 */

const db = prisma as any;

export const ACQUISITION_SOURCE = "serpentora_marketplace";

/** Log kinds that are the animal's own record. `cleanings` is the seller's enclosure upkeep. */
const TRANSFERRED_LOGS = ["weights", "feeds", "sheds", "meds"] as const;

const MAX_LOG_ENTRIES = 500;
const MAX_PHOTOS = 12;

const VERIFY_BASE = String(process.env.CERTIFICATE_VERIFICATION_URL || "https://serpentora.com").replace(/\/$/, "");

type JsonRecord = Record<string, any>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, max = 500): string | null => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
};
const stringList = (value: unknown): string[] =>
  asArray(value)
    .map((entry) => text(entry, 160))
    .filter((entry): entry is string => Boolean(entry));

export type CertificateReference = {
  certificateNumber: string;
  verificationCode: string;
  issuedAt: string;
  labName: string | null;
  verifyUrl: string;
  /** Test and call, from the same allowlist the public verify page uses. */
  results: CertifiedTestLine[];
};

export type TransferredRecord = {
  geneticClaims: GeneticClaim[];
  certificates: CertificateReference[];
  lineage: { clutchId: string | null; parents: Array<{ role: string; label: string }> } | null;
  logs: Record<(typeof TRANSFERRED_LOGS)[number], any[]>;
};

/**
 * The seller's own genetics arrays, as claims. Possible hets are stored as
 * "66% Pied" or "Pied", so they are written back into the hobby's phrasing
 * before parsing; a bare possible het becomes "pos het", never "het".
 */
const claimsFromArrays = (payload: JsonRecord): GeneticClaim[] => {
  const morphs = stringList(payload.morphs);
  const hets = stringList(payload.hets).map((gene) => (/^het\s/i.test(gene) ? gene : `het ${gene}`));
  const possible = stringList(payload.possibleHets).map((entry) => {
    const bare = entry.replace(/^(possible|probable|maybe|pos\.?|poss\.?)\s+/i, "").replace(/^het\s+/i, "");
    const percent = bare.match(/^(\d{1,3})\s*%\s*(?:het\s+)?(.+)$/i);
    if (percent) return Number(percent[1]) >= 100 ? `het ${percent[2]}` : `${percent[1]}% het ${percent[2]}`;
    return `pos het ${bare}`;
  });
  return parseGeneticClaims([...morphs, ...hets, ...possible].join(", "));
};

/**
 * The laboratory's verdicts already written on the animal (labGeneticsRules).
 * A claim they support becomes lab-confirmed, with the marker named; anything
 * else keeps the provenance it had.
 */
const withConfirmationMarkers = (claims: GeneticClaim[], payload: JsonRecord): GeneticClaim[] => {
  const markers = asArray(asRecord(payload.labGeneticsConfirmation).markers);
  if (!markers.length) return claims;
  const byGene = new Map<string, string>();
  markers.forEach((marker: any) => {
    const gene = text(marker?.marker, 160);
    if (gene) byGene.set(geneKey(gene), String(marker?.outcome || ""));
  });
  return claims.map((claim) => {
    const outcome = byGene.get(geneKey(claim.gene));
    if (!outcome) return claim;
    const supports =
      (outcome === "positive" && claim.zygosity === "visual") ||
      (outcome === "carrierDetected" && claim.zygosity === "het");
    if (!supports) return claim;
    return {
      ...claim,
      provenance: "lab_confirmed" as const,
      lab: claim.lab || {
        call: outcome === "positive" ? ("visual" as const) : ("het" as const),
        result: outcome === "positive" ? claim.gene : `Het ${claim.gene}`,
        certificateNumber: null,
      },
    };
  });
};

const certificatesFor = async (sellerId: string, appAnimalId: string): Promise<CertificateReference[]> => {
  if (!db.shedTestCertificate?.findMany) return [];
  const rows = await db.shedTestCertificate.findMany({
    where: { breederId: sellerId, animalAppId: appAnimalId },
    orderBy: { issuedAt: "desc" },
    select: {
      animalAppId: true,
      resultId: true,
      certificateNumber: true,
      verificationCode: true,
      issuedAt: true,
      snapshotJson: true,
      labOrganization: { select: { name: true } },
    },
  });
  return rows.map((row: any) => {
    let results: CertifiedTestLine[] = [];
    try {
      results = summarizeTests(row.snapshotJson, row.resultId || null, String(row.animalAppId));
    } catch {
      results = [];
    }
    return {
      certificateNumber: row.certificateNumber,
      verificationCode: row.verificationCode,
      issuedAt: new Date(row.issuedAt).toISOString(),
      labName: row.labOrganization?.name || null,
      verifyUrl: `${VERIFY_BASE}/verify/${encodeURIComponent(row.verificationCode)}`,
      results,
    };
  });
};

const lineageFor = async (animal: any, payload: JsonRecord) => {
  const parents = animal?.id
    ? await db.parentRelationship.findMany({
        where: { childId: animal.id },
        select: { role: true, parent: { select: { appAnimalId: true, name: true } } },
      })
    : [];
  const clutchId = text(payload.clutchId, 160);
  const list = (parents || []).map((row: any) => ({
    role: String(row.role || "parent"),
    label: row.parent?.name || row.parent?.appAnimalId || "Unknown",
  }));
  return list.length || clutchId ? { clutchId, parents: list } : null;
};

/** The animal's own log entries, capped, each kind on its own. */
const logsOf = (payload: JsonRecord) => {
  const logs = asRecord(payload.logs);
  const out = {} as TransferredRecord["logs"];
  TRANSFERRED_LOGS.forEach((kind) => {
    out[kind] = asArray(logs[kind]).slice(-MAX_LOG_ENTRIES).map((entry) => (entry && typeof entry === "object" ? { ...entry } : entry));
  });
  return out;
};

/** Photo URLs only; embedded data URIs are the seller device's cache, not the record. */
const photosOf = (payload: JsonRecord): JsonRecord[] =>
  asArray(payload.photos)
    .map((photo) => (typeof photo === "string" ? { url: photo } : asRecord(photo)))
    .filter((photo) => typeof photo.url === "string" && photo.url && !photo.url.startsWith("data:"))
    .slice(-MAX_PHOTOS)
    .map((photo) => ({ id: photo.id, url: photo.url, takenAt: photo.takenAt, caption: photo.caption }));

/**
 * Builds the record that travels. Exported for tests and for the preview a
 * seller sees before confirming.
 */
export const buildTransferredRecord = async (listing: any, animal: any | null): Promise<TransferredRecord> => {
  const payload = asRecord(animal?.payload);
  const fromArrays = animal ? claimsFromArrays(payload) : [];
  // No linked animal record: the listing's own genetics line is all there is.
  const baseClaims = fromArrays.length ? fromArrays : parseGeneticClaims(listing?.genetics);
  const certificates = animal ? await certificatesFor(listing.sellerUserId, String(animal.appAnimalId)) : [];
  // Oldest first, so where two certificates speak to one gene the newer one
  // has the last word, and every claim names the certificate it rests on.
  const geneticClaims = [...certificates]
    .reverse()
    .reduce(
      (claims, certificate) => withLabResults(claims, certificate.results, certificate.certificateNumber),
      withConfirmationMarkers(baseClaims, payload)
    );
  return {
    geneticClaims,
    certificates,
    lineage: animal ? await lineageFor(animal, payload) : null,
    logs: animal ? logsOf(payload) : { weights: [], feeds: [], sheds: [], meds: [] },
  };
};

/** An id the buyer does not already use: the seller's own id when free, so the animal keeps its name. */
const freeAppAnimalId = async (tx: any, buyerUserId: string, preferred: string) => {
  const base = preferred.replace(/[^\w.-]+/g, "-").slice(0, 60) || "acquired";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await tx.animal.findUnique({
      where: { ownerId_appAnimalId: { ownerId: buyerUserId, appAnimalId: candidate } },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
};

const OPEN_SALE_STATES = ["inquiry", "offer", "reserved", "pending"];

export type MarkSoldInput = {
  listingId: string;
  buyerUserId: string;
  price?: number | null;
  handoverMethod?: string | null;
};

/**
 * Marks a listing sold to a marketplace buyer and gives the buyer the record.
 * Idempotent per sale: repeating it returns the animal already transferred.
 */
export const markSold = async (actor: AuthenticatedUser, input: MarkSoldInput) => {
  const listingId = text(input.listingId, 160);
  const buyerUserId = text(input.buyerUserId, 160);
  if (!listingId || !buyerUserId) throw new HttpError(400, "listingId and buyerUserId are required.");

  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    include: { seller: { select: { id: true, fullName: true, marketplaceStores: true } } },
  });
  if (!listing) throw new HttpError(404, "Marketplace listing not found.");
  if (actor.role !== "admin" && listing.sellerUserId !== actor.id) {
    throw new HttpError(403, "Only the seller can mark this animal sold.");
  }
  if (buyerUserId === listing.sellerUserId) throw new HttpError(400, "The buyer cannot be the seller.");

  const buyer = await db.user.findUnique({ where: { id: buyerUserId }, select: { id: true, fullName: true } });
  if (!buyer) throw new HttpError(404, "Buyer not found.");

  const sales = await db.marketplaceSale.findMany({ where: { listingId }, orderBy: { createdAt: "desc" } });
  const completed = sales.find((sale: any) => ["completed", "sold"].includes(String(sale.saleStatus)));
  if (completed && completed.buyerUserId !== buyerUserId) {
    throw new HttpError(409, "This animal is already recorded as sold to someone else.");
  }
  const open =
    completed ||
    sales.find((sale: any) => sale.buyerUserId === buyerUserId && OPEN_SALE_STATES.includes(String(sale.saleStatus))) ||
    null;

  if (completed) {
    const already = await findTransferredAnimal(buyerUserId, completed.id);
    if (already) return { sale: completed, animal: toAcquiredAnimalDto(already), alreadyTransferred: true };
  }

  const sellerAnimal = listing.animalId
    ? await db.animal.findFirst({
        where: { ownerId: listing.sellerUserId, appAnimalId: String(listing.animalId), deletedAt: null },
      })
    : null;
  const record = await buildTransferredRecord(listing, sellerAnimal);
  const sellerPayload = asRecord(sellerAnimal?.payload);
  const sellerName =
    listing.seller?.marketplaceStores?.[0]?.storeName || listing.seller?.fullName || "the seller";
  const priceValue = input.price === undefined || input.price === null || input.price === ("" as any)
    ? (open?.salePrice ?? listing.price ?? null)
    : Number(input.price);
  if (priceValue !== null && priceValue !== undefined && !Number.isFinite(Number(priceValue))) {
    throw new HttpError(400, "price must be a number.");
  }
  const now = new Date();

  const result = await db.$transaction(async (tx: any) => {
    const saleData = {
      saleStatus: "completed",
      paymentStatus: open?.paymentStatus && open.paymentStatus !== "pending" && open.paymentStatus !== "deposit_paid"
        ? open.paymentStatus
        : "paid",
      salePrice: priceValue === null || priceValue === undefined ? null : Number(priceValue),
      handoverDate: open?.handoverDate || now,
      handoverMethod: text(input.handoverMethod, 160) || open?.handoverMethod || null,
    };
    const sale = open
      ? await tx.marketplaceSale.update({ where: { id: open.id }, data: saleData })
      : await tx.marketplaceSale.create({
          data: {
            listingId,
            sellerUserId: listing.sellerUserId,
            buyerUserId,
            currency: listing.currency || "EUR",
            ...saleData,
          },
        });

    // The listing leaves Browse; it stays visible as a sold comparable.
    await tx.marketplaceListing.update({ where: { id: listingId }, data: { status: "sold", availability: "sold" } });

    // The seller's animal: kept, marked Sold, its ownership closed.
    let priorHistory: any[] = [];
    if (sellerAnimal) {
      // Re-read under the seller's sync lock, and stamp what the sale changes: written from the
      // copy read before the transaction, a device save in between was erased, and unstamped,
      // the seller's next sync from a device that had not seen the sale set it back to For sale.
      await lockBreederAccount(tx, listing.sellerUserId);
      const current = await tx.animal.findUnique({ where: { id: sellerAnimal.id } });
      const currentPayload = asRecord(current?.payload) || sellerPayload || {};
      await tx.animal.update({
        where: { id: sellerAnimal.id },
        data: {
          status: "Sold",
          payload: stampServerEdit(
            {
              ...currentPayload,
              status: "Sold",
              // The breeder app files a Sold animal in its archive and reads the sale's details
              // from here, so the archive record shows who bought it and for how much.
              soldVia: {
                source: ACQUISITION_SOURCE,
                saleId: sale.id,
                listingId,
                soldAt: now.toISOString(),
                buyerName: buyer.fullName || null,
                price: sale.salePrice ?? null,
                currency: sale.currency || listing.currency || null,
                handoverMethod: sale.handoverMethod || null,
              },
            },
            ["status", "soldVia"],
            now.toISOString(),
            current?.updatedAt,
          ),
        },
      });
      const history = await tx.ownershipHistory.findMany({
        where: { animalId: sellerAnimal.id },
        orderBy: { fromDate: "asc" },
      });
      const openSellerRow = history.find((row: any) => row.ownerId === listing.sellerUserId && !row.toDate);
      if (openSellerRow) {
        await tx.ownershipHistory.update({ where: { id: openSellerRow.id }, data: { toDate: now } });
      } else if (!history.some((row: any) => row.ownerId === listing.sellerUserId)) {
        await tx.ownershipHistory.create({
          data: {
            animalId: sellerAnimal.id,
            ownerId: listing.sellerUserId,
            ownerName: sellerName,
            fromDate: sellerAnimal.createdAt || now,
            toDate: now,
            transferType: "owned",
          },
        });
      }
      await tx.ownershipHistory.create({
        data: {
          animalId: sellerAnimal.id,
          ownerId: buyerUserId,
          ownerName: buyer.fullName || null,
          fromDate: now,
          transferType: "marketplace_sale",
          notes: `Sold on Serpentora Market (sale ${sale.id}).`,
        },
      });
      priorHistory = await tx.ownershipHistory.findMany({
        where: { animalId: sellerAnimal.id, ownerId: { not: buyerUserId } },
        orderBy: { fromDate: "asc" },
      });
    }

    // The buyer's copy, built field by field. Nothing from the seller's
    // payload is spread in: notes, groups, tags and pairing links stay behind.
    const appAnimalId = await freeAppAnimalId(tx, buyerUserId, String(sellerAnimal?.appAnimalId || listing.animalId || `mp-${sale.id}`));
    const buyerPayload: JsonRecord = {
      id: appAnimalId,
      name: text(sellerPayload.name, 160) || sellerAnimal?.name || listing.title,
      sex: sellerPayload.sex || sellerAnimal?.sex || listing.sex || "",
      species: sellerPayload.species || sellerAnimal?.species || listing.species || "",
      morphs: stringList(sellerPayload.morphs),
      hets: stringList(sellerPayload.hets),
      possibleHets: stringList(sellerPayload.possibleHets),
      weight: sellerPayload.weight ?? (listing.weight === null || listing.weight === undefined ? undefined : Number(listing.weight)),
      year: sellerPayload.year ?? listing.year ?? undefined,
      birthDate: sellerPayload.birthDate || sellerPayload.hatchDate || (listing.birthDate ? new Date(listing.birthDate).toISOString().slice(0, 10) : undefined),
      status: "Active",
      tags: ["Acquired"],
      groups: [],
      notes: "",
      photos: photosOf(sellerPayload),
      logs: { ...record.logs, cleanings: [] },
      // The lab's verdicts, so the sync keeps re-asserting them on the buyer's devices too.
      ...(sellerPayload.labGeneticsConfirmation ? { labGeneticsConfirmation: sellerPayload.labGeneticsConfirmation } : {}),
      acquiredFrom: {
        source: ACQUISITION_SOURCE,
        saleId: sale.id,
        listingId,
        sellerUserId: listing.sellerUserId,
        sellerName,
        sellerAnimalId: sellerAnimal?.appAnimalId || listing.animalId || null,
        acquiredAt: now.toISOString(),
        price: sale.salePrice === null || sale.salePrice === undefined ? null : Number(sale.salePrice),
        currency: sale.currency || listing.currency || "EUR",
        advertisedGenetics: listing.genetics || "",
        recordSnapshotAt: now.toISOString(),
      },
      geneticClaims: record.geneticClaims,
      certificates: record.certificates,
      lineage: record.lineage,
    };
    const primary = buyerPayload.photos.length ? buyerPayload.photos[buyerPayload.photos.length - 1].url : undefined;
    if (primary) buyerPayload.imageUrl = primary;

    const buyerAnimal = await tx.animal.create({
      data: {
        ownerId: buyerUserId,
        appAnimalId,
        name: buyerPayload.name,
        sex: text(buyerPayload.sex, 40),
        species: text(buyerPayload.species, 120),
        status: "Active",
        payload: buyerPayload,
      },
    });

    // The chain of custody, ending with the buyer's open row.
    for (const row of priorHistory) {
      await tx.ownershipHistory.create({
        data: {
          animalId: buyerAnimal.id,
          ownerId: row.ownerId,
          ownerName: row.ownerName,
          fromDate: row.fromDate,
          toDate: row.toDate || now,
          transferType: row.transferType,
          notes: row.notes,
        },
      });
    }
    if (!priorHistory.length) {
      await tx.ownershipHistory.create({
        data: {
          animalId: buyerAnimal.id,
          ownerId: listing.sellerUserId,
          ownerName: sellerName,
          fromDate: sellerAnimal?.createdAt || listing.createdAt || now,
          toDate: now,
          transferType: "owned",
        },
      });
    }
    await tx.ownershipHistory.create({
      data: {
        animalId: buyerAnimal.id,
        ownerId: buyerUserId,
        ownerName: buyer.fullName || null,
        fromDate: now,
        transferType: "marketplace_purchase",
        notes: `Acquired from ${sellerName} on Serpentora Market.`,
      },
    });

    const conversation = await tx.marketplaceConversation.findFirst({
      where: { listingId, buyerUserId },
      select: { id: true },
    });
    if (conversation) {
      await tx.marketplaceMessage.create({
        data: {
          conversationId: conversation.id,
          senderUserId: actor.id,
          messageText: "Handed over. The sale is complete, and the animal's record is now in your account.",
        },
      });
      await tx.marketplaceConversation.update({
        where: { id: conversation.id },
        data: { status: "completed", lastMessageAt: now },
      });
    }

    return { sale, buyerAnimal };
  });

  await createNotification({
    recipientId: buyerUserId,
    actorId: actor.id,
    type: "marketplace_sale_completed",
    title: "Your purchase is complete",
    message: `${listing.title} and its record are now in your account. You can also review ${sellerName}.`,
    metadata: { saleId: result.sale.id, listingId, animalId: result.buyerAnimal.appAnimalId },
  });

  return { sale: result.sale, animal: toAcquiredAnimalDto(result.buyerAnimal), alreadyTransferred: false };
};

const findTransferredAnimal = async (buyerUserId: string, saleId: string) =>
  db.animal.findFirst({
    where: { ownerId: buyerUserId, deletedAt: null, payload: { path: ["acquiredFrom", "saleId"], equals: saleId } },
  });

/** What the buyer's acquired-animals view needs. Read from the buyer's own row only. */
export const toAcquiredAnimalDto = (row: any) => {
  const payload = asRecord(row?.payload);
  const from = asRecord(payload.acquiredFrom);
  const logs = asRecord(payload.logs);
  const weights = asArray(logs.weights);
  return {
    id: row?.id,
    appAnimalId: row?.appAnimalId,
    name: payload.name || row?.name || row?.appAnimalId,
    sex: payload.sex || row?.sex || "",
    species: payload.species || row?.species || "",
    imageUrl: payload.imageUrl || "",
    acquiredFrom: {
      sellerName: from.sellerName || "",
      sellerUserId: from.sellerUserId || null,
      listingId: from.listingId || null,
      saleId: from.saleId || null,
      acquiredAt: from.acquiredAt || null,
      price: from.price ?? null,
      currency: from.currency || "EUR",
      advertisedGenetics: from.advertisedGenetics || "",
    },
    geneticClaims: asArray(payload.geneticClaims),
    certificates: asArray(payload.certificates).map((certificate: any) => ({
      certificateNumber: certificate?.certificateNumber,
      verificationCode: certificate?.verificationCode,
      issuedAt: certificate?.issuedAt,
      labName: certificate?.labName || null,
      verifyUrl: certificate?.verifyUrl,
      results: asArray(certificate?.results),
    })),
    lineage: payload.lineage || null,
    counts: {
      weights: weights.length,
      feeds: asArray(logs.feeds).length,
      sheds: asArray(logs.sheds).length,
      meds: asArray(logs.meds).length,
    },
    latestWeight: weights.length ? weights[weights.length - 1] : null,
  };
};

/** Every animal this account received through a marketplace sale. */
export const listAcquiredAnimals = async (actor: AuthenticatedUser) => {
  const rows = await db.animal.findMany({
    where: {
      ownerId: actor.id,
      deletedAt: null,
      payload: { path: ["acquiredFrom", "source"], equals: ACQUISITION_SOURCE },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { animals: rows.map(toAcquiredAnimalDto) };
};
