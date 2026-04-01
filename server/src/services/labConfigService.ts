import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";

type TestPricingTypeValue = "morph" | "sex";

export const listCatalog = async (breederView = false) => {
  return prisma.shedTestCatalog.findMany({
    where: breederView
      ? {
          active: true,
          visibleInBreederApp: true,
        }
      : undefined,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
};

export const getActivePricing = async () => {
  const pricing = await prisma.pricingConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!pricing) {
    throw new HttpError(400, "No active pricing configuration found.");
  }
  return pricing;
};

export const updateCatalogItem = async (
  id: string,
  patch: {
    name?: string;
    category?: string;
    pricingType?: TestPricingTypeValue;
    active?: boolean;
    visibleInBreederApp?: boolean;
    description?: string | null;
    sortOrder?: number;
  }
) => {
  const existing = await prisma.shedTestCatalog.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Catalog test not found.");

  return prisma.shedTestCatalog.update({
    where: { id },
    data: patch,
  });
};

export const updatePricingConfig = async (
  id: string,
  patch: Record<string, unknown>
) => {
  const existing = await prisma.pricingConfig.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Pricing config not found.");

  return prisma.pricingConfig.update({
    where: { id },
    data: patch,
  });
};
