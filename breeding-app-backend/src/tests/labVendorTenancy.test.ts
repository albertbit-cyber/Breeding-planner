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
    labAccount: model(),
    labTestOffering: model(),
    pricingConfig: model(),
    shedTestCatalog: model(),
    membership: model(),
    organization: model(),
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma };
});

import { prisma } from "../lib/prisma";
import {
  createOffering,
  getPricingConfig,
  listOfferings,
  retireOffering,
  updateOffering,
  updatePricingConfig,
} from "../services/labVendorService";

const db = prisma as any;

const ORG_A = "org_lab_a";
const ORG_B = "org_lab_b";

const offeringInA = {
  id: "off-1",
  organizationId: ORG_A,
  name: "Albino",
  category: "morph",
  pricingType: "morph",
  priceCents: 4500,
  currency: "EUR",
  allowedPriorities: ["routine"],
  active: true,
  visibleInBreederApp: true,
};

beforeEach(() => vi.clearAllMocks());

/**
 * The single property this file exists to prove: every read and write in
 * labVendorService is keyed on an organization id supplied by the caller's own
 * membership, so one laboratory can neither see nor touch another's tests,
 * prices or configuration.
 *
 * These are the checks that were missing when a lab account could list every
 * order in the system and PATCH the one global catalog every lab sold against.
 */
describe("test offerings are scoped to one laboratory", () => {
  it("lists only the given organization's offerings", async () => {
    db.labTestOffering.findMany.mockResolvedValue([offeringInA]);

    await listOfferings(ORG_A, false);

    expect(db.labTestOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG_A } })
    );
  });

  it("shows a breeder only what is active and published", async () => {
    db.labTestOffering.findMany.mockResolvedValue([]);

    await listOfferings(ORG_A, true);

    expect(db.labTestOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_A, active: true, visibleInBreederApp: true },
      })
    );
  });

  it("stamps a new offering with the caller's own organization", async () => {
    db.labTestOffering.create.mockResolvedValue(offeringInA);

    await createOffering(ORG_A, { name: "Albino", category: "morph", pricingType: "morph" });

    expect(db.labTestOffering.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: ORG_A }),
    });
  });

  it("refuses to update an offering owned by another laboratory", async () => {
    db.labTestOffering.findUnique.mockResolvedValue(offeringInA);

    // 404 rather than 403: confirming the id exists in another tenant would
    // itself be a small disclosure.
    await expect(updateOffering(ORG_B, "off-1", { name: "Renamed" })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(db.labTestOffering.update).not.toHaveBeenCalled();
  });

  it("refuses to retire an offering owned by another laboratory", async () => {
    db.labTestOffering.findUnique.mockResolvedValue(offeringInA);

    await expect(retireOffering(ORG_B, "off-1")).rejects.toMatchObject({ statusCode: 404 });
    expect(db.labTestOffering.update).not.toHaveBeenCalled();
  });

  it("retires rather than deletes, so historical orders still resolve", async () => {
    db.labTestOffering.findUnique.mockResolvedValue(offeringInA);
    db.labTestOffering.update.mockResolvedValue({ ...offeringInA, active: false });

    await retireOffering(ORG_A, "off-1");

    expect(db.labTestOffering.delete).not.toHaveBeenCalled();
    expect(db.labTestOffering.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false, visibleInBreederApp: false } })
    );
  });

  it("lets a laboratory define a test that exists in no shared library", async () => {
    db.labTestOffering.create.mockResolvedValue({ ...offeringInA, name: "In-house panel" });

    await createOffering(ORG_A, {
      name: "In-house panel",
      category: "other",
      pricingType: "morph",
    });

    // The seed library is a starting point, never a gate on what a lab may sell.
    expect(db.shedTestCatalog.findUnique).not.toHaveBeenCalled();
    expect(db.labTestOffering.create).toHaveBeenCalled();
  });

  it("copies gene mapping when a lab starts from the shared library", async () => {
    db.shedTestCatalog.findUnique.mockResolvedValue({
      id: "morph_albino",
      geneTarget: "TYR",
      shortLabel: "ALB",
      description: "Tyrosinase",
    });
    db.labTestOffering.create.mockResolvedValue(offeringInA);

    await createOffering(ORG_A, {
      name: "Albino",
      category: "morph",
      pricingType: "morph",
      catalogRefId: "morph_albino",
    });

    expect(db.labTestOffering.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ catalogRefId: "morph_albino", geneTarget: "TYR" }),
    });
  });

  it("rejects a library reference that does not exist", async () => {
    db.shedTestCatalog.findUnique.mockResolvedValue(null);

    await expect(
      createOffering(ORG_A, {
        name: "Albino",
        category: "morph",
        pricingType: "morph",
        catalogRefId: "not-a-test",
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("reports a duplicate name within the same laboratory as a conflict", async () => {
    db.labTestOffering.create.mockRejectedValue({ code: "P2002" });

    await expect(
      createOffering(ORG_A, { name: "Albino", category: "morph", pricingType: "morph" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("pricing is scoped to one laboratory", () => {
  it("reads pricing by organization, never by a caller-supplied id", async () => {
    db.pricingConfig.findUnique.mockResolvedValue({
      id: "pricing_org_lab_a",
      organizationId: ORG_A,
      currency: "EUR",
      isActive: true,
    });

    await getPricingConfig(ORG_A);

    expect(db.pricingConfig.findUnique).toHaveBeenCalledWith({ where: { organizationId: ORG_A } });
  });

  it("fails loudly when a laboratory has no pricing rather than falling back", async () => {
    db.pricingConfig.findUnique.mockResolvedValue(null);

    // A silent fallback to a platform default would quote one lab's prices for
    // another lab's work.
    await expect(getPricingConfig(ORG_A)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("writes pricing keyed on the organization", async () => {
    db.pricingConfig.findUnique.mockResolvedValue({ id: "pricing_org_lab_a", organizationId: ORG_A });
    db.pricingConfig.update.mockResolvedValue({
      id: "pricing_org_lab_a",
      organizationId: ORG_A,
      currency: "EUR",
    });

    await updatePricingConfig(ORG_A, { sexTier1to9: 30 });

    expect(db.pricingConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG_A } })
    );
  });

  it("rejects a negative price", async () => {
    db.pricingConfig.findUnique.mockResolvedValue({ id: "p", organizationId: ORG_A });

    await expect(updatePricingConfig(ORG_A, { sexTier1to9: -5 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
