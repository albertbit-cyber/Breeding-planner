import {
  createAvailableTestRecord,
  getAvailableTestRecordById,
  listAvailableTestRecordsByLabId,
  listBreederVisibleTestRecords,
  updateAvailableTestRecord,
  setAvailableTestActiveRecord,
  setAvailableTestVisibilityRecord,
} from "../../db/labStore";
import type { LabAvailableTest, LabAvailableTestBreederView, CreateLabAvailableTestInput, UpdateLabAvailableTestInput } from "../../types/labTestCatalog";
import type { CatalogCategory, PricingType } from "../../types/labPricing";
import type { ServiceActor } from "./testOrderService";

const assertLabStaff = (actor: ServiceActor): void => {
  if (actor.role !== "lab_staff" && actor.role !== "admin") {
    throw new Error("Access denied: lab_staff or admin role is required.");
  }
};

const inferPricingType = (
  pricingType: PricingType | undefined,
  category: CatalogCategory | undefined
): PricingType => {
  if (pricingType === "morph" || pricingType === "sex") return pricingType;
  return category === "sex-determination" ? "sex" : "morph";
};

const inferCategory = (
  category: CatalogCategory | undefined,
  pricingType: PricingType
): CatalogCategory => {
  if (category) return category;
  return pricingType === "sex" ? "sex-determination" : "morph";
};

export const listBreederVisibleTests = (
  actor: ServiceActor
): LabAvailableTestBreederView[] => {
  if (!actor?.userId) {
    throw new Error("Missing actor context.");
  }
  const records = listBreederVisibleTestRecords();
  return records.map((test) => ({
    id: test.id,
    name: test.name,
    shortLabel: test.shortLabel,
    description: test.description,
    geneTarget: test.geneTarget,
    category: test.category,
    pricingType: test.pricingType,
    priceCents: test.priceCents,
    currency: test.currency,
    allowedPriorities: test.allowedPriorities,
  }));
};

export const listLabAvailableTests = (
  actor: ServiceActor,
  labId?: string
): LabAvailableTest[] => {
  assertLabStaff(actor);
  const resolvedLabId = labId || actor.labId || "proherper-main-lab";
  return listAvailableTestRecordsByLabId(resolvedLabId);
};

export const createAvailableTest = (
  actor: ServiceActor,
  input: CreateLabAvailableTestInput
): LabAvailableTest => {
  assertLabStaff(actor);
  const name = String(input.name || "").trim();
  if (!name) {
    throw new Error("Test name is required.");
  }
  const internalCode = String(input.internalCode || "").trim();
  if (!internalCode) {
    throw new Error("Internal code is required.");
  }
  const pricingType = inferPricingType(input.pricingType, input.category);
  const category = inferCategory(input.category, pricingType);
  const labId = String(input.labId || actor.labId || "proherper-main-lab").trim();
  return createAvailableTestRecord(
    {
      labId,
      internalCode,
      name,
      shortLabel: input.shortLabel,
      description: input.description,
      geneTarget: input.geneTarget,
      category,
      pricingType,
      priceCents: typeof input.priceCents === "number" ? input.priceCents : undefined,
      currency: String(input.currency || "EUR").trim(),
      allowedPriorities: Array.isArray(input.allowedPriorities) && input.allowedPriorities.length
        ? input.allowedPriorities
        : ["routine", "priority", "urgent"],
      isActive: input.isActive !== false,
      isVisibleToBreeder: input.isVisibleToBreeder !== false,
      sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : 0,
    },
    { userId: actor.userId, role: actor.role }
  );
};

export const updateAvailableTest = (
  actor: ServiceActor,
  input: UpdateLabAvailableTestInput
): LabAvailableTest => {
  assertLabStaff(actor);
  const id = String(input.id || "").trim();
  if (!id) {
    throw new Error("Test id is required.");
  }
  const existing = getAvailableTestRecordById(id);
  if (!existing) {
    throw new Error("Available test not found.");
  }
  const pricingType = inferPricingType(input.pricingType, input.category || existing.category);
  const category = inferCategory(input.category || existing.category, pricingType);
  return updateAvailableTestRecord(
    {
      ...input,
      pricingType,
      category,
    },
    { userId: actor.userId, role: actor.role }
  );
};

export const setAvailableTestActive = (
  actor: ServiceActor,
  id: string,
  isActive: boolean
): LabAvailableTest => {
  assertLabStaff(actor);
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    throw new Error("Test id is required.");
  }
  const updated = setAvailableTestActiveRecord(
    normalizedId,
    isActive,
    { userId: actor.userId, role: actor.role }
  );
  if (!updated) {
    throw new Error("Available test not found.");
  }
  return updated;
};

export const setAvailableTestVisibility = (
  actor: ServiceActor,
  id: string,
  isVisibleToBreeder: boolean
): LabAvailableTest => {
  assertLabStaff(actor);
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    throw new Error("Test id is required.");
  }
  const updated = setAvailableTestVisibilityRecord(
    normalizedId,
    isVisibleToBreeder,
    { userId: actor.userId, role: actor.role }
  );
  if (!updated) {
    throw new Error("Available test not found.");
  }
  return updated;
};
