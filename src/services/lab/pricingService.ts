import { LAB_PRICING_CONFIG } from "../../config/testPricing";
import { listAvailableTestRecordsByLabId, listBreederVisibleTestRecords } from "../../db/labStore";
import { calculateLabOrderPrice } from "../pricing/calculateLabOrderPrice";
import type {
  AnimalTestSelection,
  CalculatePriceRequest,
  OrderPriceBreakdown,
  PricingConfig,
  ShedTestCatalogItem,
} from "../../types/labPricing";
import type { ServiceActor } from "./testOrderService";

const DEFAULT_LAB_ID = "proherper-main-lab";

const assertActor = (actor: ServiceActor): void => {
  if (!actor?.userId) {
    throw new Error("Missing actor context.");
  }
};

const normalizeAnimalSelections = (animals: AnimalTestSelection[]): AnimalTestSelection[] => {
  if (!Array.isArray(animals)) return [];
  return animals
    .map((row) => ({
      animalId: String(row?.animalId || "").trim(),
      selectedTestIds: Array.isArray(row?.selectedTestIds)
        ? Array.from(new Set(row.selectedTestIds.map((id) => String(id || "").trim()).filter(Boolean)))
        : [],
    }))
    .filter((row) => row.animalId);
};

const toCatalogItem = (row: any): ShedTestCatalogItem => ({
  id: String(row?.id || "").trim(),
  name: String(row?.name || "").trim(),
  category: row?.category || "other",
  pricingType: row?.pricingType === "sex" ? "sex" : "morph",
  active: row?.isActive !== false,
  visibleInBreederApp: row?.isVisibleToBreeder !== false,
  description: row?.description || undefined,
  sortOrder: Number(row?.sortOrder || 0),
});

export const getLabTestsCatalog = (
  actor: ServiceActor,
  options: { breederView?: boolean; labId?: string } = {}
): ShedTestCatalogItem[] => {
  assertActor(actor);
  const breederView = options.breederView !== false;
  const rows = breederView
    ? listBreederVisibleTestRecords()
    : listAvailableTestRecordsByLabId(String(options.labId || actor.labId || DEFAULT_LAB_ID).trim() || DEFAULT_LAB_ID);

  return rows.map(toCatalogItem);
};

export const getLabTestsPricing = (actor: ServiceActor): PricingConfig => {
  assertActor(actor);
  return LAB_PRICING_CONFIG;
};

export const calculateLabOrderPriceFromSelections = (
  actor: ServiceActor,
  payload: CalculatePriceRequest
): OrderPriceBreakdown => {
  assertActor(actor);
  const animals = normalizeAnimalSelections(payload?.animals || []);
  const catalog = getLabTestsCatalog(actor, { breederView: true });
  return calculateLabOrderPrice(animals, catalog, LAB_PRICING_CONFIG);
};
