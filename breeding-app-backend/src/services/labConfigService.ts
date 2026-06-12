import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";

type TestPricingTypeValue = "morph" | "sex";
type AllowedPriorityValue = "routine" | "priority" | "urgent";

const DEFAULT_ALLOWED_PRIORITIES: AllowedPriorityValue[] = ["routine", "priority", "urgent"];

const normalizeCategory = (value: unknown, fallback = "morph"): string => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "sex" || normalized === "sex-determination" || normalized.includes("sex")) {
    return "sex-determination";
  }
  if (normalized === "other") return "other";
  return "morph";
};

const normalizePricingType = (
  value: unknown,
  fallback: TestPricingTypeValue = "morph"
): TestPricingTypeValue => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "sex" ? "sex" : "morph";
};

const normalizeOptionalText = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  const normalized = String(value || "").trim();
  return normalized || null;
};

const normalizeAllowedPriorities = (value: unknown): AllowedPriorityValue[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [...DEFAULT_ALLOWED_PRIORITIES];
  const normalized = Array.from(
    new Set(
      value
        .map((entry) => String(entry || "").trim().toLowerCase())
        .filter((entry): entry is AllowedPriorityValue =>
          entry === "routine" || entry === "priority" || entry === "urgent"
        )
    )
  );
  return normalized.length ? normalized : [...DEFAULT_ALLOWED_PRIORITIES];
};

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

export const createCatalogItem = async (body: {
  name?: string;
  shortLabel?: string | null;
  geneTarget?: string | null;
  category?: string;
  pricingType?: TestPricingTypeValue;
  priceCents?: number | null;
  currency?: string;
  allowedPriorities?: string[];
  active?: boolean;
  visibleInBreederApp?: boolean;
  description?: string | null;
  sortOrder?: number;
}) => {
  const name = String(body.name || "").trim();
  if (!name) throw new HttpError(400, "Test name is required.");

  const toCode = (s: string) =>
    s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "TEST";
  const pricingType = normalizePricingType(body.pricingType);
  const category = normalizeCategory(body.category, pricingType === "sex" ? "sex-determination" : "morph");
  const id = `morph-${toCode(name).toLowerCase()}-${Date.now()}`;

  return prisma.shedTestCatalog.create({
    data: {
      id,
      name,
      shortLabel: normalizeOptionalText(body.shortLabel) ?? name,
      geneTarget: normalizeOptionalText(body.geneTarget),
      category,
      pricingType,
      priceCents: typeof body.priceCents === "number" ? Math.max(0, Math.round(body.priceCents)) : null,
      currency: String(body.currency || "EUR").trim().toUpperCase() || "EUR",
      allowedPriorities: normalizeAllowedPriorities(body.allowedPriorities) ?? ["routine", "priority", "urgent"],
      active: body.active !== false,
      visibleInBreederApp: body.visibleInBreederApp !== false,
      description: normalizeOptionalText(body.description),
      sortOrder: typeof body.sortOrder === "number" ? Math.max(0, Math.round(body.sortOrder)) : 0,
    },
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
    shortLabel?: string | null;
    geneTarget?: string | null;
    category?: string;
    pricingType?: TestPricingTypeValue;
    priceCents?: number | null;
    currency?: string;
    allowedPriorities?: string[];
    active?: boolean;
    visibleInBreederApp?: boolean;
    isActive?: boolean;
    isVisibleToBreeder?: boolean;
    description?: string | null;
    sortOrder?: number;
  }
) => {
  const existing = await prisma.shedTestCatalog.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Catalog test not found.");

  const nextPricingType = patch.pricingType !== undefined
    ? normalizePricingType(patch.pricingType, existing.pricingType)
    : patch.category !== undefined
      ? normalizeCategory(patch.category, existing.category) === "sex-determination"
        ? "sex"
        : existing.pricingType
      : existing.pricingType;

  const nextCategory = patch.category !== undefined
    ? normalizeCategory(patch.category, existing.category)
    : patch.pricingType !== undefined
      ? nextPricingType === "sex"
        ? "sex-determination"
        : existing.category === "sex-determination"
          ? "morph"
          : existing.category
      : existing.category;

  const nextName = patch.name !== undefined ? String(patch.name || "").trim() : undefined;
  if (patch.name !== undefined && !nextName) {
    throw new HttpError(400, "Catalog test name is required.");
  }

  const nextSortOrder = patch.sortOrder !== undefined
    ? Math.max(0, Math.round(Number(patch.sortOrder) || 0))
    : undefined;

  const nextPriceCents = patch.priceCents !== undefined
    ? (patch.priceCents == null
      ? null
      : Math.max(0, Math.round(Number(patch.priceCents) || 0)))
    : undefined;

  const data = {
    ...(nextName !== undefined ? { name: nextName } : {}),
    ...(patch.shortLabel !== undefined ? { shortLabel: normalizeOptionalText(patch.shortLabel) } : {}),
    ...(patch.geneTarget !== undefined ? { geneTarget: normalizeOptionalText(patch.geneTarget) } : {}),
    ...(patch.description !== undefined ? { description: normalizeOptionalText(patch.description) } : {}),
    ...(patch.category !== undefined || patch.pricingType !== undefined ? { category: nextCategory, pricingType: nextPricingType } : {}),
    ...(nextPriceCents !== undefined ? { priceCents: nextPriceCents } : {}),
    ...(patch.currency !== undefined ? { currency: String(patch.currency || "EUR").trim().toUpperCase() || "EUR" } : {}),
    ...(patch.allowedPriorities !== undefined ? { allowedPriorities: normalizeAllowedPriorities(patch.allowedPriorities) } : {}),
    ...(patch.active !== undefined || patch.isActive !== undefined
      ? { active: patch.active !== undefined ? Boolean(patch.active) : Boolean(patch.isActive) }
      : {}),
    ...(patch.visibleInBreederApp !== undefined || patch.isVisibleToBreeder !== undefined
      ? {
          visibleInBreederApp: patch.visibleInBreederApp !== undefined
            ? Boolean(patch.visibleInBreederApp)
            : Boolean(patch.isVisibleToBreeder),
        }
      : {}),
    ...(nextSortOrder !== undefined ? { sortOrder: nextSortOrder } : {}),
  };

  return prisma.shedTestCatalog.update({
    where: { id },
    data,
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
