import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signAuthToken } from "../utils/jwt";

vi.mock("../lib/prisma", () => ({
  prisma: {
    shedTestCatalog: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    pricingConfig: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { app } from "../app";
import { prisma } from "../lib/prisma";

const tokenFor = (role: "admin" | "breeder" | "lab_staff" = "breeder") =>
  signAuthToken({
    sub: `${role}-1`,
    email: `${role}@example.com`,
    role,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/lab/tests/catalog", () => {
  it("returns breeder-visible catalog tests for authenticated breeder view", async () => {
    vi.mocked(prisma.shedTestCatalog.findMany).mockResolvedValue([
      {
        id: "test-1",
        name: "Clown",
        category: "morph",
        pricingType: "morph",
        active: true,
        visibleInBreederApp: true,
        sortOrder: 1,
      },
    ] as any);

    const res = await request(app)
      .get("/api/lab/tests/catalog?breederView=true")
      .set("Authorization", `Bearer ${tokenFor("breeder")}`);

    expect(res.status).toBe(200);
    expect(res.body.tests).toHaveLength(1);
    expect(res.body.tests[0]).toMatchObject({ id: "test-1", name: "Clown" });
    expect(prisma.shedTestCatalog.findMany).toHaveBeenCalledWith({
      where: {
        active: true,
        visibleInBreederApp: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/lab/tests/catalog?breederView=true");

    expect(res.status).toBe(401);
    expect(prisma.shedTestCatalog.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/lab/tests/pricing", () => {
  it("returns active pricing for authenticated users", async () => {
    vi.mocked(prisma.pricingConfig.findFirst).mockResolvedValue({
      id: "pricing-1",
      name: "Default",
      isActive: true,
      currency: "EUR",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as any);

    const res = await request(app)
      .get("/api/lab/tests/pricing")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`);

    expect(res.status).toBe(200);
    expect(res.body.pricing).toMatchObject({ id: "pricing-1", name: "Default" });
    expect(prisma.pricingConfig.findFirst).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });
  });
});

