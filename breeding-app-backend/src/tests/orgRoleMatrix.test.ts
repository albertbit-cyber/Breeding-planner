import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => {
  const model = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  });
  const prisma: any = {
    membership: model(),
    labAccount: model(),
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma };
});

vi.mock("../services/organizationService", () => ({
  findMembershipForUser: vi.fn(),
}));

import { prisma } from "../lib/prisma";
import { findMembershipForUser } from "../services/organizationService";
import { requireOrgAdmin, requireOrgRole, withOrgContext } from "../middleware/orgContext";
import { changeMemberRole, removeMember, transferOwnership } from "../services/labVendorService";

const db = prisma as any;
const ORG_A = "org_lab_a";

const mockResponse = () => {
  const res: any = { statusCode: 0, body: null };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
};

const membershipFor = (role: string, orgStatus = "active") => ({
  id: "mbr-1",
  userId: "user-1",
  organizationId: ORG_A,
  role,
  organization: { id: ORG_A, name: "Lab A", status: orgStatus, kind: "lab_vendor" },
});

beforeEach(() => vi.clearAllMocks());

/**
 * The org-role half of §3.4: `requireRole` says what kind of account someone
 * has platform-wide, these say what they may do inside their own laboratory.
 */
describe("requireOrgRole", () => {
  it("admits a member holding one of the required roles", () => {
    const req: any = { user: { id: "user-1", role: "lab_staff" }, membership: membershipFor("admin") };
    const res = mockResponse();
    const next = vi.fn();

    requireOrgRole("owner", "admin")(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("turns away a member whose role is not enough", () => {
    const req: any = { user: { id: "user-1", role: "lab_staff" }, membership: membershipFor("member") };
    const res = mockResponse();
    const next = vi.fn();

    requireOrgAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("turns away an account with no organization at all", () => {
    const req: any = { user: { id: "user-1", role: "lab_staff" }, membership: null };
    const res = mockResponse();
    const next = vi.fn();

    requireOrgAdmin(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/does not belong to an organization/i);
  });

  it("distinguishes a suspended organization from a missing one", () => {
    const req: any = {
      user: { id: "user-1", role: "lab_staff" },
      membership: membershipFor("owner", "suspended"),
    };
    const res = mockResponse();
    const next = vi.fn();

    requireOrgAdmin(req, res, next);

    // Different message for the user, different thing to alert on.
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/suspended/i);
  });

  it("lets a platform admin through without a membership", () => {
    const req: any = { user: { id: "admin-1", role: "admin" }, membership: null };
    const res = mockResponse();
    const next = vi.fn();

    requireOrgAdmin(req, res, next);

    // This is what makes the oversight console able to read any tenant. It does
    // not grant writes: the vendor-write routes are not mounted for admins.
    expect(next).toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", () => {
    const req: any = {};
    const res = mockResponse();
    const next = vi.fn();

    requireOrgAdmin(req, res, next);

    expect(res.statusCode).toBe(401);
  });
});

describe("withOrgContext", () => {
  it("loads the actor's membership onto the request exactly once", async () => {
    const membership = membershipFor("owner");
    vi.mocked(findMembershipForUser).mockResolvedValue(membership as any);
    const req: any = { user: { id: "user-1", role: "lab_staff" } };
    const next = vi.fn();

    await withOrgContext(req, mockResponse(), next);

    expect(req.membership).toBe(membership);
    expect(findMembershipForUser).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalled();
  });

  it("does not reject an account without an organization", async () => {
    vi.mocked(findMembershipForUser).mockResolvedValue(null);
    const req: any = { user: { id: "admin-1", role: "admin" } };
    const next = vi.fn();

    await withOrgContext(req, mockResponse(), next);

    // Routes that are merely org-aware need the lookup without the gate.
    expect(req.membership).toBeNull();
    expect(next).toHaveBeenCalled();
  });
});

describe("team management guard rails", () => {
  const actor = { id: "owner-1", email: "owner@example.com", role: "lab_owner" } as any;

  it("refuses to change a member belonging to another laboratory", async () => {
    db.membership.findUnique.mockResolvedValue({ id: "mbr-2", organizationId: "org_lab_b", role: "member" });

    await expect(changeMemberRole(actor, ORG_A, "mbr-2", "admin")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("refuses to demote the owner through the role editor", async () => {
    db.membership.findUnique.mockResolvedValue({
      id: "mbr-1",
      organizationId: ORG_A,
      userId: "owner-1",
      role: "owner",
    });

    await expect(changeMemberRole(actor, ORG_A, "mbr-1", "member")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("refuses to let someone change their own role", async () => {
    db.membership.findUnique.mockResolvedValue({
      id: "mbr-9",
      organizationId: ORG_A,
      userId: "owner-1",
      role: "admin",
    });

    await expect(changeMemberRole(actor, ORG_A, "mbr-9", "member")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("refuses to assign owner as an ordinary role", async () => {
    await expect(changeMemberRole(actor, ORG_A, "mbr-2", "owner")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("refuses to remove the owner", async () => {
    db.membership.findUnique.mockResolvedValue({
      id: "mbr-1",
      organizationId: ORG_A,
      userId: "someone",
      role: "owner",
    });

    await expect(removeMember(actor, ORG_A, "mbr-1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("removes the membership but keeps the person's account", async () => {
    db.membership.findUnique.mockResolvedValue({
      id: "mbr-2",
      organizationId: ORG_A,
      userId: "tech-1",
      role: "member",
    });
    db.membership.delete.mockResolvedValue({});

    const result = await removeMember(actor, ORG_A, "mbr-2");

    // Someone leaving a laboratory is not a reason to erase the results they
    // signed off, which deleting the user would do.
    expect(result).toEqual({ removed: true, userId: "tech-1" });
    expect(db.membership.delete).toHaveBeenCalledWith({ where: { id: "mbr-2" } });
  });

  it("transfers ownership by demoting the old owner in the same transaction", async () => {
    db.membership.findUnique.mockResolvedValue({
      id: "mbr-2",
      organizationId: ORG_A,
      userId: "tech-1",
      role: "admin",
    });
    db.membership.findMany.mockResolvedValue([]);

    await transferOwnership(actor, ORG_A, "mbr-2");

    // An organization with two owners or none breaks the same invariant from
    // opposite directions, so both halves happen together.
    expect(db.membership.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_A, role: "owner" },
      data: { role: "admin" },
    });
    expect(db.membership.update).toHaveBeenCalledWith({
      where: { id: "mbr-2" },
      data: { role: "owner" },
    });
    // The lab account's designated owning user follows, so the admin console's
    // search keeps finding the right person after a handover.
    expect(db.labAccount.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_A },
      data: { userId: "tech-1" },
    });
  });
});
