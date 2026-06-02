import {
  createPendingShedTestRecord,
  createShedSubmissionBatchRecord,
  deletePendingShedTestRecord,
  getPendingShedTestRecordById,
  getShedSubmissionBatchRecordById,
  getTestOrderRecordById,
  listAvailableTestRecordsByLabId,
  listPendingShedTestRecordsByBreederUserId,
  listShedSubmissionBatchRecordsByBreederUserId,
  updatePendingShedTestRecord,
} from "../../db/labStore";
import type { TestOrder } from "../../types/lab";
import type { LabAvailableTest } from "../../types/labTestCatalog";
import type { AnimalTestSelection, CatalogTest, PricingSnapshot } from "../../types/labPricing";
import type {
  PendingShedTestItem,
  ShedSubmissionBatch,
  ShedTerminalQuote,
  ShedTerminalQuotedItem,
} from "../../types/labShedTerminal";
import { generateMasterShipmentLabelArtifact } from "./batchShipmentLabelService";
import { generateShipmentLabelsForOrder } from "./shipmentLabelService";
import { createTestOrder, type ServiceActor } from "./testOrderService";
import { LAB_PRICING_CONFIG } from "../../config/testPricing";
import { calculateLabOrderPrice } from "../pricing/calculateLabOrderPrice";

const DEFAULT_LAB_ID = "proherper-main-lab";

type PendingShedCreateInput = {
  snakeId: string;
  snakeDisplayId?: string;
  snakeName?: string;
  selectedTestIds: string[];
  priority?: "routine" | "priority" | "urgent";
  sampleType?: "shed" | "bellyScaleClip";
  notes?: string;
};

type PendingShedUpdateInput = {
  selectedTestIds?: string[];
  priority?: "routine" | "priority" | "urgent";
  sampleType?: "shed" | "bellyScaleClip";
  notes?: string;
  selected?: boolean;
};

type SubmitBatchInput = {
  pendingItemIds?: string[];
};

const nowIso = (): string => new Date().toISOString();

const makeId = (prefix: string): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
};

const assertBreederActor = (actor: ServiceActor): void => {
  if (!actor?.userId) throw new Error("Missing actor context.");
  if (actor.role !== "breeder" && actor.role !== "admin") {
    throw new Error("Access denied: breeder role is required.");
  }
};

const resolveCatalogMap = (): Map<string, LabAvailableTest> => {
  const rows = listAvailableTestRecordsByLabId(DEFAULT_LAB_ID);
  return new Map(rows.map((entry) => [entry.id, entry]));
};

const toPricingCatalog = (rows: LabAvailableTest[]): CatalogTest[] => {
  return (Array.isArray(rows) ? rows : []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    category: entry.category || "other",
    pricingType: entry.pricingType || "morph",
    active: entry.isActive !== false,
    visibleInBreederApp: entry.isVisibleToBreeder !== false,
    description: entry.description,
    sortOrder: Number(entry.sortOrder || 0),
  }));
};

const toAnimalSelections = (items: PendingShedTestItem[]): AnimalTestSelection[] => {
  return (Array.isArray(items) ? items : []).map((item) => ({
    animalId: String(item.snakeId || "").trim() || String(item.id || "").trim(),
    selectedTestIds: Array.isArray(item.selectedTestIds)
      ? Array.from(new Set(item.selectedTestIds.map((id) => String(id || "").trim()).filter(Boolean)))
      : [],
  }));
};

const quoteItems = (items: PendingShedTestItem[], catalogMap: Map<string, LabAvailableTest>): { quote: ShedTerminalQuote; breakdown: ReturnType<typeof calculateLabOrderPrice> } => {
  const quotedItems: ShedTerminalQuotedItem[] = [];
  let currency = LAB_PRICING_CONFIG.currency;

  const catalogRows = Array.from(catalogMap.values());
  const pricingCatalog = toPricingCatalog(catalogRows);
  const animals = toAnimalSelections(items);
  const breakdown = calculateLabOrderPrice(animals, pricingCatalog, LAB_PRICING_CONFIG);
  const perAnimalById = new Map(breakdown.perAnimal.map((row) => [row.animalId, row]));

  for (const item of items) {
    const tests = item.selectedTestIds.map((testId) => {
      const catalog = catalogMap.get(testId);
      if (!catalog) {
        throw new Error(`Catalog test not found for selected ID: ${testId}`);
      }
      return {
        id: catalog.id,
        name: catalog.name,
        priceCents: Number(catalog.priceCents ?? 0),
        currency: catalog.currency || currency,
      };
    });

    const animalId = String(item.snakeId || "").trim() || String(item.id || "").trim();
    const itemTotalCents = Number(perAnimalById.get(animalId)?.total || 0);

    quotedItems.push({
      pendingItemId: item.id,
      snakeId: item.snakeId,
      tests,
      itemTotalCents,
      currency,
      priority: item.priority,
    });
  }

  return {
    quote: {
      items: quotedItems,
      subtotalCents: breakdown.total,
      totalCents: breakdown.total,
      currency,
    },
    breakdown,
  };
};

const normalizePendingCreateInput = (input: PendingShedCreateInput): PendingShedCreateInput => {
  const snakeId = String(input.snakeId || "").trim();
  if (!snakeId) {
    throw new Error("snakeId is required.");
  }
  const selectedTestIds = normalizeStringArray(input.selectedTestIds);
  if (!selectedTestIds.length) {
    throw new Error("Select at least one test.");
  }
  return {
    snakeId,
    snakeDisplayId: String(input.snakeDisplayId || "").trim() || undefined,
    snakeName: String(input.snakeName || "").trim() || undefined,
    selectedTestIds,
    priority: input.priority || "routine",
    sampleType: input.sampleType || "shed",
    notes: String(input.notes || "").trim() || undefined,
  };
};

export const listPendingShedTests = (actor: ServiceActor): PendingShedTestItem[] => {
  assertBreederActor(actor);
  return listPendingShedTestRecordsByBreederUserId(actor.userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const addPendingShedTest = (actor: ServiceActor, input: PendingShedCreateInput): PendingShedTestItem => {
  assertBreederActor(actor);
  const normalized = normalizePendingCreateInput(input);
  const timestamp = nowIso();
  const catalogMap = resolveCatalogMap();
  const selectedTestNames = normalized.selectedTestIds.map((testId) => {
    const test = catalogMap.get(testId);
    return test?.name || testId;
  });

  return createPendingShedTestRecord({
    id: makeId("pending_shed"),
    breederUserId: actor.userId,
    labId: actor.labId || DEFAULT_LAB_ID,
    snakeId: normalized.snakeId,
    snakeDisplayId: normalized.snakeDisplayId || normalized.snakeId,
    snakeName: normalized.snakeName,
    selectedTestIds: normalized.selectedTestIds,
    selectedTestNames,
    priority: normalized.priority || "routine",
    sampleType: normalized.sampleType || "shed",
    notes: normalized.notes,
    selected: true,
  }, { userId: actor.userId, role: actor.role });
};

export const updatePendingShedTest = (
  actor: ServiceActor,
  pendingItemId: string,
  patch: PendingShedUpdateInput
): PendingShedTestItem => {
  assertBreederActor(actor);
  const normalizedId = String(pendingItemId || "").trim();
  if (!normalizedId) throw new Error("pendingItemId is required.");

  const target = getPendingShedTestRecordById(normalizedId);
  if (!target) {
    throw new Error("Pending shed test not found.");
  }
  if (target.breederUserId !== actor.userId) {
    throw new Error("Access denied: breeder role is required.");
  }

  const nextPatch: Parameters<typeof updatePendingShedTestRecord>[1] = {};
  if (patch.selectedTestIds) {
    const selectedTestIds = normalizeStringArray(patch.selectedTestIds);
    if (!selectedTestIds.length) {
      throw new Error("Select at least one test.");
    }
    nextPatch.selectedTestIds = selectedTestIds;
    const catalogMap = resolveCatalogMap();
    nextPatch.selectedTestNames = selectedTestIds.map((testId) => catalogMap.get(testId)?.name || testId);
  }
  if (patch.priority) nextPatch.priority = patch.priority;
  if (patch.sampleType) nextPatch.sampleType = patch.sampleType;
  if (patch.notes !== undefined) nextPatch.notes = String(patch.notes || "").trim() || undefined;
  if (patch.selected !== undefined) nextPatch.selected = Boolean(patch.selected);

  const updated = updatePendingShedTestRecord(normalizedId, nextPatch, { userId: actor.userId, role: actor.role });
  if (!updated) throw new Error("Pending shed test not found.");
  return updated;
};

export const removePendingShedTest = (actor: ServiceActor, pendingItemId: string): void => {
  assertBreederActor(actor);
  const normalizedId = String(pendingItemId || "").trim();
  if (!normalizedId) throw new Error("pendingItemId is required.");
  const target = getPendingShedTestRecordById(normalizedId);
  if (!target) return;
  if (target.breederUserId !== actor.userId) {
    throw new Error("Access denied: breeder role is required.");
  }
  deletePendingShedTestRecord(normalizedId, { userId: actor.userId, role: actor.role });
};

export const quotePendingShedTests = (actor: ServiceActor, pendingItemIds?: string[]): ShedTerminalQuote => {
  assertBreederActor(actor);
  const ids = normalizeStringArray(pendingItemIds);
  const all = listPendingShedTests(actor);
  const selected = ids.length
    ? all.filter((entry) => ids.includes(entry.id))
    : all.filter((entry) => entry.selected);

  if (!selected.length) {
    return { items: [], subtotalCents: 0, totalCents: 0, currency: LAB_PRICING_CONFIG.currency };
  }

  return quoteItems(selected, resolveCatalogMap()).quote;
};

export const listShedSubmissionBatches = (actor: ServiceActor): ShedSubmissionBatch[] => {
  assertBreederActor(actor);
  return listShedSubmissionBatchRecordsByBreederUserId(actor.userId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
};

export const getShedSubmissionBatch = (actor: ServiceActor, batchId: string): ShedSubmissionBatch | null => {
  assertBreederActor(actor);
  const normalized = String(batchId || "").trim();
  if (!normalized) throw new Error("batchId is required.");
  const batch = getShedSubmissionBatchRecordById(normalized);
  if (!batch || batch.breederUserId !== actor.userId) return null;
  return batch;
};

export const submitPendingShedBatch = async (
  actor: ServiceActor,
  input: SubmitBatchInput = {}
): Promise<{
  batch: ShedSubmissionBatch;
  quote: ShedTerminalQuote;
  orders: TestOrder[];
  masterLabel: {
    batchId: string;
    fileName: string;
    mimeType: "application/pdf";
    base64: string;
    byteLength: number;
  };
  individualLabels: Array<{
    orderId: string;
    orderNumber: string;
    fileName: string;
    mimeType: "application/pdf";
    base64: string;
    byteLength: number;
    labelCount: number;
  }>;
}> => {
  assertBreederActor(actor);
  const pendingIds = normalizeStringArray(input.pendingItemIds);
  const all = listPendingShedTests(actor);
  const selected = pendingIds.length
    ? all.filter((entry) => pendingIds.includes(entry.id))
    : all.filter((entry) => entry.selected);

  if (!selected.length) {
    throw new Error("No pending shed tests selected for submission.");
  }

  const catalogMap = resolveCatalogMap();
  const { quote, breakdown } = quoteItems(selected, catalogMap);
  const submittedAt = nowIso();
  const pricingSnapshotBase: Omit<PricingSnapshot, "animals"> = {
    calculatedAt: submittedAt,
    currency: LAB_PRICING_CONFIG.currency,
    pricingConfig: LAB_PRICING_CONFIG,
    breakdown,
  };

  const orderResults = selected.map((item) => {
    const requestedTests = item.selectedTestIds.map((testId) => {
      const catalog = catalogMap.get(testId);
      if (!catalog) {
        throw new Error(`Catalog test not found for selected ID: ${testId}`);
      }
      return catalog.name;
    });

    return createTestOrder(actor, {
      id: makeId("order"),
      labId: item.labId || actor.labId || DEFAULT_LAB_ID,
      animalId: item.snakeId,
      requestedTests,
      priority: item.priority,
      notes: item.notes,
      sampleType: item.sampleType,
      requestedByUserId: actor.userId,
      breederUserId: actor.userId,
      status: "order_created",
      paymentStatus: "pending",
      submittedAt,
      pricingSnapshot: {
        ...pricingSnapshotBase,
        animals: [{
          animalId: item.snakeId,
          selectedTestIds: Array.isArray(item.selectedTestIds) ? item.selectedTestIds : [],
        }],
      },
    });
  });

  const orders = orderResults.map((entry) => entry.order);

  const batch = createShedSubmissionBatchRecord({
    id: makeId("shed_batch"),
    breederUserId: actor.userId,
    labId: orders[0]?.labId || actor.labId || DEFAULT_LAB_ID,
    pendingItemIds: selected.map((entry) => entry.id),
    orderIds: orders.map((entry) => entry.id),
    itemCount: orders.length,
    totalCents: quote.totalCents,
    currency: quote.currency,
    submittedAt,
  }, { userId: actor.userId, role: actor.role });

  selected.forEach((entry) => {
    deletePendingShedTestRecord(entry.id, { userId: actor.userId, role: actor.role });
  });

  const individualLabels = await Promise.all(
    orders.map((order) => generateShipmentLabelsForOrder(actor, order.id, 1))
  );
  const masterLabel = await generateMasterShipmentLabelArtifact(actor, batch, orders);

  return {
    batch,
    quote,
    orders,
    masterLabel,
    individualLabels,
  };
};

export const getShedBatchArtifacts = async (
  actor: ServiceActor,
  batchId: string
): Promise<{
  batch: ShedSubmissionBatch;
  masterLabel: {
    batchId: string;
    fileName: string;
    mimeType: "application/pdf";
    base64: string;
    byteLength: number;
  };
  individualLabels: Array<{
    orderId: string;
    orderNumber: string;
    fileName: string;
    mimeType: "application/pdf";
    base64: string;
    byteLength: number;
    labelCount: number;
  }>;
}> => {
  assertBreederActor(actor);
  const batch = getShedSubmissionBatch(actor, batchId);
  if (!batch) {
    throw new Error("Shed submission batch not found.");
  }

  // Re-resolve orders through shipment generation path so permissions and access checks stay centralized.
  const individualLabels = await Promise.all(
    batch.orderIds.map((orderId) => generateShipmentLabelsForOrder(actor, orderId, 1))
  );

  const resolvedOrders: TestOrder[] = batch.orderIds
    .map((orderId) => getTestOrderRecordById(orderId))
    .filter(Boolean) as TestOrder[];

  const fallbackOrders: TestOrder[] = individualLabels.map((entry) => ({
    id: entry.orderId,
    orderNumber: entry.orderNumber,
    labId: batch.labId,
    animalId: "unknown",
    status: "order_created",
    requestedTests: [],
    priority: "routine",
    sampleIds: [],
    resultIds: [],
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    paymentStatus: "pending",
  }));

  const masterLabel = await generateMasterShipmentLabelArtifact(
    actor,
    batch,
    resolvedOrders.length ? resolvedOrders : fallbackOrders
  );

  return {
    batch,
    masterLabel,
    individualLabels,
  };
};
