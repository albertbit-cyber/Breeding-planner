import { HttpError } from "../utils/errors";
import type { AuthenticatedUser } from "../types/auth";

export const isAdminActor = (actor?: Pick<AuthenticatedUser, "role"> | null): boolean =>
  actor?.role === "admin" || actor?.role === "super_admin";

export const isLabActor = (actor?: Pick<AuthenticatedUser, "role"> | null): boolean =>
  isAdminActor(actor) || actor?.role === "lab_owner" || actor?.role === "lab_staff";

export const isBreederActor = (actor?: Pick<AuthenticatedUser, "role"> | null): boolean =>
  isAdminActor(actor) || actor?.role === "breeder";

export const assertAdminActor = (actor?: Pick<AuthenticatedUser, "role"> | null): void => {
  if (!isAdminActor(actor)) throw new HttpError(403, "Only admin users can perform this action.");
};

export const assertSellerActor = (actor?: Pick<AuthenticatedUser, "role"> | null): void => {
  if (!isBreederActor(actor)) throw new HttpError(403, "Only breeder or admin users can manage marketplace listings.");
};

export const assertOwnerOrAdmin = (
  actor: Pick<AuthenticatedUser, "id" | "role">,
  ownerId: string | null | undefined,
  message = "You cannot access this resource."
): void => {
  if (isAdminActor(actor)) return;
  if (ownerId && actor.id === ownerId) return;
  throw new HttpError(403, message);
};

/**
 * Org-scoped version of assertOwnerOrAdmin (implementation plan §3.4).
 *
 * The distinction that matters: assertOwnerOrAdmin asks "did *you personally*
 * create this row", which is what made a vendor lab with two employees
 * impossible. This asks "does the org you belong to own this resource", so any
 * number of colleagues can work on the same data.
 *
 * Takes the actor's already-loaded organization id rather than looking it up, so
 * callers do one membership query per request instead of one per check.
 */
export const assertSameOrganization = (
  actor: Pick<AuthenticatedUser, "id" | "role">,
  actorOrganizationId: string | null | undefined,
  resourceOrganizationId: string | null | undefined,
  message = "You cannot access this resource."
): void => {
  // Platform admins are not tenants and intentionally bypass org scoping —
  // that's what makes the admin console able to support customers at all.
  if (isAdminActor(actor)) return;
  if (!actorOrganizationId || !resourceOrganizationId) {
    throw new HttpError(403, message);
  }
  if (actorOrganizationId !== resourceOrganizationId) {
    throw new HttpError(403, message);
  }
};

export const permissionAuditSummary = (
  actor: Pick<AuthenticatedUser, "id" | "role"> | null | undefined,
  resource: string,
  allowed: boolean,
  reason: string
) => ({
  actorId: actor?.id || null,
  actorRole: actor?.role || null,
  resource,
  allowed,
  reason,
});

