import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AppRole } from "../types/auth";

type InquiryInput = {
  listingId?: unknown;
  buyerName?: unknown;
  buyerEmail?: unknown;
  message?: unknown;
};

const db = prisma as any;

const textValue = (value: unknown, maxLength = 1000): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, maxLength);
};

const toPublicInquiry = (row: any) => ({
  id: row.id,
  listingId: row.listing?.appListingId || row.listingId,
  listingRowId: row.listingId,
  listingTitle: row.listing?.title,
  breederId: row.breederId,
  buyerId: row.buyerId,
  buyerName: row.buyerName,
  buyerEmail: row.buyerEmail,
  message: row.message,
  status: row.status,
  createdAt: row.createdAt,
});

export const createListingInquiry = async (
  actor: { id: string; role: AppRole },
  input: InquiryInput
) => {
  const listingId = textValue(input?.listingId, 160);
  const buyerName = textValue(input?.buyerName, 160);
  const buyerEmail = textValue(input?.buyerEmail, 180).toLowerCase();
  const message = textValue(input?.message, 2000);

  if (!listingId) throw new HttpError(400, "listingId is required.");
  if (!buyerName) throw new HttpError(400, "buyerName is required.");
  if (!buyerEmail || !buyerEmail.includes("@")) throw new HttpError(400, "A valid buyerEmail is required.");
  if (message.length < 10) throw new HttpError(400, "message must be at least 10 characters.");

  const listing = await db.listing.findFirst({
    where: {
      OR: [{ id: listingId }, { appListingId: listingId }],
      status: "available",
      owner: {
        isActive: true,
        profile: { isPublic: true },
      },
    },
  });
  if (!listing) throw new HttpError(404, "Available listing not found.");
  if (listing.ownerId === actor.id) {
    throw new HttpError(400, "You cannot inquire about your own listing.");
  }

  const inquiry = await db.listingInquiry.create({
    data: {
      listingId: listing.id,
      breederId: listing.ownerId,
      buyerId: actor.id,
      buyerName,
      buyerEmail,
      message,
      status: "new",
    },
    include: { listing: true },
  });

  return toPublicInquiry(inquiry);
};

export const listMyInquiries = async (actor: { id: string; role: AppRole }) => {
  const where = actor.role === "admin"
    ? {}
    : actor.role === "breeder"
      ? { breederId: actor.id }
      : { buyerId: actor.id };

  const rows = await db.listingInquiry.findMany({
    where,
    include: { listing: true },
    orderBy: [{ createdAt: "desc" }],
  });

  return rows.map(toPublicInquiry);
};
