import { prisma } from "../lib/prisma";
import { notifyLabApplicationReceived } from "./labOrderNotificationService";
import { HttpError } from "../utils/errors";
import { logAdminAction } from "./adminService";
import { recordSecurityEvent } from "./securityEventService";
import type { AuthenticatedUser } from "../types/auth";

const db = prisma as any;

/**
 * Applications from laboratories asking to be considered as partners.
 *
 * This does not weaken invitation-only onboarding, and is carefully built not
 * to: submitting creates no account, no organization, no token and no access of
 * any kind. It creates a row an administrator reads. The only way it becomes
 * access is an administrator separately deciding to send a real invitation
 * through the existing flow.
 *
 * It exists because "invitation-only" was leaving laboratories with no way to
 * make contact at all — a gap in the journey rather than a hole in the rule.
 */

const APPLICATION_STATUSES = new Set(["pending", "invited", "declined"]);

const text = (value: unknown, max: number): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.slice(0, max);
};

const requiredText = (value: unknown, field: string, max: number): string => {
  const normalized = text(value, max);
  if (!normalized) throw new HttpError(400, `${field} is required.`);
  return normalized;
};

export const normalizeApplication = (row: any) => ({
  id: row.id,
  labName: row.labName,
  contactName: row.contactName,
  email: row.email,
  phone: row.phone || null,
  country: row.country || null,
  website: row.website || null,
  message: row.message || null,
  status: row.status,
  reviewedAt: row.reviewedAt || null,
  reviewNote: row.reviewNote || null,
  reviewer: row.reviewer ? { id: row.reviewer.id, name: row.reviewer.fullName } : null,
  createdAt: row.createdAt,
});

/**
 * Public submission. Unauthenticated by nature — the applicant has no account,
 * which is the entire point.
 */
export const submitApplication = async (payload: Record<string, unknown>) => {
  const email = requiredText(payload.email, "Email", 200).toLowerCase();
  if (!email.includes("@")) throw new HttpError(400, "Enter a valid email address.");

  const labName = requiredText(payload.labName, "Laboratory name", 200);
  const contactName = requiredText(payload.contactName, "Your name", 200);

  const website = text(payload.website, 300);
  if (website && !/^https?:\/\//i.test(website)) {
    throw new HttpError(400, "A website must start with http:// or https://");
  }

  // One live application per address. A second submission updates the first
  // rather than filling the administrator's queue with duplicates from someone
  // who clicked twice or followed up a week later.
  const existing = await db.partnerApplication.findFirst({
    where: { email, status: "pending" },
  });

  const data = {
    labName,
    contactName,
    email,
    phone: text(payload.phone, 50),
    country: text(payload.country, 120),
    website,
    message: text(payload.message, 4000),
  };

  const application = existing
    ? await db.partnerApplication.update({ where: { id: existing.id }, data })
    : await db.partnerApplication.create({ data: { ...data, status: "pending" } });

  await recordSecurityEvent({
    type: "partner_application.submitted",
    outcome: "success",
    metadata: { applicationId: application.id, labName },
  });

  // Until now this row waited for an administrator to happen to open the Vendor
  // Labs page. A laboratory that hears nothing assumes the answer was no.
  await notifyLabApplicationReceived({
    id: application.id,
    labName: application.labName,
    contactPerson: application.contactName,
    email: application.email,
    location: application.country,
    reason: application.message,
  });

  // Deliberately returns nothing about the record. An applicant learns only
  // that it arrived; anything more would let this endpoint be used to probe
  // which laboratories have already applied.
  return { received: true };
};

export const listApplications = async (query: Record<string, unknown>) => {
  const status = String(query.status || "").trim();
  const search = String(query.search || "").trim();
  const where: any = {};
  if (status) {
    if (!APPLICATION_STATUSES.has(status)) throw new HttpError(400, "Unsupported application status.");
    where.status = status;
  }
  if (search) {
    where.OR = [
      { labName: { contains: search, mode: "insensitive" } },
      { contactName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const rows = await db.partnerApplication.findMany({
    where,
    include: { reviewer: { select: { id: true, fullName: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return { applications: rows.map(normalizeApplication), statuses: Array.from(APPLICATION_STATUSES) };
};

/**
 * Records what an administrator decided about an application.
 *
 * Note what this does *not* do: it never sends an invitation itself. Marking an
 * application "invited" is bookkeeping. Actually inviting the laboratory is a
 * separate, deliberate action through the invitation flow, so the decision to
 * grant access is never a side effect of tidying a queue.
 */
export const reviewApplication = async (
  actor: AuthenticatedUser,
  applicationId: string,
  payload: Record<string, unknown>
) => {
  const status = String(payload.status || "").trim().toLowerCase();
  if (!APPLICATION_STATUSES.has(status) || status === "pending") {
    throw new HttpError(400, "Mark an application as invited or declined.");
  }
  const note = text(payload.note, 4000);

  const before = await db.partnerApplication.findUnique({ where: { id: applicationId } });
  if (!before) throw new HttpError(404, "Application not found.");

  const updated = await db.partnerApplication.update({
    where: { id: applicationId },
    data: { status, reviewNote: note, reviewedBy: actor.id, reviewedAt: new Date() },
    include: { reviewer: { select: { id: true, fullName: true } } },
  });

  await logAdminAction({
    adminUserId: actor.id,
    action: status === "invited" ? "partner_application_invited" : "partner_application_declined",
    beforeJson: { status: before.status },
    afterJson: { status: updated.status, email: updated.email, labName: updated.labName },
    reason: note || `Partner application marked ${status}`,
  });

  return { application: normalizeApplication(updated) };
};
