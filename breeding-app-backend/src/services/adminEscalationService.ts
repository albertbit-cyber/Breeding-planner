import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AuthenticatedUser } from "../types/auth";
import { isOwnerRole } from "../auth/identity";
import { logAdminAction } from "./adminService";

const db = prisma as any;

const ESCALATION_STATUSES = new Set(["open", "acknowledged", "resolved"]);

const text = (value: unknown, max: number): string => String(value || "").trim().slice(0, max);

const RAISER_SELECT = { id: true, fullName: true, email: true, role: true };

const normalizeEscalation = (row: any) => ({
  id: row.id,
  subject: row.subject,
  note: row.note,
  status: row.status,
  raisedBy: row.raisedBy
    ? { id: row.raisedBy.id, fullName: row.raisedBy.fullName, email: row.raisedBy.email, role: row.raisedBy.role }
    : null,
  subjectUser: row.subjectUser
    ? { id: row.subjectUser.id, fullName: row.subjectUser.fullName, email: row.subjectUser.email }
    : null,
  relatedReportId: row.relatedReportId || null,
  resolutionNote: row.resolutionNote || null,
  resolvedAt: row.resolvedAt || null,
  resolvedBy: row.resolvedBy ? { id: row.resolvedBy.id, fullName: row.resolvedBy.fullName } : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const ESCALATION_INCLUDE = {
  raisedBy: { select: RAISER_SELECT },
  subjectUser: { select: { id: true, fullName: true, email: true } },
  resolvedBy: { select: { id: true, fullName: true } },
};

/**
 * The one write a moderator is allowed in the admin console. It creates a note
 * for the owner and nothing else: no status changes, no account actions, no
 * side effects on the thing being flagged.
 */
export const createAdminEscalation = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  const subject = text(payload.subject, 200);
  const note = text(payload.note, 4000);
  if (!subject) throw new HttpError(400, "A subject is required.");
  if (!note) throw new HttpError(400, "Describe what the owner should look at.");

  const subjectUserId = text(payload.subjectUserId, 40) || null;
  const relatedReportId = text(payload.relatedReportId, 40) || null;

  // Verified rather than trusted: an id that does not resolve would otherwise
  // fail as an opaque foreign-key error at insert time.
  if (subjectUserId) {
    const exists = await db.user.findUnique({ where: { id: subjectUserId }, select: { id: true } });
    if (!exists) throw new HttpError(404, "The user this refers to was not found.");
  }
  if (relatedReportId) {
    const exists = await db.report.findUnique({ where: { id: relatedReportId }, select: { id: true } });
    if (!exists) throw new HttpError(404, "The report this refers to was not found.");
  }

  const created = await db.adminEscalation.create({
    data: { raisedByUserId: actor.id, subject, note, subjectUserId, relatedReportId, status: "open" },
    include: ESCALATION_INCLUDE,
  });

  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: subjectUserId || undefined,
    action: "escalation_raised",
    afterJson: { escalationId: created.id, subject },
    reason: subject,
  });

  return { escalation: normalizeEscalation(created) };
};

export const listAdminEscalations = async (_actor: AuthenticatedUser, query: Record<string, unknown>) => {
  const status = text(query.status, 32);
  const where = status && ESCALATION_STATUSES.has(status) ? { status } : {};
  const rows = await db.adminEscalation.findMany({
    where,
    include: ESCALATION_INCLUDE,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return {
    escalations: rows.map(normalizeEscalation),
    openCount: await db.adminEscalation.count({ where: { status: "open" } }),
  };
};

/** Acting on an escalation is the owner's call, never a moderator's. */
export const updateAdminEscalation = async (
  actor: AuthenticatedUser,
  id: string,
  payload: Record<string, unknown>
) => {
  if (!isOwnerRole(actor.role)) {
    throw new HttpError(403, "Only the account owner can act on an escalation.");
  }
  const status = text(payload.status, 32);
  if (!ESCALATION_STATUSES.has(status)) throw new HttpError(400, "Unsupported escalation status.");

  const before = await db.adminEscalation.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, "Escalation not found.");

  const resolving = status === "resolved";
  const updated = await db.adminEscalation.update({
    where: { id },
    data: {
      status,
      resolutionNote: text(payload.resolutionNote, 4000) || before.resolutionNote,
      resolvedAt: resolving ? new Date() : null,
      resolvedByUserId: resolving ? actor.id : null,
    },
    include: ESCALATION_INCLUDE,
  });

  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: before.subjectUserId || undefined,
    action: "escalation_reviewed",
    beforeJson: { status: before.status },
    afterJson: { status: updated.status },
    reason: `Escalation ${status}`,
  });

  return { escalation: normalizeEscalation(updated) };
};
