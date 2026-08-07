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
 *
 * A caller may narrow the export to a subset of groups (see
 * ACCOUNT_EXPORT_GROUPS). That is a convenience for someone who wants, say,
 * only their animals — it is not a change to what Art. 20 entitles them to, so
 * the full export stays the default whenever no groups are named, and a partial
 * file says so in its own notice rather than passing itself off as complete.
 */

export const ACCOUNT_EXPORT_FORMAT_VERSION = 1;

/**
 * The groups a user can pick from. Grouped by what the data means to them
 * rather than by table: "Animals & breeding" is one decision, the five tables
 * behind it are not.
 *
 * `account` is not optional. A file with no identity in it cannot be checked
 * against the person it belongs to, which is exactly what a portability export
 * is for.
 */
export const ACCOUNT_EXPORT_GROUPS = [
  { id: "account", label: "Account & profile", always: true },
  { id: "animals", label: "Animals & breeding", always: false },
  { id: "lab", label: "Lab orders", always: false },
  { id: "marketplace", label: "Marketplace", always: false },
  { id: "messages", label: "Messages & inquiries", always: false },
  { id: "reviews", label: "Reviews", always: false },
  { id: "security", label: "Security & activity", always: false },
] as const;

export type AccountExportGroupId = (typeof ACCOUNT_EXPORT_GROUPS)[number]["id"];

export const ACCOUNT_EXPORT_GROUP_IDS: AccountExportGroupId[] = ACCOUNT_EXPORT_GROUPS.map((group) => group.id);

const ALWAYS_INCLUDED: AccountExportGroupId[] = ACCOUNT_EXPORT_GROUPS.filter((group) => group.always).map(
  (group) => group.id
);

/**
 * Which top-level key of the export a table lands under. These three sections
 * are the file's existing shape and are kept as they are: narrowing the export
 * changes which keys are present, never where they live, so a partial file
 * parses with the same reader as a complete one.
 */
type ExportSection = "records" | "shared" | "security";

type ExportEntry = {
  /** Key in the output object. */
  key: string;
  section: ExportSection;
  group: AccountExportGroupId;
  query: (userId: string) => Promise<unknown>;
};

/**
 * One row per exported table. Declaration order is the key order in the
 * generated file, and a deselected group's queries are never issued — the
 * point of narrowing the export is to not ask for the data, not to fetch it
 * and drop it on the floor.
 */
const EXPORT_ENTRIES: ExportEntry[] = [
  // Account & profile.
  {
    key: "profile",
    section: "records",
    group: "account",
    query: (userId) => prisma.profile.findUnique({ where: { userId } }),
  },
  {
    key: "notificationPreferences",
    section: "records",
    group: "account",
    query: (userId) => (prisma as any).notificationPreference.findMany({ where: { userId } }),
  },

  // Animals & breeding.
  {
    key: "animals",
    section: "records",
    group: "animals",
    query: (userId) => prisma.animal.findMany({ where: { ownerId: userId } }),
  },
  {
    key: "pairings",
    section: "records",
    group: "animals",
    query: (userId) => prisma.pairing.findMany({ where: { ownerId: userId } }),
  },
  {
    key: "clutches",
    section: "records",
    group: "animals",
    query: (userId) => prisma.clutch.findMany({ where: { ownerId: userId } }),
  },
  {
    key: "plannerState",
    section: "records",
    group: "animals",
    query: (userId) => prisma.breederPlannerState.findUnique({ where: { ownerId: userId } }),
  },
  {
    key: "reproductiveCycles",
    section: "records",
    group: "animals",
    query: (userId) => (prisma as any).reproductiveCycle.findMany({ where: { ownerId: userId } }),
  },

  // Lab orders.
  {
    key: "labOrders",
    section: "records",
    group: "lab",
    query: (userId) =>
      (prisma as any).shedTestOrder.findMany({
        where: { breederId: userId },
        include: { animals: true, results: true },
      }),
  },

  // Marketplace.
  {
    key: "listings",
    section: "records",
    group: "marketplace",
    query: (userId) => prisma.listing.findMany({ where: { ownerId: userId } }),
  },
  {
    key: "savedSearches",
    section: "records",
    group: "marketplace",
    query: (userId) => prisma.savedSearch.findMany({ where: { ownerId: userId } }),
  },
  {
    key: "marketplaceListings",
    section: "records",
    group: "marketplace",
    query: (userId) => (prisma as any).marketplaceListing.findMany({ where: { sellerUserId: userId } }),
  },
  {
    key: "marketplaceStores",
    section: "records",
    group: "marketplace",
    query: (userId) => (prisma as any).marketplaceStore.findMany({ where: { userId } }),
  },
  {
    key: "marketplaceFavorites",
    section: "records",
    group: "marketplace",
    query: (userId) => (prisma as any).marketplaceFavorite.findMany({ where: { userId } }),
  },
  {
    key: "sales",
    section: "shared",
    group: "marketplace",
    query: (userId) => (prisma as any).marketplaceSale.findMany({ where: { sellerUserId: userId } }),
  },
  {
    key: "purchases",
    section: "shared",
    group: "marketplace",
    query: (userId) => (prisma as any).marketplaceSale.findMany({ where: { buyerUserId: userId } }),
  },

  // Messages & inquiries.
  {
    key: "conversations",
    section: "shared",
    group: "messages",
    query: (userId) =>
      (prisma as any).marketplaceConversation.findMany({
        where: { OR: [{ buyerUserId: userId }, { sellerUserId: userId }] },
        include: {
          messages: {
            select: { id: true, senderUserId: true, messageText: true, offerAmount: true, createdAt: true, readAt: true },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
  },
  {
    key: "inquiriesSent",
    section: "shared",
    group: "messages",
    query: (userId) => prisma.listingInquiry.findMany({ where: { buyerId: userId } }),
  },
  {
    key: "inquiriesReceived",
    section: "shared",
    group: "messages",
    query: (userId) => prisma.listingInquiry.findMany({ where: { breederId: userId } }),
  },

  // Reviews.
  {
    key: "reviewsWritten",
    section: "shared",
    group: "reviews",
    query: (userId) => (prisma as any).marketplaceReview.findMany({ where: { reviewerUserId: userId } }),
  },
  {
    key: "reviewsReceived",
    section: "shared",
    group: "reviews",
    query: (userId) => (prisma as any).marketplaceReview.findMany({ where: { sellerUserId: userId } }),
  },

  // Security & activity. The subject is entitled to this — it is how they audit
  // access to their own account — but reasons and metadata blobs can quote
  // internal detail, so only the shape of each event is released.
  {
    key: "deviceSessions",
    section: "records",
    group: "security",
    query: (userId) =>
      (prisma as any).userDeviceSession.findMany({
        where: { userId },
        // pushToken is a credential for addressing the device, not useful to the
        // subject, and is deliberately not selected.
        select: { id: true, deviceId: true, deviceName: true, platform: true, lastSeenAt: true, createdAt: true },
      }),
  },
  {
    key: "mobileScanLogs",
    section: "records",
    group: "security",
    query: (userId) => (prisma as any).mobileScanLog.findMany({ where: { userId } }),
  },
  {
    key: "usageTracking",
    section: "records",
    group: "security",
    query: (userId) => (prisma as any).usageTracking.findMany({ where: { userId } }),
  },
  {
    key: "subscriptions",
    section: "records",
    group: "security",
    query: (userId) => (prisma as any).userSubscription.findMany({ where: { userId } }),
  },
  {
    key: "securityEvents",
    section: "security",
    group: "security",
    query: (userId) =>
      (prisma as any).securityEvent.findMany({
        where: { actorUserId: userId },
        select: { id: true, type: true, outcome: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
  },
  {
    key: "emailJobs",
    section: "security",
    group: "security",
    query: (userId) =>
      (prisma as any).emailJob.findMany({
        where: { ownerId: userId },
        select: { id: true, category: true, templateKey: true, recipientEmail: true, status: true, createdAt: true, sentAt: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
  },
  {
    key: "reportsFiled",
    section: "security",
    group: "security",
    query: (userId) =>
      prisma.report.findMany({
        where: { reporterUserId: userId },
        select: { id: true, type: true, status: true, description: true, createdAt: true },
      }),
  },
];

/**
 * An absent or empty selection means the whole export. Anything the caller does
 * name is unioned with the groups that are never optional, so a selection can
 * only ever narrow the optional part.
 */
const resolveGroups = (requested?: readonly string[] | null): AccountExportGroupId[] => {
  const named = (requested ?? []).filter((id): id is AccountExportGroupId =>
    ACCOUNT_EXPORT_GROUP_IDS.includes(id as AccountExportGroupId)
  );

  const selected = named.length > 0 ? new Set<AccountExportGroupId>([...named, ...ALWAYS_INCLUDED]) : new Set(ACCOUNT_EXPORT_GROUP_IDS);

  // Returned in registry order rather than the order the caller listed them, so
  // the file and the audit log read the same way every time.
  return ACCOUNT_EXPORT_GROUP_IDS.filter((id) => selected.has(id));
};

const PARTIAL_NOTICE =
  "This is a partial export: it contains only the categories you selected, and is " +
  "not the complete set of personal data held about you. Request an export with no " +
  "categories deselected to receive everything.";

const BASE_NOTICE =
  "This file contains the personal data held about you. Records shared with another " +
  "person (marketplace conversations, sales, reviews) identify the other party only by " +
  "an internal id, because their details are not yours to receive. Passwords and session " +
  "tokens are never included.";

export const buildAccountExport = async (userId: string, requestedGroups?: readonly string[] | null) => {
  const groups = resolveGroups(requestedGroups);
  const complete = groups.length === ACCOUNT_EXPORT_GROUP_IDS.length;
  const omitted = ACCOUNT_EXPORT_GROUP_IDS.filter((id) => !groups.includes(id));

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

  const entries = EXPORT_ENTRIES.filter((entry) => groups.includes(entry.group));
  const values = await Promise.all(entries.map((entry) => entry.query(userId)));

  const sections: Record<ExportSection, Record<string, unknown>> = { records: {}, shared: {}, security: {} };
  entries.forEach((entry, index) => {
    sections[entry.section][entry.key] = values[index];
  });

  await recordSecurityEvent({
    type: "account.data_export.generated",
    actorUserId: userId,
    outcome: "success",
    // Which categories left the system, so the audit trail can answer "what was
    // in the file" and not merely "a file was produced".
    metadata: { complete, groups },
  });

  return {
    formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    notice: complete ? BASE_NOTICE : `${PARTIAL_NOTICE} ${BASE_NOTICE}`,
    selection: {
      complete,
      included: groups,
      omitted,
    },
    account: user,
    organization: membership
      ? { role: membership.role, joinedAt: membership.createdAt, organization: membership.organization }
      : null,
    records: sections.records,
    shared: sections.shared,
    security: sections.security,
  };
};

/**
 * Stable, filesystem-safe filename for the download. A narrowed export is
 * marked in the filename as well as inside the file, so the two cannot be
 * confused once they are sitting in the same Downloads folder.
 */
export const accountExportFilename = (
  userId: string,
  generatedAt = new Date(),
  complete = true
): string => {
  const stamp = generatedAt.toISOString().slice(0, 10);
  const suffix = complete ? "" : "-partial";
  return `serpentora-data-export-${stamp}-${userId.slice(0, 8)}${suffix}.json`;
};
