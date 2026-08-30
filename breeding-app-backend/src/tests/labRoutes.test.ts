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
    labTestOffering: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
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

/** Puts the acting user inside a vendor lab, the way `withOrgContext` would. */
const inOrganization = (organizationId: string, role = "owner") => {
  vi.mocked((prisma as any).membership.findUnique).mockResolvedValue({
    id: `mbr_${organizationId}`,
    userId: "lab_staff-1",
    organizationId,
    role,
    organization: { id: organizationId, name: "Lab A", status: "active", kind: "lab_vendor" },
  });
};

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

describe("GET /api/lab/my/pricing", () => {
  it("returns the acting laboratory's own pricing", async () => {
    inOrganization("org_lab_a");
    vi.mocked((prisma as any).pricingConfig.findUnique).mockResolvedValue({
      id: "pricing_org_lab_a",
      organizationId: "org_lab_a",
      isActive: true,
      currency: "EUR",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as any);

    const res = await request(app)
      .get("/api/lab/my/pricing")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`);

    expect(res.status).toBe(200);
    expect(res.body.pricing).toMatchObject({ id: "pricing_org_lab_a", organizationId: "org_lab_a" });
    // Keyed on the caller's own organization, never on an id from the request:
    // this is what stops one lab reading another lab's prices.
    expect((prisma as any).pricingConfig.findUnique).toHaveBeenCalledWith({
      where: { organizationId: "org_lab_a" },
    });
  });

  it("refuses a lab account that belongs to no organization", async () => {
    vi.mocked((prisma as any).membership.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .get("/api/lab/my/pricing")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`);

    expect(res.status).toBe(403);
  });
});

describe("shared seed library writes", () => {
  it("rejects a lab user from editing the platform test library", async () => {
    inOrganization("org_lab_a");

    const res = await request(app)
      .patch("/api/lab/tests/catalog/test-1")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`)
      .send({ name: "Renamed by a vendor" });

    // Vendors used to be able to rewrite the definitions every other lab sold
    // against. The library is the platform's; a lab edits its own offerings.
    expect(res.status).toBe(403);
    expect(prisma.shedTestCatalog.update).not.toHaveBeenCalled();
  });
});

describe("GET /api/lab/my/tests", () => {
  it("lists only the acting laboratory's own offerings", async () => {
    inOrganization("org_lab_a");
    vi.mocked((prisma as any).labTestOffering.findMany).mockResolvedValue([]);

    const res = await request(app)
      .get("/api/lab/my/tests")
      .set("Authorization", `Bearer ${tokenFor("lab_staff")}`);

    expect(res.status).toBe(200);
    expect((prisma as any).labTestOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org_lab_a" } })
    );
  });
});

