import {
  apiRequest,
  calculateOrderPrice,
  createOrder,
  fetchMyOrders,
  fetchOrderById,
  fetchPricingConfig,
  fetchTestCatalog,
} from "../../../../shared/api";
import type { ServiceActor } from "../../../services/lab/testOrderService";
import {
  adminCorrectOrderStatusHandler,
  createTestOrderHandler,
  getAdminOrderOversightHandler,
  getAllowedOrderStatusTransitionsHandler,
  getBreederCertificateArtifactHandler,
  getBreederOrderOutcomeHandler,
  getOrderStatusHistoryHandler,
  getTestOrderByIdHandler,
  listAdminAllOrdersHandler,
  listBreederTestOrdersHandler,
  listLabTestOrdersHandler,
  updateTestOrderPaymentStatusHandler,
  updateTestOrderStatusHandler,
} from "./testOrderHandlers";
import {
  calculateLabOrderPriceHandler,
  getLabTestsCatalogHandler,
  getLabTestsPricingHandler,
} from "./pricingHandlers";
import {
  createAvailableTestHandler,
  listBreederVisibleTestsHandler,
  listLabAvailableTestsHandler,
  setAvailableTestActiveHandler,
  setAvailableTestVisibilityHandler,
  updateAvailableTestHandler,
} from "./testCatalogHandlers";
import { markSampleReceivedHandler, resolveQrTokenHandler } from "./qrLookupHandlers";
import {
  getBreederAllLabelsArtifactHandler,
  getBreederSampleLabelsArtifactHandler,
  getBreederShipmentLabelArtifactHandler,
} from "./shipmentLabelHandlers";
import {
  LAB_PROFILE,
  loadBreederInfo,
  loadSnakeById,
  toBreederAddress,
  isLabLabelDebugEnabled,
} from "../../../services/lab/labelProfileService";
import {
  type AllOrderLabelsArtifactResponse,
  type OrderLabelsArtifactResponse,
  type SampleLabelsArtifactResponse,
  type ShippingLabelArtifactResponse,
} from "../../../services/lab/shipmentLabelService";
import {
  getResultEntryTemplateHandler,
  saveResultDraftHandler,
  submitResultHandler,
} from "./resultEntryHandlers";
import {
  addPendingShedTestHandler,
  getShedBatchArtifactsHandler,
  listPendingShedTestsHandler,
  listShedSubmissionBatchesHandler,
  quotePendingShedTestsHandler,
  removePendingShedTestHandler,
  submitPendingShedBatchHandler,
  updatePendingShedTestHandler,
} from "./shedTerminalHandlers";
import type { LabAvailableTest, LabAvailableTestBreederView, CreateLabAvailableTestInput, UpdateLabAvailableTestInput } from "../../../types/labTestCatalog";
import type { LabResultEntryTemplate } from "../../../types/labResultEntry";
import type { PendingShedTestItem, ShedSubmissionBatch, ShedTerminalQuote } from "../../../types/labShedTerminal";
import type { AnimalTestSelection, OrderPriceBreakdown, PricingConfig, ShedTestCatalogItem } from "../../../types/labPricing";
import type { CreateTestOrderResult } from "../../../services/lab/testOrderService";
import type { SampleType, StatusHistory, TestOrder } from "../../../types/lab";
import { buildQrPayload, parseQrPayload } from "../../../utils/labToken";
import { generateOrderLabelsPdf } from "../../../utils/pdf/labOrderLabelsPdf";
import { getActiveLabelSize } from "../utils/labelSizing";
import { toLabQrResolvePayload } from "../utils/qrLookupInput";

const AUTH_STORAGE_KEY = "breedingPlannerAuthSession";
const DEFAULT_LAB_ID = "proherper-main-lab";
type LegacyRole = "admin" | "lab_staff" | "breeder";

type AuthSession = {
  isAuthenticated?: boolean;
  role?: string;
  profile?: {
    role?: string;
    email?: string;
    displayName?: string;
  };
};

const mapBackendStatusToLegacy = (status: string): string => {
  if (status === "submitted") return "order_created";
  if (status === "received") return "sample_received";
  if (status === "in_progress") return "testing_in_progress";
  if (status === "completed") return "completed";
  return status || "order_created";
};

const mapLegacyStatusToBackend = (status: string): string => {
  if (status === "order_created") return "submitted";
  if (status === "sample_received") return "received";
  if (status === "intake_approved" || status === "testing_in_progress" || status === "result_entered" || status === "result_reviewed") return "in_progress";
  if (status === "completed" || status === "result_released" || status === "certificate_issued") return "completed";
  if (status === "cancelled") return "cancelled";
  return "submitted";
};

const normalizeRole = (value: unknown): LegacyRole => {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "lab" || role === "lab_staff") return "lab_staff";
  return "breeder";
};

const getSession = (): AuthSession | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
};

const requireSessionRole = (...roles: LegacyRole[]): LegacyRole => {
  const session = getSession();
  if (!session?.isAuthenticated) {
    throw new Error("You must be signed in.");
  }
  const role = normalizeRole(session.role || session.profile?.role);
  if (!roles.includes(role)) {
    throw new Error("Access denied for this role.");
  }
  return role;
};

const buildActorFromSessionRole = (role: LegacyRole): ServiceActor => {
  const session = getSession();
  const profile = session?.profile || {};
  const userId = String(profile.email || profile.displayName || "local-user").trim() || "local-user";
  return {
    userId,
    role,
    labId: role === "lab_staff" || role === "admin" ? DEFAULT_LAB_ID : undefined,
  };
};

const unwrapLocalResponse = async <T>(
  response: Promise<{ ok: true; data: T } | { ok: false; error: { message: string } }> | { ok: true; data: T } | { ok: false; error: { message: string } }
): Promise<T> => {
  const resolved = await response;
  if (!resolved.ok) {
    throw new Error(resolved.error?.message || "Lab request failed.");
  }
  return resolved.data;
};

const toLegacyOrder = (order: any): TestOrder => {
  const animals = Array.isArray(order?.animals) ? order.animals : [];
  const firstAnimal = animals[0] || null;
  const requestedTests = animals
    .flatMap((animal: any) => (Array.isArray(animal?.tests) ? animal.tests : []))
    .map((test: any) => String(test?.testNameSnapshot || test?.testId || "").trim())
    .filter(Boolean);

  const backendStatus = String(order?.status || "submitted");
  const orderNumber = String(order?.id || "");

  return {
    id: String(order?.id || ""),
    labId: DEFAULT_LAB_ID,
    animalId: String(firstAnimal?.animalId || ""),
    orderNumber,
    status: mapBackendStatusToLegacy(backendStatus) as any,
    requestedTests: Array.from(new Set(requestedTests)),
    priority: "routine",
    breederUserId: String(order?.breederId || ""),
    requestedByUserId: String(order?.breederId || ""),
    submittedAt: String(order?.createdAt || ""),
    sampleIds: animals.map((_: any, index: number) => `${sanitizeFilePart(orderNumber)}-sample-${index + 1}`),
    resultIds: Array.isArray(order?.results)
      ? order.results
          .map((result: any) => String(result?.id || "").trim())
          .filter(Boolean)
      : [],
    paymentStatus: (backendStatus === "submitted" || backendStatus === "cancelled" ? "pending" : "manually_approved") as any,
    notes: "",
    createdAt: String(order?.createdAt || ""),
    updatedAt: String(order?.updatedAt || ""),
  };
};

const toLegacyPricingConfig = (pricing: any): PricingConfig => ({
  morph: {
    tier1to9: {
      firstTest: Number(pricing?.morphTier1to9FirstTest || 35),
      additionalTest: Number(pricing?.morphTier1to9AdditionalTest || 20),
    },
    tier10to49: {
      firstTest: Number(pricing?.morphTier10to49FirstTest || 30),
      additionalTest: Number(pricing?.morphTier10to49AdditionalTest || 20),
    },
    tier50plus: {
      firstTest: Number(pricing?.morphTier50PlusFirstTest || 25),
      additionalTest: Number(pricing?.morphTier50PlusAdditionalTest || 20),
    },
  },
  sex: {
    tier1to9: Number(pricing?.sexTier1to9 || 30),
    tier10to49: Number(pricing?.sexTier10to49 || 25),
    tier50plus: Number(pricing?.sexTier50Plus || 20),
  },
  currency: String(pricing?.currency || "EUR") as "EUR",
});

const toLegacyCatalogItem = (test: any): ShedTestCatalogItem => ({
  id: String(test?.id || ""),
  name: String(test?.name || ""),
  category: String(test?.category || "morph").toLowerCase() === "sex" ? "sex-determination" : "morph",
  pricingType: String(test?.pricingType || "morph") === "sex" ? "sex" : "morph",
  active: Boolean(test?.active),
  visibleInBreederApp: Boolean(test?.visibleInBreederApp),
  description: test?.description ? String(test.description) : undefined,
  sortOrder: Number(test?.sortOrder || 0),
});

const unsupported = (feature: string): never => {
  throw new Error(`${feature} is not available on the shared backend yet.`);
};

const bytesToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const buildStableQrToken = async (seed: string): Promise<string> => {
  const normalized = String(seed || "").trim() || "shared-order-label";
  if (typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined") {
    const buffer = new TextEncoder().encode(normalized);
    return toHex(await crypto.subtle.digest("SHA-256", buffer));
  }

  const fallback = Array.from(normalized)
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return (fallback + fallback + fallback + fallback).slice(0, 64).padEnd(64, "0");
};

const sanitizeFilePart = (value: string): string =>
  String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9-]/g, "_") || "order";

const getSharedOrderAnimals = (order: any): any[] =>
  Array.isArray(order?.animals) ? order.animals : [];

const getSharedOrderNumber = (order: any): string =>
  String(order?.id || "").trim();

const getSharedSampleId = (order: any, index: number): string =>
  `${sanitizeFilePart(getSharedOrderNumber(order))}-sample-${index + 1}`;

const getSharedRequestedTestsForAnimal = (animal: any): string[] =>
  Array.isArray(animal?.tests)
    ? animal.tests
        .map((test: any) => String(test?.testNameSnapshot || test?.testId || "").trim())
        .filter(Boolean)
    : [];

const mapBackendStatusToSampleStatus = (status: string): string => {
  if (status === "received") return "sample_received";
  if (status === "in_progress") return "testing_in_progress";
  if (status === "completed") return "archived";
  return "expected";
};

const supportsSharedWorkflowTransition = (status: string): boolean =>
  status === "order_created"
  || status === "sample_received"
  || status === "testing_in_progress"
  || status === "completed"
  || status === "cancelled";

const interpolateIso = (startValue: string, endValue: string, ratio: number): string => {
  const startMs = new Date(startValue || "").getTime();
  const fallbackStartMs = Number.isFinite(startMs) ? startMs : Date.now();
  const endMsRaw = new Date(endValue || "").getTime();
  const fallbackEndMs = Number.isFinite(endMsRaw) && endMsRaw > fallbackStartMs
    ? endMsRaw
    : fallbackStartMs + 1000;
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const value = fallbackStartMs + Math.round((fallbackEndMs - fallbackStartMs) * clampedRatio);
  return new Date(value).toISOString();
};

const createSyntheticHistoryEntry = (
  orderId: string,
  index: number,
  fromStatus: string | undefined,
  toStatus: string,
  changedAt: string
): StatusHistory => ({
  id: `${orderId}-history-${index}-${toStatus}`,
  labId: DEFAULT_LAB_ID,
  entityType: "testOrder",
  entityId: orderId,
  fromStatus,
  toStatus,
  changedAt,
  createdAt: changedAt,
  updatedAt: changedAt,
});

const buildSharedStatusHistory = (order: any): StatusHistory[] => {
  const orderId = String(order?.id || "").trim();
  const createdAt = String(order?.createdAt || new Date().toISOString());
  const updatedAt = String(order?.updatedAt || createdAt);
  const backendStatus = String(order?.status || "submitted");
  const entries: StatusHistory[] = [
    createSyntheticHistoryEntry(orderId, 0, undefined, "order_created", createdAt),
  ];

  if (backendStatus === "received") {
    entries.push(createSyntheticHistoryEntry(orderId, 1, "order_created", "sample_received", updatedAt));
    return entries;
  }

  if (backendStatus === "in_progress") {
    entries.push(
      createSyntheticHistoryEntry(orderId, 1, "order_created", "sample_received", interpolateIso(createdAt, updatedAt, 0.45)),
      createSyntheticHistoryEntry(orderId, 2, "sample_received", "testing_in_progress", updatedAt)
    );
    return entries;
  }

  if (backendStatus === "completed") {
    entries.push(
      createSyntheticHistoryEntry(orderId, 1, "order_created", "sample_received", interpolateIso(createdAt, updatedAt, 0.3)),
      createSyntheticHistoryEntry(orderId, 2, "sample_received", "testing_in_progress", interpolateIso(createdAt, updatedAt, 0.65)),
      createSyntheticHistoryEntry(orderId, 3, "testing_in_progress", "completed", updatedAt)
    );
    return entries;
  }

  if (backendStatus === "cancelled") {
    entries.push(createSyntheticHistoryEntry(orderId, 1, "order_created", "cancelled", updatedAt));
  }

  return entries;
};

const OUTCOME_TO_RESULT_STATUS = {
  notDetected: "not_detected",
  carrierDetected: "heterozygous",
  positive: "visual",
} as const;

const getSharedPrimaryAnimal = (order: any) => {
  const animals = getSharedOrderAnimals(order);
  return animals[0] || null;
};

const getSharedOrderedResultItems = (order: any) => {
  const primaryAnimal = getSharedPrimaryAnimal(order);
  const tests = Array.isArray(primaryAnimal?.tests) ? primaryAnimal.tests : [];

  return tests.map((test: any, index: number) => {
    const sourceOrderedName = String(test?.testNameSnapshot || test?.testId || "").trim();
    return {
      orderedTestKey: `${String(order?.id || "").trim()}:${sanitizeFilePart(sourceOrderedName)}:${index + 1}`,
      geneName: sourceOrderedName,
      sourceOrderedName,
      catalogTestId: String(test?.testId || "").trim() || undefined,
    };
  });
};

const parseSharedResultFindings = (result: any) => {
  if (!Array.isArray(result?.findingsJson)) {
    return [];
  }

  return result.findingsJson
    .filter((entry: any) => entry && typeof entry === "object")
    .map((entry: any) => ({
      orderedTestKey: String(entry?.orderedTestKey || "").trim() || undefined,
      marker: String(entry?.marker || "").trim(),
      sourceOrderedName: String(entry?.sourceOrderedName || "").trim() || undefined,
      catalogTestId: String(entry?.catalogTestId || "").trim() || undefined,
      outcome: String(entry?.outcome || "").trim(),
      confidence: typeof entry?.confidence === "number" ? entry.confidence : undefined,
      notes: String(entry?.notes || "").trim() || undefined,
    }))
    .filter((entry) => entry.marker && entry.outcome);
};

const buildSharedTemplateExistingResult = (result: any) => {
  if (!result) return undefined;

  const items = parseSharedResultFindings(result)
    .map((finding: any) => {
      const resultStatus = OUTCOME_TO_RESULT_STATUS[finding.outcome as keyof typeof OUTCOME_TO_RESULT_STATUS];
      if (!resultStatus || !finding.orderedTestKey) {
        return null;
      }
      return {
        orderedTestKey: finding.orderedTestKey,
        geneName: finding.marker,
        resultStatus,
        notes: finding.notes,
        confidence: finding.confidence,
      };
    })
    .filter(Boolean);

  return {
    id: String(result?.id || "").trim(),
    status: String(result?.status || "").trim(),
    testCode: String(result?.testCode || "").trim(),
    method: String(result?.method || "").trim() || undefined,
    summary: String(result?.summary || "").trim() || undefined,
    notes: String(result?.notes || "").trim() || undefined,
    items,
  };
};

const buildSharedResultEntryTemplate = (order: any): LabResultEntryTemplate => {
  const items = getSharedOrderedResultItems(order);
  const requestedTests = items.map((item) => item.sourceOrderedName);
  const latestSavedResult = Array.isArray(order?.results) ? order.results[0] || null : null;

  return {
    orderId: String(order?.id || "").trim(),
    requestedTests,
    items,
    existingResult: buildSharedTemplateExistingResult(latestSavedResult),
  };
};

const buildSharedOrderOutcome = (order: any) => {
  const legacyOrder = toLegacyOrder(order);
  const finalizedResults = (Array.isArray(order?.results) ? order.results : [])
    .filter((result: any) => String(result?.status || "").trim() === "completed")
    .map((result: any) => {
      const findings = parseSharedResultFindings(result);
      return {
        id: String(result?.id || "").trim(),
        status: String(result?.status || "").trim(),
        testCode: String(result?.testCode || "").trim(),
        summary: String(result?.summary || "").trim() || undefined,
        findings,
        reportedAt: String(result?.reportedAt || "").trim() || undefined,
        reviewedAt: undefined,
        releasedAt: undefined,
        certificateId: undefined,
      };
    });

  const labConfirmedMarkers = finalizedResults
    .flatMap((result: any) => Array.isArray(result.findings) ? result.findings : [])
    .filter((finding: any) => finding.outcome === "positive" || finding.outcome === "carrierDetected")
    .map((finding: any) => ({
      marker: finding.marker,
      outcome: finding.outcome,
    }));

  return {
    order: legacyOrder,
    latestResult: finalizedResults[0] || null,
    geneticsUpdate: null,
    certificate: null,
    resultHistory: finalizedResults,
    labConfirmedMarkers,
    currentGenetics: null,
  };
};

const buildSharedSyntheticSample = async (order: any, animal: any, index: number) => {
  const orderId = String(order?.id || "").trim();
  const orderNumber = getSharedOrderNumber(order) || orderId;
  const animalId = String(animal?.animalId || "").trim();
  const sampleId = getSharedSampleId(order, index);
  const qrToken = await buildStableQrToken(`${orderId}:${animalId}:${sampleId}`);
  const backendStatus = String(order?.status || "submitted");
  const receivedAt = backendStatus === "received" || backendStatus === "in_progress" || backendStatus === "completed"
    ? String(order?.updatedAt || order?.createdAt || "").trim() || undefined
    : undefined;

  return {
    id: sampleId,
    orderId,
    orderNumber,
    animalId,
    animalName: String(animal?.animalName || "").trim() || undefined,
    requestedTests: getSharedRequestedTestsForAnimal(animal),
    qrToken,
    status: mapBackendStatusToSampleStatus(backendStatus),
    type: "shed" as const,
    receivedAt,
  };
};

const loadSharedAnimalSummary = async (animal: any) => {
  const animalId = String(animal?.animalId || "").trim();
  const storedSnake = animalId ? await loadSnakeById(animalId) : null;
  return {
    id: animalId,
    name: String(animal?.animalName || storedSnake?.name || "").trim() || undefined,
    code: String(storedSnake?.code || storedSnake?.displayId || storedSnake?.externalId || "").trim() || undefined,
    sex: typeof storedSnake?.sex === "string" ? storedSnake.sex : undefined,
    status: typeof storedSnake?.status === "string" ? storedSnake.status : undefined,
  };
};

const toSharedBreederSummary = (order: any) => {
  const userId = String(order?.breederId || order?.breeder?.email || "").trim();
  if (!userId) return null;
  const displayName = String(order?.breeder?.fullName || order?.breeder?.email || "").trim() || undefined;
  return {
    userId,
    displayName,
  };
};

const listSharedOrdersRaw = async (): Promise<any[]> => {
  const data = await apiRequest<{ orders: any[] }>("/lab/orders");
  return Array.isArray(data?.orders) ? data.orders : [];
};

const fetchSharedOrderRaw = async (orderId: string): Promise<any> => {
  const data = await fetchOrderById(String(orderId || "").trim());
  return (data as any)?.order || null;
};

const findSharedSampleBySampleId = async (sampleId: string) => {
  const normalizedSampleId = String(sampleId || "").trim();
  const orders = await listSharedOrdersRaw();

  for (const order of orders) {
    const animals = getSharedOrderAnimals(order);
    for (let index = 0; index < animals.length; index += 1) {
      if (getSharedSampleId(order, index) !== normalizedSampleId) continue;
      const sample = await buildSharedSyntheticSample(order, animals[index], index);
      return { order, animal: animals[index], sample };
    }
  }

  return null;
};

const findSharedSampleByQrToken = async (qrToken: string) => {
  const normalizedQrToken = String(qrToken || "").trim();
  const orders = await listSharedOrdersRaw();

  for (const order of orders) {
    const animals = getSharedOrderAnimals(order);
    for (let index = 0; index < animals.length; index += 1) {
      const sample = await buildSharedSyntheticSample(order, animals[index], index);
      if (sample.qrToken === normalizedQrToken) {
        return { order, animal: animals[index], sample };
      }
    }
  }

  return null;
};

const toSharedSampleLookupResult = async (
  order: any,
  animal: any,
  sample: Awaited<ReturnType<typeof buildSharedSyntheticSample>>,
  lookupMethod: "qrToken" | "sampleId"
) => {
  const legacyOrder = toLegacyOrder(order);
  const animalSummary = await loadSharedAnimalSummary(animal);

  return {
    lookup: {
      method: lookupMethod,
      sampleId: sample.id,
    },
    sample: {
      id: sample.id,
      orderId: sample.orderId,
      status: sample.status,
      type: sample.type,
      receivedAt: sample.receivedAt,
      qrToken: sample.qrToken,
    },
    testOrder: {
      id: legacyOrder.id,
      orderNumber: legacyOrder.orderNumber,
      status: legacyOrder.status,
      paymentStatus: legacyOrder.paymentStatus,
      priority: legacyOrder.priority,
      submittedAt: legacyOrder.submittedAt,
    },
    animal: animalSummary,
    breeder: toSharedBreederSummary(order),
    requestedTests: [...sample.requestedTests],
  };
};

const getSharedOrderLabelsArtifact = async (orderId: string): Promise<OrderLabelsArtifactResponse> => {
  const data = await fetchOrderById(String(orderId || "").trim());
  const order = (data as any)?.order || null;
  if (!order) {
    throw new Error("Order not found.");
  }

  const breederInfo = await loadBreederInfo();
  const labelSize = getActiveLabelSize(breederInfo);
  const debug = await isLabLabelDebugEnabled();
  const normalizedOrderId = String(order?.id || "").trim();
  const orderNumber = String(order?.id || "").trim() || normalizedOrderId;
  const animals = Array.isArray(order?.animals) ? order.animals : [];
  const breederName = String(
    breederInfo?.name ||
    breederInfo?.businessName ||
    order?.breeder?.fullName ||
    order?.breeder?.email ||
    order?.breederId ||
    "Breeder"
  ).trim() || "Breeder";

  const sampleLabels = await Promise.all(
    animals.map(async (animal: any, index: number) => {
      const animalId = String(animal?.animalId || "").trim();
      const storedSnake = animalId ? await loadSnakeById(animalId) : null;
      const sampleId = `${sanitizeFilePart(orderNumber)}-sample-${index + 1}`;
      const qrToken = await buildStableQrToken(`${normalizedOrderId}:${animalId}:${sampleId}`);
      const requestedTests = Array.isArray(animal?.tests)
        ? animal.tests
            .map((test: any) => String(test?.testNameSnapshot || test?.testId || "").trim())
            .filter(Boolean)
        : [];

      return {
        sampleId,
        orderId: normalizedOrderId,
        orderNumber,
        animalId,
        animalName: String(animal?.animalName || storedSnake?.name || "").trim() || undefined,
        breederName,
        requestedTests,
        sampleStatus: "submitted",
        qrPayload: buildQrPayload(qrToken),
        sampleType: "shed",
        labName: LAB_PROFILE.name,
      };
    })
  );

  const rendered = await generateOrderLabelsPdf({
    size: labelSize,
    debug,
    shippingLabel: {
      orderId: normalizedOrderId,
      orderNumber,
      labName: LAB_PROFILE.name,
      labAddress: LAB_PROFILE.address,
      breeder: {
        name: breederName,
        businessName: String(breederInfo?.businessName || "").trim() || undefined,
        address: toBreederAddress(breederInfo),
        email: String(breederInfo?.email || order?.breeder?.email || "").trim() || undefined,
        phone: String(breederInfo?.phone || "").trim() || undefined,
      },
      createdAt: String(order?.createdAt || new Date().toISOString()),
      sampleCount: sampleLabels.length,
    },
    sampleLabels,
  });

  return {
    orderId: normalizedOrderId,
    orderNumber,
    sampleCount: sampleLabels.length,
    sampleIds: sampleLabels.map((sample) => sample.sampleId),
    fileName: `shed-order-labels-${sanitizeFilePart(orderNumber)}.pdf`,
    mimeType: "application/pdf",
    base64: bytesToBase64(rendered.arrayBuffer),
    byteLength: rendered.byteLength,
    pageCount: rendered.pageCount,
    labelCount: rendered.pageCount,
    pageWidthMm: rendered.pageWidthMm,
    pageHeightMm: rendered.pageHeightMm,
  };
};

export interface BreederCreateOrderInput {
  snakeId: string;
  requestedTests: string[];
  priority?: "routine" | "priority" | "urgent";
  notes?: string;
  sampleType?: SampleType;
}

export const createLabApiClient = () => {
  const createTestOrderFromBreeder = async (input: BreederCreateOrderInput): Promise<CreateTestOrderResult> => {
    requireSessionRole("breeder");
    const normalizedAnimalId = String(input.snakeId || "").trim();
    const selectedTestIds = Array.isArray(input.requestedTests)
      ? input.requestedTests.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const payload = {
      animals: [
        {
          animalId: normalizedAnimalId,
          animalName: undefined,
          selectedTestIds,
        },
      ],
    };
    if (!payload.animals[0].animalId || payload.animals[0].selectedTestIds.length === 0) {
      throw new Error("snakeId and requested tests are required.");
    }
    const created = await createOrder(payload as any);
    return { order: toLegacyOrder((created as any)?.order || null) } as any;
  };

  const listBreederTestOrders = async (): Promise<TestOrder[]> => {
    requireSessionRole("breeder");
    const data = await fetchMyOrders();
    const rows = Array.isArray((data as any)?.orders) ? (data as any).orders : [];
    return rows.map(toLegacyOrder);
  };

  const listBreederTestOrdersForSnake = async (snakeId: string): Promise<TestOrder[]> => {
    const normalized = String(snakeId || "").trim();
    const orders = await listBreederTestOrders();
    return orders.filter((order) => String(order.animalId || "").trim() === normalized);
  };

  const getBreederTestOrderDetails = async (orderId: string): Promise<TestOrder> => {
    requireSessionRole("breeder");
    const data = await fetchOrderById(String(orderId || "").trim());
    return toLegacyOrder((data as any)?.order || null);
  };

  const getBreederOrderOutcome = async (orderId: string) => {
    requireSessionRole("breeder");
    const order = await fetchSharedOrderRaw(orderId);
    return buildSharedOrderOutcome(order);
  };

  const getBreederCertificateArtifact = async (orderId: string) => {
    requireSessionRole("breeder");
    return unsupported("Certificate artifact retrieval");
  };

  const listLabTestOrders = async (): Promise<TestOrder[]> => {
    requireSessionRole("admin", "lab_staff", "breeder");
    const orders = await listSharedOrdersRaw();
    return orders.map(toLegacyOrder);
  };

  const getLabOrderOutcome = async (orderId: string) => {
    requireSessionRole("admin", "lab_staff", "breeder");
    const order = await fetchSharedOrderRaw(orderId);
    return buildSharedOrderOutcome(order);
  };

  const resolveLabSampleByQrToken = async (rawInput: string) => {
    requireSessionRole("admin", "lab_staff");
    const normalizedInput = String(rawInput || "").trim();
    const parsed = toLabQrResolvePayload(normalizedInput);

    if (parsed.sampleId) {
      return resolveLabSampleBySampleId(parsed.sampleId);
    }

    const qrToken = parsed.qrToken
      || (parsed.rawQrString ? parseQrPayload(parsed.rawQrString).t : "");
    if (!qrToken) {
      throw new Error("QR token could not be resolved.");
    }

    const match = await findSharedSampleByQrToken(qrToken);
    if (!match) {
      throw new Error("Sample not found for the provided qrToken.");
    }

    return toSharedSampleLookupResult(match.order, match.animal, match.sample, "qrToken");
  };

  const resolveLabSampleBySampleId = async (sampleId: string) => {
    requireSessionRole("admin", "lab_staff", "breeder");
    const match = await findSharedSampleBySampleId(String(sampleId || "").trim());
    if (!match) {
      throw new Error("Sample not found for the provided sampleId.");
    }

    return toSharedSampleLookupResult(match.order, match.animal, match.sample, "sampleId");
  };

  const markSampleAsReceived = async (sampleId: string) => {
    requireSessionRole("admin", "lab_staff");
    const resolved = await resolveLabSampleBySampleId(sampleId);
    const currentStatus = String(resolved?.testOrder?.status || "").trim();
    if (currentStatus === "sample_received" || currentStatus === "testing_in_progress" || currentStatus === "completed" || currentStatus === "cancelled") {
      return {
        ...resolved,
        alreadyReceived: true,
      };
    }

    await apiRequest<{ order: any }>(`/lab/orders/${encodeURIComponent(String(resolved.testOrder.id || "").trim())}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "received" }),
    });

    const refreshed = await resolveLabSampleBySampleId(sampleId);
    return {
      ...refreshed,
      alreadyReceived: false,
    };
  };

  const submitLabSampleIntake = async (input: { orderId: string; sampleCondition: "acceptable" | "borderline" | "degraded" | "insufficient"; notes?: string; received: boolean; }): Promise<TestOrder> => {
    requireSessionRole("admin", "lab_staff");
    if (!input.received) throw new Error("Sample must be marked as received.");
    const backendStatus = input.sampleCondition === "insufficient" ? "received" : "in_progress";
    const response = await apiRequest<{ order: any }>(`/lab/orders/${encodeURIComponent(String(input.orderId || "").trim())}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: backendStatus }),
    });
    return toLegacyOrder(response?.order || null);
  };

  const getLabTestOrderDetails = async (orderId: string): Promise<TestOrder> => {
    requireSessionRole("admin", "lab_staff", "breeder");
    const data = await fetchOrderById(String(orderId || "").trim());
    return toLegacyOrder((data as any)?.order || null);
  };

  const getLabOrderStatusHistory = async (orderId: string): Promise<StatusHistory[]> => {
    requireSessionRole("admin", "lab_staff", "breeder");
    const data = await fetchOrderById(String(orderId || "").trim());
    return buildSharedStatusHistory((data as any)?.order || null);
  };

  const updateLabOrderWorkflowStatus = async (input: { orderId: string; status: string; reason?: string; }): Promise<TestOrder> => {
    requireSessionRole("admin", "lab_staff");
    const response = await apiRequest<{ order: any }>(`/lab/orders/${encodeURIComponent(String(input.orderId || "").trim())}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: mapLegacyStatusToBackend(input.status) }),
    });
    return toLegacyOrder(response?.order || null);
  };

  const updateLabOrderPaymentStatus = async (input: { orderId: string; paymentStatus: string; reason?: string; }): Promise<TestOrder> => {
    requireSessionRole("admin", "lab_staff");
    return unsupported("Payment status changes");
  };

  const getBreederShipmentLabelArtifact = async (orderId: string) => {
    requireSessionRole("breeder", "admin", "lab_staff");
    return getSharedOrderLabelsArtifact(orderId) as Promise<ShippingLabelArtifactResponse>;
  };

  const getBreederSampleLabelsArtifact = async (orderId: string) => {
    requireSessionRole("breeder", "admin", "lab_staff");
    return getSharedOrderLabelsArtifact(orderId) as Promise<SampleLabelsArtifactResponse>;
  };

  const getBreederAllLabelsArtifact = async (orderId: string) => {
    requireSessionRole("breeder", "admin", "lab_staff");
    const labelsPdf = await getSharedOrderLabelsArtifact(orderId);
    return {
      orderId: labelsPdf.orderId,
      orderNumber: labelsPdf.orderNumber,
      labelsPdf,
    } satisfies AllOrderLabelsArtifactResponse;
  };

  const getLabTestsCatalog = async (options: { breederView?: boolean } = {}): Promise<ShedTestCatalogItem[]> => {
    requireSessionRole("admin", "lab_staff", "breeder");
    const breederView = options.breederView ? "true" : "false";
    const data = options.breederView
      ? await fetchTestCatalog()
      : await apiRequest<{ tests: any[] }>(`/lab/tests/catalog?breederView=${breederView}`);
    const tests = Array.isArray((data as any)?.tests) ? (data as any).tests : [];
    return tests.map(toLegacyCatalogItem);
  };

  const getLabTestsPricing = async (): Promise<PricingConfig> => {
    requireSessionRole("admin", "lab_staff", "breeder");
    const data = await fetchPricingConfig();
    return toLegacyPricingConfig((data as any)?.pricing || null);
  };

  const calculateLabOrderPrice = async (payload: { animals: AnimalTestSelection[] }): Promise<OrderPriceBreakdown> => {
    requireSessionRole("admin", "lab_staff", "breeder");
    const data = await calculateOrderPrice(payload as any);
    const tierMap: Record<string, "1-9" | "10-49" | "50+"> = {
      tier_1_9: "1-9",
      tier_10_49: "10-49",
      tier_50_plus: "50+",
    };
    return {
      animalCount: Number((data as any)?.animalCount || 0),
      tier: tierMap[String((data as any)?.tier || "tier_1_9")] || "1-9",
      perAnimal: Array.isArray((data as any)?.perAnimal) ? (data as any).perAnimal : [],
      totalMorphCharges: Number((data as any)?.totalMorphCharges || 0),
      totalSexCharges: Number((data as any)?.totalSexCharges || 0),
      total: Number((data as any)?.total || 0),
    };
  };

  const listBreederAvailableTests = async (): Promise<LabAvailableTestBreederView[]> => {
    requireSessionRole("breeder", "admin", "lab_staff");
    const catalog = await getLabTestsCatalog({ breederView: true });
    return catalog.map((test) => ({
      id: test.id,
      name: test.name,
      shortLabel: test.name,
      description: test.description,
      category: test.category,
      pricingType: test.pricingType,
      currency: "EUR",
      allowedPriorities: ["routine", "priority", "urgent"],
    }));
  };

  const listPendingShedTests = async (): Promise<PendingShedTestItem[]> => {
    requireSessionRole("breeder");
    throw new Error("Pending shed queue is not available on the shared backend. Create submitted orders directly.");
  };

  const addPendingShedTest = async (input: {
    snakeId: string;
    snakeDisplayId?: string;
    snakeName?: string;
    selectedTestIds: string[];
    priority?: "routine" | "priority" | "urgent";
    sampleType?: "shed" | "bellyScaleClip";
    notes?: string;
  }): Promise<PendingShedTestItem> => {
    requireSessionRole("breeder");
    throw new Error("Pending shed queue is not available on the shared backend. Create the order directly instead.");
  };

  const updatePendingShedTest = async (input: { pendingItemId: string; selectedTestIds?: string[]; priority?: "routine" | "priority" | "urgent"; sampleType?: "shed" | "bellyScaleClip"; notes?: string; selected?: boolean; }): Promise<PendingShedTestItem> => {
    requireSessionRole("breeder");
    throw new Error("Pending shed queue is not available on the shared backend.");
  };

  const removePendingShedTest = async (pendingItemId: string): Promise<void> => {
    requireSessionRole("breeder");
    throw new Error("Pending queue deletion is not supported on hosted backend. Orders are already submitted on creation.");
  };

  const quotePendingShedTests = async (pendingItemIds?: string[]): Promise<ShedTerminalQuote> => {
    requireSessionRole("breeder");
    throw new Error("Pending shed pricing is not available on the shared backend. Submitted orders are priced by the backend.");
  };

  const submitPendingShedBatch = async (pendingItemIds?: string[]) => {
    requireSessionRole("breeder");
    throw new Error("Pending shed batch submission is not available on the shared backend. Orders are created immediately.");
  };

  const listShedSubmissionBatches = async (): Promise<ShedSubmissionBatch[]> => {
    requireSessionRole("breeder");
    throw new Error("Shed submission batches are not available on the shared backend.");
  };

  const getShedBatchArtifacts = async (batchId: string) => {
    requireSessionRole("breeder");
    return unsupported("Batch artifact download");
  };

  const listLabAvailableTests = async (): Promise<LabAvailableTest[]> => {
    requireSessionRole("admin", "lab_staff");
    const tests = await getLabTestsCatalog({ breederView: false });
    return tests.map((test, index) => ({
      id: test.id,
      labId: DEFAULT_LAB_ID,
      internalCode: test.id,
      name: test.name,
      shortLabel: test.name,
      description: test.description,
      category: test.category,
      pricingType: test.pricingType,
      currency: "EUR",
      allowedPriorities: ["routine", "priority", "urgent"],
      isActive: test.active,
      isVisibleToBreeder: test.visibleInBreederApp,
      sortOrder: Number(test.sortOrder || index),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  };

  const createLabAvailableTest = async (input: CreateLabAvailableTestInput): Promise<LabAvailableTest> => {
    requireSessionRole("admin", "lab_staff");
    return unsupported("Creating new catalog tests");
  };

  const updateLabAvailableTest = async (input: UpdateLabAvailableTestInput): Promise<LabAvailableTest> => {
    requireSessionRole("admin", "lab_staff");
    const response = await apiRequest<{ test: any }>(`/lab/tests/catalog/${encodeURIComponent(String(input.id || "").trim())}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    const item = toLegacyCatalogItem(response?.test || null);
    return {
      id: item.id,
      labId: DEFAULT_LAB_ID,
      internalCode: item.id,
      name: item.name,
      shortLabel: item.name,
      description: item.description,
      category: item.category,
      pricingType: item.pricingType,
      currency: "EUR",
      allowedPriorities: ["routine", "priority", "urgent"],
      isActive: item.active,
      isVisibleToBreeder: item.visibleInBreederApp,
      sortOrder: Number(item.sortOrder || 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const setLabAvailableTestActive = async (id: string, isActive: boolean): Promise<LabAvailableTest> => {
    requireSessionRole("admin", "lab_staff");
    return updateLabAvailableTest({ id, labId: DEFAULT_LAB_ID, isActive } as any);
  };

  const setLabAvailableTestVisibility = async (id: string, isVisibleToBreeder: boolean): Promise<LabAvailableTest> => {
    requireSessionRole("admin", "lab_staff");
    return updateLabAvailableTest({ id, labId: DEFAULT_LAB_ID, isVisibleToBreeder } as any);
  };

  const listAdminAllOrders = async (): Promise<TestOrder[]> => {
    requireSessionRole("admin");
    return listLabTestOrders();
  };

  const deleteAllLabOrders = async (): Promise<{
    deletedOrders: number;
    deletedAnimals: number;
    deletedAnimalTests: number;
  }> => {
    requireSessionRole("admin", "lab_staff");
    return apiRequest("/lab/orders", {
      method: "DELETE",
    });
  };

  const getAdminOrderOversight = async (orderId: string) => {
    requireSessionRole("admin");
    const order = await getLabTestOrderDetails(orderId);
    const statusHistory = await getLabOrderStatusHistory(orderId);
    return {
      order,
      statusHistory,
      results: [],
      certificates: [],
      geneticsChanges: [],
    };
  };

  const adminCorrectOrderStatus = async (input: { orderId: string; status: string; reason: string; }): Promise<TestOrder> => {
    requireSessionRole("admin");
    return updateLabOrderWorkflowStatus({ orderId: input.orderId, status: input.status, reason: input.reason });
  };

  const getLabAllowedWorkflowStatuses = async (orderId: string): Promise<string[]> => {
    const role = requireSessionRole("admin", "lab_staff", "breeder");
    if (role === "breeder") {
      return [];
    }

    const order = await getLabTestOrderDetails(orderId);
    const currentStatus = String(order?.status || "").trim();
    if (!supportsSharedWorkflowTransition(currentStatus)) {
      return [];
    }

    if (currentStatus === "order_created") {
      return ["sample_received", "cancelled"];
    }
    if (currentStatus === "sample_received") {
      return ["testing_in_progress", "cancelled"];
    }
    if (currentStatus === "testing_in_progress") {
      return ["completed", "cancelled"];
    }
    return [];
  };

  const getLabResultEntryTemplate = async (orderId: string): Promise<LabResultEntryTemplate> => {
    requireSessionRole("admin", "lab_staff");
    const order = await fetchSharedOrderRaw(orderId);
    return buildSharedResultEntryTemplate(order);
  };

  const saveLabResultDraft = async (payload: any): Promise<any> => {
    requireSessionRole("admin", "lab_staff");
    const orderId = String(payload?.orderId || "").trim();
    if (!orderId) {
      throw new Error("orderId is required.");
    }
    const response = await apiRequest<{ result?: any; order?: any; mode?: string }>(`/lab/orders/${encodeURIComponent(orderId)}/results/draft`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      ...response,
      order: toLegacyOrder(response?.order || null),
      result: response?.result
        ? {
            ...response.result,
            findings: parseSharedResultFindings(response.result),
          }
        : null,
    };
  };

  const submitLabResult = async (payload: any): Promise<any> => {
    requireSessionRole("admin", "lab_staff");
    const orderId = String(payload?.orderId || "").trim();
    if (!orderId) {
      throw new Error("orderId is required.");
    }
    const response = await apiRequest<{ result?: any; order?: any; mode?: string }>(`/lab/orders/${encodeURIComponent(orderId)}/results/submit`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      ...response,
      order: toLegacyOrder(response?.order || null),
      result: response?.result
        ? {
            ...response.result,
            findings: parseSharedResultFindings(response.result),
          }
        : null,
    };
  };

  return {
    createTestOrderFromBreeder,
    listBreederTestOrders,
    listBreederTestOrdersForSnake,
    getBreederTestOrderDetails,
    getBreederOrderOutcome,
    getBreederCertificateArtifact,
    listLabTestOrders,
    getLabOrderOutcome,
    resolveLabSampleByQrToken,
    resolveLabSampleBySampleId,
    markSampleAsReceived,
    submitLabSampleIntake,
    getLabTestOrderDetails,
    getLabOrderStatusHistory,
    updateLabOrderWorkflowStatus,
    updateLabOrderPaymentStatus,
    getBreederShipmentLabelArtifact,
    getBreederSampleLabelsArtifact,
    getBreederAllLabelsArtifact,
    getLabTestsCatalog,
    getLabTestsPricing,
    calculateLabOrderPrice,
    listBreederAvailableTests,
    listPendingShedTests,
    addPendingShedTest,
    updatePendingShedTest,
    removePendingShedTest,
    quotePendingShedTests,
    submitPendingShedBatch,
    listShedSubmissionBatches,
    getShedBatchArtifacts,
    listLabAvailableTests,
    createLabAvailableTest,
    updateLabAvailableTest,
    setLabAvailableTestActive,
    setLabAvailableTestVisibility,
    listAdminAllOrders,
    deleteAllLabOrders,
    getAdminOrderOversight,
    adminCorrectOrderStatus,
    getLabAllowedWorkflowStatuses,
    getLabResultEntryTemplate,
    saveLabResultDraft,
    submitLabResult,
  };
};
