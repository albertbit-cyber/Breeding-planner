import type { OrgRole, OrganizationKind, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";

/**
 * Organization/Membership access layer — the tenancy foundation from
 * docs/architecture/saas-implementation-plan.md §3.
 *
 * Two rules this module exists to keep true everywhere:
 *
 *  1. **One organization per user, always.** Enforced at the DB level by
 *     `Membership.userId @unique`. There is deliberately no "active org" or
 *     org-switcher concept — a user's org is a single lookup, never a choice.
 *  2. **Access is granted by org membership, not by direct row ownership.**
 *     Existing `ownerId`/`userId` columns are retained as "who created this",
 *     but authorization asks "is the actor in the org that owns this?".
 */

/** Org roles that may administer the organization itself (members, settings). */
const ORG_ADMIN_ROLES: OrgRole[] = ["owner", "admin"];
/** Org roles that may act on billing. Lab-vendor orgs are never billed. */
const ORG_BILLING_ROLES: OrgRole[] = ["owner", "billing_manager"];

export type MembershipWithOrganization = Prisma.MembershipGetPayload<{
  include: { organization: true };
}>;

/**
 * The org a user belongs to, or null for non-tenant accounts. Internal staff
 * (admin/moderator/support) and marketplace-only buyers legitimately have no
 * membership — callers must handle null rather than assuming one exists.
 */
export const findMembershipForUser = async (
  userId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<MembershipWithOrganization | null> =>
  client.membership.findUnique({
    where: { userId },
    include: { organization: true },
  });

/**
 * Same as findMembershipForUser but throws instead of returning null. Use in
 * routes that are meaningless without a tenant context.
 */
export const requireMembershipForUser = async (
  userId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<MembershipWithOrganization> => {
  const membership = await findMembershipForUser(userId, client);
  if (!membership) {
    throw new HttpError(403, "This account does not belong to an organization.");
  }
  if (membership.organization.status === "suspended") {
    // Deliberately distinct from the 403 above: the caller *has* a tenant, it's
    // just been suspended by an admin, which is a different thing to explain to
    // a user and a different thing to alert on.
    throw new HttpError(403, "This organization has been suspended.");
  }
  return membership;
};

/**
 * Creates an organization and makes `userId` its owner, in one transaction.
 *
 * Ids are derived from the user id (`org_`/`mbr_` prefixes) to match the
 * 20260730120000_add_organization_tenancy migration and the seed scripts, which
 * do the same. That keeps provisioning idempotent and makes it obvious in the
 * database which org belongs to which user without a join.
 */
export const createOrganizationWithOwner = async (
  input: {
    userId: string;
    name: string;
    kind: OrganizationKind;
    /** Vendor-lab orgs are never billed, so they carry no billing contact. */
    billingEmail?: string | null;
  },
  client?: Prisma.TransactionClient
): Promise<MembershipWithOrganization> => {
  const run = async (tx: Prisma.TransactionClient): Promise<MembershipWithOrganization> => {
    const existing = await tx.membership.findUnique({
      where: { userId: input.userId },
      include: { organization: true },
    });
    // One-org-per-user is a hard rule; provisioning twice is a bug upstream, but
    // returning the existing membership keeps registration/invite-acceptance
    // idempotent under retries rather than failing on the unique constraint.
    if (existing) return existing;

    const organizationId = `org_${input.userId}`;
    const organization = await tx.organization.create({
      data: {
        id: organizationId,
        name: input.name,
        kind: input.kind,
        status: "active",
        billingEmail: input.kind === "lab_vendor" ? null : input.billingEmail ?? null,
      },
    });

    return tx.membership.create({
      data: {
        id: `mbr_${input.userId}`,
        userId: input.userId,
        organizationId: organization.id,
        role: "owner",
      },
      include: { organization: true },
    });
  };

  return client ? run(client) : prisma.$transaction(run);
};

/**
 * Derives a sensible organization name for a self-service breeder signup. The
 * org is initially just "this person's business", and they can rename it later.
 */
export const defaultOrganizationName = (fullName: string, email: string): string =>
  fullName.trim() || email.trim();

export const isOrgAdminRole = (role: OrgRole): boolean => ORG_ADMIN_ROLES.includes(role);
export const canManageOrgBilling = (role: OrgRole): boolean => ORG_BILLING_ROLES.includes(role);
