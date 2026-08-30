import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  });
  const prisma: any = {
    user: model(),
    organization: model(),
    organizationInvite: model(),
    membership: model(),
    labAccount: model(),
    pricingConfig: model(),
    adminAuditLog: model(),
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma };
});

vi.mock("../email/queueService", () => ({ enqueueEmail: vi.fn().mockResolvedValue({ id: "job-1" }) }));
vi.mock("./../services/securityEventService", () => ({ recordSecurityEvent: vi.fn() }));
vi.mock("../services/securityEventService", () => ({ recordSecurityEvent: vi.fn() }));
vi.mock("../services/adminService", () => ({ logAdminAction: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed") } }));

import { prisma } from "../lib/prisma";
import { enqueueEmail } from "../email/queueService";
import { acceptInvite, inviteVendorLab, previewInvite, revokeInvite } from "../services/organizationInviteService";

const db = prisma as any;

const ADMIN = { id: "admin-1", email: "admin@example.com", role: "admin" as const };

const futureDate = () => new Date(Date.now() + 60 * 60 * 1000);
const pastDate = () => new Date(Date.now() - 60 * 60 * 1000);

const vendorInvite = (overrides: Record<string, unknown> = {}) => ({
  id: "inv-1",
  email: "lab@example.com",
  organizationId: null,
  createsOrgKind: "lab_vendor",
  createsOrgName: "Helix Labs",
  createsOrgLocation: "Utrecht",
  createsOrgContact: "Sam Rivers",
  role: "owner",
  status: "pending",
  expiresAt: futureDate(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(null);
  db.organizationInvite.updateMany.mockResolvedValue({ count: 1 });
  db.pricingConfig.findFirst.mockResolvedValue(null);
  db.pricingConfig.create.mockResolvedValue({ id: "pricing-1" });
});

describe("inviteVendorLab", () => {
  it("creates a pending invite and emails it without creating the organization yet", async () => {
    const created = { ...vendorInvite(), organization: null, inviter: { fullName: "Admin" } };
    db.organizationInvite.create.mockResolvedValue(created);
    db.user.findUnique.mockResolvedValue({ fullName: "Admin" });

    const result = await inviteVendorLab(ADMIN, {
      email: "Lab@Example.com",
      labName: "Helix Labs",
      reason: "New partner",
    });

    expect(result.invite.status).toBe("pending");
    // Nothing exists until the vendor accepts: an unaccepted invitation must not
    // leave a half-built tenant behind.
    expect(db.organization.create).not.toHaveBeenCalled();
    expect(db.membership.create).not.toHaveBeenCalled();
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
  });

  it("stores only a hash of the token, never the token itself", async () => {
    db.organizationInvite.create.mockResolvedValue({ ...vendorInvite(), organization: null, inviter: null });

    await inviteVendorLab(ADMIN, { email: "lab@example.com", labName: "Helix Labs", reason: "x" });

    const stored = db.organizationInvite.create.mock.calls[0][0].data.tokenHash;
    const emailedLink = String(
      (enqueueEmail as any).mock.calls[0][0].templatePayload.actionUrl
    );
    const rawToken = new URL(emailedLink.replace("/#/", "/")).searchParams.get("token");

    expect(rawToken).toBeTruthy();
    expect(stored).not.toBe(rawToken);
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
  });

  it("supersedes an earlier pending invite to the same address", async () => {
    db.organizationInvite.create.mockResolvedValue({ ...vendorInvite(), organization: null, inviter: null });

    await inviteVendorLab(ADMIN, { email: "lab@example.com", labName: "Helix Labs", reason: "x" });

    // Otherwise revoking the visible invitation would leave an older live token
    // that still works.
    expect(db.organizationInvite.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: "lab@example.com", status: "pending" }),
        data: { status: "revoked" },
      })
    );
  });

  it("refuses an address that already belongs to an organization", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u-1", membership: { organizationId: "org_other" } });

    await expect(
      inviteVendorLab(ADMIN, { email: "taken@example.com", labName: "Helix", reason: "x" })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.organizationInvite.create).not.toHaveBeenCalled();
  });

  it("requires a laboratory name", async () => {
    await expect(
      inviteVendorLab(ADMIN, { email: "lab@example.com", reason: "x" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("previewInvite", () => {
  it("reveals only what the acceptance page needs", async () => {
    db.organizationInvite.findUnique.mockResolvedValue({ ...vendorInvite(), organization: null });
    db.user.findUnique.mockResolvedValue(null);

    const preview = await previewInvite("raw-token");

    expect(preview).toEqual({
      email: "lab@example.com",
      organizationName: "Helix Labs",
      kind: "vendor_lab",
      role: "owner",
      expiresAt: expect.any(Date),
      requiresPassword: true,
    });
    // No inviter identity, no membership list, no other addresses: a guessed
    // token must not become an information leak.
    expect(Object.keys(preview)).toHaveLength(6);
  });

  it("rejects an expired invitation with 410", async () => {
    db.organizationInvite.findUnique.mockResolvedValue({
      ...vendorInvite({ expiresAt: pastDate() }),
      organization: null,
    });

    await expect(previewInvite("raw-token")).rejects.toMatchObject({ statusCode: 410 });
  });

  it("rejects a withdrawn invitation", async () => {
    db.organizationInvite.findUnique.mockResolvedValue({
      ...vendorInvite({ status: "revoked" }),
      organization: null,
    });

    await expect(previewInvite("raw-token")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects an unknown token", async () => {
    db.organizationInvite.findUnique.mockResolvedValue(null);

    await expect(previewInvite("nonsense")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("acceptInvite", () => {
  const arrangeAcceptance = () => {
    db.organizationInvite.findUnique.mockResolvedValue(vendorInvite());
    db.user.findUnique.mockResolvedValue(null);
    db.organizationInvite.updateMany.mockResolvedValue({ count: 1 });
    db.user.create.mockResolvedValue({ id: "user-1", email: "lab@example.com" });
    db.organization.create.mockResolvedValue({ id: "org_user-1", name: "Helix Labs" });
    db.labAccount.create.mockResolvedValue({ id: "lab-1" });
    db.membership.create.mockResolvedValue({ id: "mbr_user-1" });
    db.organizationInvite.update.mockResolvedValue({});
  };

  it("creates the organization, owner membership, lab account and pricing in one go", async () => {
    arrangeAcceptance();

    const result = await acceptInvite("raw-token", {
      fullName: "Sam Rivers",
      password: "a-good-password",
    });

    expect(result).toMatchObject({ userId: "user-1", organizationId: "org_user-1", role: "owner" });
    expect(db.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "lab_vendor", status: "active" }) })
    );
    expect(db.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "owner" }) })
    );
    // A lab that cannot quote is not usable, so pricing is seeded at acceptance.
    expect(db.pricingConfig.create).toHaveBeenCalled();
  });

  it("carries the details the admin supplied onto the new lab account", async () => {
    arrangeAcceptance();

    await acceptInvite("raw-token", { fullName: "Sam Rivers", password: "a-good-password" });

    expect(db.labAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          labName: "Helix Labs",
          contactPerson: "Sam Rivers",
          location: "Utrecht",
          status: "approved",
        }),
      })
    );
  });

  it("marks the new account's email verified without a second round trip", async () => {
    arrangeAcceptance();

    await acceptInvite("raw-token", { fullName: "Sam Rivers", password: "a-good-password" });

    // The invitation was delivered to that address and redeemed from it, which
    // is the same proof a verification email provides.
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailVerified: true, role: "lab" }) })
    );
  });

  it("is single-use: a second redemption of the same token is refused", async () => {
    arrangeAcceptance();
    // The conditional UPDATE matches no still-pending row the second time.
    db.organizationInvite.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      acceptInvite("raw-token", { fullName: "Sam Rivers", password: "a-good-password" })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.organization.create).not.toHaveBeenCalled();
  });

  it("refuses a short password", async () => {
    db.organizationInvite.findUnique.mockResolvedValue(vendorInvite());
    db.user.findUnique.mockResolvedValue(null);

    await expect(
      acceptInvite("raw-token", { fullName: "Sam Rivers", password: "short" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses an account that already belongs to an organization", async () => {
    db.organizationInvite.findUnique.mockResolvedValue(vendorInvite());
    db.user.findUnique.mockResolvedValue({ id: "u-1", fullName: "Sam", membership: { id: "mbr-1" } });

    await expect(
      acceptInvite("raw-token", { fullName: "Sam Rivers", password: "a-good-password" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses an expired invitation", async () => {
    db.organizationInvite.findUnique.mockResolvedValue(vendorInvite({ expiresAt: pastDate() }));

    await expect(
      acceptInvite("raw-token", { fullName: "Sam Rivers", password: "a-good-password" })
    ).rejects.toMatchObject({ statusCode: 410 });
  });
});

describe("revokeInvite", () => {
  it("marks a pending invite revoked rather than deleting it", async () => {
    db.organizationInvite.findUnique.mockResolvedValue({ ...vendorInvite(), organization: null, inviter: null });
    db.organizationInvite.update.mockResolvedValue({
      ...vendorInvite({ status: "revoked" }),
      organization: null,
      inviter: null,
    });

    const result = await revokeInvite(ADMIN, "inv-1", { reason: "Wrong address" });

    expect(result.invite.status).toBe("revoked");
    // The oversight view has to be able to show that an invitation was sent and
    // withdrawn, which a deleted row cannot.
    expect(db.organizationInvite.delete).not.toHaveBeenCalled();
  });

  it("hides another organization's invite behind a 404", async () => {
    db.organizationInvite.findUnique.mockResolvedValue({
      ...vendorInvite({ organizationId: "org_a", createsOrgKind: null }),
      organization: null,
      inviter: null,
    });

    await expect(
      revokeInvite({ id: "u-2", email: "b@example.com", role: "lab_owner" } as any, "inv-1", {
        organizationId: "org_b",
        reason: "x",
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses to revoke an already-accepted invitation", async () => {
    db.organizationInvite.findUnique.mockResolvedValue({
      ...vendorInvite({ status: "accepted" }),
      organization: null,
      inviter: null,
    });

    await expect(revokeInvite(ADMIN, "inv-1", { reason: "x" })).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
