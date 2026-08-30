import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  });
  const prisma: any = {
    labAccount: model(),
    labTestOffering: model(),
    labGeneSubmission: model(),
    pricingConfig: model(),
    shedTestCatalog: model(),
    organization: model(),
    adminAuditLog: model(),
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma };
});
vi.mock("../services/securityEventService", () => ({ recordSecurityEvent: vi.fn() }));
vi.mock("../services/adminService", () => ({ logAdminAction: vi.fn() }));

import { prisma } from "../lib/prisma";
import { logAdminAction } from "../services/adminService";
import { isKnownSpecies, normalizeSpeciesIds, speciesName } from "../services/speciesCatalogService";
import {
  getSpeciesGeneOverlay,
  normalizeGeneType,
  reviewSubmission,
  submitGene,
} from "../services/geneSubmissionService";
import { createOffering, listPublicLabs } from "../services/labVendorService";

const db = prisma as any;
const ADMIN = { id: "admin-1", email: "a@example.com", role: "admin" as const };
const ORG = "org_lab_a";

beforeEach(() => vi.clearAllMocks());

/**
 * The species vocabulary is what makes a breeder's animal match a laboratory's
 * test. The first ProHerper import used scientific ids while the app has always
 * used slugs, so nothing matched at all — these guard against that returning.
 */
describe("species taxonomy", () => {
  it("knows the species the breeder app records on animals", () => {
    for (const id of ["ball-python", "corn-snake", "boa-constrictor", "green-tree-python"]) {
      expect(isKnownSpecies(id)).toBe(true);
    }
  });

  it("rejects scientific ids, which are not what animals carry", () => {
    expect(isKnownSpecies("python_regius")).toBe(false);
    expect(isKnownSpecies("morelia_viridis")).toBe(false);
  });

  it("rejects an unknown species rather than silently dropping it", () => {
    // Dropping it would leave a laboratory wondering why a species it believed
    // it had declared never reaches anyone.
    expect(() => normalizeSpeciesIds(["ball-python", "made-up"])).toThrow(/Unknown species/i);
  });

  it("de-duplicates", () => {
    expect(normalizeSpeciesIds(["ball-python", "ball-python"])).toEqual(["ball-python"]);
  });

  it("resolves a display name", () => {
    expect(speciesName("ball-python")).toBe("Ball Pythons");
  });
});

describe("a test cannot claim a species its laboratory does not serve", () => {
  it("refuses when the laboratory has not declared it", async () => {
    db.labAccount.findUnique.mockResolvedValue({ servedSpeciesIds: ["ball-python"] });

    await expect(
      createOffering(ORG, {
        name: "Scaleless",
        category: "morph",
        pricingType: "morph",
        speciesIds: ["corn-snake"],
      })
    ).rejects.toThrow(/before tagging a test with it/i);
    expect(db.labTestOffering.create).not.toHaveBeenCalled();
  });

  it("allows a species the laboratory serves", async () => {
    db.labAccount.findUnique.mockResolvedValue({ servedSpeciesIds: ["ball-python", "corn-snake"] });
    db.labTestOffering.create.mockResolvedValue({ id: "off-1", organizationId: ORG, name: "Scaleless" });

    await createOffering(ORG, {
      name: "Scaleless",
      category: "morph",
      pricingType: "morph",
      speciesIds: ["corn-snake"],
    });

    expect(db.labTestOffering.create).toHaveBeenCalled();
  });
});

describe("the directory narrows to the species being ordered for", () => {
  it("filters laboratories by served species", async () => {
    db.labAccount.findMany.mockResolvedValue([]);

    await listPublicLabs("corn-snake");

    expect(db.labAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ servedSpeciesIds: { has: "corn-snake" } }),
      })
    );
  });

  it("lists every laboratory when no species is given", async () => {
    db.labAccount.findMany.mockResolvedValue([]);

    await listPublicLabs();

    const where = db.labAccount.findMany.mock.calls[0][0].where;
    expect(where.servedSpeciesIds).toBeUndefined();
  });
});

describe("gene inheritance vocabulary", () => {
  it("translates what laboratories say into what the gene tables store", () => {
    // The tables hold 207 incomplete_dominants and no "co-dom" at all, so the
    // translation happens here rather than asking a laboratory to learn our word.
    expect(normalizeGeneType("co-dominant")).toBe("incomplete_dominant");
    expect(normalizeGeneType("co-dom")).toBe("incomplete_dominant");
    expect(normalizeGeneType("recessive")).toBe("recessive");
    expect(normalizeGeneType("Dominant")).toBe("dominant");
  });

  it("rejects anything else", () => {
    expect(() => normalizeGeneType("polygenic-ish")).toThrow(/recessive, co-dominant, or dominant/i);
  });
});

describe("submitting a gene", () => {
  beforeEach(() => {
    db.labGeneSubmission.findUnique.mockResolvedValue(null);
    db.labGeneSubmission.create.mockResolvedValue({
      id: "sub-1",
      organizationId: ORG,
      speciesId: "ball-python",
      geneName: "Sentinel",
      geneType: "recessive",
      status: "pending",
    });
  });

  it("creates a pending submission, visible to nobody else yet", async () => {
    const result = await submitGene(ORG, {
      speciesId: "ball-python",
      geneName: "Sentinel",
      geneType: "co-dominant",
    });

    expect(result.submission.status).toBe("pending");
    expect(db.labGeneSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ geneType: "incomplete_dominant" }) })
    );
  });

  it("rejects a species the platform does not know", async () => {
    await expect(
      submitGene(ORG, { speciesId: "python_regius", geneName: "X", geneType: "recessive" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses to re-propose a gene already approved", async () => {
    db.labGeneSubmission.findUnique.mockResolvedValue({ id: "sub-0", status: "approved" });

    await expect(
      submitGene(ORG, { speciesId: "ball-python", geneName: "Clown", geneType: "recessive" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses to duplicate another laboratory's pending proposal", async () => {
    db.labGeneSubmission.findUnique.mockResolvedValue({
      id: "sub-0",
      status: "pending",
      organizationId: "org_lab_b",
    });

    // The same gene proposed twice is one fact to review, not two.
    await expect(
      submitGene(ORG, { speciesId: "ball-python", geneName: "Sentinel", geneType: "recessive" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("puts a corrected resubmission back into the queue", async () => {
    db.labGeneSubmission.findUnique.mockResolvedValue({
      id: "sub-0",
      status: "rejected",
      organizationId: ORG,
    });
    db.labGeneSubmission.update.mockResolvedValue({ id: "sub-0", status: "pending" });

    await submitGene(ORG, { speciesId: "ball-python", geneName: "Sentinel", geneType: "recessive" });

    expect(db.labGeneSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending", reviewNote: null }),
      })
    );
  });
});

describe("reviewing a submission", () => {
  beforeEach(() => {
    db.labGeneSubmission.findUnique.mockResolvedValue({
      id: "sub-1",
      status: "pending",
      geneType: "recessive",
    });
    db.labGeneSubmission.update.mockResolvedValue({
      id: "sub-1",
      status: "approved",
      speciesId: "ball-python",
      geneName: "Sentinel",
      geneType: "recessive",
    });
  });

  it("records approval in the audit log", async () => {
    await reviewSubmission(ADMIN, "sub-1", { status: "approved" });

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "gene_submission_approved" })
    );
  });

  it("requires a reason when rejecting", async () => {
    // A laboratory told only "no" cannot correct and resubmit.
    await expect(reviewSubmission(ADMIN, "sub-1", { status: "rejected" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("lets an administrator correct the inheritance type while approving", async () => {
    await reviewSubmission(ADMIN, "sub-1", { status: "approved", geneType: "co-dominant" });

    // The whole point of review: a wrong type would corrupt every prediction
    // for that species.
    expect(db.labGeneSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ geneType: "incomplete_dominant" }),
      })
    );
  });

  it("refuses anything but approve or reject", async () => {
    await expect(reviewSubmission(ADMIN, "sub-1", { status: "maybe" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("the overlay a client merges over the generated tables", () => {
  it("shows only approved genes to a breeder", async () => {
    db.labGeneSubmission.findMany.mockResolvedValue([]);

    await getSpeciesGeneOverlay("ball-python");

    expect(db.labGeneSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { speciesId: "ball-python", status: "approved" } })
    );
  });

  it("also shows a laboratory its own pending genes", async () => {
    db.labGeneSubmission.findMany.mockResolvedValue([]);

    await getSpeciesGeneOverlay("ball-python", ORG);

    // They are never blocked waiting on review for their own catalogue.
    const where = db.labGeneSubmission.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { status: "approved" },
      { status: "pending", organizationId: ORG },
    ]);
  });

  it("marks provenance so a contributed gene is never mistaken for a curated one", async () => {
    db.labGeneSubmission.findMany.mockResolvedValue([
      {
        geneName: "Sentinel",
        geneType: "recessive",
        aliases: [],
        status: "pending",
        organization: { labAccount: { labName: "ProHerper Lab" } },
      },
    ]);

    const overlay = await getSpeciesGeneOverlay("ball-python", ORG);

    expect(overlay.genes[0]).toMatchObject({
      geneName: "Sentinel",
      contributedBy: "ProHerper Lab",
      pendingReview: true,
    });
  });

  it("rejects an unknown species", async () => {
    await expect(getSpeciesGeneOverlay("python_regius")).rejects.toMatchObject({ statusCode: 404 });
  });
});
