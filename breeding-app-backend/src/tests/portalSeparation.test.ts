import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { signAuthToken } from "../utils/jwt";

/**
 * The user-visible defect this file exists for: signing in to the admin console
 * with breeder credentials succeeded, rendered the console shell, and left
 * every request inside it 403ing. No data escaped — the API was already gated —
 * but reaching that screen at all is the bug.
 *
 * Two halves are tested, because either alone is porous: login must refuse to
 * mint a token for the wrong portal, and the routes must refuse a token that
 * was minted for another one and carried across.
 */
vi.mock("../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    refreshSession: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    securityEvent: { create: vi.fn() },
    adminAuditLog: { create: vi.fn(), findMany: vi.fn() },
    adminEscalation: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    report: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../services/refreshTokenSessionService", () => ({
  createRefreshSession: vi.fn(),
  hashRefreshToken: vi.fn(() => "hashed"),
  findActiveRefreshSession: vi.fn(),
  matchesStoredRefreshToken: vi.fn(() => false),
  revokeRefreshSessionsForUser: vi.fn(),
  rotateRefreshSession: vi.fn(),
}));

import { app } from "../app";
import { prisma } from "../lib/prisma";

const db = prisma as any;

const PASSWORD = "correct-horse-battery";

const accountWith = (role: string) => ({
  id: `${role}-1`,
  email: `${role}@example.com`,
  fullName: `${role} person`,
  passwordHash: bcrypt.hashSync(PASSWORD, 4),
  role,
  isActive: true,
  emailVerified: true,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
});

const signInAt = (role: string, portal?: string) =>
  request(app)
    .post("/api/auth/login")
    .send({ email: `${role}@example.com`, password: PASSWORD, ...(portal ? { portal } : {}) });

beforeEach(() => {
  vi.clearAllMocks();
  db.user.update.mockResolvedValue({});
  db.securityEvent.create.mockResolvedValue({});
});

describe("signing in to the wrong portal", () => {
  it("refuses a breeder at the admin console and mints nothing", async () => {
    db.user.findUnique.mockResolvedValue(accountWith("breeder"));

    const res = await signInAt("breeder", "admin");

    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
    // No cookie may be set either: a session that half-exists is worse than none.
    expect(res.headers["set-cookie"]).toBeUndefined();
    // Nothing was written — no refresh token, no last-login stamp.
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("records the attempt as a security event", async () => {
    db.user.findUnique.mockResolvedValue(accountWith("breeder"));

    await signInAt("breeder", "admin");

    expect(db.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "auth.login.blocked_portal", outcome: "blocked" }),
      })
    );
  });

  it("refuses a laboratory account at the admin console", async () => {
    db.user.findUnique.mockResolvedValue(accountWith("lab"));
    const res = await signInAt("lab", "admin");
    expect(res.status).toBe(403);
  });

  it("refuses a breeder at the Laboratory portal", async () => {
    db.user.findUnique.mockResolvedValue(accountWith("breeder"));
    const res = await signInAt("breeder", "lab");
    expect(res.status).toBe(403);
  });

  it("refuses a laboratory account at the breeder app", async () => {
    db.user.findUnique.mockResolvedValue(accountWith("lab"));
    const res = await signInAt("lab", "breeder");
    expect(res.status).toBe(403);
  });

  it("answers a wrong password before it answers the portal question", async () => {
    // Otherwise the form becomes an oracle for which addresses hold staff
    // accounts: 403 for a real admin address, 401 for anything else.
    db.user.findUnique.mockResolvedValue(accountWith("admin"));
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "wrong", portal: "admin" });
    expect(res.status).toBe(401);
  });

  it("lets the owner in everywhere", async () => {
    db.user.findUnique.mockResolvedValue(accountWith("admin"));
    for (const portal of ["admin", "lab", "breeder", "marketplace"]) {
      const res = await signInAt("admin", portal);
      expect(res.status, `owner should reach the ${portal} portal`).toBe(200);
    }
  });

  it("lets a moderator in everywhere too", async () => {
    db.user.findUnique.mockResolvedValue(accountWith("moderator"));
    for (const portal of ["admin", "lab", "breeder", "marketplace"]) {
      const res = await signInAt("moderator", portal);
      expect(res.status, `moderator should reach the ${portal} portal`).toBe(200);
    }
  });

  it("lets a breeder into the breeder app and the marketplace", async () => {
    db.user.findUnique.mockResolvedValue(accountWith("breeder"));
    expect((await signInAt("breeder", "breeder")).status).toBe(200);
    expect((await signInAt("breeder", "marketplace")).status).toBe(200);
  });
});

describe("carrying a token across portals", () => {
  const adminApiCall = (token: string) =>
    request(app).get("/api/admin/dashboard").set("Authorization", `Bearer ${token}`);

  it("refuses an admin-role token that was minted for the breeder app", async () => {
    // The role would pass; the portal is what stops it.
    const token = signAuthToken({
      sub: "admin-1",
      email: "admin@example.com",
      role: "admin",
      portal: "breeder",
    });

    const res = await adminApiCall(token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("wrong_portal");
  });

  it("refuses a token minted before portals existed", async () => {
    // No `portal` claim at all: read as the least privileged surface rather
    // than as a wildcard, so old sessions expire out of the console.
    const token = signAuthToken({ sub: "admin-1", email: "admin@example.com", role: "admin" });
    expect((await adminApiCall(token)).status).toBe(403);
  });
});
