import type { ResultFinding, TestOrder, TestResult } from "../../types/lab";
import { createTestResultRecord, getTestOrderRecordById } from "../../db/labStore";
import { canAccessTestOrder, type ServiceActor, updateOrderStatus } from "./testOrderService";
import {
  finalizeLatestOrderResult,
  type GeneticsUpdateEngineResult,
} from "./resultFinalizationService";
import { listTestResultRecordsByOrderId } from "../../db/labStore";
import {
  LAB_RESULT_STATUS_TO_OUTCOME,
  type LabResultEntryTemplate,
  type OrderedTestTemplateItem,
  type ResultEntryItemInput,
} from "../../types/labResultEntry";
import { resolveCanonicalGene } from "../../genetics/geneDatabase";

type ResultMode = "draft" | "submit";

export interface ResultEntryFindingInput {
  marker: string;
  outcome: ResultFinding["outcome"];
  value?: string;
  units?: string;
  confidence?: number;
  notes?: string;
}

export interface ResultEntryRequest {
  orderId: string;
  testCode: string;
  method?: string;
  findings: ResultEntryFindingInput[];
  items?: ResultEntryItemInput[];
  summary?: string;
  notes?: string;
}

export interface ResultEntryResponse {
  result: TestResult;
  order: TestOrder;
  mode: ResultMode;
  geneticsUpdate: GeneticsUpdateEngineResult;
}

const assertNonEmpty = (value: unknown, field: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`Invalid ${field}: value is required.`);
  return normalized;
};

const normalizeFindings = (value: unknown): ResultFinding[] => {
  if (!Array.isArray(value) || !value.length) {
    throw new Error("Invalid findings: at least one finding is required.");
  }

  const normalized: ResultFinding[] = value.map((entry, index) => {
    const marker = assertNonEmpty((entry as ResultEntryFindingInput)?.marker, `findings[${index}].marker`);
    const outcome = assertNonEmpty((entry as ResultEntryFindingInput)?.outcome, `findings[${index}].outcome`) as ResultFinding["outcome"];
    const confidenceRaw = (entry as ResultEntryFindingInput)?.confidence;
    const confidenceNum = typeof confidenceRaw === "number" ? confidenceRaw : Number(confidenceRaw);

    return {
      marker,
      outcome,
      value: String((entry as ResultEntryFindingInput)?.value ?? "").trim() || undefined,
      units: String((entry as ResultEntryFindingInput)?.units ?? "").trim() || undefined,
      confidence: Number.isFinite(confidenceNum) ? confidenceNum : undefined,
      notes: String((entry as ResultEntryFindingInput)?.notes ?? "").trim() || undefined,
    };
  });

  return normalized;
};

const normalizeOrderedGeneName = (value: unknown): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const canonical = resolveCanonicalGene(normalized);
  return canonical || normalized;
};

const makeOrderedTestKey = (geneName: string, index: number): string => {
  const base = String(geneName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `gene-${index + 1}`;
  return `${index}:${base}`;
};

const buildOrderedTestTemplate = (order: TestOrder): OrderedTestTemplateItem[] => {
  const requested = Array.isArray(order.requestedTests)
    ? order.requestedTests.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  return requested.map((sourceOrderedName, index) => {
    const geneName = normalizeOrderedGeneName(sourceOrderedName);
    return {
      orderedTestKey: makeOrderedTestKey(geneName || sourceOrderedName, index),
      geneName: geneName || sourceOrderedName,
      sourceOrderedName,
    };
  });
};

const normalizeItemsFromTemplate = (
  order: TestOrder,
  items: ResultEntryItemInput[] | undefined,
  mode: ResultMode
): ResultFinding[] => {
  const template = buildOrderedTestTemplate(order);
  if (!template.length) {
    throw new Error("Cannot create result: order has no requested tests.");
  }

  const byKey = new Map(template.map((item) => [item.orderedTestKey, item]));
  const seen = new Set<string>();
  const incoming = Array.isArray(items) ? items : [];

  if (!incoming.length) {
    throw new Error("Invalid result items: at least one ordered test result is required.");
  }

  const findings: ResultFinding[] = [];

  incoming.forEach((entry, index) => {
    const key = assertNonEmpty(entry?.orderedTestKey, `items[${index}].orderedTestKey`);
    if (!byKey.has(key)) {
      throw new Error(`Invalid result items: '${key}' does not belong to this order.`);
    }
    if (seen.has(key)) {
      throw new Error(`Invalid result items: duplicate ordered test key '${key}'.`);
    }
    seen.add(key);

    const statusRaw = assertNonEmpty(entry?.resultStatus, `items[${index}].resultStatus`) as keyof typeof LAB_RESULT_STATUS_TO_OUTCOME;
    if (!LAB_RESULT_STATUS_TO_OUTCOME[statusRaw]) {
      throw new Error(`Invalid result status for ordered test '${key}'.`);
    }

    const tpl = byKey.get(key)!;
    const confidenceRaw = entry?.confidence;
    const confidenceNum = typeof confidenceRaw === "number" ? confidenceRaw : Number(confidenceRaw);

    findings.push({
      orderedTestKey: key,
      marker: tpl.geneName,
      sourceOrderedName: tpl.sourceOrderedName,
      catalogTestId: tpl.catalogTestId,
      outcome: LAB_RESULT_STATUS_TO_OUTCOME[statusRaw],
      confidence: Number.isFinite(confidenceNum) ? confidenceNum : undefined,
      notes: String(entry?.notes ?? "").trim() || undefined,
    });
  });

  if (mode === "submit" && seen.size !== template.length) {
    throw new Error("Invalid result items: all ordered tests must have a submitted result status.");
  }

  return findings;
};

const assertLabActor = (actor: ServiceActor): void => {
  if (actor.role !== "lab_staff" && actor.role !== "admin") {
    throw new Error("Access denied: only lab staff or admin can submit test results.");
  }
};

const getAccessibleOrder = (actor: ServiceActor, orderId: string): TestOrder => {
  const normalizedOrderId = assertNonEmpty(orderId, "orderId");
  const order = getTestOrderRecordById(normalizedOrderId);
  if (!order) {
    throw new Error("Test order not found.");
  }
  if (!canAccessTestOrder(actor, order)) {
    throw new Error("Access denied: you do not have permission to access this test order.");
  }
  return order;
};

const makeResultId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `result_${crypto.randomUUID()}`;
  }
  return `result_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const moveOrderToResultStage = (actor: ServiceActor, order: TestOrder, mode: ResultMode): TestOrder => {
  let latestOrder = order;

  if (mode === "draft") {
    if (latestOrder.status === "intake_approved") {
      const progressed = updateOrderStatus(actor, latestOrder.id, "testing_in_progress", "result_draft_started");
      if (progressed) latestOrder = progressed;
    }
    return latestOrder;
  }

  // submit mode
  if (latestOrder.status === "intake_approved") {
    const progressed = updateOrderStatus(actor, latestOrder.id, "testing_in_progress", "result_submission_started");
    if (progressed) latestOrder = progressed;
  }

  if (latestOrder.status === "testing_in_progress") {
    const progressed = updateOrderStatus(actor, latestOrder.id, "result_entered", "result_submitted");
    if (progressed) latestOrder = progressed;
  }

  return latestOrder;
};

const createResultRecord = (
  actor: ServiceActor,
  order: TestOrder,
  request: ResultEntryRequest,
  mode: ResultMode
): TestResult => {
  const sampleId = Array.isArray(order.sampleIds) && order.sampleIds.length
    ? String(order.sampleIds[0]).trim()
    : "";
  if (!sampleId) {
    throw new Error("Cannot create result: order has no linked sample.");
  }

  const structuredFindings = normalizeItemsFromTemplate(order, request.items, mode);

  return createTestResultRecord(
    {
      id: makeResultId(),
      labId: order.labId,
      orderId: order.id,
      sampleId,
      animalId: order.animalId,
      status: mode === "submit" ? "completed" : "running",
      testCode: assertNonEmpty(request.testCode, "testCode"),
      method: String(request.method ?? "").trim() || undefined,
      findings: structuredFindings,
      summary: String(request.summary ?? "").trim() || undefined,
      reportedAt: mode === "submit" ? new Date().toISOString() : undefined,
      analystUserId: actor.userId,
      notes: String(request.notes ?? "").trim() || undefined,
    },
    { userId: actor.userId, role: actor.role }
  );
};

const findExistingFinalizedResultForOrder = (orderId: string, testCode: string): TestResult | null => {
  const normalizedTestCode = String(testCode || "").trim().toLowerCase();
  if (!normalizedTestCode) return null;

  const rows = listTestResultRecordsByOrderId(orderId);
  const existing = rows.find((row) => {
    const status = String(row.status || "").trim().toLowerCase();
    if (!(status === "completed" || status === "reviewed" || status === "released")) {
      return false;
    }
    return String(row.testCode || "").trim().toLowerCase() === normalizedTestCode;
  });
  return existing || null;
};

const saveResult = async (actor: ServiceActor, request: ResultEntryRequest, mode: ResultMode): Promise<ResultEntryResponse> => {
  assertLabActor(actor);
  const order = getAccessibleOrder(actor, request.orderId);

  if (mode === "submit") {
    const existingFinalized = findExistingFinalizedResultForOrder(order.id, request.testCode);
    if (existingFinalized) {
      const finalized = await finalizeLatestOrderResult(actor, order, {
        testCode: request.testCode,
        allowNoop: true,
      });
      return {
        result: existingFinalized,
        order,
        mode,
        geneticsUpdate: finalized.geneticsUpdate,
      };
    }
  }

  const updatedOrder = moveOrderToResultStage(actor, order, mode);
  const result = createResultRecord(actor, updatedOrder, request, mode);

  const geneticsUpdate = mode === "submit"
    ? (await finalizeLatestOrderResult(actor, updatedOrder, {
      testCode: request.testCode,
      allowNoop: true,
    })).geneticsUpdate
    : {
      applied: false,
      changedGeneKeys: [],
      before: { morphs: [], hets: [] },
      after: { morphs: [], hets: [] },
      reason: "Result draft does not apply genetics updates.",
    };

  return {
    result,
    order: updatedOrder,
    mode,
    geneticsUpdate,
  };
};

export const saveResultDraft = (actor: ServiceActor, request: ResultEntryRequest): Promise<ResultEntryResponse> =>
  saveResult(actor, request, "draft");

export const submitResult = (actor: ServiceActor, request: ResultEntryRequest): Promise<ResultEntryResponse> =>
  saveResult(actor, request, "submit");

export const getResultEntryTemplate = async (
  actor: ServiceActor,
  orderId: string
): Promise<LabResultEntryTemplate> => {
  assertLabActor(actor);
  const order = getAccessibleOrder(actor, orderId);
  const items = buildOrderedTestTemplate(order);
  return {
    orderId: order.id,
    requestedTests: Array.isArray(order.requestedTests) ? order.requestedTests : [],
    items,
  };
};
