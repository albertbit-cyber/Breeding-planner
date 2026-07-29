import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma", () => {
  const membership = {
    findUnique: vi.fn(),
    create: vi.fn(),
  };
  const organization = {
    create: vi.fn(),
  };
  return {
    prisma: {
      membership,
      organization,
      $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({ membership, organization })),
    },
  };
});

import { prisma } from "../lib/prisma";
import {
  createOrganizationWithOwner,
  findMembershipForUser,
  requireMembershipForUser,
  defaultOrganizationName,
  isOrgAdminRole,
  canManageOrgBilling,
} from "../services/organizationService";

const db = prisma as any;

const activeOrg = (overrides: Record<string, unknown> = {}) => ({
  id: "org_user-1",
  name: "Test Org",
  kind: "breeder",
  status: "active",
  billingEmail: "user1@example.com",
  ...overrides,
});

describe("organizationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createOrganizationWithOwner", () => {
    it("creates the org and an owner membership with ids derived from the user id", async () => {
      db.membership.findUnique.mockResolvedValue(null);
      db.organization.create.mockResolvedValue(activeOrg());
      db.membership.create.mockResolvedValue({ id: "mbr_user-1", role: "owner", organization: activeOrg() });

      await createOrganizationWithOwner({
        userId: "user-1",
        name: "Test Org",
        kind: "breeder",
        billingEmail: "user1@example.com",
      });

      // Derived ids are what let the migration, the seeds, and this service all
      // agree on which org belongs to which user without a join.
      expect(db.organization.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ id: "org_user-1", kind: "breeder", status: "active" }),
      }));
      expect(db.membership.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          id: "mbr_user-1",
          userId: "user-1",
          organizationId: "org_user-1",
          role: "owner",
        }),
      }));
    });

    it("never sets a billing contact on a vendor-lab org, even if one is passed", async () => {
      // Lab vendors are unbilled by product decision; the service enforces that
      // rather than trusting every call site to remember it.
      db.membership.findUnique.mockResolvedValue(null);
      db.organization.create.mockResolvedValue(activeOrg({ kind: "lab_vendor", billingEmail: null }));
      db.membership.create.mockResolvedValue({ id: "mbr_user-1", role: "owner", organization: activeOrg() });

      await createOrganizationWithOwner({
        userId: "user-1",
        name: "A Lab",
        kind: "lab_vendor",
        billingEmail: "should-be-ignored@example.com",
      });

      expect(db.organization.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ kind: "lab_vendor", billingEmail: null }),
      }));
    });

    it("is idempotent — returns the existing membership instead of violating the one-org-per-user rule", async () => {
      const existing = { id: "mbr_user-1", role: "owner", organization: activeOrg() };
      db.membership.findUnique.mockResolvedValue(existing);

      const result = await createOrganizationWithOwner({
        userId: "user-1",
        name: "Second Org",
        kind: "breeder",
      });

      expect(result).toBe(existing);
      expect(db.organization.create).not.toHaveBeenCalled();
      expect(db.membership.create).not.toHaveBeenCalled();
    });
  });

  describe("requireMembershipForUser", () => {
    it("returns the membership for an active organization", async () => {
      const membership = { id: "mbr_user-1", role: "owner", organization: activeOrg() };
      db.membership.findUnique.mockResolvedValue(membership);

      await expect(requireMembershipForUser("user-1")).resolves.toBe(membership);
    });

    it("rejects an account with no organization", async () => {
      db.membership.findUnique.mockResolvedValue(null);

      await expect(requireMembershipForUser("user-1")).rejects.toThrow(
        "This account does not belong to an organization."
      );
    });

    it("distinguishes a suspended organization from a missing one", async () => {
      // A suspended tenant is a different situation to explain (and to alert on)
      // than an account that never had one, so the messages must not collapse.
      db.membership.findUnique.mockResolvedValue({
        id: "mbr_user-1",
        role: "owner",
        organization: activeOrg({ status: "suspended" }),
      });

      await expect(requireMembershipForUser("user-1")).rejects.toThrow(
        "This organization has been suspended."
      );
    });
  });

  describe("findMembershipForUser", () => {
    it("returns null for non-tenant accounts rather than throwing", async () => {
      // Internal staff and marketplace-only buyers legitimately have no org.
      db.membership.findUnique.mockResolvedValue(null);

      await expect(findMembershipForUser("admin-1")).resolves.toBeNull();
    });
  });

  describe("helpers", () => {
    it("derives an org name from the user's name, falling back to their email", () => {
      expect(defaultOrganizationName("Alice Breeder", "alice@example.com")).toBe("Alice Breeder");
      expect(defaultOrganizationName("   ", "alice@example.com")).toBe("alice@example.com");
    });

    it("scopes org-admin and billing capability to the right roles", () => {
      expect(isOrgAdminRole("owner")).toBe(true);
      expect(isOrgAdminRole("admin")).toBe(true);
      expect(isOrgAdminRole("billing_manager")).toBe(false);
      expect(isOrgAdminRole("member")).toBe(false);

      expect(canManageOrgBilling("owner")).toBe(true);
      expect(canManageOrgBilling("billing_manager")).toBe(true);
      // An org admin can manage members without being able to touch billing.
      expect(canManageOrgBilling("admin")).toBe(false);
      expect(canManageOrgBilling("member")).toBe(false);
    });
  });
});
