import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signAuthToken } from "../utils/jwt";

/**
 * Route-level tenant isolation: two vendor laboratories against the live
 * Express stack, asserting that Lab B cannot reach Lab A's data through any
 * lab-facing route.
 *
 * The service-level equivalents live in labVendorTenancy.test.ts. This file
 * exists because isolation that holds in a service but is not wired into the
 * route stack protects nothing — the original defect was exactly that shape:
 * the ownership rules existed, the order routes just never asked.
 */

vi.mock("../lib/prisma", () => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    groupBy: vi.fn(),
  });
  const prisma: any = {
    user: model(),
    membership: model(),
    organization: model(),
    labAccount: model(),
    labTestOffering: model(),
    pricingConfig: model(),
    shedTestCatalog: model(),
    shedTestOrder: model(),
    adminAuditLog: model(),
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma };
});

vi.mock("../services/orderNumberService", () => ({
  ensureSharedOrderNumbers: vi.fn(),
  buildNextOrderNumber: vi.fn(() => "01AA00001"),
}));

import { app } from "../app";
import { prisma } from "../lib/prisma";

const db = prisma as any;

const ORG_A = "org_lab_a";
const ORG_B = "org_lab_b";

const tokenForLab = (suffix: string) =>
  signAuthToken({
    sub: `lab-${suffix}`,
    email: `lab-${suffix}@example.com`,
    role: "lab_staff",
    persistedRole: "lab",
  });

/** Puts the acting user inside one laboratory, the way `withOrgContext` would. */
const actingFor = (organizationId: string) => {
  db.membership.findUnique.mockResolvedValue({
    id: `mbr_${organizationId}`,
    userId: "lab-b",
    organizationId,
    role: "owner",
    organization: { id: organizationId, name: "A Lab", status: "active", kind: "lab_vendor" },
  });
};

const orderOwnedByA = {
  id: "order-1",
  orderNumber: "01AA00001",
  breederId: "breeder-1",
  labOrganizationId: ORG_A,
  status: "submitted",
  animals: [],
  results: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ emailVerified: true });
});

describe("one laboratory cannot reach another's orders", () => {
  it("lists only its own queue", async () => {
    actingFor(ORG_B);
    db.shedTestOrder.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/api/lab/orders")
      .set("Authorization", `Bearer ${tokenForLab("b")}`);

    expect(res.status).toBe(200);
    expect(db.shedTestOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { labOrganizationId: ORG_B } })
    );
  });

  it("cannot open another laboratory's order", async () => {
    actingFor(ORG_B);
    db.shedTestOrder.findUnique.mockResolvedValue(orderOwnedByA);

    const res = await request(app)
      .get("/api/lab/orders/order-1")
      .set("Authorization", `Bearer ${tokenForLab("b")}`);

    expect(res.status).toBe(404);
  });

  it("cannot advance another laboratory's order", async () => {
    actingFor(ORG_B);
    db.shedTestOrder.findUnique.mockResolvedValue(orderOwnedByA);

    const res = await request(app)
      .patch("/api/lab/orders/order-1/status")
      .set("Authorization", `Bearer ${tokenForLab("b")}`)
      .send({ status: "received" });

    expect(res.status).toBe(404);
    expect(db.shedTestOrder.update).not.toHaveBeenCalled();
  });

  it("cannot mark another laboratory's order paid", async () => {
    actingFor(ORG_B);
    db.shedTestOrder.findUnique.mockResolvedValue(orderOwnedByA);

    const res = await request(app)
      .patch("/api/lab/orders/order-1/payment")
      .set("Authorization", `Bearer ${tokenForLab("b")}`)
      .send({ paymentStatus: "paid" });

    expect(res.status).toBe(404);
    expect(db.shedTestOrder.update).not.toHaveBeenCalled();
  });

  it("cannot delete another laboratory's order", async () => {
    actingFor(ORG_B);
    db.shedTestOrder.findUnique.mockResolvedValue(orderOwnedByA);

    const res = await request(app)
      .delete("/api/lab/orders/order-1")
      .set("Authorization", `Bearer ${tokenForLab("b")}`);

    expect(res.status).toBe(404);
    expect(db.shedTestOrder.delete).not.toHaveBeenCalled();
  });

  it("cannot write results onto another laboratory's order", async () => {
    actingFor(ORG_B);
    db.shedTestOrder.findUnique.mockResolvedValue(orderOwnedByA);

    const res = await request(app)
      .post("/api/lab/orders/order-1/results/submit")
      .set("Authorization", `Bearer ${tokenForLab("b")}`)
      .send({ orderId: "order-1", testCode: "X", animalResults: [] });

    // Writing a result changes the animal's recorded genetics downstream, so
    // this is the most consequential of the lot.
    expect(res.status).toBe(404);
  });

  it("refuses a lab account that belongs to no organization", async () => {
    db.membership.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/lab/orders")
      .set("Authorization", `Bearer ${tokenForLab("b")}`);

    expect(res.status).toBe(403);
    expect(db.shedTestOrder.findMany).not.toHaveBeenCalled();
  });
});

describe("one laboratory cannot reach another's tests or prices", () => {
  it("lists only its own tests", async () => {
    actingFor(ORG_B);
    db.labTestOffering.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/api/lab/my/tests")
      .set("Authorization", `Bearer ${tokenForLab("b")}`);

    expect(res.status).toBe(200);
    expect(db.labTestOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG_B } })
    );
  });

  it("cannot edit a test belonging to another laboratory", async () => {
    actingFor(ORG_B);
    db.labTestOffering.findUnique.mockResolvedValue({ id: "off-1", organizationId: ORG_A });

    const res = await request(app)
      .patch("/api/lab/my/tests/off-1")
      .set("Authorization", `Bearer ${tokenForLab("b")}`)
      .send({ priceCents: 1 });

    expect(res.status).toBe(404);
    expect(db.labTestOffering.update).not.toHaveBeenCalled();
  });

  it("reads its own pricing and never another laboratory's", async () => {
    actingFor(ORG_B);
    db.pricingConfig.findUnique.mockResolvedValue({
      id: "pricing_org_lab_b",
      organizationId: ORG_B,
      currency: "EUR",
      isActive: true,
    });

    const res = await request(app)
      .get("/api/lab/my/pricing")
      .set("Authorization", `Bearer ${tokenForLab("b")}`);

    expect(res.status).toBe(200);
    expect(db.pricingConfig.findUnique).toHaveBeenCalledWith({ where: { organizationId: ORG_B } });
  });

  it("cannot write to the platform's shared test library", async () => {
    actingFor(ORG_B);

    const res = await request(app)
      .patch("/api/lab/tests/catalog/morph_albino")
      .set("Authorization", `Bearer ${tokenForLab("b")}`)
      .send({ name: "Renamed by a vendor" });

    // A vendor rewriting the library would change the definitions every other
    // laboratory sells against.
    expect(res.status).toBe(403);
    expect(db.shedTestCatalog.update).not.toHaveBeenCalled();
  });
});

describe("the ordering path names a laboratory", () => {
  it("refuses a quote with no laboratory chosen", async () => {
    db.membership.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/lab/orders/calculate-price")
      .set(
        "Authorization",
        `Bearer ${signAuthToken({ sub: "breeder-1", email: "b@example.com", role: "breeder" })}`
      )
      .send({ animals: [{ animalId: "a-1", selectedTestIds: ["t-1"] }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/laborator/i);
  });

  it("refuses to quote against a laboratory that is not accepting orders", async () => {
    db.membership.findUnique.mockResolvedValue(null);
    db.labAccount.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/lab/orders/calculate-price")
      .set(
        "Authorization",
        `Bearer ${signAuthToken({ sub: "breeder-1", email: "b@example.com", role: "breeder" })}`
      )
      .send({
        labOrganizationId: "org_suspended",
        animals: [{ animalId: "a-1", selectedTestIds: ["t-1"] }],
      });

    expect(res.status).toBe(404);
  });

  it("refuses to quote when the chosen laboratory has no pricing of its own", async () => {
    db.membership.findUnique.mockResolvedValue(null);
    db.labAccount.findFirst.mockResolvedValue({ labName: "Helix" });
    db.labTestOffering.findMany.mockResolvedValue([{ id: "off-1", active: true }]);
    db.pricingConfig.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/lab/orders/calculate-price")
      .set(
        "Authorization",
        `Bearer ${signAuthToken({ sub: "breeder-1", email: "b@example.com", role: "breeder" })}`
      )
      .send({
        labOrganizationId: ORG_A,
        animals: [{ animalId: "a-1", selectedTestIds: ["off-1"] }],
      });

    // Never silently falls back to a platform default: that would quote one
    // laboratory's prices for another's work.
    expect(res.status).toBe(409);
  });
});
