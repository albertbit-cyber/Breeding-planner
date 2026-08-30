import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { OrgRole, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { env } from "../config/env";
import { enqueueEmail } from "../email/queueService";
import {
  VENDOR_LAB_INVITATION_TEMPLATE_KEY,
  VENDOR_LAB_INVITATION_TEMPLATE_VERSION,
  ORG_TEAMMATE_INVITATION_TEMPLATE_KEY,
  ORG_TEAMMATE_INVITATION_TEMPLATE_VERSION,
} from "../email/templates";
import { recordSecurityEvent } from "./securityEventService";
import { logAdminAction } from "./adminService";
import { seedPricingConfigForOrganization } from "./labVendorService";
import type { AuthenticatedUser } from "../types/auth";

const db = prisma as any;

/**
 * `OrganizationInvite` lifecycle — the only door through which a vendor lab
 * enters the platform (implementation plan §3.3, and the 2026-08-30 decision
 * that lab onboarding is invite-only with no public signup anywhere).
 *
 * Two triggers share this one entity, and the difference is worth holding onto
 * because the acceptance paths diverge sharply:
 *
 *   vendor lab  — `createsOrgKind = lab_vendor`, `organizationId` null.
 *                 Accepting CREATES an Organization + owner Membership +
 *                 LabAccount. Issued by a platform admin only.
 *   teammate    — `organizationId` set, `createsOrgKind` null.
 *                 Accepting creates a Membership in an org that already exists.
 *                 Issued by that org's owner/admin.
 *
 * Security properties this module is responsible for, all of which have a test
 * in organizationInviteService.test.ts:
 *   - the raw token exists only in the email; the DB holds sha256 of it
 *   - acceptance is single-use, enforced by a conditional UPDATE, not a read
 *   - the invited address is the identity: an accepted account is created with
 *     that email already verified, and the invitee sets their own password
 *   - one-org-per-user is checked before anything is written
 */

/** Long enough that a vendor can act on it over a holiday, short enough to expire. */
const VENDOR_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const TEAMMATE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MIN_PASSWORD_LENGTH = 8;

export const ORG_ROLES: readonly OrgRole[] = ["owner", "admin", "billing_manager", "member"];

/** Same scheme as accountTokenService/RefreshSession — never store the raw token. */
const hashToken = (rawToken: string): string =>
  crypto.createHash("sha256").update(rawToken).digest("hex");

const normalizeEmail = (value: unknown): string => {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new HttpError(400, "A valid email address is required.");
  return email;
};

const normalizeRequiredText = (value: unknown, field: string, max = 200): string => {
  const text = String(value || "").trim();
  if (!text) throw new HttpError(400, `${field} is required.`);
  if (text.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer.`);
  return text;
};

const normalizeOptionalText = (value: unknown, max = 200): string | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
};

const formatExpiry = (date: Date): string =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const inviteLink = (rawToken: string, kind: "vendor" | "teammate"): string => {
  // Vendor and teammate invitations both land in the Lab Portal for now, since
  // vendor labs are the only orgs that invite teammates today. When breeder orgs
  // gain self-service invites (plan §4.4) this picks the breeder app instead.
  const base = String(kind === "vendor" ? env.labPortalUrl : env.labPortalUrl || env.publicAppUrl).replace(/\/$/, "");
  return `${base}/#/accept-invite?token=${encodeURIComponent(rawToken)}`;
};

export const inviteIdempotencyKey = (inviteId: string): string => `organization_invite:${inviteId}`;

const INVITE_SELECT = {
  id: true,
  email: true,
  organizationId: true,
  createsOrgKind: true,
  createsOrgName: true,
  role: true,
  status: true,
  invitedBy: true,
  expiresAt: true,
  acceptedAt: true,
  acceptedByUserId: true,
  createdAt: true,
  updatedAt: true,
};

export const normalizeInvite = (row: any) => ({
  id: row.id,
  email: row.email,
  organizationId: row.organizationId,
  organizationName: row.organization?.name || row.createsOrgName || null,
  kind: row.createsOrgKind ? "vendor_lab" : "teammate",
  createsOrgKind: row.createsOrgKind || null,
  role: row.role,
  status: row.status,
  invitedBy: row.invitedBy || null,
  inviterName: row.inviter?.fullName || null,
  expiresAt: row.expiresAt,
  acceptedAt: row.acceptedAt || null,
  acceptedByUserId: row.acceptedByUserId || null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  // Derived rather than stored: a pending invite silently becomes useless at
  // its expiry, and callers should not have to compare dates themselves.
  isExpired: row.status === "pending" && new Date(row.expiresAt).getTime() <= Date.now(),
});

/**
 * Rejects an address that already has somewhere to belong. Checked before any
 * write so an invite is never issued that cannot be accepted — the alternative
 * is a vendor clicking a link and hitting a wall, which is worse than the admin
 * finding out at issue time.
 */
const assertInvitableEmail = async (email: string, targetOrganizationId: string | null): Promise<void> => {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, membership: { select: { organizationId: true } } },
  });
  if (!user?.membership) return;
  if (targetOrganizationId && user.membership.organizationId === targetOrganizationId) {
    throw new HttpError(409, "That person is already a member of this organization.");
  }
  throw new HttpError(
    409,
    "That email address already belongs to another organization. One account can belong to only one organization — they will need a separate account."
  );
};

const createInvite = async (input: {
  email: string;
  organizationId: string | null;
  createsOrgKind: "lab_vendor" | null;
  createsOrgName: string | null;
  /** Prefills the LabAccount at acceptance so the vendor starts with what the admin already knew. */
  createsOrgLocation?: string | null;
  createsOrgContact?: string | null;
  role: OrgRole;
  invitedBy: string;
  ttlMs: number;
}) => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + input.ttlMs);

  const invite = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Supersede any earlier pending invite to the same address for the same
    // target, so a re-invite (typo in the name, lost email) can't leave two live
    // tokens where revoking one still lets the other through.
    await (tx as any).organizationInvite.updateMany({
      where: {
        email: input.email,
        organizationId: input.organizationId,
        status: "pending",
      },
      data: { status: "revoked" },
    });
    return (tx as any).organizationInvite.create({
      data: {
        email: input.email,
        tokenHash: hashToken(rawToken),
        organizationId: input.organizationId,
        createsOrgKind: input.createsOrgKind,
        createsOrgName: input.createsOrgName,
        createsOrgLocation: input.createsOrgLocation ?? null,
        createsOrgContact: input.createsOrgContact ?? null,
        role: input.role,
        invitedBy: input.invitedBy,
        status: "pending",
        expiresAt,
      },
      include: { organization: true, inviter: { select: { fullName: true } } },
    });
  });

  return { invite, rawToken };
};

/**
 * Admin invites a brand-new vendor laboratory. Creates nothing but the invite —
 * the organization does not exist until the vendor accepts, so an unaccepted
 * invitation leaves no half-built tenant behind.
 */
export const inviteVendorLab = async (
  actor: AuthenticatedUser,
  payload: Record<string, unknown>
) => {
  const email = normalizeEmail(payload.email);
  const labName = normalizeRequiredText(payload.labName, "Laboratory name");
  const contactPerson = normalizeOptionalText(payload.contactPerson);
  const location = normalizeOptionalText(payload.location);
  const reason = normalizeRequiredText(payload.reason || "Invite vendor laboratory", "Reason");

  await assertInvitableEmail(email, null);

  const { invite, rawToken } = await createInvite({
    email,
    organizationId: null,
    createsOrgKind: "lab_vendor",
    createsOrgName: labName,
    createsOrgLocation: location,
    createsOrgContact: contactPerson,
    role: "owner",
    invitedBy: actor.id,
    ttlMs: VENDOR_INVITE_TTL_MS,
  });

  const inviter = await db.user.findUnique({ where: { id: actor.id }, select: { fullName: true } });
  const job = await enqueueEmail({
    // EmailJob.ownerId is a required FK and the invitee has no account yet, so
    // the job is owned by the admin who sent it. That also keeps it visible in
    // the admin's own email history, which is where they will look for it.
    ownerId: actor.id,
    recipientEmail: email,
    category: "organization_invitations",
    templateKey: VENDOR_LAB_INVITATION_TEMPLATE_KEY,
    templateVersion: VENDOR_LAB_INVITATION_TEMPLATE_VERSION,
    templatePayload: {
      organizationName: labName,
      inviterFullName: inviter?.fullName || null,
      expiresAtDisplay: formatExpiry(invite.expiresAt),
      actionUrl: inviteLink(rawToken, "vendor"),
    },
    subject: "Your laboratory is invited to Breeding Planner",
    idempotencyKey: inviteIdempotencyKey(invite.id),
    relatedEntityType: "organization_invite",
    relatedEntityId: invite.id,
  });

  await logAdminAction({
    adminUserId: actor.id,
    action: "vendor_lab_invited",
    afterJson: { inviteId: invite.id, email, labName, location, contactPerson },
    reason,
  });
  await recordSecurityEvent({
    type: "organization.vendor_invite_issued",
    actorUserId: actor.id,
    outcome: "success",
    metadata: { inviteId: invite.id, email },
  });

  return { invite: normalizeInvite(invite), email: { queued: Boolean(job), jobId: job?.id } };
};

/**
 * An org owner/admin invites a colleague into their own organization. Never
 * creates an organization — `organizationId` is taken from the *actor's* own
 * membership, never from the request body, so this cannot be aimed at someone
 * else's tenant.
 */
export const inviteTeammate = async (
  actor: AuthenticatedUser,
  actorMembership: { organizationId: string; organization: { name: string } },
  payload: Record<string, unknown>
) => {
  const email = normalizeEmail(payload.email);
  const requestedRole = String(payload.role || "member").trim() as OrgRole;
  if (!ORG_ROLES.includes(requestedRole)) throw new HttpError(400, "Unsupported organization role.");
  if (requestedRole === "owner") {
    throw new HttpError(400, "An organization has a single owner. Invite as admin instead, or transfer ownership.");
  }

  await assertInvitableEmail(email, actorMembership.organizationId);

  const { invite, rawToken } = await createInvite({
    email,
    organizationId: actorMembership.organizationId,
    createsOrgKind: null,
    createsOrgName: null,
    role: requestedRole,
    invitedBy: actor.id,
    ttlMs: TEAMMATE_INVITE_TTL_MS,
  });

  const [inviter, existingUser] = await Promise.all([
    db.user.findUnique({ where: { id: actor.id }, select: { fullName: true } }),
    db.user.findUnique({ where: { email }, select: { id: true } }),
  ]);

  const job = await enqueueEmail({
    ownerId: actor.id,
    recipientEmail: email,
    category: "organization_invitations",
    templateKey: ORG_TEAMMATE_INVITATION_TEMPLATE_KEY,
    templateVersion: ORG_TEAMMATE_INVITATION_TEMPLATE_VERSION,
    templatePayload: {
      organizationName: actorMembership.organization.name,
      inviterFullName: inviter?.fullName || null,
      role: requestedRole,
      expiresAtDisplay: formatExpiry(invite.expiresAt),
      actionUrl: inviteLink(rawToken, "teammate"),
      hasExistingAccount: Boolean(existingUser),
    },
    subject: `You're invited to join ${actorMembership.organization.name}`,
    idempotencyKey: inviteIdempotencyKey(invite.id),
    relatedEntityType: "organization_invite",
    relatedEntityId: invite.id,
  });

  await recordSecurityEvent({
    type: "organization.teammate_invite_issued",
    actorUserId: actor.id,
    outcome: "success",
    metadata: { inviteId: invite.id, organizationId: actorMembership.organizationId, role: requestedRole },
  });

  return { invite: normalizeInvite(invite), email: { queued: Boolean(job), jobId: job?.id } };
};

export const listVendorInvites = async (query: Record<string, unknown>) => {
  const status = String(query.status || "").trim();
  const search = String(query.search || "").trim();
  const where: any = { createsOrgKind: { not: null } };
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { createsOrgName: { contains: search, mode: "insensitive" } },
    ];
  }
  const rows = await db.organizationInvite.findMany({
    where,
    include: { organization: true, inviter: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { invites: rows.map(normalizeInvite) };
};

export const listInvitesForOrganization = async (organizationId: string) => {
  const rows = await db.organizationInvite.findMany({
    where: { organizationId },
    include: { inviter: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { invites: rows.map(normalizeInvite) };
};

/**
 * Revokes a pending invite. Deliberately a status change rather than a delete:
 * the oversight view needs to show that an invitation was sent and withdrawn,
 * which a deleted row cannot.
 */
export const revokeInvite = async (
  actor: AuthenticatedUser,
  inviteId: string,
  options: { reason?: unknown; organizationId?: string } = {}
) => {
  const invite = await db.organizationInvite.findUnique({
    where: { id: inviteId },
    include: { organization: true, inviter: { select: { fullName: true } } },
  });
  if (!invite) throw new HttpError(404, "Invitation not found.");
  if (options.organizationId && invite.organizationId !== options.organizationId) {
    throw new HttpError(404, "Invitation not found.");
  }
  if (invite.status !== "pending") {
    throw new HttpError(409, `This invitation is already ${invite.status}.`);
  }

  const updated = await db.organizationInvite.update({
    where: { id: inviteId },
    data: { status: "revoked" },
    include: { organization: true, inviter: { select: { fullName: true } } },
  });

  if (invite.createsOrgKind) {
    await logAdminAction({
      adminUserId: actor.id,
      action: "vendor_lab_invite_revoked",
      beforeJson: { status: invite.status },
      afterJson: { status: updated.status, email: invite.email },
      reason: normalizeRequiredText(options.reason || "Invitation revoked", "Reason"),
    });
  }
  await recordSecurityEvent({
    type: "organization.invite_revoked",
    actorUserId: actor.id,
    outcome: "success",
    metadata: { inviteId, email: invite.email },
  });

  return { invite: normalizeInvite(updated) };
};

/**
 * What the acceptance page may show before anyone has authenticated. Returns
 * the minimum needed to render the form and nothing that would turn a guessed
 * token into an information leak — no inviter identity, no org membership, no
 * other addresses.
 */
export const previewInvite = async (rawToken: string) => {
  const tokenHash = hashToken(String(rawToken || ""));
  const invite = await db.organizationInvite.findUnique({
    where: { tokenHash },
    include: { organization: { select: { name: true, kind: true, status: true } } },
  });
  if (!invite) throw new HttpError(404, "This invitation link is not valid.");

  if (invite.status === "accepted") throw new HttpError(409, "This invitation has already been used.");
  if (invite.status === "revoked") throw new HttpError(409, "This invitation has been withdrawn.");
  if (new Date(invite.expiresAt).getTime() <= Date.now()) {
    throw new HttpError(410, "This invitation has expired. Ask for a new one.");
  }
  if (invite.organization && invite.organization.status === "suspended") {
    throw new HttpError(403, "This organization has been suspended.");
  }

  const existingUser = await db.user.findUnique({ where: { email: invite.email }, select: { id: true } });

  return {
    email: invite.email,
    organizationName: invite.organization?.name || invite.createsOrgName,
    kind: invite.createsOrgKind ? "vendor_lab" : "teammate",
    role: invite.role,
    expiresAt: invite.expiresAt,
    // Tells the page whether to ask for a new password or to ask them to sign in.
    requiresPassword: !existingUser,
  };
};

/**
 * Redeems an invitation.
 *
 * The whole tenant comes into existence here, in one transaction, so a failure
 * halfway cannot leave an organization with no owner or a user with no org. The
 * conditional `updateMany` on the invite is what makes this single-use: two
 * concurrent redemptions of the same token cannot both match a still-pending
 * row, so exactly one proceeds.
 */
export const acceptInvite = async (
  rawToken: string,
  payload: Record<string, unknown>
): Promise<{ userId: string; email: string; organizationId: string; role: OrgRole }> => {
  const tokenHash = hashToken(String(rawToken || ""));
  const invite = await db.organizationInvite.findUnique({ where: { tokenHash } });
  if (!invite) throw new HttpError(404, "This invitation link is not valid.");
  if (invite.status === "accepted") throw new HttpError(409, "This invitation has already been used.");
  if (invite.status === "revoked") throw new HttpError(409, "This invitation has been withdrawn.");
  if (new Date(invite.expiresAt).getTime() <= Date.now()) {
    throw new HttpError(410, "This invitation has expired. Ask for a new one.");
  }

  const existingUser = await db.user.findUnique({
    where: { email: invite.email },
    select: { id: true, fullName: true, membership: { select: { id: true } } },
  });
  if (existingUser?.membership) {
    throw new HttpError(409, "That account already belongs to an organization.");
  }

  const password = String(payload.password || "");
  if (!existingUser) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new HttpError(400, `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
  }
  const fullName = normalizeRequiredText(
    payload.fullName || existingUser?.fullName,
    "Your name"
  );
  const passwordHash = existingUser ? null : await bcrypt.hash(password, 12);

  const result = await db.$transaction(async (tx: any) => {
    // Single-use gate. Anything after this line runs at most once per token.
    const claimed = await tx.organizationInvite.updateMany({
      where: { tokenHash, status: "pending", expiresAt: { gt: new Date() } },
      data: { status: "accepted", acceptedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new HttpError(409, "This invitation has already been used.");
    }

    const user = existingUser
      ? await tx.user.findUnique({ where: { id: existingUser.id } })
      : await tx.user.create({
          data: {
            email: invite.email,
            fullName,
            // Persisted role stays `lab` (the UserRole enum value); what the
            // person may do inside the org is the OrgRole on the membership.
            role: invite.createsOrgKind === "lab_vendor" || invite.organizationId ? "lab" : "breeder",
            status: "active",
            isActive: true,
            // The invitation was delivered to this address and redeemed from it,
            // which is the same proof a verification email provides. Asking them
            // to verify again immediately after would be theatre.
            emailVerified: true,
            passwordHash,
            subscriptionPlan: "free",
            subscriptionStatus: "inactive",
            subscriptionPaymentStatus: "none",
          },
        });

    let organizationId = invite.organizationId as string | null;

    if (invite.createsOrgKind) {
      const organization = await tx.organization.create({
        data: {
          id: `org_${user.id}`,
          name: invite.createsOrgName || fullName,
          kind: invite.createsOrgKind,
          status: "active",
          // Lab vendor orgs are never billed (2026-07-30 decision), so they
          // carry no billing contact.
          billingEmail: null,
        },
      });
      organizationId = organization.id;

      await tx.labAccount.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          labName: organization.name,
          contactPerson: invite.createsOrgContact || fullName,
          location: invite.createsOrgLocation || null,
          // Approved on acceptance: the admin already vetted this vendor by
          // inviting them, so a second approval step would gate nothing.
          status: "approved",
          permissionsJson: {},
          availableTestsJson: [],
          pricingJson: {},
        },
      });

      // A lab with no pricing row cannot quote anything, and the pricing lookup
      // deliberately refuses to fall back to another lab's numbers — so seed it
      // here rather than letting the first breeder to pick this lab hit a 404.
      await seedPricingConfigForOrganization(organization.id, tx);
    }

    if (!organizationId) {
      throw new HttpError(500, "This invitation is not attached to an organization.");
    }

    await tx.membership.create({
      data: {
        id: `mbr_${user.id}`,
        userId: user.id,
        organizationId,
        role: invite.role,
      },
    });

    await tx.organizationInvite.update({
      where: { id: invite.id },
      data: { acceptedByUserId: user.id },
    });

    return { userId: user.id, email: user.email as string, organizationId, role: invite.role as OrgRole };
  });

  await recordSecurityEvent({
    type: invite.createsOrgKind ? "organization.vendor_invite_accepted" : "organization.teammate_invite_accepted",
    actorUserId: result.userId,
    outcome: "success",
    metadata: { inviteId: invite.id, organizationId: result.organizationId, role: result.role },
  });

  return result;
};
