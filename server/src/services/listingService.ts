import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { createNotification } from "./notificationService";
import { canAccessFeature } from "./subscriptionService";

type JsonRecord = Record<string, unknown>;

export type ListingPayload = {
  listings?: unknown[];
};

const db = prisma as any;

const asRecord = (value: unknown): JsonRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
};

const textValue = (value: unknown, maxLength = 500): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
};

const centsValue = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
};

const requireListingId = (record: JsonRecord, index: number): string =>
  textValue(record.id, 120) || textValue(record.appListingId, 120) || `listing-${index + 1}`;

const normalizeListings = (value: unknown): JsonRecord[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new HttpError(400, "listings must be an array.");
  return value.map(asRecord).filter((item): item is JsonRecord => !!item);
};

const assertCanManageListings = async (ownerId: string) => {
  const user = await db.user.findUnique({ where: { id: ownerId }, select: { id: true, role: true } });
  if (!user) throw new HttpError(404, "User not found.");
  if (user.role !== "breeder" && user.role !== "admin") {
    throw new HttpError(403, "Only breeder or admin users can manage listings.");
  }
  const access = await canAccessFeature({ id: user.id, role: user.role }, "marketplace.create_listing");
  if (!access.allowed) throw new HttpError(403, access.reason || "Your subscription tier does not include marketplace selling.");
};

const toPublicListing = (row: any) => {
  if (!row) return null;
  return {
    ...(row.payload && typeof row.payload === "object" ? row.payload : {}),
    id: row.appListingId,
    rowId: row.id,
    ownerId: row.ownerId,
    animalAppId: row.animalAppId,
    title: row.title,
    status: row.status,
    priceCents: row.priceCents,
    currency: row.currency,
    updatedAt: row.updatedAt,
  };
};

const assertAdmin = (actor: { role: string }) => {
  if (actor.role !== "admin") {
    throw new HttpError(403, "Only admin users can moderate marketplace listings.");
  }
};

export const listMyListings = async (ownerId: string) => {
  await assertCanManageListings(ownerId);
  const rows = await db.listing.findMany({
    where: { ownerId },
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map(toPublicListing).filter(Boolean);
};

export const replaceMyListings = async (ownerId: string, input: ListingPayload) => {
  await assertCanManageListings(ownerId);
  const listings = normalizeListings(input?.listings);

  await db.$transaction(async (tx: any) => {
    await tx.listing.deleteMany({ where: { ownerId } });

    for (const [index, listing] of listings.entries()) {
      const appListingId = requireListingId(listing, index);
      const title = textValue(listing.title, 160) || textValue(listing.name, 160) || `Listing ${index + 1}`;
      const status = textValue(listing.status, 40) || "draft";
      await tx.listing.create({
        data: {
          ownerId,
          appListingId,
          animalAppId: textValue(listing.animalAppId, 120) || textValue(listing.animalId, 120),
          title,
          status,
          priceCents: centsValue(listing.price),
          currency: textValue(listing.currency, 12) || "EUR",
          payload: { ...listing, id: appListingId, title, status },
        },
      });
    }
  });

  return listMyListings(ownerId);
};

export const listPublicListingsByOwner = async (ownerId: string) => {
  const rows = await db.listing.findMany({
    where: { ownerId, status: "available" },
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map(toPublicListing).filter(Boolean);
};

export const listPublicMarketplaceListings = async () => {
  const rows = await db.listing.findMany({
    where: {
      status: "available",
      owner: {
        isActive: true,
        role: { in: ["breeder", "admin"] },
        profile: { isPublic: true },
      },
    },
    include: {
      owner: {
        select: {
          id: true,
          fullName: true,
          email: true,
          profile: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return rows.map((row: any) => ({
    ...toPublicListing(row),
    breeder: row.owner?.profile
      ? {
          userId: row.owner.id,
          breederName: row.owner.profile.breederName || row.owner.fullName,
          location: row.owner.profile.location,
          publicContactEmail: row.owner.profile.publicContactEmail,
          publicContactPhone: row.owner.profile.publicContactPhone,
          contactPreference: row.owner.profile.contactPreference,
        }
      : undefined,
  })).filter(Boolean);
};

export const listModerationListings = async (actor: { role: string }) => {
  assertAdmin(actor);
  const rows = await db.listing.findMany({
    include: {
      owner: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          profile: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return rows.map((row: any) => ({
    ...toPublicListing(row),
    breeder: row.owner
      ? {
          userId: row.owner.id,
          fullName: row.owner.fullName,
          email: row.owner.email,
          role: row.owner.role,
          breederName: row.owner.profile?.breederName || row.owner.fullName,
          isPublic: row.owner.profile?.isPublic === true,
        }
      : undefined,
  })).filter(Boolean);
};

export const listModerationAudit = async (actor: { role: string }) => {
  assertAdmin(actor);
  const rows = await db.listingModerationAudit.findMany({
    include: {
      listing: {
        select: {
          id: true,
          appListingId: true,
          title: true,
          owner: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      },
      actor: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  return rows.map((row: any) => ({
    id: row.id,
    listingId: row.listing?.appListingId || row.listingId,
    listingRowId: row.listingId,
    listingTitle: row.listing?.title,
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    note: row.note,
    createdAt: row.createdAt,
    breeder: row.listing?.owner
      ? {
          userId: row.listing.owner.id,
          fullName: row.listing.owner.fullName,
          email: row.listing.owner.email,
        }
      : undefined,
    actor: row.actor
      ? {
          id: row.actor.id,
          fullName: row.actor.fullName,
          email: row.actor.email,
          role: row.actor.role,
        }
      : undefined,
  }));
};

export const updateListingModerationStatus = async (
  actor: { id?: string; role: string },
  listingId: string,
  statusInput: unknown,
  noteInput?: unknown
) => {
  assertAdmin(actor);
  const id = textValue(listingId, 160);
  const status = textValue(statusInput, 40);
  const allowed = new Set(["draft", "available", "reserved", "sold", "hidden"]);
  if (!id) throw new HttpError(400, "listingId is required.");
  if (!status || !allowed.has(status)) {
    throw new HttpError(400, "Invalid listing status.");
  }

  const existing = await db.listing.findFirst({
    where: { OR: [{ id }, { appListingId: id }] },
  });
  if (!existing) throw new HttpError(404, "Listing not found.");
  const note = textValue(noteInput, 1000);

  const payload = existing.payload && typeof existing.payload === "object"
    ? { ...existing.payload, status }
    : { status };

  const row = await db.listing.update({
    where: { id: existing.id },
    data: { status, payload },
    include: {
      owner: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          profile: true,
        },
      },
    },
  });

  await db.listingModerationAudit.create({
    data: {
      listingId: row.id,
      actorId: actor.id || null,
      previousStatus: existing.status,
      newStatus: status,
      note,
    },
  });

  await createNotification({
    recipientId: row.ownerId,
    actorId: actor.id || null,
    type: "listing_status_changed",
    title: "Listing status changed",
    message: `${row.title || "Your listing"} is now ${status}.`,
    metadata: {
      listingId: row.id,
      appListingId: row.appListingId,
      status,
    },
  });

  return {
    ...toPublicListing(row),
    breeder: row.owner
      ? {
          userId: row.owner.id,
          fullName: row.owner.fullName,
          email: row.owner.email,
          role: row.owner.role,
          breederName: row.owner.profile?.breederName || row.owner.fullName,
          isPublic: row.owner.profile?.isPublic === true,
        }
      : undefined,
  };
};
