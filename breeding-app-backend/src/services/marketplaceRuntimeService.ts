import { prisma } from "../lib/prisma";
import { isListingPublic } from "./marketplaceVisibility";
import type { AuthenticatedUser } from "../types/auth";
import { HttpError } from "../utils/errors";
import { assertOwnerOrAdmin, assertSellerActor } from "./permissionHelpers";
import { recordSecurityEvent } from "./securityEventService";
import { uploadStorage } from "./uploadStorageService";
import { validateMarketplaceUpload } from "./uploadValidationService";

const db = prisma as any;

const text = (value: unknown, max = 1000): string | null => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
};

const assertMarketplaceSeller = (actor: AuthenticatedUser) => {
  try {
    assertSellerActor(actor);
  } catch {
    throw new HttpError(403, "Only breeder or admin users can upload marketplace media.");
  }
};

const parseBase64Upload = (payload: Record<string, unknown>): Buffer => {
  const raw = String(payload.dataBase64 || payload.fileBase64 || payload.base64 || "").trim();
  if (!raw) throw new HttpError(400, "dataBase64 is required.");
  const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  if (!/^[a-zA-Z0-9+/=\s]+$/.test(base64)) throw new HttpError(400, "Upload data must be base64 encoded.");
  const buffer = Buffer.from(base64.replace(/\s+/g, ""), "base64");
  if (!buffer.length) throw new HttpError(400, "Upload file is empty.");
  return buffer;
};

const toMarketplaceMediaDto = (media: any) => ({
  id: media.id,
  ownerUserId: media.ownerUserId,
  listingId: media.listingId,
  storageKey: media.storageKey,
  originalName: media.originalName,
  mimeType: media.mimeType,
  sizeBytes: media.sizeBytes,
  checksum: media.checksum,
  status: media.status,
  scanStatus: media.scanStatus,
  // Uploads used to be written to storage and then left unreachable: publicUrl
  // was always null and no route served the bytes back, so the listing editor
  // could not show what a breeder had just uploaded. The read path is derived
  // from the media id rather than stored, which leaves the column free for a
  // CDN URL later without a migration or a second write on every upload.
  publicUrl: media.publicUrl || `/marketplace/media/${media.id}`,
  createdAt: media.createdAt,
  updatedAt: media.updatedAt,
});

const assertMessageParticipant = (actor: AuthenticatedUser, conversation: any) => {
  if (
    actor.role !== "admin" &&
    conversation?.buyerUserId !== actor.id &&
    conversation?.sellerUserId !== actor.id
  ) {
    throw new HttpError(403, "You cannot access this marketplace message.");
  }
};

export const createMarketplaceMediaUpload = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  assertMarketplaceSeller(actor);

  const listingId = text(payload.listingId, 160);
  if (listingId) {
    const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new HttpError(404, "Marketplace listing not found.");
    assertOwnerOrAdmin(actor, listing.sellerUserId, "You cannot upload media to this listing.");
  }

  const buffer = parseBase64Upload(payload);
  const validation = validateMarketplaceUpload(buffer);
  if (!validation.ok || !validation.mimeType) {
    throw new HttpError(400, validation.reason || "Upload failed validation.");
  }

  const originalName = text(payload.originalName || payload.fileName || payload.name, 240) || "marketplace-upload";
  const stored = await uploadStorage.putObject({ ownerUserId: actor.id, buffer, originalName });
  const media = await db.marketplaceMedia.create({
    data: {
      ownerUserId: actor.id,
      listingId,
      storageKey: stored.storageKey,
      originalName,
      mimeType: validation.mimeType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      status: "ready",
      scanStatus: validation.scanStatus,
      publicUrl: null,
    },
  });


  await recordSecurityEvent({
    type: "marketplace_upload_created",
    actorUserId: actor.id,
    outcome: "success",
    metadata: { mediaId: media.id, listingId, sizeBytes: stored.sizeBytes, mimeType: validation.mimeType },
  });

  return { media: toMarketplaceMediaDto(media) };
};

/**
 * Serves an uploaded image. Media attached to a published listing is public --
 * a buyer has to be able to see the photos without an account. Anything else
 * is readable only by its owner or an admin.
 */
export const readMarketplaceMediaObject = async (
  mediaId: string,
  actor: AuthenticatedUser | null
): Promise<{ buffer: Buffer; mimeType: string }> => {
  const media = await db.marketplaceMedia.findUnique({
    where: { id: mediaId },
    include: { listing: { select: { status: true, archivedAt: true } } },
  });
  if (!media) throw new HttpError(404, "Marketplace media not found.");

  // The same rule as the listing's own page: a hidden listing's photos used to
  // stay public because only "draft" was excluded here.
  const listingIsPublic = isListingPublic(media.listing);
  const isOwner = Boolean(actor && (actor.id === media.ownerUserId || actor.role === "admin"));
  if (!listingIsPublic && !isOwner) throw new HttpError(404, "Marketplace media not found.");
  if (media.status !== "ready" || media.scanStatus === "infected") {
    throw new HttpError(404, "Marketplace media not found.");
  }

  const buffer = await uploadStorage.getObject(media.storageKey).catch(() => null);
  if (!buffer) throw new HttpError(404, "Marketplace media not found.");
  return { buffer, mimeType: media.mimeType || "application/octet-stream" };
};

export const listMyMarketplaceMedia = async (actor: AuthenticatedUser) => {
  const rows = await db.marketplaceMedia.findMany({
    where: { ownerUserId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { media: rows.map(toMarketplaceMediaDto) };
};

/**
 * The categories a marketplace user can report under, mapped onto the admin
 * console's report types so the moderation queue can filter them.
 */
const MESSAGE_REPORT_TYPES = new Set(["abusive_message", "scam_suspicion", "spam", "other"]);
const LISTING_REPORT_TYPES = new Set([
  "fake_listing",
  "incorrect_genetics",
  "scam_suspicion",
  "animal_welfare_concern",
  "spam",
  "other",
]);

const reportType = (value: unknown, allowed: Set<string>, fallback: string): string => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
};

/**
 * A reported message used to be written to `marketplace_message_reports` and
 * nowhere else -- a table no screen reads, so a buyer reporting a scam was
 * reporting it to nobody. It now also opens a case in the admin console's
 * report queue, which is where moderators actually work.
 */
export const reportMarketplaceMessage = async (
  actor: AuthenticatedUser,
  messageId: string,
  payload: Record<string, unknown>
) => {
  const message = await db.marketplaceMessage.findUnique({
    where: { id: messageId },
    include: { conversation: true },
  });
  if (!message) throw new HttpError(404, "Marketplace message not found.");
  assertMessageParticipant(actor, message.conversation);
  if (message.senderUserId === actor.id) throw new HttpError(400, "You cannot report your own message.");

  const type = reportType(payload.type || payload.category, MESSAGE_REPORT_TYPES, "other");
  const note = text(payload.note || payload.description, 2000);
  const reason = text(payload.reason, 240) || type;

  const report = await db.marketplaceMessageReport.create({
    data: {
      messageId,
      reporterUserId: actor.id,
      reason,
      note,
      status: "open",
    },
  });

  const moderation = await db.report.create({
    data: {
      reporterUserId: actor.id,
      reportedUserId: message.senderUserId || null,
      relatedMessageId: messageId,
      type,
      status: "open",
      description: [
        `Marketplace message in conversation ${message.conversationId} (listing ${message.conversation?.listingId || "unknown"}).`,
        `Reason: ${reason}.`,
        note ? `Reporter's note: ${note}` : null,
        `Reported message: "${String(message.messageText || "").slice(0, 500)}"`,
      ]
        .filter(Boolean)
        .join(" "),
    },
  });

  await recordSecurityEvent({
    type: "marketplace_message_reported",
    actorUserId: actor.id,
    outcome: "success",
    metadata: { messageId, reportId: report.id, moderationReportId: moderation.id, conversationId: message.conversationId },
  });

  return { report: { id: report.id, status: report.status, moderationReportId: moderation.id } };
};

/**
 * Reporting a listing. The button used to thank the visitor and record
 * nothing. The case names the listing and its seller, so the console's
 * "remove listing" action has a live listing to take down.
 */
export const reportMarketplaceListing = async (
  actor: AuthenticatedUser,
  listingId: string,
  payload: Record<string, unknown>
) => {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    select: { id: true, title: true, sellerUserId: true, genetics: true },
  });
  if (!listing) throw new HttpError(404, "Marketplace listing not found.");
  if (listing.sellerUserId === actor.id) throw new HttpError(400, "You cannot report your own listing.");

  const type = reportType(payload.type || payload.category, LISTING_REPORT_TYPES, "other");
  const note = text(payload.note || payload.description, 2000);


  // One open case per reporter per listing; pressing the button twice is not
  // two reports.
  const existing = await db.report.findFirst({
    where: { reporterUserId: actor.id, status: "open", relatedMarketplaceListingId: listing.id },
    select: { id: true, status: true },
  });
  if (existing) return { report: existing, duplicate: true };

  const report = await db.report.create({
    data: {
      reporterUserId: actor.id,
      reportedUserId: listing.sellerUserId,
      relatedMarketplaceListingId: listing.id,
      type,
      status: "open",
      description: [
        `Marketplace listing "${listing.title}" (${listing.id}).`,
        listing.genetics ? `Listed genetics: ${listing.genetics}.` : null,
        note ? `Reporter's note: ${note}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
    select: { id: true, status: true },
  });

  await recordSecurityEvent({
    type: "marketplace_listing_reported",
    actorUserId: actor.id,
    outcome: "success",
    metadata: { listingId, reportId: report.id, type },
  });

  return { report, duplicate: false };
};

export const blockMarketplaceUser = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  const blockedUserId = text(payload.blockedUserId || payload.userId, 160);
  if (!blockedUserId) throw new HttpError(400, "blockedUserId is required.");
  if (blockedUserId === actor.id) throw new HttpError(400, "You cannot block yourself.");

  const user = await db.user.findUnique({ where: { id: blockedUserId }, select: { id: true } });
  if (!user) throw new HttpError(404, "User not found.");

  const block = await db.marketplaceUserBlock.upsert({
    where: { blockerUserId_blockedUserId: { blockerUserId: actor.id, blockedUserId } },
    create: {
      blockerUserId: actor.id,
      blockedUserId,
      reason: text(payload.reason, 2000),
    },
    update: {
      reason: text(payload.reason, 2000),
    },
  });

  await recordSecurityEvent({
    type: "marketplace_user_blocked",
    actorUserId: actor.id,
    outcome: "success",
    metadata: { blockedUserId, blockId: block.id },
  });

  return { block };
};

export const unblockMarketplaceUser = async (actor: AuthenticatedUser, blockedUserId: string) => {
  const result = await db.marketplaceUserBlock.deleteMany({
    where: { blockerUserId: actor.id, blockedUserId },
  });
  await recordSecurityEvent({
    type: "marketplace_user_unblocked",
    actorUserId: actor.id,
    outcome: "success",
    metadata: { blockedUserId, deleted: result.count || 0 },
  });
  return { deleted: result.count || 0 };
};

export const listMyMarketplaceBlocks = async (actor: AuthenticatedUser) => {
  const blocks = await db.marketplaceUserBlock.findMany({
    where: { blockerUserId: actor.id },
    include: { blocked: { select: { id: true, fullName: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { blocks };
};
