import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AppRole, AuthenticatedUser } from "../types/auth";

const db = prisma as any;

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  status: true,
  verificationStatus: true,
  subscriptionPlan: true,
  subscriptionStatus: true,
  subscriptionStartedAt: true,
  subscriptionRenewalAt: true,
  subscriptionTrialEndsAt: true,
  subscriptionPaymentStatus: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  profile: true,
};

const ADMIN_ROLES = new Set(["admin", "lab", "breeder", "buyer"]);
const USER_STATUSES = new Set(["active", "pending", "restricted", "suspended", "banned", "deleted"]);
const SUBSCRIPTION_PLANS = new Set(["free", "hobby", "breeder", "professional", "lab", "enterprise"]);
const SUBSCRIPTION_STATUSES = new Set(["inactive", "active", "trialing", "past_due", "expired", "cancelled", "lifetime"]);
const PAYMENT_STATUSES = new Set(["none", "paid", "pending", "failed", "waived", "refunded"]);
const VERIFICATION_STATUSES = new Set(["not_applied", "pending", "approved", "rejected", "revoked", "more_info_requested"]);
const VERIFICATION_REQUEST_STATUSES = new Set(["not_applied", "pending_review", "approved", "rejected", "revoked", "more_info_requested"]);
const REPORT_TYPES = new Set([
  "fake_listing",
  "incorrect_genetics",
  "scam_suspicion",
  "abusive_message",
  "non_payment",
  "animal_welfare_concern",
  "spam",
  "other",
]);
const REPORT_STATUSES = new Set(["open", "under_review", "waiting_for_response", "resolved", "dismissed", "escalated"]);
const LAB_ACCOUNT_STATUSES = new Set(["pending", "approved", "suspended", "rejected"]);
const GDPR_REQUEST_TYPES = new Set(["deletion_requested", "data_export_requested", "anonymize_requested"]);
const GDPR_REQUEST_STATUSES = new Set(["deletion_requested", "data_export_requested", "data_exported", "account_anonymized", "fully_deleted", "rejected", "completed"]);

const assertReason = (reason: unknown): string => {
  const normalized = String(reason || "").trim();
  if (!normalized) throw new HttpError(400, "A reason is required for this admin action.");
  return normalized;
};

const normalizeUser = (row: any) => ({
  id: row.id,
  name: row.fullName,
  email: row.email,
  role: row.role,
  status: row.status || (row.isActive ? "active" : "suspended"),
  subscription: {
    plan: row.subscriptionPlan || "free",
    status: row.subscriptionStatus || "inactive",
    startDate: row.subscriptionStartedAt,
    renewalDate: row.subscriptionRenewalAt,
    trialEndsAt: row.subscriptionTrialEndsAt,
    paymentStatus: row.subscriptionPaymentStatus || "none",
  },
  verificationStatus: row.verificationStatus || "not_applied",
  country: row.profile?.country || row.profile?.location || "",
  city: row.profile?.city || "",
  breederName: row.profile?.breederName || "",
  websiteUrl: row.profile?.websiteUrl || "",
  profileImageUrl: row.profile?.profileImageUrl || row.profile?.logoUrl || "",
  phone: row.profile?.publicContactPhone || "",
  language: row.profile?.language || "",
  joinedDate: row.createdAt,
  lastLoginAt: row.lastLoginAt,
  updatedAt: row.updatedAt,
});

const normalizeReport = (row: any) => ({
  id: row.id,
  type: row.type,
  status: row.status,
  description: row.description,
  reporter: row.reporterUser ? {
    id: row.reporterUser.id,
    name: row.reporterUser.fullName,
    email: row.reporterUser.email,
    role: row.reporterUser.role,
  } : null,
  reportedUser: row.reportedUser ? {
    id: row.reportedUser.id,
    name: row.reportedUser.fullName,
    email: row.reportedUser.email,
    role: row.reportedUser.role,
  } : null,
  listing: row.relatedListing ? {
    id: row.relatedListing.id,
    title: row.relatedListing.title,
    status: row.relatedListing.status,
  } : null,
  relatedMessageId: row.relatedMessageId,
  assignedAdmin: row.assignedAdmin ? {
    id: row.assignedAdmin.id,
    name: row.assignedAdmin.fullName,
    email: row.assignedAdmin.email,
  } : null,
  resolutionNote: row.resolutionNote || "",
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const normalizeVerificationRequest = (row: any) => ({
  id: row.id,
  type: row.type,
  status: row.status,
  submittedData: row.submittedDataJson || {},
  adminNote: row.adminNote || "",
  reviewedAt: row.reviewedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  user: row.user ? normalizeUser(row.user) : null,
  reviewer: row.reviewer ? {
    id: row.reviewer.id,
    name: row.reviewer.fullName,
    email: row.reviewer.email,
    role: row.reviewer.role,
  } : null,
});

const normalizeMarketplacePermission = (row: any) => row ? ({
  id: row.id,
  userId: row.userId,
  canAccess: row.canAccess,
  activeListingLimit: row.activeListingLimit,
  requireApproval: row.requireApproval,
  featuredBreeder: row.featuredBreeder,
  disabledReason: row.disabledReason || "",
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
}) : null;

const normalizeLabAccount = (row: any) => ({
  id: row.id,
  userId: row.userId,
  labName: row.labName,
  contactPerson: row.contactPerson || "",
  location: row.location || "",
  status: row.status,
  permissions: row.permissionsJson || {},
  availableTests: row.availableTestsJson || [],
  pricing: row.pricingJson || {},
  user: row.user ? normalizeUser(row.user) : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const normalizeGdprRequest = (row: any) => ({
  id: row.id,
  type: row.type,
  status: row.status,
  adminNote: row.adminNote || "",
  reviewedAt: row.reviewedAt,
  user: row.user ? normalizeUser(row.user) : null,
  reviewer: row.reviewer ? {
    id: row.reviewer.id,
    name: row.reviewer.fullName,
    email: row.reviewer.email,
  } : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const logAdminAction = async (input: {
  adminUserId?: string;
  targetUserId?: string;
  action: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  reason: string;
  internalNote?: string;
}) => db.adminAuditLog.create({
  data: {
    adminUserId: input.adminUserId || null,
    targetUserId: input.targetUserId || null,
    action: input.action,
    beforeJson: input.beforeJson || null,
    afterJson: input.afterJson || null,
    reason: input.reason,
    internalNote: input.internalNote || null,
  },
});

export const getAdminDashboard = async () => {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const [
    totalUsers,
    newUsersThisWeek,
    pendingBreederVerification,
    suspendedUsers,
    reportedUsers,
    verifiedBreeders,
    activeSubscriptions,
    expiredSubscriptions,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: since } } }),
    db.verificationRequest.count({ where: { status: "pending_review" } }),
    db.user.count({ where: { OR: [{ status: "suspended" }, { isActive: false }] } }),
    db.user.count({ where: { reportsReceived: { some: { status: { in: ["open", "under_review", "waiting_for_response", "escalated"] } } } } }),
    db.user.count({ where: { role: "breeder", verificationStatus: "approved" } }),
    db.user.count({ where: { subscriptionStatus: "active" } }),
    db.user.count({ where: { subscriptionStatus: { in: ["expired", "cancelled"] } } }),
  ]);

  return {
    cards: {
      totalUsers,
      newUsersThisWeek,
      pendingBreederVerification,
      suspendedUsers,
      reportedUsers,
      verifiedBreeders,
      activeSubscriptions,
      expiredSubscriptions,
    },
  };
};

export const listAdminUsers = async (query: Record<string, unknown>) => {
  const search = String(query.search || "").trim();
  const role = String(query.role || "").trim();
  const status = String(query.status || "").trim();
  const verification = String(query.verification || "").trim();
  const subscription = String(query.subscription || "").trim();
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(10, Number(query.pageSize || 25)));

  const where: any = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { fullName: { contains: search, mode: "insensitive" } },
      { profile: { breederName: { contains: search, mode: "insensitive" } } },
    ];
  }
  if (role) where.role = role;
  if (status) where.status = status;
  if (verification) where.verificationStatus = verification;
  if (subscription) where.subscriptionPlan = subscription;

  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { users: rows.map(normalizeUser), total, page, pageSize };
};

export const getAdminUserDetail = async (id: string) => {
  const user = await db.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!user) throw new HttpError(404, "User not found.");

  const [auditLogs, reports, activity] = await Promise.all([
    db.adminAuditLog.findMany({
      where: { targetUserId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { adminUser: { select: { id: true, fullName: true, email: true, role: true } } },
    }),
    db.report.findMany({
      where: { OR: [{ reporterUserId: id }, { reportedUserId: id }, { assignedAdminId: id }] },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: REPORT_INCLUDE,
    }),
    db.adminAuditLog.findMany({
      where: { OR: [{ targetUserId: id }, { adminUserId: id }] },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  return { user: normalizeUser(user), auditLogs, reports: reports.map(normalizeReport), activity };
};

const REPORT_INCLUDE = {
  reporterUser: { select: { id: true, fullName: true, email: true, role: true } },
  reportedUser: { select: { id: true, fullName: true, email: true, role: true } },
  relatedListing: { select: { id: true, title: true, status: true } },
  assignedAdmin: { select: { id: true, fullName: true, email: true, role: true } },
};

const VERIFICATION_REQUEST_INCLUDE = {
  user: { select: USER_SELECT },
  reviewer: { select: { id: true, fullName: true, email: true, role: true } },
};

export const listAdminVerificationRequests = async (query: Record<string, unknown>) => {
  const status = String(query.status || "").trim();
  const search = String(query.search || "").trim();
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(10, Number(query.pageSize || 25)));
  const where: any = { type: "breeder" };
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { user: { email: { contains: search, mode: "insensitive" } } },
      { user: { fullName: { contains: search, mode: "insensitive" } } },
      { user: { profile: { breederName: { contains: search, mode: "insensitive" } } } },
    ];
  }

  const [total, rows] = await Promise.all([
    db.verificationRequest.count({ where }),
    db.verificationRequest.findMany({
      where,
      include: VERIFICATION_REQUEST_INCLUDE,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    requests: rows.map(normalizeVerificationRequest),
    total,
    page,
    pageSize,
    statuses: Array.from(VERIFICATION_REQUEST_STATUSES),
  };
};

const mapVerificationRequestStatusToUserStatus = (status: string): string => {
  if (status === "pending_review") return "pending";
  if (status === "more_info_requested") return "pending";
  return status;
};

export const updateAdminVerificationRequest = async (
  actor: AuthenticatedUser,
  requestId: string,
  payload: { status?: unknown; reason?: unknown; adminNote?: unknown; internalNote?: unknown }
) => {
  const status = String(payload.status || "").trim().toLowerCase();
  if (!VERIFICATION_REQUEST_STATUSES.has(status) || status === "not_applied") {
    throw new HttpError(400, "Unsupported verification request status.");
  }
  const reason = assertReason(payload.reason || payload.adminNote);
  const before = await db.verificationRequest.findUnique({
    where: { id: requestId },
    include: VERIFICATION_REQUEST_INCLUDE,
  });
  if (!before) throw new HttpError(404, "Verification request not found.");

  const userVerificationStatus = mapVerificationRequestStatusToUserStatus(status);
  const updated = await db.$transaction(async (tx: any) => {
    const request = await tx.verificationRequest.update({
      where: { id: requestId },
      data: {
        status,
        adminNote: String(payload.adminNote || "").trim() || before.adminNote,
        reviewedBy: actor.id,
        reviewedAt: new Date(),
      },
      include: VERIFICATION_REQUEST_INCLUDE,
    });
    await tx.user.update({
      where: { id: before.userId },
      data: { verificationStatus: userVerificationStatus },
    });
    return request;
  });

  const action = status === "approved"
    ? "verification_approved"
    : status === "rejected"
      ? "verification_rejected"
      : status === "revoked"
        ? "verification_revoked"
        : "verification_more_info_requested";

  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: before.userId,
    action,
    beforeJson: { requestId, status: before.status, adminNote: before.adminNote },
    afterJson: { requestId, status: updated.status, adminNote: updated.adminNote },
    reason,
    internalNote: String(payload.internalNote || "").trim(),
  });

  return { request: normalizeVerificationRequest(updated) };
};

export const getAdminMarketplacePermission = async (userId: string) => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { ...USER_SELECT, marketplacePermission: true },
  });
  if (!user) throw new HttpError(404, "User not found.");
  return {
    user: normalizeUser(user),
    permission: normalizeMarketplacePermission(user.marketplacePermission) || {
      userId,
      canAccess: true,
      activeListingLimit: 25,
      requireApproval: false,
      featuredBreeder: false,
      disabledReason: "",
    },
  };
};

export const updateAdminMarketplacePermission = async (
  actor: AuthenticatedUser,
  userId: string,
  payload: {
    canAccess?: unknown;
    activeListingLimit?: unknown;
    requireApproval?: unknown;
    featuredBreeder?: unknown;
    disabledReason?: unknown;
    reason?: unknown;
  }
) => {
  const reason = assertReason(payload.reason || payload.disabledReason);
  const before = await db.marketplacePermission.findUnique({ where: { userId } });
  const data = {
    canAccess: payload.canAccess !== undefined ? Boolean(payload.canAccess) : true,
    activeListingLimit: Math.max(0, Math.min(500, Number(payload.activeListingLimit ?? 25) || 0)),
    requireApproval: Boolean(payload.requireApproval),
    featuredBreeder: Boolean(payload.featuredBreeder),
    disabledReason: String(payload.disabledReason || "").trim() || null,
  };
  const updated = await db.marketplacePermission.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: userId,
    action: data.canAccess ? "marketplace_access_updated" : "marketplace_access_disabled",
    beforeJson: before,
    afterJson: updated,
    reason,
  });
  return { permission: normalizeMarketplacePermission(updated) };
};

const LAB_ACCOUNT_INCLUDE = {
  user: { select: USER_SELECT },
};

export const listAdminLabAccounts = async (query: Record<string, unknown>) => {
  const status = String(query.status || "").trim();
  const search = String(query.search || "").trim();
  const where: any = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { labName: { contains: search, mode: "insensitive" } },
      { contactPerson: { contains: search, mode: "insensitive" } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { user: { fullName: { contains: search, mode: "insensitive" } } },
    ];
  }
  const rows = await db.labAccount.findMany({
    where,
    include: LAB_ACCOUNT_INCLUDE,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return { labs: rows.map(normalizeLabAccount), statuses: Array.from(LAB_ACCOUNT_STATUSES) };
};

export const updateAdminLabAccount = async (
  actor: AuthenticatedUser,
  labId: string,
  payload: { status?: unknown; reason?: unknown; adminNote?: unknown }
) => {
  const status = String(payload.status || "").trim().toLowerCase();
  if (!LAB_ACCOUNT_STATUSES.has(status)) throw new HttpError(400, "Unsupported lab account status.");
  const reason = assertReason(payload.reason || payload.adminNote);
  const before = await db.labAccount.findUnique({ where: { id: labId }, include: LAB_ACCOUNT_INCLUDE });
  if (!before) throw new HttpError(404, "Lab account not found.");
  const updated = await db.labAccount.update({
    where: { id: labId },
    data: { status },
    include: LAB_ACCOUNT_INCLUDE,
  });
  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: updated.userId,
    action: status === "approved" ? "lab_account_approved" : "lab_account_status_change",
    beforeJson: { status: before.status },
    afterJson: { status: updated.status },
    reason,
    internalNote: String(payload.adminNote || "").trim(),
  });
  return { lab: normalizeLabAccount(updated) };
};

export const sendAdminNotification = async (
  actor: AuthenticatedUser,
  payload: { recipientId?: unknown; audience?: unknown; title?: unknown; message?: unknown; type?: unknown; reason?: unknown }
) => {
  const title = String(payload.title || "").trim();
  const message = String(payload.message || "").trim();
  const type = String(payload.type || "admin_message").trim() || "admin_message";
  const audience = String(payload.audience || "individual").trim();
  const recipientId = String(payload.recipientId || "").trim();
  const reason = assertReason(payload.reason || title);
  if (!title || !message) throw new HttpError(400, "Notification title and message are required.");

  const where = audience === "all"
    ? {}
    : audience === "breeders"
      ? { role: "breeder" }
      : audience === "labs"
        ? { role: "lab" }
        : recipientId
          ? { id: recipientId }
          : null;
  if (!where) throw new HttpError(400, "recipientId is required for individual notifications.");
  const recipients = await db.user.findMany({ where, select: { id: true } });
  await db.notification.createMany({
    data: recipients.map((recipient: { id: string }) => ({
      recipientId: recipient.id,
      actorId: actor.id,
      type,
      title,
      message,
      metadata: { audience },
    })),
  });
  await logAdminAction({
    adminUserId: actor.id,
    action: "admin_notification_sent",
    afterJson: { audience, recipientCount: recipients.length, title, type },
    reason,
  });
  return { sent: recipients.length };
};

const GDPR_INCLUDE = {
  user: { select: USER_SELECT },
  reviewer: { select: { id: true, fullName: true, email: true, role: true } },
};

export const listAdminGdprRequests = async (query: Record<string, unknown>) => {
  const status = String(query.status || "").trim();
  const type = String(query.type || "").trim();
  const where: any = {};
  if (status) where.status = status;
  if (type) where.type = type;
  const rows = await db.gdprRequest.findMany({
    where,
    include: GDPR_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return {
    requests: rows.map(normalizeGdprRequest),
    types: Array.from(GDPR_REQUEST_TYPES),
    statuses: Array.from(GDPR_REQUEST_STATUSES),
  };
};

export const createAdminGdprRequest = async (
  actor: AuthenticatedUser,
  userId: string,
  payload: { type?: unknown; reason?: unknown; adminNote?: unknown }
) => {
  const type = String(payload.type || "data_export_requested").trim();
  if (!GDPR_REQUEST_TYPES.has(type)) throw new HttpError(400, "Unsupported GDPR request type.");
  const reason = assertReason(payload.reason || payload.adminNote || type);
  const created = await db.gdprRequest.create({
    data: {
      userId,
      type,
      status: type,
      adminNote: String(payload.adminNote || "").trim() || null,
      reviewedBy: actor.id,
      reviewedAt: new Date(),
    },
    include: GDPR_INCLUDE,
  });
  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: userId,
    action: type === "deletion_requested" ? "gdpr_delete" : type === "anonymize_requested" ? "gdpr_anonymize" : "gdpr_export",
    afterJson: { requestId: created.id, type },
    reason,
    internalNote: String(payload.adminNote || "").trim(),
  });
  return { request: normalizeGdprRequest(created) };
};

export const updateAdminGdprRequest = async (
  actor: AuthenticatedUser,
  requestId: string,
  payload: { status?: unknown; reason?: unknown; adminNote?: unknown }
) => {
  const status = String(payload.status || "").trim();
  if (!GDPR_REQUEST_STATUSES.has(status)) throw new HttpError(400, "Unsupported GDPR status.");
  const reason = assertReason(payload.reason || payload.adminNote || status);
  const before = await db.gdprRequest.findUnique({ where: { id: requestId }, include: GDPR_INCLUDE });
  if (!before) throw new HttpError(404, "GDPR request not found.");
  const updated = await db.gdprRequest.update({
    where: { id: requestId },
    data: {
      status,
      adminNote: String(payload.adminNote || "").trim() || before.adminNote,
      reviewedBy: actor.id,
      reviewedAt: new Date(),
    },
    include: GDPR_INCLUDE,
  });
  if (status === "account_anonymized") {
    await db.user.update({
      where: { id: updated.userId },
      data: { fullName: "Anonymized User", email: `anonymized-${updated.userId}@breedingplanner.local`, refreshToken: null },
    });
  }
  if (status === "fully_deleted") {
    await db.user.update({
      where: { id: updated.userId },
      data: { status: "deleted", isActive: false, refreshToken: null },
    });
  }
  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: updated.userId,
    action: status === "fully_deleted" ? "gdpr_delete" : status === "account_anonymized" ? "gdpr_anonymize" : "gdpr_status_change",
    beforeJson: { requestId, status: before.status },
    afterJson: { requestId, status },
    reason,
    internalNote: String(payload.adminNote || "").trim(),
  });
  return { request: normalizeGdprRequest(updated) };
};

export const listAdminReports = async (query: Record<string, unknown>) => {
  const status = String(query.status || "").trim();
  const type = String(query.type || "").trim();
  const search = String(query.search || "").trim();
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(10, Number(query.pageSize || 25)));
  const where: any = {};

  if (status) where.status = status;
  if (type) where.type = type;
  if (search) {
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { reporterUser: { email: { contains: search, mode: "insensitive" } } },
      { reporterUser: { fullName: { contains: search, mode: "insensitive" } } },
      { reportedUser: { email: { contains: search, mode: "insensitive" } } },
      { reportedUser: { fullName: { contains: search, mode: "insensitive" } } },
      { relatedListing: { title: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [total, rows] = await Promise.all([
    db.report.count({ where }),
    db.report.findMany({
      where,
      include: REPORT_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    reports: rows.map(normalizeReport),
    total,
    page,
    pageSize,
    reportTypes: Array.from(REPORT_TYPES),
    reportStatuses: Array.from(REPORT_STATUSES),
  };
};

export const updateAdminReportStatus = async (
  actor: AuthenticatedUser,
  reportId: string,
  payload: { status?: unknown; resolutionNote?: unknown; reason?: unknown; internalNote?: unknown }
) => {
  const status = String(payload.status || "").trim().toLowerCase();
  if (!REPORT_STATUSES.has(status)) throw new HttpError(400, "Unsupported report status.");
  const reason = assertReason(payload.reason || payload.resolutionNote);
  const before = await db.report.findUnique({ where: { id: reportId }, include: REPORT_INCLUDE });
  if (!before) throw new HttpError(404, "Report not found.");

  const updated = await db.report.update({
    where: { id: reportId },
    data: {
      status,
      resolutionNote: String(payload.resolutionNote || "").trim() || before.resolutionNote,
      assignedAdminId: actor.id,
    },
    include: REPORT_INCLUDE,
  });

  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: updated.reportedUserId || undefined,
    action: status === "resolved" ? "report_resolved" : "report_status_change",
    beforeJson: { reportId, status: before.status, resolutionNote: before.resolutionNote },
    afterJson: { reportId, status: updated.status, resolutionNote: updated.resolutionNote },
    reason,
    internalNote: String(payload.internalNote || "").trim(),
  });

  return { report: normalizeReport(updated) };
};

export const applyAdminReportAction = async (
  actor: AuthenticatedUser,
  reportId: string,
  payload: { action?: unknown; reason?: unknown; internalNote?: unknown }
) => {
  const action = String(payload.action || "").trim().toLowerCase();
  const allowed = new Set(["warn_user", "restrict_messaging", "remove_listing", "suspend_account", "ban_account", "escalate_report"]);
  if (!allowed.has(action)) throw new HttpError(400, "Unsupported report action.");
  const reason = assertReason(payload.reason);
  const report = await db.report.findUnique({ where: { id: reportId }, include: REPORT_INCLUDE });
  if (!report) throw new HttpError(404, "Report not found.");

  let updatedReport = report;
  if (action === "escalate_report") {
    updatedReport = await db.report.update({
      where: { id: reportId },
      data: { status: "escalated", assignedAdminId: actor.id },
      include: REPORT_INCLUDE,
    });
  }

  if (report.reportedUserId && (action === "suspend_account" || action === "ban_account")) {
    await db.user.update({
      where: { id: report.reportedUserId },
      data: {
        status: action === "ban_account" ? "banned" : "suspended",
        isActive: false,
        refreshToken: null,
      },
    });
  }

  if (report.relatedListingId && action === "remove_listing") {
    await db.listing.update({
      where: { id: report.relatedListingId },
      data: { status: "hidden" },
    });
  }

  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: report.reportedUserId || undefined,
    action,
    beforeJson: { reportId, reportStatus: report.status },
    afterJson: { reportId, reportStatus: updatedReport.status },
    reason,
    internalNote: String(payload.internalNote || "").trim(),
  });

  return { report: normalizeReport(updatedReport) };
};

export const updateAdminUserRole = async (
  actor: AuthenticatedUser,
  userId: string,
  payload: { role?: unknown; reason?: unknown; internalNote?: unknown }
) => {
  const role = String(payload.role || "").trim().toLowerCase();
  if (!ADMIN_ROLES.has(role)) throw new HttpError(400, "Unsupported role.");
  const reason = assertReason(payload.reason);
  const before = await db.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  if (!before) throw new HttpError(404, "User not found.");

  const updated = await db.user.update({
    where: { id: userId },
    data: { role: role as AppRole },
    select: USER_SELECT,
  });
  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: userId,
    action: "role_change",
    beforeJson: { role: before.role },
    afterJson: { role: updated.role },
    reason,
    internalNote: String(payload.internalNote || "").trim(),
  });
  return { user: normalizeUser(updated) };
};

export const updateAdminUserStatus = async (
  actor: AuthenticatedUser,
  userId: string,
  payload: { status?: unknown; reason?: unknown; internalNote?: unknown }
) => {
  const status = String(payload.status || "").trim().toLowerCase();
  if (!USER_STATUSES.has(status)) throw new HttpError(400, "Unsupported status.");
  const reason = assertReason(payload.reason);
  const before = await db.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  if (!before) throw new HttpError(404, "User not found.");

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      status,
      isActive: status === "active" || status === "pending" || status === "restricted",
      refreshToken: status === "active" ? undefined : null,
    },
    select: USER_SELECT,
  });
  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: userId,
    action: status === "suspended" ? "user_suspended" : status === "banned" ? "user_banned" : "status_change",
    beforeJson: { status: before.status, isActive: before.isActive },
    afterJson: { status: updated.status, isActive: updated.isActive },
    reason,
    internalNote: String(payload.internalNote || "").trim(),
  });
  return { user: normalizeUser(updated) };
};

const dateValue = (value: unknown): Date | null | undefined => {
  if (value === undefined) return undefined;
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, "Invalid subscription date.");
  return parsed;
};

export const updateAdminUserSubscription = async (
  actor: AuthenticatedUser,
  userId: string,
  payload: {
    plan?: unknown;
    status?: unknown;
    paymentStatus?: unknown;
    startDate?: unknown;
    renewalDate?: unknown;
    trialEndsAt?: unknown;
    reason?: unknown;
    internalNote?: unknown;
  }
) => {
  const plan = String(payload.plan || "").trim().toLowerCase();
  const status = String(payload.status || "").trim().toLowerCase();
  const paymentStatus = String(payload.paymentStatus || "").trim().toLowerCase();
  if (!SUBSCRIPTION_PLANS.has(plan)) throw new HttpError(400, "Unsupported subscription plan.");
  if (!SUBSCRIPTION_STATUSES.has(status)) throw new HttpError(400, "Unsupported subscription status.");
  if (!PAYMENT_STATUSES.has(paymentStatus)) throw new HttpError(400, "Unsupported payment status.");
  const reason = assertReason(payload.reason);
  const before = await db.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  if (!before) throw new HttpError(404, "User not found.");

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      subscriptionPlan: plan,
      subscriptionStatus: status,
      subscriptionPaymentStatus: paymentStatus,
      subscriptionStartedAt: dateValue(payload.startDate),
      subscriptionRenewalAt: dateValue(payload.renewalDate),
      subscriptionTrialEndsAt: dateValue(payload.trialEndsAt),
    },
    select: USER_SELECT,
  });
  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: userId,
    action: "subscription_change",
    beforeJson: {
      plan: before.subscriptionPlan,
      status: before.subscriptionStatus,
      paymentStatus: before.subscriptionPaymentStatus,
      startDate: before.subscriptionStartedAt,
      renewalDate: before.subscriptionRenewalAt,
      trialEndsAt: before.subscriptionTrialEndsAt,
    },
    afterJson: {
      plan: updated.subscriptionPlan,
      status: updated.subscriptionStatus,
      paymentStatus: updated.subscriptionPaymentStatus,
      startDate: updated.subscriptionStartedAt,
      renewalDate: updated.subscriptionRenewalAt,
      trialEndsAt: updated.subscriptionTrialEndsAt,
    },
    reason,
    internalNote: String(payload.internalNote || "").trim(),
  });
  return { user: normalizeUser(updated) };
};

export const updateAdminUserVerification = async (
  actor: AuthenticatedUser,
  userId: string,
  payload: { verificationStatus?: unknown; reason?: unknown; internalNote?: unknown }
) => {
  const verificationStatus = String(payload.verificationStatus || "").trim().toLowerCase();
  if (!VERIFICATION_STATUSES.has(verificationStatus)) throw new HttpError(400, "Unsupported verification status.");
  const reason = assertReason(payload.reason);
  const before = await db.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  if (!before) throw new HttpError(404, "User not found.");

  const updated = await db.user.update({
    where: { id: userId },
    data: { verificationStatus },
    select: USER_SELECT,
  });
  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: userId,
    action: verificationStatus === "approved" ? "verification_approved" : "verification_rejected",
    beforeJson: { verificationStatus: before.verificationStatus },
    afterJson: { verificationStatus: updated.verificationStatus },
    reason,
    internalNote: String(payload.internalNote || "").trim(),
  });
  return { user: normalizeUser(updated) };
};
