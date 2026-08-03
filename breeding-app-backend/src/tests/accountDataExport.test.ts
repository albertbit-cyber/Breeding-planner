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
});
