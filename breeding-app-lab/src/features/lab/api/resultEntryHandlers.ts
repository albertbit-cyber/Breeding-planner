import type { ResultFinding } from "../../../types/lab";
import type { ServiceActor } from "../../../services/lab/testOrderService";
import type { LabResultEntryTemplate, ResultEntryItemInput } from "../../../types/labResultEntry";
import {
  getResultEntryTemplate,
  saveResultDraft,
  submitResult,
  type ResultEntryRequest,
  type ResultEntryResponse,
} from "../../../services/lab/resultEntryService";

export type ResultEntryApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export type ResultEntryApiResponse<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ResultEntryApiErrorCode;
        message: string;
        details?: Record<string, unknown>;
      };
    };

export type ResultEntryContext = {
  actor?: ServiceActor;
};

export type ResultEntryPayload = {
  orderId: string;
  testCode: string;
  method?: string;
  findings?: Array<{
    marker: string;
    outcome: ResultFinding["outcome"];
    value?: string;
    units?: string;
    confidence?: number;
    notes?: string;
  }>;
  items?: ResultEntryItemInput[];
  summary?: string;
  notes?: string;
};

export type ResultEntryTemplatePayload = {
  orderId: string;
};

const failure = (
  code: ResultEntryApiErrorCode,
  message: string,
  details?: Record<string, unknown>
): ResultEntryApiResponse<never> => ({
  ok: false,
  error: { code, message, ...(details ? { details } : {}) },
});

const success = <T>(data: T): ResultEntryApiResponse<T> => ({ ok: true, data });

const assertActor = (context: ResultEntryContext): ServiceActor => {
  if (!context.actor) {
    throw new Error("Missing actor context.");
  }
  if (!context.actor.userId || !context.actor.role) {
    throw new Error("Invalid actor context.");
  }
  return context.actor;
};

const normalizeRequest = (payload: ResultEntryPayload): ResultEntryRequest => ({
  orderId: String(payload?.orderId ?? "").trim(),
  testCode: String(payload?.testCode ?? "").trim(),
  method: String(payload?.method ?? "").trim() || undefined,
  findings: Array.isArray(payload?.findings) ? payload.findings : [],
  items: Array.isArray(payload?.items) ? payload.items : [],
  summary: String(payload?.summary ?? "").trim() || undefined,
  notes: String(payload?.notes ?? "").trim() || undefined,
});

export const getResultEntryTemplateHandler = async (
  context: ResultEntryContext,
  payload: ResultEntryTemplatePayload
): Promise<ResultEntryApiResponse<LabResultEntryTemplate>> => {
  try {
    const actor = assertActor(context);
    const orderId = String(payload?.orderId ?? "").trim();
    if (!orderId) {
      return failure("VALIDATION_ERROR", "orderId is required.");
    }
    const template = await getResultEntryTemplate(actor, orderId);
    return success(template);
  } catch (error) {
    return mapError(error);
  }
};

const mapError = (error: unknown): ResultEntryApiResponse<never> => {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  const normalized = message.toLowerCase();

  if (normalized.includes("missing actor") || normalized.includes("invalid actor")) {
    return failure("UNAUTHORIZED", message);
  }
  if (normalized.includes("access denied") || normalized.includes("permission")) {
    return failure("FORBIDDEN", message);
  }
  if (normalized.includes("not found")) {
    return failure("NOT_FOUND", message);
  }
  if (normalized.includes("invalid") || normalized.includes("required") || normalized.includes("cannot create")) {
    return failure("VALIDATION_ERROR", message);
  }
  return failure("INTERNAL_ERROR", message);
};

export const saveResultDraftHandler = async (
  context: ResultEntryContext,
  payload: ResultEntryPayload
): Promise<ResultEntryApiResponse<ResultEntryResponse>> => {
  try {
    const actor = assertActor(context);
    const request = normalizeRequest(payload);
    const saved = await saveResultDraft(actor, request);
    return success(saved);
  } catch (error) {
    return mapError(error);
  }
};

export const submitResultHandler = async (
  context: ResultEntryContext,
  payload: ResultEntryPayload
): Promise<ResultEntryApiResponse<ResultEntryResponse>> => {
  try {
    const actor = assertActor(context);
    const request = normalizeRequest(payload);
    const submitted = await submitResult(actor, request);
    return success(submitted);
  } catch (error) {
    return mapError(error);
  }
};

export const RESULT_ENTRY_API_HANDLERS = {
  "lab.results.template": getResultEntryTemplateHandler,
  "lab.results.saveDraft": saveResultDraftHandler,
  "lab.results.submit": submitResultHandler,
} as const;
