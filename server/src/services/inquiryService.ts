import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AppRole } from "../types/auth";
import { createNotification } from "./notificationService";

type InquiryInput = {
  listingId?: unknown;
  buyerName?: unknown;
  buyerEmail?: unknown;
  message?: unknown;
};

type InquiryUpdateInput = {
  status?: unknown;
  breederResponseNote?: unknown;
};

const INQUIRY_STATUSES = new Set(["new", "contacted", "in_discussion", "closed"]);

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
  breederResponseNote: row.breederResponseNote,
  respondedAt: row.respondedAt,
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

  await createNotification({
    recipientId: listing.ownerId,
    actorId: actor.id,
    type: "listing_inquiry",
    title: "New listing inquiry",
    message: `${buyerName} asked about ${listing.title || "your listing"}.`,
    metadata: {
      inquiryId: inquiry.id,
      listingId: listing.id,
      appListingId: listing.appListingId,
    },
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

export const updateInquiryFollowUp = async (
  actor: { id: string; role: AppRole },
  inquiryId: string,
  input: InquiryUpdateInput
) => {
  const id = textValue(inquiryId, 160);
  if (!id) throw new HttpError(400, "inquiryId is required.");

  const inquiry = await db.listingInquiry.findUnique({
    where: { id },
    include: { listing: true },
  });
  if (!inquiry) throw new HttpError(404, "Inquiry not found.");
  if (actor.role !== "admin" && inquiry.breederId !== actor.id) {
    throw new HttpError(403, "Only the receiving breeder or admin can update this inquiry.");
  }

  const status = textValue(input?.status, 40) || inquiry.status;
  if (!INQUIRY_STATUSES.has(status)) {
    throw new HttpError(400, "Invalid inquiry status.");
  }
  const breederResponseNote = textValue(input?.breederResponseNote, 2000);
  const hasResponse = Boolean(breederResponseNote);

  const updated = await db.listingInquiry.update({
    where: { id },
    data: {
      status,
      breederResponseNote: hasResponse ? breederResponseNote : null,
      respondedAt: hasResponse ? new Date() : null,
    },
    include: { listing: true },
  });

  if (updated.buyerId) {
    await createNotification({
      recipientId: updated.buyerId,
      actorId: actor.id,
      type: "inquiry_follow_up",
      title: "Inquiry updated",
      message: `Your inquiry about ${updated.listing?.title || "a listing"} was updated.`,
      metadata: {
        inquiryId: updated.id,
        listingId: updated.listingId,
        status: updated.status,
      },
    });
  }

  return toPublicInquiry(updated);
};
