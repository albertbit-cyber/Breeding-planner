import {
  apiRequest,
  calculateOrderPrice,
  createOrder,
  fetchMyOrders,
  fetchOrderById,
  fetchPricingConfig,
  fetchTestCatalog,
} from "../../../shared/apiClient";
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
import { buildLabCertificateTemplateData } from "../../../services/lab/certificateTemplate";
import { applyConfirmedResultGeneticsUpdate } from "../../../services/lab/geneticsUpdateEngine";
import { resolveLabTestNumber } from "../../../services/lab/testNumber";
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
import type { ResultFinding, SampleType, StatusHistory, TestOrder, TestResult } from "../../../types/lab";
import { buildQrPayload, parseQrPayload } from "../../../utils/labToken";
import { renderLabCertificatePdf } from "../../../utils/pdf/labCertificatePdf";
import { generateOrderLabelsPdf } from "../../../utils/pdf/labOrderLabelsPdf";
import { getActiveLabelSize } from "../utils/labelSizing";
import { toLabQrResolvePayload } from "../utils/qrLookupInput";

const AUTH_STORAGE_KEYS = [
  "breedingPlannerBreederAuthSession",
  "breedingPlannerLabAuthSession",
  "breedingPlannerAdminAuthSession",
  "breedingPlannerAuthSession",
];
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

const mapLegacyStatusToBackend = (status: string): string => {
  // Legacy names still accepted for backwards compat with older stored data
  if (status === "order_created") return "submitted";
  if (status === "sample_received" || status === "intake_approved") return "received";
  if (status === "testing_in_progress" || status === "result_entered" || status === "result_reviewed") return "in_progress";
  if (status === "result_released" || status === "certificate_issued") return "completed";
  // Backend canonical names pass through unchanged
  return status || "submitted";
};

const normalizeRole = (value: unknown): LegacyRole => {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "lab" || role === "lab_staff") return "lab_staff";
  return "breeder";
};

const getSession = (): AuthSession | null => {
  if (typeof window === "undefined") return null;
  for (const storageKey of AUTH_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as AuthSession;
      if (parsed?.isAuthenticated) return parsed;
    } catch {
      // Try the next auth-session key.
    }
  }
  return null;
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
  const orderId = String(order?.id || "");
  const orderNumber = String(order?.orderNumber || orderId).trim() || orderId;

  return {
    id: orderId,
    labId: DEFAULT_LAB_ID,
    animalId: String(firstAnimal?.animalId || ""),
    animalName: String(firstAnimal?.animalName || "").trim(),
    animalIds: animals.map((a: any) => String(a?.animalId || "")).filter(Boolean),
    animalNames: animals.map((a: any) => String(a?.animalName || "").trim()).filter(Boolean),
    orderNumber,
    status: backendStatus as any,
    requestedTests: Array.from(new Set(requestedTests)),
    priority: "routine",
    breederUserId: String(order?.breederId || ""),
    requestedByUserId: String(order?.breederId || ""),
    submittedAt: String(order?.createdAt || ""),
    sampleIds: animals.map((_: any, index: number) => `${sanitizeFilePart(orderId)}-sample-${index + 1}`),
    resultIds: Array.isArray(order?.results)
      ? order.results
          .map((result: any) => String(result?.id || "").trim())
          .filter(Boolean)
      : [],
    paymentStatus: (["pending", "invoiced", "paid", "waived"].includes(String(order?.paymentStatus || ""))
      ? String(order.paymentStatus) === "paid" ? "paid"
        : String(order.paymentStatus) === "waived" ? "manually_approved"
        : String(order.paymentStatus) === "invoiced" ? "payment_pending"
        : "pending"
      : "pending") as any,
    notes: "",
    paidAt: String(order?.paidAt || "").trim() || undefined,
    paymentRequestedAt: String(order?.paymentRequestedAt || "").trim() || undefined,
    paymentRef: String(order?.paymentRef || "").trim() || undefined,
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
  category: (() => {
    const normalized = String(test?.category || "morph").trim().toLowerCase();
    if (normalized === "sex" || normalized === "sex-determination") return "sex-determination";
    if (normalized === "other") return "other";
    return "morph";
  })(),
  pricingType: String(test?.pricingType || "morph") === "sex" ? "sex" : "morph",
  active: Boolean(test?.active),
  visibleInBreederApp: Boolean(test?.visibleInBreederApp),
  description: test?.description ? String(test.description) : undefined,
  sortOrder: Number(test?.sortOrder || 0),
});

const normalizeAllowedPriorities = (
  value: unknown
): Array<"routine" | "priority" | "urgent"> => {
  const priorities = Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => String(entry || "").trim().toLowerCase())
            .filter((entry): entry is "routine" | "priority" | "urgent" =>
              entry === "routine" || entry === "priority" || entry === "urgent"
            )
        )
      )
    : [];
  return priorities.length ? priorities : ["routine", "priority", "urgent"];
};

const toLabAvailableTestRecord = (test: any, index = 0): LabAvailableTest => ({
  id: String(test?.id || ""),
  labId: DEFAULT_LAB_ID,
  internalCode: String(test?.internalCode || test?.id || ""),
  name: String(test?.name || ""),
  shortLabel: String(test?.shortLabel || test?.name || "").trim() || undefined,
  description: test?.description ? String(test.description) : undefined,
  geneTarget: String(test?.geneTarget || "").trim() || undefined,
  category: (() => {
    const normalized = String(test?.category || "morph").trim().toLowerCase();
    if (normalized === "sex" || normalized === "sex-determination") return "sex-determination";
    if (normalized === "other") return "other";
    return "morph";
  })(),
  pricingType: String(test?.pricingType || "morph") === "sex" ? "sex" : "morph",
  priceCents: Number.isFinite(Number(test?.priceCents)) ? Number(test.priceCents) : undefined,
  currency: String(test?.currency || "EUR").trim() || "EUR",
  allowedPriorities: normalizeAllowedPriorities(test?.allowedPriorities),
  isActive: test?.active !== false,
  isVisibleToBreeder: test?.visibleInBreederApp !== false,
  sortOrder: Number(test?.sortOrder || index || 0),
  createdAt: String(test?.createdAt || new Date().toISOString()),
  updatedAt: String(test?.updatedAt || new Date().toISOString()),
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
  String(order?.orderNumber || order?.id || "").trim();

const getSharedSampleId = (order: any, index: number): string =>
  `${sanitizeFilePart(String(order?.id || "").trim())}-sample-${index + 1}`;

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
  status === "submitted"
  || status === "received"
  || status === "in_progress"
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
    createSyntheticHistoryEntry(orderId, 0, undefined, "submitted", createdAt),
  ];

  if (backendStatus === "received") {
    entries.push(createSyntheticHistoryEntry(orderId, 1, "submitted", "received", updatedAt));
    return entries;
  }

  if (backendStatus === "in_progress") {
    entries.push(
      createSyntheticHistoryEntry(orderId, 1, "submitted", "received", interpolateIso(createdAt, updatedAt, 0.45)),
      createSyntheticHistoryEntry(orderId, 2, "received", "in_progress", updatedAt)
    );
    return entries;
  }

  if (backendStatus === "completed") {
    entries.push(
      createSyntheticHistoryEntry(orderId, 1, "submitted", "received", interpolateIso(createdAt, updatedAt, 0.3)),
      createSyntheticHistoryEntry(orderId, 2, "received", "in_progress", interpolateIso(createdAt, updatedAt, 0.65)),
      createSyntheticHistoryEntry(orderId, 3, "in_progress", "completed", updatedAt)
    );
    return entries;
  }

  if (backendStatus === "cancelled") {
    entries.push(createSyntheticHistoryEntry(orderId, 1, "submitted", "cancelled", updatedAt));
  }

  return entries;
};

const OUTCOME_TO_RESULT_STATUS = {
  notDetected: "not_detected",
  carrierDetected: "heterozygous",
  positive: "visual",
} as const;

const RESULT_OUTCOME_LABELS: Record<string, string> = {
  positive: "Visual",
  negative: "Negative",
  inconclusive: "Inconclusive",
  carrierDetected: "Heterozygous",
  notDetected: "Negative",
};

export const formatLabOutcomeLabel = (value: unknown): string => {
  const normalized = String(value || "").trim();
  return RESULT_OUTCOME_LABELS[normalized] || normalized || "-";
};

export const formatLabTestNumber = (value: unknown, seed: unknown, dateLike?: string): string =>
  resolveLabTestNumber(value, seed, dateLike);

const normalizeSnakeStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

const getSharedPrimaryAnimal = (order: any) => {
  const animals = getSharedOrderAnimals(order);
  return animals[0] || null;
};

// Build per-animal result item groups. Key format: `${orderId}:${animalId}:${testIndex}`
const getSharedOrderedAnimalGroups = (order: any) => {
  const orderId = String(order?.id || "").trim();
  const animals = getSharedOrderAnimals(order);
  return animals.map((animal: any) => {
    const animalId = String(animal?.animalId || "").trim();
    const animalName = String(animal?.animalName || "").trim();
    const tests = Array.isArray(animal?.tests) ? animal.tests : [];
    const items = tests.map((test: any, index: number) => {
      const sourceOrderedName = String(test?.testNameSnapshot || test?.testId || "").trim();
      return {
        orderedTestKey: `${orderId}:${sanitizeFilePart(animalId)}:${index + 1}`,
        geneName: sourceOrderedName,
        sourceOrderedName,
        catalogTestId: String(test?.testId || "").trim() || undefined,
      };
    });
    return { animalId, animalName, items };
  });
};

// Flat list for backward compat (primary animal only for single-animal code paths)
const getSharedOrderedResultItems = (order: any) => {
  const groups = getSharedOrderedAnimalGroups(order);
  return groups.flatMap((g) => g.items);
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

const toStoredSnakeGeneticsSnapshot = (snake: any) => {
  if (!snake || typeof snake !== "object") return null;
  return {
    morphs: normalizeSnakeStringList(snake.morphs),
    hets: normalizeSnakeStringList(snake.hets),
    possibleHets: normalizeSnakeStringList(snake.possibleHets),
  };
};

const attachSharedCurrentGenetics = async (order: any, outcome: any) => {
  const animalId = String(getSharedPrimaryAnimal(order)?.animalId || "").trim();
  if (!animalId) return outcome;
  const storedSnake = await loadSnakeById(animalId);
  const currentGenetics = toStoredSnakeGeneticsSnapshot(storedSnake);
  if (!currentGenetics) return outcome;

  // Derive geneticsUpdate.applied: true if every lab-confirmed marker now
  // appears in the snake's current morphs or hets.
  const confirmedMarkers: Array<{ marker: string; outcome: string }> =
    Array.isArray(outcome?.labConfirmedMarkers) ? outcome.labConfirmedMarkers : [];
  let geneticsUpdateApplied = false;
  if (confirmedMarkers.length > 0) {
    const allTokens = [
      ...(currentGenetics.morphs || []),
      ...(currentGenetics.hets || []),
    ].map((token) => String(token || "").trim().toLowerCase());
    geneticsUpdateApplied = confirmedMarkers.every((entry) => {
      const markerKey = String(entry?.marker || "").trim().toLowerCase();
      return markerKey && allTokens.some((token) => token.includes(markerKey) || markerKey.includes(token));
    });
  }

  return {
    ...outcome,
    currentGenetics,
    geneticsUpdate: geneticsUpdateApplied
      ? { applied: true, changeLogId: outcome?.geneticsUpdate?.changeLogId || undefined }
      : outcome?.geneticsUpdate || null,
  };
};

const toSharedLocalResultRecord = (order: any, result: any): TestResult | null => {
  if (!result) return null;

  const legacyOrder = toLegacyOrder(order);
  if (!legacyOrder.id || !legacyOrder.animalId) return null;

  const findings = parseSharedResultFindings(result) as ResultFinding[];
  return {
    id: String(result?.id || "").trim(),
    labId: DEFAULT_LAB_ID,
    orderId: legacyOrder.id,
    sampleId: String(result?.sampleId || getSharedSampleId(order, 0)).trim(),
    animalId: legacyOrder.animalId,
    status: String(result?.status || "completed").trim() as TestResult["status"],
    testCode: resolveLabTestNumber(
      String(result?.testCode || "").trim(),
      `${legacyOrder.id}:${String(result?.id || "").trim()}`,
      String(result?.reportedAt || result?.updatedAt || order?.updatedAt || order?.createdAt || "").trim() || undefined
    ),
    method: String(result?.method || "").trim() || undefined,
    findings,
    summary: String(result?.summary || "").trim() || undefined,
    reportedAt: String(result?.reportedAt || "").trim() || undefined,
    reviewedAt: String(result?.reviewedAt || "").trim() || undefined,
    releasedAt: String(result?.releasedAt || "").trim() || undefined,
    analystUserId: String(result?.analystUserId || "").trim() || undefined,
    reviewerUserId: String(result?.reviewerUserId || "").trim() || undefined,
    certificateId: String(result?.certificateId || "").trim() || undefined,
    notes: String(result?.notes || "").trim() || undefined,
    createdAt: String(result?.createdAt || new Date().toISOString()).trim(),
    updatedAt: String(result?.updatedAt || result?.createdAt || new Date().toISOString()).trim(),
  };
};

const syncSharedResultSnakeGenetics = async (role: LegacyRole, order: any, result: any): Promise<void> => {
  if (!order || !result) return;

  const legacyOrder = toLegacyOrder(order);
  const localResult = toSharedLocalResultRecord(order, result);
  if (!legacyOrder.id || !legacyOrder.animalId || !localResult) return;

  try {
    await applyConfirmedResultGeneticsUpdate({
      actor: buildActorFromSessionRole(role),
      order: legacyOrder,
      result: localResult,
    }, {
      allowNonLabActor: role === "breeder",
    });

    const updatedSnake = await loadSnakeById(legacyOrder.animalId);
    if (updatedSnake && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("lab:snake-genetics-updated", {
        detail: {
          snakeId: legacyOrder.animalId,
          snake: updatedSnake,
        },
      }));
    }
  } catch (error) {
    console.warn("Failed to synchronize shared lab genetics into local snake data.", error);
  }
};

const syncSharedLatestCompletedResultSnakeGenetics = async (role: LegacyRole, order: any): Promise<void> => {
  const completedResult = (Array.isArray(order?.results) ? order.results : [])
    .find((entry: any) => String(entry?.status || "").trim() === "completed");
  if (!completedResult) return;
  await syncSharedResultSnakeGenetics(role, order, completedResult);
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
  const animalGroups = getSharedOrderedAnimalGroups(order);
  const allItems = animalGroups.flatMap((g) => g.items);
  const requestedTests = allItems.map((item) => item.sourceOrderedName);
  const savedResults: any[] = Array.isArray(order?.results) ? order.results : [];

  // Build per-animal groups with their existing result (matched by animalId)
  const animals = animalGroups.map((group) => {
    const existingResult =
      savedResults.find((r: any) => String(r?.animalId || "").trim() === group.animalId) ||
      (animalGroups.length === 1 ? savedResults[0] || null : null);
    return {
      ...group,
      existingResult: buildSharedTemplateExistingResult(existingResult),
    };
  });

  return {
    orderId: String(order?.id || "").trim(),
    requestedTests,
    animals,
    items: allItems,
    existingResult: buildSharedTemplateExistingResult(savedResults[0] || null),
  };
};

const buildSharedCertificateNumber = (order: any, issuedAt: string): string => {
  const parsed = new Date(issuedAt || "");
  const stamp = Number.isNaN(parsed.getTime())
    ? String(issuedAt || "").replace(/[^0-9]/g, "").slice(0, 8)
    : [
        parsed.getFullYear(),
        String(parsed.getMonth() + 1).padStart(2, "0"),
        String(parsed.getDate()).padStart(2, "0"),
      ].join("");
  const suffix = String(order?.id || "").replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase() || "GEN";
  return `PH-GC-${stamp || "00000000"}-${suffix}`;
};

const buildSharedCertificateSummary = async (order: any, result: any) => {
  const orderId = String(order?.id || "").trim();
  const resultId = String(result?.id || result?.testCode || "").trim() || "result";
  const issuedAt = String(result?.reportedAt || result?.updatedAt || order?.updatedAt || order?.createdAt || new Date().toISOString()).trim();
  const certificateHash = await buildStableQrToken(`${orderId}:${resultId}:certificate`);
  const verificationHash = await buildStableQrToken(`${orderId}:${resultId}:verification`);
  const certificateId = `shared-cert-${sanitizeFilePart(orderId || "order")}-${certificateHash.slice(0, 12).toLowerCase()}`;

  return {
    id: certificateId,
    status: "issued",
    certificateNumber: buildSharedCertificateNumber(order, issuedAt),
    issuedAt,
    fileUrl: `lab-certificate://${certificateId}`,
    verificationCode: verificationHash.slice(0, 24).toUpperCase(),
  };
};

const buildSharedCertificateTemplate = async (order: any, result: any, certificate: any, preUpdateSnake?: any) => {
  const legacyOrder = toLegacyOrder(order);
  const localResult = toSharedLocalResultRecord(order, result);
  if (!localResult) {
    throw new Error("Finalized result could not be converted into a certificate.");
  }

  // Use the pre-update snake snapshot when provided so the certificate morph column
  // reflects the snake's known genetics at the time of testing (before the lab result
  // was incorporated). Fall back to current stored data if no snapshot was captured.
  const [breederInfo, snake] = await Promise.all([
    loadBreederInfo(),
    preUpdateSnake !== undefined
      ? Promise.resolve(preUpdateSnake)
      : legacyOrder.animalId ? loadSnakeById(legacyOrder.animalId) : Promise.resolve(null),
  ]);

  return buildLabCertificateTemplateData({
    order: legacyOrder,
    result: localResult,
    certificateId: String(certificate?.id || "").trim(),
    certificateNumber: String(certificate?.certificateNumber || "").trim(),
    verificationCode: String(certificate?.verificationCode || "").trim(),
    issueDateIso: String(certificate?.issuedAt || "").trim() || undefined,
    breeder: {
      name: String(breederInfo?.name || order?.breeder?.fullName || order?.breeder?.email || "").trim() || undefined,
      businessName: String(breederInfo?.businessName || "").trim() || undefined,
      email: String(breederInfo?.email || order?.breeder?.email || "").trim() || undefined,
      phone: String(breederInfo?.phone || "").trim() || undefined,
      street: String(breederInfo?.street || breederInfo?.addressLine1 || "").trim() || undefined,
      addressLine1: String(breederInfo?.addressLine1 || breederInfo?.street || "").trim() || undefined,
      addressLine2: String(breederInfo?.addressLine2 || "").trim() || undefined,
      city: String(breederInfo?.city || "").trim() || undefined,
      stateOrRegion: String(breederInfo?.stateOrRegion || breederInfo?.state || "").trim() || undefined,
      postalCode: String(breederInfo?.postalCode || "").trim() || undefined,
      country: String(breederInfo?.country || "").trim() || undefined,
    },
    snake,
  });
};

const buildSharedOrderOutcome = async (order: any) => {
  const legacyOrder = toLegacyOrder(order);
  const completedResults = (Array.isArray(order?.results) ? order.results : [])
    .filter((result: any) => String(result?.status || "").trim() === "completed");
  const certificate = completedResults[0]
    ? await buildSharedCertificateSummary(order, completedResults[0])
    : null;
  const latestCompletedResultId = String(completedResults[0]?.id || "").trim();

  const finalizedResults = completedResults.map((result: any) => {
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
        certificateId: certificate && String(result?.id || "").trim() === latestCompletedResultId
          ? certificate.id
          : undefined,
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
    certificate,
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

const buildSharedOrderLabelsPrintPayload = async (orderId: string) => {
  const data = await fetchOrderById(String(orderId || "").trim());
  const order = (data as any)?.order || null;
  if (!order) {
    throw new Error("Order not found.");
  }

  const breederInfo = await loadBreederInfo();
  const labelSize = getActiveLabelSize(breederInfo);
  const debug = await isLabLabelDebugEnabled();
  const normalizedOrderId = String(order?.id || "").trim();
  const orderNumber = getSharedOrderNumber(order) || normalizedOrderId;
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
      const sampleId = getSharedSampleId(order, index);
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

  return {
    orderId: normalizedOrderId,
    orderNumber,
    labelSize,
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
  };
};

const getSharedOrderLabelsArtifact = async (orderId: string): Promise<OrderLabelsArtifactResponse> => {
  const payload = await buildSharedOrderLabelsPrintPayload(orderId);

  const rendered = await generateOrderLabelsPdf({
    size: payload.labelSize,
    debug: payload.debug,
    shippingLabel: payload.shippingLabel,
    sampleLabels: payload.sampleLabels,
  });

  return {
    orderId: payload.orderId,
    orderNumber: payload.orderNumber,
    sampleCount: payload.sampleLabels.length,
    sampleIds: payload.sampleLabels.map((sample) => sample.sampleId),
    fileName: `shed-order-labels-${sanitizeFilePart(payload.orderNumber)}.pdf`,
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

  const createBatchOrder = async (
    items: { snakeId: string; snakeName?: string; selectedTestIds: string[] }[]
  ): Promise<{ order: TestOrder }> => {
    requireSessionRole("breeder");
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("No animals in batch.");
    }
    const animals = items.map((item) => ({
      animalId: String(item.snakeId || "").trim(),
      animalName: String(item.snakeName || "").trim() || undefined,
      selectedTestIds: Array.from(
        new Set((item.selectedTestIds || []).map((id) => String(id || "").trim()).filter(Boolean))
      ),
    }));
    const invalid = animals.find((a) => !a.animalId || a.selectedTestIds.length === 0);
    if (invalid) {
      throw new Error("Each animal must have an ID and at least one selected test.");
    }
    const created = await createOrder({ animals } as any);
    return { order: toLegacyOrder((created as any)?.order || null) };
  };

  const listBreederTestOrders = async (): Promise<TestOrder[]> => {
    requireSessionRole("breeder");
    const data = await fetchMyOrders();
    const rows = Array.isArray((data as any)?.orders) ? (data as any).orders : [];
    return rows.map(toLegacyOrder);
  };

  const listBreederTestOrdersForSnake = async (snakeId: string, snakeDisplayName?: string): Promise<TestOrder[]> => {
    const normalized = String(snakeId || "").trim();
    const snakeName = String(snakeDisplayName || (await loadSnakeById(normalized))?.name || "").trim();
    const orders = await listBreederTestOrders();
    const matches = orders.filter((order) => {
      const ids: string[] = Array.isArray(order.animalIds) && order.animalIds.length
        ? order.animalIds
        : [String(order.animalId || "").trim()].filter(Boolean);
      const names: string[] = Array.isArray((order as any).animalNames)
        ? (order as any).animalNames.map((name: unknown) => String(name || "").trim()).filter(Boolean)
        : [];
      const firstName = String((order as any).animalName || "").trim();
      if (firstName) names.push(firstName);
      return ids.some((id) => id === normalized) || (snakeName && names.some((name) => name === snakeName));
    });
    return matches.length ? matches : [];
  };

  const getBreederTestOrderDetails = async (orderId: string): Promise<TestOrder> => {
    requireSessionRole("breeder");
    const data = await fetchOrderById(String(orderId || "").trim());
    return toLegacyOrder((data as any)?.order || null);
  };

  const getBreederOrderOutcome = async (orderId: string) => {
    const role = requireSessionRole("breeder");
    const order = await fetchSharedOrderRaw(orderId);
    await syncSharedLatestCompletedResultSnakeGenetics(role, order);
    return attachSharedCurrentGenetics(order, await buildSharedOrderOutcome(order));
  };

  const getBreederCertificateArtifact = async (orderId: string) => {
    const role = requireSessionRole("breeder", "admin", "lab_staff");
    const order = await fetchSharedOrderRaw(orderId);
    if (!order) {
      throw new Error("Order not found.");
    }

    const completedResult = (Array.isArray(order?.results) ? order.results : [])
      .find((entry: any) => String(entry?.status || "").trim() === "completed");
    if (!completedResult) {
      throw new Error("Certificate is not available for this order yet.");
    }

    // Capture the snake's genetics BEFORE syncing the lab result so the certificate
    // morph column shows the snake's known morphs at the time of testing.
    const legacyOrderForSnap = toLegacyOrder(order);
    const preUpdateSnake = legacyOrderForSnap.animalId
      ? await loadSnakeById(legacyOrderForSnap.animalId)
      : null;

    await syncSharedResultSnakeGenetics(role, order, completedResult);
    const certificate = await buildSharedCertificateSummary(order, completedResult);
    const template = await buildSharedCertificateTemplate(order, completedResult, certificate, preUpdateSnake);
    const rendered = await renderLabCertificatePdf(template, { includeQr: false });

    return {
      certificateId: certificate.id,
      certificateNumber: certificate.certificateNumber,
      issuedAt: certificate.issuedAt,
      fileName: `${sanitizeFilePart(certificate.certificateNumber || certificate.id)}.pdf`,
      mimeType: "application/pdf" as const,
      base64: bytesToBase64(rendered.arrayBuffer),
      byteLength: rendered.byteLength,
    };
  };

  const listLabTestOrders = async (): Promise<TestOrder[]> => {
    requireSessionRole("admin", "lab_staff", "breeder");
    const orders = await listSharedOrdersRaw();
    return orders.map(toLegacyOrder);
  };

  const getLabOrderOutcome = async (orderId: string) => {
    const role = requireSessionRole("admin", "lab_staff", "breeder");
    const order = await fetchSharedOrderRaw(orderId);
    await syncSharedLatestCompletedResultSnakeGenetics(role, order);
    return attachSharedCurrentGenetics(order, await buildSharedOrderOutcome(order));
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
    if (currentStatus === "received" || currentStatus === "in_progress" || currentStatus === "completed" || currentStatus === "cancelled") {
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

  const updateLabOrderPaymentStatus = async (input: { orderId: string; paymentStatus: string; paymentRef?: string; }): Promise<TestOrder> => {
    requireSessionRole("admin", "lab_staff");
    // Map legacy status names to the canonical backend enum values
    const statusMap: Record<string, string> = {
      pending: "pending",
      payment_pending: "invoiced",
      paid: "paid",
      manually_approved: "waived",
      refunded: "waived",
      failed: "pending",
    };
    const backendPaymentStatus = statusMap[String(input.paymentStatus || "").trim()] || "pending";
    const response = await apiRequest<{ order: any }>(
      `/lab/orders/${encodeURIComponent(String(input.orderId || "").trim())}/payment`,
      {
        method: "PATCH",
        body: JSON.stringify({ paymentStatus: backendPaymentStatus, paymentRef: input.paymentRef }),
      }
    );
    return toLegacyOrder(response?.order || null);
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

  const getBreederAllLabelsPrintData = async (orderId: string) => {
    requireSessionRole("breeder", "admin", "lab_staff");
    return buildSharedOrderLabelsPrintPayload(orderId);
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
    const response = await apiRequest<{ tests: any[] }>("/lab/tests/catalog?breederView=false");
    const tests = Array.isArray(response?.tests) ? response.tests : [];
    return tests.map((test, index) => toLabAvailableTestRecord(test, index));
  };

  const createLabAvailableTest = async (input: CreateLabAvailableTestInput): Promise<LabAvailableTest> => {
    requireSessionRole("admin", "lab_staff");
    return unsupported("Creating new catalog tests");
  };

  const updateLabAvailableTest = async (input: UpdateLabAvailableTestInput): Promise<LabAvailableTest> => {
    requireSessionRole("admin", "lab_staff");
    const payload: Record<string, unknown> = {};

    if (input.name !== undefined) payload.name = String(input.name || "").trim();
    if (input.shortLabel !== undefined) payload.shortLabel = String(input.shortLabel || "").trim() || null;
    if (input.description !== undefined) payload.description = String(input.description || "").trim() || null;
    if (input.geneTarget !== undefined) payload.geneTarget = String(input.geneTarget || "").trim() || null;
    if (input.category !== undefined) payload.category = input.category;
    if (input.pricingType !== undefined) payload.pricingType = input.pricingType;
    if (input.priceCents !== undefined) {
      payload.priceCents = Number.isFinite(Number(input.priceCents))
        ? Math.max(0, Math.round(Number(input.priceCents)))
        : null;
    }
    if (input.currency !== undefined) payload.currency = String(input.currency || "EUR").trim().toUpperCase() || "EUR";
    if (input.allowedPriorities !== undefined) payload.allowedPriorities = normalizeAllowedPriorities(input.allowedPriorities);
    if (input.sortOrder !== undefined) payload.sortOrder = Math.max(0, Math.round(Number(input.sortOrder) || 0));
    if (input.isActive !== undefined) payload.active = Boolean(input.isActive);
    if (input.isVisibleToBreeder !== undefined) payload.visibleInBreederApp = Boolean(input.isVisibleToBreeder);

    const response = await apiRequest<{ test: any }>(`/lab/tests/catalog/${encodeURIComponent(String(input.id || "").trim())}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return toLabAvailableTestRecord(response?.test || null);
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

  const deleteLabOrder = async (orderId: string): Promise<{
    deletedOrderId: string;
    deletedAnimals: number;
    deletedAnimalTests: number;
    deletedResults: number;
  }> => {
    requireSessionRole("admin", "lab_staff");
    const normalized = String(orderId || "").trim();
    if (!normalized) {
      throw new Error("orderId is required.");
    }
    return apiRequest(`/lab/orders/${encodeURIComponent(normalized)}`, {
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

    if (currentStatus === "submitted") {
      return ["received", "cancelled"];
    }
    if (currentStatus === "received") {
      return ["in_progress", "cancelled"];
    }
    if (currentStatus === "in_progress") {
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
    const role = requireSessionRole("admin", "lab_staff");
    const orderId = String(payload?.orderId || "").trim();
    if (!orderId) {
      throw new Error("orderId is required.");
    }
    const response = await apiRequest<{ result?: any; order?: any; mode?: string }>(`/lab/orders/${encodeURIComponent(orderId)}/results/submit`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await syncSharedResultSnakeGenetics(role, response?.order || null, response?.result || null);
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
    createBatchOrder,
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
    getBreederAllLabelsPrintData,
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
    deleteLabOrder,
    deleteAllLabOrders,
    getAdminOrderOversight,
    adminCorrectOrderStatus,
    getLabAllowedWorkflowStatuses,
    getLabResultEntryTemplate,
    saveLabResultDraft,
    submitLabResult,
  };
};
