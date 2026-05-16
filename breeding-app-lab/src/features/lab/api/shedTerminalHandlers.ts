import type {
  PendingShedTestItem,
  ShedSubmissionBatch,
  ShedTerminalQuote,
} from "../../../types/labShedTerminal";
import {
  addPendingShedTest,
  getShedBatchArtifacts,
  listPendingShedTests,
  listShedSubmissionBatches,
  quotePendingShedTests,
  removePendingShedTest,
  submitPendingShedBatch,
  updatePendingShedTest,
} from "../../../services/lab/shedTerminalService";
import type { ServiceActor } from "../../../services/lab/testOrderService";

type ShedTerminalApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

type ShedTerminalApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ShedTerminalApiErrorCode; message: string } };

type ShedTerminalContext = {
  actor?: ServiceActor;
};

const failure = (code: ShedTerminalApiErrorCode, message: string): ShedTerminalApiResponse<never> => ({
  ok: false,
  error: { code, message },
});

const success = <T>(data: T): ShedTerminalApiResponse<T> => ({ ok: true, data });

const assertActor = (context: ShedTerminalContext): ServiceActor => {
  if (!context.actor?.userId || !context.actor?.role) {
    throw new Error("Missing actor context.");
  }
  return context.actor;
};

const mapError = (error: unknown): ShedTerminalApiResponse<never> => {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  const lower = message.toLowerCase();
  if (lower.includes("missing actor") || lower.includes("signed in")) {
    return failure("UNAUTHORIZED", message);
  }
  if (lower.includes("access denied") || lower.includes("permission")) {
    return failure("FORBIDDEN", message);
  }
  if (lower.includes("not found")) {
    return failure("NOT_FOUND", message);
  }
  if (lower.includes("invalid") || lower.includes("required") || lower.includes("select")) {
    return failure("VALIDATION_ERROR", message);
  }
  return failure("INTERNAL_ERROR", message);
};

export const listPendingShedTestsHandler = (
  context: ShedTerminalContext
): ShedTerminalApiResponse<PendingShedTestItem[]> => {
  try {
    const actor = assertActor(context);
    return success(listPendingShedTests(actor));
  } catch (error) {
    return mapError(error);
  }
};

export const addPendingShedTestHandler = (
  context: ShedTerminalContext,
  payload: {
    snakeId: string;
    snakeDisplayId?: string;
    snakeName?: string;
    selectedTestIds: string[];
    priority?: "routine" | "priority" | "urgent";
    sampleType?: "shed" | "bellyScaleClip";
    notes?: string;
  }
): ShedTerminalApiResponse<PendingShedTestItem> => {
  try {
    const actor = assertActor(context);
    return success(addPendingShedTest(actor, payload));
  } catch (error) {
    return mapError(error);
  }
};

export const updatePendingShedTestHandler = (
  context: ShedTerminalContext,
  payload: {
    pendingItemId: string;
    selectedTestIds?: string[];
    priority?: "routine" | "priority" | "urgent";
    sampleType?: "shed" | "bellyScaleClip";
    notes?: string;
    selected?: boolean;
  }
): ShedTerminalApiResponse<PendingShedTestItem> => {
  try {
    const actor = assertActor(context);
    const pendingItemId = String(payload?.pendingItemId || "").trim();
    if (!pendingItemId) {
      return failure("VALIDATION_ERROR", "pendingItemId is required.");
    }
    return success(updatePendingShedTest(actor, pendingItemId, payload));
  } catch (error) {
    return mapError(error);
  }
};

export const removePendingShedTestHandler = (
  context: ShedTerminalContext,
  payload: { pendingItemId: string }
): ShedTerminalApiResponse<{ removed: true }> => {
  try {
    const actor = assertActor(context);
    const pendingItemId = String(payload?.pendingItemId || "").trim();
    if (!pendingItemId) {
      return failure("VALIDATION_ERROR", "pendingItemId is required.");
    }
    removePendingShedTest(actor, pendingItemId);
    return success({ removed: true });
  } catch (error) {
    return mapError(error);
  }
};

export const quotePendingShedTestsHandler = (
  context: ShedTerminalContext,
  payload?: { pendingItemIds?: string[] }
): ShedTerminalApiResponse<ShedTerminalQuote> => {
  try {
    const actor = assertActor(context);
    return success(quotePendingShedTests(actor, payload?.pendingItemIds));
  } catch (error) {
    return mapError(error);
  }
};

export const submitPendingShedBatchHandler = async (
  context: ShedTerminalContext,
  payload?: { pendingItemIds?: string[] }
): Promise<
  ShedTerminalApiResponse<{
    batch: ShedSubmissionBatch;
    quote: ShedTerminalQuote;
    orders: Array<{
      id: string;
      orderNumber: string;
      animalId: string;
      requestedTests: string[];
      priority: "routine" | "priority" | "urgent";
    }>;
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
  }>
> => {
  try {
    const actor = assertActor(context);
    const result = await submitPendingShedBatch(actor, payload || {});
    return success({
      batch: result.batch,
      quote: result.quote,
      orders: result.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        animalId: order.animalId,
        requestedTests: order.requestedTests,
        priority: order.priority,
      })),
      masterLabel: result.masterLabel,
      individualLabels: result.individualLabels,
    });
  } catch (error) {
    return mapError(error);
  }
};

export const listShedSubmissionBatchesHandler = (
  context: ShedTerminalContext
): ShedTerminalApiResponse<ShedSubmissionBatch[]> => {
  try {
    const actor = assertActor(context);
    return success(listShedSubmissionBatches(actor));
  } catch (error) {
    return mapError(error);
  }
};

export const getShedBatchArtifactsHandler = async (
  context: ShedTerminalContext,
  payload: { batchId: string }
): Promise<
  ShedTerminalApiResponse<{
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
  }>
> => {
  try {
    const actor = assertActor(context);
    const batchId = String(payload?.batchId || "").trim();
    if (!batchId) {
      return failure("VALIDATION_ERROR", "batchId is required.");
    }
    const artifacts = await getShedBatchArtifacts(actor, batchId);
    return success(artifacts);
  } catch (error) {
    return mapError(error);
  }
};
