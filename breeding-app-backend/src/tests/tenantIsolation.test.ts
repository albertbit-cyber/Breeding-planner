import { describe, expect, it } from "vitest";
import { assertSameOrganization, assertOwnerOrAdmin } from "../services/permissionHelpers";

/**
 * Tenant-isolation boundary tests (implementation plan §3.5).
 *
 * One org being able to read or write another org's data is the single
 * highest-severity bug class the tenancy migration can introduce, and it had no
 * coverage at all before this. These tests pin the *authorization primitive*;
 * per-route coverage follows as each model is migrated onto an organizationId
 * (plan §3.2 step 2, the breeder-side models).
 */

const breederInOrgA = { id: "user-a", role: "breeder" as any };
const breederInOrgB = { id: "user-b", role: "breeder" as any };
const colleagueInOrgA = { id: "user-a2", role: "breeder" as any };
const platformAdmin = { id: "admin-1", role: "admin" as any };
const ORG_A = "org_a";
const ORG_B = "org_b";

describe("tenant isolation", () => {
  it("lets a member act on their own organization's resource", () => {
    expect(() => assertSameOrganization(breederInOrgA, ORG_A, ORG_A)).not.toThrow();
  });

  it("blocks a member from another organization's resource", () => {
    expect(() => assertSameOrganization(breederInOrgB, ORG_B, ORG_A)).toThrow(
      "You cannot access this resource."
    );
  });

  it("lets a colleague act on a resource a different member of the same org created", () => {
    // This is the case that was impossible before the tenancy migration and is
    // the entire point of it: a vendor lab (or breeding business) with more than
    // one person. Note the actor is NOT the row's creator — only an org peer.
    expect(() => assertSameOrganization(colleagueInOrgA, ORG_A, ORG_A)).not.toThrow();
    // Contrast with the pre-migration primitive, which would reject the same
    // colleague because it only ever asked "did you personally create this".
    expect(() => assertOwnerOrAdmin(colleagueInOrgA, breederInOrgA.id)).toThrow(
      "You cannot access this resource."
    );
  });

  it("blocks access when the actor has no organization", () => {
    // Non-tenant accounts (marketplace-only buyers) must not fall through to
    // access org-scoped data just because their org id is absent.
    expect(() => assertSameOrganization(breederInOrgB, null, ORG_A)).toThrow(
      "You cannot access this resource."
    );
    expect(() => assertSameOrganization(breederInOrgB, undefined, ORG_A)).toThrow(
      "You cannot access this resource."
    );
  });

  it("blocks access when the resource has no organization", () => {
    // Guards the migration window: a row that somehow has no organizationId must
    // fail closed, not be treated as accessible to everyone.
    expect(() => assertSameOrganization(breederInOrgA, ORG_A, null)).toThrow(
      "You cannot access this resource."
    );
    expect(() => assertSameOrganization(breederInOrgA, ORG_A, undefined)).toThrow(
      "You cannot access this resource."
    );
  });

  it("does not treat two absent organization ids as a match", () => {
    // The dangerous degenerate case: null === null must never grant access, or
    // any two unmigrated rows would be mutually visible.
    expect(() => assertSameOrganization(breederInOrgA, null, null)).toThrow(
      "You cannot access this resource."
    );
  });

  it("lets a platform admin cross org boundaries, by design", () => {
    // The admin console cannot support customers without this; it's an
    // intentional exemption, so it's pinned by a test rather than left implicit.
    expect(() => assertSameOrganization(platformAdmin, null, ORG_A)).not.toThrow();
    expect(() => assertSameOrganization(platformAdmin, ORG_B, ORG_A)).not.toThrow();
  });

  it("supports a caller-supplied message without leaking which org owns the resource", () => {
    // Error text must not confirm the existence or identity of another tenant.
    const message = "Lab order not found.";
    expect(() => assertSameOrganization(breederInOrgB, ORG_B, ORG_A, message)).toThrow(message);
  });
});
