import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signAuthToken } from "../utils/jwt";

/**
 * Moderators may look at everything in the admin console and change nothing.
 *
 * The rule lives inside `requireRole` rather than on the admin router, because
 * admin power is not confined to that router: subscription tiers, marketplace
 * stores, the shared test catalogue and "delete every order" are all gated by
 * `requireRole("admin")` from four other files. A guard mounted on the router
 * would have left every one of those writable. The cases below are drawn from
 * each of those files deliberately.
 */
vi.mock("../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn(), create: vi.fn() },
    adminAuditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    adminEscalation: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    report: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    securityEvent: { create: vi.fn() },
    membership: { findUnique: vi.fn() },
    shedTestCatalog: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));

import { app } from "../app";
import { prisma } from "../lib/prisma";

const db = prisma as any;

const tokenFor = (role: string, portal = "admin") =>
  signAuthToken({ sub: `${role}-1`, email: `${role}@example.com`, role: role as any, portal: portal as any });

const asModerator = () => `Bearer ${tokenFor("moderator")}`;
const asOwner = () => `Bearer ${tokenFor("admin")}`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a moderator's writes are refused across every admin-gated route", () => {
  const writes: Array<[string, string, string]> = [
    ["patch", "/api/admin/users/u1/role", "the admin router"],
    ["patch", "/api/admin/users/u1/status", "the admin router"],
    ["post", "/api/admin/users", "team creation"],
    ["patch", "/api/admin/gdpr-requests/g1", "GDPR handling"],
    ["post", "/api/admin/notifications/send", "broadcast notifications"],
    ["post", "/api/subscriptions/admin/tiers", "subscriptionRoutes"],
    ["patch", "/api/subscriptions/admin/tiers/t1", "subscriptionRoutes"],
    ["patch", "/api/marketplace/admin/stores/u1", "marketplaceRoutes"],
    ["post", "/api/lab/tests/catalog", "labRoutes"],
    ["delete", "/api/lab/orders", "orderRoutes"],
  ];

  it.each(writes)("refuses %s %s (%s)", async (method, path) => {
    const res = await (request(app) as any)[method](path)
      .set("Authorization", asModerator())
      .send({ role: "breeder", reason: "because" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("moderator_read_only");
  });
});

describe("a moderator's reads are allowed", () => {
  it("can open the user list the owner sees", async () => {
    db.user.findMany.mockResolvedValue([]);
    db.user.count.mockResolvedValue(0);

    const res = await request(app).get("/api/admin/users").set("Authorization", asModerator());

    expect(res.status).toBe(200);
  });
});

describe("the two writes a moderator is allowed", () => {
  it("can raise an escalation for the owner", async () => {
    db.adminEscalation.create.mockResolvedValue({
      id: "esc-1",
      subject: "Suspicious listing",
      note: "Same photos as a banned seller.",
      status: "open",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    db.adminAuditLog.create.mockResolvedValue({});

    const res = await request(app)
      .post("/api/admin/escalations")
      .set("Authorization", asModerator())
      .send({ subject: "Suspicious listing", note: "Same photos as a banned seller." });

    expect(res.status).toBe(201);
    expect(db.adminEscalation.create).toHaveBeenCalled();
  });

  it("can escalate a report but cannot act on one", async () => {
    db.report.findUnique.mockResolvedValue({ id: "r1", reportedUserId: "u9", status: "open" });
    db.report.update.mockResolvedValue({ id: "r1", status: "escalated" });
    db.adminAuditLog.create.mockResolvedValue({});

    const escalated = await request(app)
      .post("/api/admin/reports/r1/action")
      .set("Authorization", asModerator())
      .send({ action: "escalate_report", reason: "Needs the owner" });
    expect(escalated.status).toBe(200);

    const banned = await request(app)
      .post("/api/admin/reports/r1/action")
      .set("Authorization", asModerator())
      .send({ action: "ban_account", reason: "Needs the owner" });
    expect(banned.status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("cannot resolve the escalation it raised — that is the owner's call", async () => {
    db.adminEscalation.findUnique.mockResolvedValue({ id: "esc-1", status: "open", subjectUserId: null });

    const res = await request(app)
      .patch("/api/admin/escalations/esc-1")
      .set("Authorization", asModerator())
      .send({ status: "resolved" });

    expect(res.status).toBe(403);
  });
});

describe("the owner is unaffected", () => {
  it("may still change a role", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "breeder", email: "b@example.com" });
    db.user.update.mockResolvedValue({ id: "u1", role: "moderator", email: "b@example.com" });
    db.adminAuditLog.create.mockResolvedValue({});

    const res = await request(app)
      .patch("/api/admin/users/u1/role")
      .set("Authorization", asOwner())
      .send({ role: "moderator", reason: "Joining the team" });

    expect(res.status).toBe(200);
  });

  it("cannot mint a second owner, by either door", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "breeder", email: "b@example.com" });

    const promoted = await request(app)
      .patch("/api/admin/users/u1/role")
      .set("Authorization", asOwner())
      .send({ role: "admin", reason: "Second owner" });
    expect(promoted.status).toBe(400);

    db.user.findUnique.mockResolvedValue(null);
    const created = await request(app)
      .post("/api/admin/users")
      .set("Authorization", asOwner())
      .send({ email: "new@example.com", fullName: "New Person", role: "admin", reason: "Second owner" });
    expect(created.status).toBe(400);
  });

  it("cannot have its own role changed out from under it", async () => {
    db.user.findUnique.mockResolvedValue({ id: "admin-1", role: "admin", email: "admin@example.com" });

    const res = await request(app)
      .patch("/api/admin/users/admin-1/role")
      .set("Authorization", asOwner())
      .send({ role: "breeder", reason: "Stepping down" });

    expect(res.status).toBe(403);
  });
});
