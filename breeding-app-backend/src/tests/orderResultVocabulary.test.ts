import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The answers a laboratory may record follow the gene's inheritance, and what
 * is stored on the finding is the genotype the breeder reads. See
 * orderResultService (RESULT_STATUS_RULES) and geneInheritanceService.
 */

const tx = {
  shedTestOrderResult: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  shedTestOrder: { update: vi.fn() },
};

vi.mock("../lib/prisma", () => ({
  prisma: {
    shedTestOrder: { findUnique: vi.fn() },
    labGeneSubmission: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (callback: any) => callback(tx)),
  },
}));

vi.mock("../services/orderNumberService", () => ({
  ensureSharedOrderNumbers: vi.fn(async () => undefined),
}));

vi.mock("../services/labGeneticsService", () => ({
  applyConfirmedResultGenetics: vi.fn(async () => []),
}));

vi.mock("../services/labOrderNotificationService", () => ({
  notifyResultsReady: vi.fn(async () => undefined),
}));

vi.mock("../services/labCertificateService", () => ({
  recordCertificatesForSubmittedResults: vi.fn(async () => undefined),
}));

import { prisma } from "../lib/prisma";
import { saveOrderResult } from "../services/orderResultService";

const db = prisma as any;
const LAB_USER = { id: "lab-user-1", role: "lab_staff" as const };
const ORG = { organizationId: "org-lab" };

const offering = (over: Record<string, unknown>) => ({
  id: "off",
  name: "Test",
  geneTarget: null,
  testKind: "morph",
  speciesIds: ["ball-python"],
  aliases: [],
  ...over,
});

const orderWith = (tests: Array<Record<string, unknown>>) => ({
  id: "order-1",
  status: "in_progress",
  breederId: "breeder-1",
  labOrganizationId: "org-lab",
  animals: [{ animalId: "snake-1", animalName: "Jasmine", tests }],
  results: [],
});

const submit = (items: Array<{ resultStatus: string; index?: number }>) =>
  saveOrderResult(
    "order-1",
    {
      testCode: "SHED-1",
      animalResults: [
        {
          animalId: "snake-1",
          items: items.map((item) => ({
            orderedTestKey: `order-1:snake-1:${item.index || 1}`,
            resultStatus: item.resultStatus,
          })),
        },
      ],
    },
    LAB_USER,
    "submit",
    ORG
  );

const storedFindings = () => tx.shedTestOrderResult.create.mock.calls[0][0].data.findingsJson;

beforeEach(() => {
  vi.clearAllMocks();
  tx.shedTestOrderResult.findFirst.mockResolvedValue(null);
  tx.shedTestOrderResult.create.mockImplementation(async ({ data }: any) => ({ id: "result-1", ...data }));
  tx.shedTestOrder.update.mockResolvedValue({});
  db.labGeneSubmission.findMany.mockResolvedValue([]);
});

describe("result vocabulary by inheritance", () => {
  it("stores a recessive het as the genotype the breeder reads", async () => {
    db.shedTestOrder.findUnique.mockResolvedValue(
      orderWith([{ testNameSnapshot: "Clown", offering: offering({ name: "Clown", geneTarget: "Clown" }) }])
    );
    await submit([{ resultStatus: "heterozygous" }]);

    expect(storedFindings()[0]).toMatchObject({
      marker: "Clown",
      outcome: "carrierDetected",
      resultStatus: "heterozygous",
      label: "het Clown",
      genotype: "Clown",
      inheritance: "recessive",
    });
  });

  it("writes a super form as 'Super <gene>' for an incomplete dominant gene", async () => {
    db.shedTestOrder.findUnique.mockResolvedValue(
      orderWith([{ testNameSnapshot: "Fire", offering: offering({ name: "Fire", geneTarget: "Fire" }) }])
    );
    await submit([{ resultStatus: "super_form" }]);

    expect(storedFindings()[0]).toMatchObject({
      outcome: "positive",
      label: "Super Fire",
      genotype: "Super Fire",
      inheritance: "incomplete_dominant",
    });
  });

  it("spells the gene the way the species table does, not the way the lab sells it", async () => {
    db.shedTestOrder.findUnique.mockResolvedValue(
      orderWith([{ testNameSnapshot: "Pied", offering: offering({ name: "Pied", geneTarget: "Piebald" }) }])
    );
    await submit([{ resultStatus: "homozygous" }]);

    expect(storedFindings()[0]).toMatchObject({ marker: "Pied", label: "Piebald", genotype: "Piebald" });
  });

  it("refuses an answer the gene's inheritance does not allow", async () => {
    db.shedTestOrder.findUnique.mockResolvedValue(
      orderWith([{ testNameSnapshot: "Pinstripe", offering: offering({ name: "Pinstripe", geneTarget: "Pinstripe" }) }])
    );

    await expect(submit([{ resultStatus: "heterozygous" }])).rejects.toThrow(
      /'heterozygous' is not a valid answer for Pinstripe \(dominant gene\)/
    );
    expect(tx.shedTestOrderResult.create).not.toHaveBeenCalled();
  });

  it("records a dominant gene as present or not present", async () => {
    db.shedTestOrder.findUnique.mockResolvedValue(
      orderWith([
        { testNameSnapshot: "Pinstripe", offering: offering({ name: "Pinstripe", geneTarget: "Pinstripe" }) },
        { testNameSnapshot: "Leopard", offering: offering({ name: "Leopard", geneTarget: "Leopard" }) },
      ])
    );
    await submit([
      { resultStatus: "present", index: 1 },
      { resultStatus: "not_present", index: 2 },
    ]);

    const [pin, leopard] = storedFindings();
    expect(pin).toMatchObject({ outcome: "positive", label: "Pinstripe", genotype: "Pinstripe" });
    expect(leopard).toMatchObject({ outcome: "notDetected", label: "Not present" });
    expect(leopard.genotype).toBeUndefined();
  });

  it("records a sex test without touching the genetics engine", async () => {
    db.shedTestOrder.findUnique.mockResolvedValue(
      orderWith([{ testNameSnapshot: "Sex determination", offering: offering({ name: "Sex determination", testKind: "sex" }) }])
    );
    await submit([{ resultStatus: "female" }]);

    expect(storedFindings()[0]).toMatchObject({ outcome: "reported", label: "Female", inheritance: "sex" });
    await expect(submit([{ resultStatus: "homozygous" }])).rejects.toThrow(/not a valid answer/);
  });

  it("falls back to the recessive vocabulary for a gene nobody has typed", async () => {
    db.shedTestOrder.findUnique.mockResolvedValue(
      orderWith([{ testNameSnapshot: "House Marker 7", offering: offering({ name: "House Marker 7" }) }])
    );
    await submit([{ resultStatus: "heterozygous" }]);

    expect(storedFindings()[0]).toMatchObject({ label: "het House Marker 7", inheritance: "unknown" });
  });

  it("still accepts the legacy 'visual' answer from older clients", async () => {
    db.shedTestOrder.findUnique.mockResolvedValue(
      orderWith([{ testNameSnapshot: "Clown", offering: offering({ name: "Clown", geneTarget: "Clown" }) }])
    );
    await submit([{ resultStatus: "visual" }]);

    expect(storedFindings()[0]).toMatchObject({ outcome: "positive", label: "Clown", genotype: "Clown" });
  });

  it("lets a laboratory's own gene submission decide the inheritance", async () => {
    db.labGeneSubmission.findMany.mockResolvedValue([
      {
        speciesId: "ball-python",
        geneName: "Nova Marker",
        geneType: "dominant",
        hasSuperForm: false,
        superGeneName: null,
        aliases: ["NVM"],
      },
    ]);
    db.shedTestOrder.findUnique.mockResolvedValue(
      orderWith([{ testNameSnapshot: "NVM", offering: offering({ name: "NVM", geneTarget: "Nova Marker" }) }])
    );
    await submit([{ resultStatus: "present" }]);

    expect(storedFindings()[0]).toMatchObject({ label: "Nova Marker", inheritance: "dominant" });
  });
});
