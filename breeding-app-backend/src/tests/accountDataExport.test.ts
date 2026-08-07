import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

// Defined inside the factory: vi.mock is hoisted above every top-level
// binding, so a helper declared outside is still in its temporal dead zone.
vi.mock("../lib/prisma", () => {
  const listModel = (rows: unknown[] = []) => ({ findMany: vi.fn().mockResolvedValue(rows) });

  return {
    prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    refreshSession: { create: vi.fn(), updateMany: vi.fn() },
    securityEvent: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    membership: { findUnique: vi.fn().mockResolvedValue(null) },
    profile: { findUnique: vi.fn().mockResolvedValue({ breederName: "Test Reptiles" }) },
    breederPlannerState: { findUnique: vi.fn().mockResolvedValue(null) },
    animal: listModel([{ id: "animal-1", name: "Kaa" }]),
    pairing: listModel(),
    clutch: listModel(),
    reproductiveCycle: listModel(),
    listing: listModel(),
    savedSearch: listModel(),
    notificationPreference: listModel(),
    marketplaceListing: listModel(),
    marketplaceStore: listModel(),
    marketplaceFavorite: listModel(),
    shedTestOrder: listModel(),
    usageTracking: listModel(),
    userDeviceSession: listModel(),
    mobileScanLog: listModel(),
    userSubscription: listModel(),
    marketplaceConversation: listModel(),
    marketplaceSale: listModel(),
    marketplaceReview: listModel(),
    listingInquiry: listModel(),
      report: listModel(),
      emailJob: listModel(),
    },
  };
});

vi.mock("../email/queueService", () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ id: "job-1" }),
}));

import { app } from "../app";
import { prisma } from "../lib/prisma";

const db = prisma as any;

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  passwordHash: bcrypt.hashSync("password123", 1),
  fullName: "Test User",
  role: "breeder",
  isActive: true,
  emailVerified: true,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const getToken = async (): Promise<string> => {
  db.user.findUnique.mockResolvedValue(mockUser);
  db.user.update.mockResolvedValue(mockUser);
  db.refreshSession.create.mockResolvedValue({ id: "session-1" });
  const res = await request(app).post("/api/auth/login").send({ email: mockUser.email, password: "password123" });
  return res.body.token;
};

beforeEach(() => {
  vi.clearAllMocks();
  db.refreshSession.updateMany.mockResolvedValue({ count: 1 });
  db.membership.findUnique.mockResolvedValue(null);
  db.profile.findUnique.mockResolvedValue({ breederName: "Test Reptiles" });
  db.breederPlannerState.findUnique.mockResolvedValue(null);
  db.animal.findMany.mockResolvedValue([{ id: "animal-1", name: "Kaa" }]);
  db.securityEvent.findMany.mockResolvedValue([]);
});

describe("GET /api/auth/me/export", () => {
  it("returns the user's records as a downloadable JSON file", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);

    const res = await request(app).get("/api/auth/me/export").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain(".json");
    expect(res.headers["cache-control"]).toBe("no-store");

    const body = JSON.parse(res.text);
    expect(body.formatVersion).toBe(1);
    expect(body.account.email).toBe("test@example.com");
    expect(body.records.animals).toHaveLength(1);
    expect(body.records.profile.breederName).toBe("Test Reptiles");
  });

  it("never asks the database for credentials", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);

    await request(app).get("/api/auth/me/export").set("Authorization", `Bearer ${token}`);

    // Asserted on the query rather than the response body: this suite's Prisma
    // is a mock that ignores `select` and echoes the whole fixture back, so a
    // body assertion here would fail on the mock's behaviour, not the code's.
    // The allow-list in the select clause is the actual control.
    const select = db.user.findUnique.mock.calls.at(-1)[0].select;
    expect(select).toBeDefined();
    expect(select.passwordHash).toBeUndefined();
    expect(select.refreshToken).toBeUndefined();
    expect(select.passwordResetToken).toBeUndefined();
    expect(select.email).toBe(true);
  });

  it("selects device sessions without the push token", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);

    await request(app).get("/api/auth/me/export").set("Authorization", `Bearer ${token}`);

    const call = db.userDeviceSession.findMany.mock.calls[0][0];
    expect(call.select.pushToken).toBeUndefined();
    expect(call.select.deviceName).toBe(true);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/auth/me/export");
    expect(res.status).toBe(401);
  });

  it("exports every group and marks the file complete when none are named", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);

    const res = await request(app).get("/api/auth/me/export").set("Authorization", `Bearer ${token}`);

    const body = JSON.parse(res.text);
    expect(body.selection.complete).toBe(true);
    expect(body.selection.omitted).toEqual([]);
    expect(body.records.animals).toBeDefined();
    expect(body.records.labOrders).toBeDefined();
    expect(body.shared.conversations).toBeDefined();
    expect(body.security.securityEvents).toBeDefined();
    expect(res.headers["content-disposition"]).not.toContain("partial");
  });
});

describe("GET /api/auth/me/export?groups=", () => {
  it("returns only the named groups", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);

    const res = await request(app)
      .get("/api/auth/me/export?groups=animals")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = JSON.parse(res.text);

    expect(body.records.animals).toHaveLength(1);
    expect(body.records.pairings).toBeDefined();
    // Marketplace, messages, reviews and security were not asked for.
    expect(body.records.marketplaceListings).toBeUndefined();
    expect(body.shared.conversations).toBeUndefined();
    expect(body.shared.reviewsWritten).toBeUndefined();
    expect(body.security.securityEvents).toBeUndefined();
  });

  it("does not query the tables behind a group that was not selected", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);

    await request(app).get("/api/auth/me/export?groups=animals").set("Authorization", `Bearer ${token}`);

    // The whole point of narrowing server-side: the work is skipped, not done
    // and then discarded.
    expect(db.animal.findMany).toHaveBeenCalled();
    expect(db.marketplaceListing.findMany).not.toHaveBeenCalled();
    expect(db.marketplaceConversation.findMany).not.toHaveBeenCalled();
    expect(db.marketplaceReview.findMany).not.toHaveBeenCalled();
    expect(db.shedTestOrder.findMany).not.toHaveBeenCalled();
    expect(db.userDeviceSession.findMany).not.toHaveBeenCalled();
  });

  it("always includes the account group, even when it is not named", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);

    const res = await request(app)
      .get("/api/auth/me/export?groups=lab")
      .set("Authorization", `Bearer ${token}`);

    const body = JSON.parse(res.text);
    expect(body.account.email).toBe("test@example.com");
    expect(body.records.profile.breederName).toBe("Test Reptiles");
    expect(body.selection.included).toContain("account");
    expect(body.records.animals).toBeUndefined();
  });

  it("flags a narrowed export as partial in the file and the filename", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);

    const res = await request(app)
      .get("/api/auth/me/export?groups=animals")
      .set("Authorization", `Bearer ${token}`);

    const body = JSON.parse(res.text);
    // A partial file must never be mistakable for a complete Art. 20 response.
    expect(body.selection.complete).toBe(false);
    expect(body.selection.omitted).toContain("marketplace");
    expect(body.notice).toContain("partial export");
    expect(res.headers["content-disposition"]).toContain("-partial.json");
  });

  it("rejects an unknown group instead of silently ignoring it", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);

    const res = await request(app)
      .get("/api/auth/me/export?groups=animals,passwords")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(db.animal.findMany).not.toHaveBeenCalled();
  });

  it("still never asks the database for credentials when narrowed", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);

    await request(app).get("/api/auth/me/export?groups=animals").set("Authorization", `Bearer ${token}`);

    const select = db.user.findUnique.mock.calls.at(-1)[0].select;
    expect(select.passwordHash).toBeUndefined();
    expect(select.email).toBe(true);
  });
});
