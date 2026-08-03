import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { recordSecurityEvent } from "./securityEventService";

/**
 * Right to data portability (GDPR Art. 20): everything we hold that is about
 * this person, in one machine-readable file.
 *
 * Two rules govern what goes in here, and they pull in opposite directions:
 *
 *  - Include everything about *them*. Art. 20 is not satisfied by a partial
 *    dump of the convenient tables. If a column is keyed to their user id, it
 *    belongs in the export.
 *
 *  - Exclude anything that would leak a *third party*. A subject access request
 *    is not a mechanism for extracting other people's data. This is why the
 *    marketplace conversation export carries only the counterparty's user id and
 *    not their profile, and why admin notes on reports and verification requests
 *    are omitted — those are the reviewer's words about the case, and releasing
 *    them wholesale would expose both staff identities and other users.
 *
 * Credentials are never exported: password hashes, refresh-token hashes and
 * account tokens are authentication material, not personal data the subject has
 * any use for, and putting them in a file that lands in a Downloads folder would
 * be actively harmful.
 */

export const ACCOUNT_EXPORT_FORMAT_VERSION = 1;

/** Tables whose rows are keyed to the user and are wholly theirs. */
const collectOwnRecords = async (userId: string) => {
  const [
    profile,
    animals,
    pairings,
    clutches,
    plannerState,
    reproductiveCycles,
    listings,
    savedSearches,
    notificationPreferences,
    marketplaceListings,
    marketplaceStores,
    marketplaceFavorites,
    labOrders,
    usageTracking,
    deviceSessions,
    mobileScanLogs,
    subscriptions,
  ] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.animal.findMany({ where: { ownerId: userId } }),
    prisma.pairing.findMany({ where: { ownerId: userId } }),
    prisma.clutch.findMany({ where: { ownerId: userId } }),
    prisma.breederPlannerState.findUnique({ where: { ownerId: userId } }),
    (prisma as any).reproductiveCycle.findMany({ where: { ownerId: userId } }),
    prisma.listing.findMany({ where: { ownerId: userId } }),
    prisma.savedSearch.findMany({ where: { ownerId: userId } }),
    (prisma as any).notificationPreference.findMany({ where: { userId } }),
    (prisma as any).marketplaceListing.findMany({ where: { sellerUserId: userId } }),
    (prisma as any).marketplaceStore.findMany({ where: { userId } }),
    (prisma as any).marketplaceFavorite.findMany({ where: { userId } }),
    (prisma as any).shedTestOrder.findMany({
      where: { breederId: userId },
      include: { animals: true, results: true },
    }),
    (prisma as any).usageTracking.findMany({ where: { userId } }),
    (prisma as any).userDeviceSession.findMany({
      where: { userId },
      // pushToken is a credential for addressing the device, not useful to the
      // subject, and is deliberately not selected.
      select: { id: true, deviceId: true, deviceName: true, platform: true, lastSeenAt: true, createdAt: true },
    }),
    (prisma as any).mobileScanLog.findMany({ where: { userId } }),
    (prisma as any).userSubscription.findMany({ where: { userId } }),
  ]);

  return {
    profile,
    animals,
    pairings,
    clutches,
    plannerState,
    reproductiveCycles,
    listings,
    savedSearches,
    notificationPreferences,
    marketplaceListings,
    marketplaceStores,
    marketplaceFavorites,
    labOrders,
    usageTracking,
    deviceSessions,
    mobileScanLogs,
    subscriptions,
  };
};

/**
 * Records with another person on the other side. The subject's own contribution
 * is exported in full; the counterparty is reduced to an opaque id.
 */
const collectSharedRecords = async (userId: string) => {
  const [conversations, sales, purchases, reviewsWritten, reviewsReceived, inquiriesSent, inquiriesReceived] =
    await Promise.all([
      (prisma as any).marketplaceConversation.findMany({
        where: { OR: [{ buyerUserId: userId }, { sellerUserId: userId }] },
        include: {
          messages: {
            select: { id: true, senderUserId: true, messageText: true, offerAmount: true, createdAt: true, readAt: true },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      (prisma as any).marketplaceSale.findMany({ where: { sellerUserId: userId } }),
      (prisma as any).marketplaceSale.findMany({ where: { buyerUserId: userId } }),
      (prisma as any).marketplaceReview.findMany({ where: { reviewerUserId: userId } }),
      (prisma as any).marketplaceReview.findMany({ where: { sellerUserId: userId } }),
      prisma.listingInquiry.findMany({ where: { buyerId: userId } }),
      prisma.listingInquiry.findMany({ where: { breederId: userId } }),
    ]);

  return { conversations, sales, purchases, reviewsWritten, reviewsReceived, inquiriesSent, inquiriesReceived };
};

/**
 * Account-security history. The subject is entitled to this — it is how they
 * audit access to their own account — but reasons and metadata blobs can quote
 * internal detail, so only the shape of each event is released.
 */
const collectSecurityHistory = async (userId: string) => {
  const [securityEvents, emailJobs, reportsFiled] = await Promise.all([
    (prisma as any).securityEvent.findMany({
      where: { actorUserId: userId },
      select: { id: true, type: true, outcome: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    (prisma as any).emailJob.findMany({
      where: { ownerId: userId },
      select: { id: true, category: true, templateKey: true, recipientEmail: true, status: true, createdAt: true, sentAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.report.findMany({
      where: { reporterUserId: userId },
      select: { id: true, type: true, status: true, description: true, createdAt: true },
    }),
  ]);

  return { securityEvents, emailJobs, reportsFiled };
};

export const buildAccountExport = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      emailVerified: true,
      emailVerifiedAt: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      deletionRequestedAt: true,
      deletionScheduledAt: true,
    },
  });

  if (!user) {
    throw new HttpError(404, "User not found.");
  }

  const membership = await (prisma as any).membership.findUnique({
    where: { userId },
    include: { organization: { select: { id: true, name: true, kind: true, status: true, createdAt: true } } },
  });

  const [own, shared, security] = await Promise.all([
    collectOwnRecords(userId),
    collectSharedRecords(userId),
    collectSecurityHistory(userId),
  ]);

  await recordSecurityEvent({
    type: "account.data_export.generated",
    actorUserId: userId,
    outcome: "success",
  });

  return {
    formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    notice:
      "This file contains the personal data held about you. Records shared with another " +
      "person (marketplace conversations, sales, reviews) identify the other party only by " +
      "an internal id, because their details are not yours to receive. Passwords and session " +
      "tokens are never included.",
    account: user,
    organization: membership
      ? { role: membership.role, joinedAt: membership.createdAt, organization: membership.organization }
      : null,
    records: own,
    shared,
    security,
  };
};

/** Stable, filesystem-safe filename for the download. */
export const accountExportFilename = (userId: string, generatedAt = new Date()): string => {
  const stamp = generatedAt.toISOString().slice(0, 10);
  return `serpentora-data-export-${stamp}-${userId.slice(0, 8)}.json`;
};
