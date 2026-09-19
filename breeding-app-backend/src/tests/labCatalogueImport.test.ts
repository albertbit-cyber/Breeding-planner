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
import { importOfferings } from "../services/labVendorService";

const db = prisma as any;
const ORG = "org_lab_a";

/**
 * The bulk half of the spreadsheet onboarding: a laboratory hands over its whole
 * price list at once instead of adding sixty-eight tests through a form.
 *
 * The property these tests exist to hold is that arriving in bulk buys a row
 * nothing. Every row goes through the same validation and the same
 * served-species rule as a test typed into the form, and a row that fails is
 * reported by position rather than taking the file down with it.
 */

/** One parsed spreadsheet row, as the portal's importer produces it. */
const offering = (over: Record<string, unknown> = {}) => ({
  name: "Clown",
  category: "morph",
  pricingType: "morph",
  testKind: "morph",
  speciesIds: ["ball-python"],
  priceModel: "tier",
  tierPrices: { t1: 3500, t2: 3000, t3: 2500 },
  aliases: [],
  availability: "available",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.labAccount.findUnique.mockResolvedValue({ servedSpeciesIds: ["ball-python", "corn-snake"] });
  db.labTestOffering.findMany.mockResolvedValue([]);
  db.labTestOffering.create.mockImplementation(async ({ data }: any) => ({ id: "new", ...data }));
  db.labTestOffering.update.mockImplementation(async ({ data }: any) => ({ id: "off-1", ...data }));
});

describe("a dry run says what would happen and writes nothing", () => {
  it("reports the plan without touching the database", async () => {
    const result = await importOfferings(ORG, {
      offerings: [offering(), offering({ name: "Piebald" })],
      dryRun: true,
    });

    expect(result.willCreate.map((row: any) => row.name)).toEqual(["Clown", "Piebald"]);
    expect(result.created).toBe(0);
    expect(db.labTestOffering.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("tells a laboratory which rows would update a test it already offers", async () => {
    db.labTestOffering.findMany.mockResolvedValue([
      { id: "off-1", name: "Clown", sortOrder: 4, active: true },
    ]);

    const result = await importOfferings(ORG, {
      offerings: [offering(), offering({ name: "Piebald" })],
      dryRun: true,
    });

    expect(result.willUpdate).toEqual([{ id: "off-1", name: "Clown", active: true }]);
    expect(result.willCreate).toEqual([{ name: "Piebald" }]);
  });

  // A test taken off sale that reappears in the price list stays off sale.
  // Saying so in the plan is what keeps that from being a mystery later.
  it("flags a matched test that is currently retired", async () => {
    db.labTestOffering.findMany.mockResolvedValue([
      { id: "off-1", name: "Clown", sortOrder: 4, active: false },
    ]);

    const result = await importOfferings(ORG, { offerings: [offering()], dryRun: true });

    expect(result.willUpdate).toEqual([{ id: "off-1", name: "Clown", active: false }]);
  });
});

describe("importing writes the whole list in one transaction", () => {
  it("creates what is new and updates what is matched by name", async () => {
    db.labTestOffering.findMany.mockResolvedValue([
      { id: "off-1", name: "clown", sortOrder: 7, active: true },
    ]);

    const result = await importOfferings(ORG, {
      offerings: [offering({ name: "Clown" }), offering({ name: "Piebald" })],
    });

    expect(result).toMatchObject({ created: 1, updated: 1 });
    expect(db.labTestOffering.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "off-1" } })
    );
    expect(db.labTestOffering.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Piebald", organizationId: ORG }),
      })
    );
  });

  it("appends new tests after the catalogue a laboratory already has", async () => {
    db.labTestOffering.findMany.mockResolvedValue([
      { id: "off-1", name: "Albino", sortOrder: 12, active: true },
    ]);

    await importOfferings(ORG, { offerings: [offering(), offering({ name: "Piebald" })] });

    const orders = db.labTestOffering.create.mock.calls.map((call: any) => call[0].data.sortOrder);
    expect(orders).toEqual([13, 14]);
  });

  // A supplementary file of ten tests must not renumber itself to the top of a
  // catalogue of sixty-eight.
  it("leaves the order of tests it updates alone", async () => {
    db.labTestOffering.findMany.mockResolvedValue([
      { id: "off-1", name: "Clown", sortOrder: 40, active: true },
    ]);

    await importOfferings(ORG, { offerings: [offering()] });

    expect(db.labTestOffering.update.mock.calls[0][0].data).not.toHaveProperty("sortOrder");
  });

  it("carries the per-test tier prices the spreadsheet states", async () => {
    await importOfferings(ORG, { offerings: [offering()] });

    expect(db.labTestOffering.create.mock.calls[0][0].data.tierPricesJson).toEqual({
      t1: 3500,
      t2: 3000,
      t3: 2500,
    });
  });

  // The file is the whole truth about a test: a laboratory that cleared the Gene
  // column means the test no longer maps to a gene.
  it("clears a field the laboratory emptied rather than keeping the old value", async () => {
    db.labTestOffering.findMany.mockResolvedValue([
      { id: "off-1", name: "Clown", sortOrder: 1, active: true },
    ]);

    await importOfferings(ORG, { offerings: [offering()] });

    const data = db.labTestOffering.update.mock.calls[0][0].data;
    expect(data.geneTarget).toBeNull();
    expect(data.description).toBeNull();
    expect(data.turnaroundDays).toBeNull();
  });

  // Neither is a spreadsheet column, and a re-import must not put a withdrawn
  // test back on sale.
  it("never revives a test the laboratory took off sale", async () => {
    db.labTestOffering.findMany.mockResolvedValue([
      { id: "off-1", name: "Clown", sortOrder: 1, active: false },
    ]);

    await importOfferings(ORG, { offerings: [offering()] });

    const data = db.labTestOffering.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("active");
    expect(data).not.toHaveProperty("visibleInBreederApp");
  });
});

describe("a bad row is reported and the rest of the file still imports", () => {
  it("refuses a species the laboratory has not said it serves", async () => {
    const result = await importOfferings(ORG, {
      offerings: [offering(), offering({ name: "Axanthic", speciesIds: ["hognose-snake"] })],
    });

    expect(result.created).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ position: 2, name: "Axanthic" });
    expect(result.rejected[0].message).toContain("serves");
  });

  it("refuses the same test listed twice in one file", async () => {
    const result = await importOfferings(ORG, { offerings: [offering(), offering()] });

    expect(result.created).toBe(1);
    expect(result.rejected[0].message).toContain("more than once");
  });

  it("refuses a price no one meant", async () => {
    const result = await importOfferings(ORG, {
      offerings: [offering({ name: "Broken", tierPrices: { t1: 3500, t2: 3000 } })],
      dryRun: true,
    });

    expect(result.willCreate).toEqual([]);
    expect(result.rejected[0].message).toContain("all three order sizes");
  });

  it("stops rather than half-import a file where nothing is usable", async () => {
    await expect(
      importOfferings(ORG, { offerings: [offering({ speciesIds: ["hognose-snake"] })] })
    ).rejects.toThrow(/Not one test/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("the import is scoped to the caller's own laboratory", () => {
  it("checks species against the acting organization's own profile", async () => {
    await importOfferings(ORG, { offerings: [offering()], dryRun: true });

    expect(db.labAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG } })
    );
    expect(db.labTestOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG } })
    );
  });

  it("refuses a file larger than an onboarding import should ever be", async () => {
    const many = Array.from({ length: 501 }, (_, index) => offering({ name: `Test ${index}` }));
    await expect(importOfferings(ORG, { offerings: many })).rejects.toThrow(/limited to 500/);
  });
});
