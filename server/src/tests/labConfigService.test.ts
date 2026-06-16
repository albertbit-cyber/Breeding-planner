import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    shedTestCatalog: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";
import { updateCatalogItem } from "../services/labConfigService";
import { HttpError } from "../utils/errors";

const mockCatalogItem = {
  id: "clown",
  name: "Clown",
  shortLabel: "Clown",
  geneTarget: "Clown",
  category: "morph",
  pricingType: "morph" as const,
  priceCents: null,
  currency: "EUR",
  allowedPriorities: ["routine", "priority", "urgent"],
  active: true,
  visibleInBreederApp: true,
  description: "Clown genetic test",
  sortOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateCatalogItem", () => {
  it("maps lab-ui patch fields into shared backend catalog columns", async () => {
    vi.mocked(prisma.shedTestCatalog.findUnique).mockResolvedValue(mockCatalogItem);
    vi.mocked(prisma.shedTestCatalog.update).mockResolvedValue({
      ...mockCatalogItem,
      name: "Clown Updated",
      shortLabel: "Cln",
      geneTarget: "clown",
      category: "sex-determination",
      pricingType: "sex",
      priceCents: 4999,
      currency: "EUR",
      allowedPriorities: ["urgent", "routine"],
      active: false,
      visibleInBreederApp: false,
      sortOrder: 3,
    });

    const result = await updateCatalogItem("clown", {
      name: " Clown Updated ",
      shortLabel: " Cln ",
      geneTarget: " clown ",
      pricingType: "sex",
      priceCents: 4999.4,
      currency: " eur ",
      allowedPriorities: ["urgent", "routine", "invalid"],
      isActive: false,
      isVisibleToBreeder: false,
      sortOrder: 3.2,
    });

    expect(prisma.shedTestCatalog.update).toHaveBeenCalledWith({
      where: { id: "clown" },
      data: expect.objectContaining({
        name: "Clown Updated",
        shortLabel: "Cln",
        geneTarget: "clown",
        category: "sex-determination",
        pricingType: "sex",
        priceCents: 4999,
        currency: "EUR",
        allowedPriorities: ["urgent", "routine"],
        active: false,
        visibleInBreederApp: false,
        sortOrder: 3,
      }),
    });
    expect(result).toMatchObject({
      name: "Clown Updated",
      pricingType: "sex",
      category: "sex-determination",
    });
  });

  it("rejects blank names when the patch includes name", async () => {
    vi.mocked(prisma.shedTestCatalog.findUnique).mockResolvedValue(mockCatalogItem);

    await expect(updateCatalogItem("clown", { name: "   " })).rejects.toBeInstanceOf(HttpError);
    await expect(updateCatalogItem("clown", { name: "   " })).rejects.toMatchObject({ statusCode: 400 });
  });
});
