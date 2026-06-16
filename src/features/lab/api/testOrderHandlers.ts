import type { StatusHistory, TestOrder } from "../../../types/lab";
import type { OrderPaymentStatus, TestOrderStatus } from "../../../types/labStatus";
import { ORDER_PAYMENT_STATUSES, TEST_ORDER_STATUSES } from "../../../types/labStatus";
import {
  createTestOrder,
  getAllowedOrderStatusTransitions,
  getTestOrderById,
  listTestOrdersForBreeder,
  listTestOrdersForLabStaff,
  type CreateTestOrderRequest,
  type ServiceActor,
  updateOrderPaymentStatus,
  updateOrderStatus,
} from "../../../services/lab/testOrderService";
import { getBreederOrderOutcomeSummary } from "../../../services/lab/resultFinalizationService";
import { getBreederCertificateArtifact } from "../../../services/lab/certificateService";
import {
  correctOrderStatusAsAdmin,
  getOrderOversightForAdmin,
  listAllOrdersForAdmin,
} from "../../../services/lab/adminOversightService";
import type { CreateTestOrderResult } from "../../../services/lab/testOrderService";
import { listStatusHistoryRecords } from "../../../db/labStore";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  error: ApiError;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type RequestContext = {
  actor?: ServiceActor;
};

export type CreateTestOrderPayload = {
  order: CreateTestOrderRequest;
};

export type GetTestOrderPayload = {
  orderId: string;
};

export type ListBreederOrdersPayload = {
  breederUserId?: string;
};

export type ListLabOrdersPayload = {
  labId?: string;
};

export type UpdateOrderStatusPayload = {
  orderId: string;
  status: TestOrderStatus;
  reason?: string;
};

export type UpdateOrderPaymentStatusPayload = {
  orderId: string;
  paymentStatus: OrderPaymentStatus;
  reason?: string;
};

export type AdminCorrectOrderStatusPayload = {
  orderId: string;
  status: TestOrderStatus;
  reason: string;
};

const toFailure = (
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>
): ApiFailure => ({
  ok: false,
  error: { code, message, ...(details ? { details } : {}) },
});

const toSuccess = <T>(data: T): ApiSuccess<T> => ({ ok: true, data });

const assertActor = (context: RequestContext): ServiceActor => {
  if (!context.actor) {
    throw new Error("Missing actor context.");
  }
  if (!context.actor.userId || !context.actor.role) {
    throw new Error("Invalid actor context.");
  }
  return context.actor;
};

const assertString = (value: unknown, fieldName: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`Invalid ${fieldName}.`);
  return normalized;
};

const handleError = (error: unknown): ApiFailure => {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  const normalized = message.toLowerCase();

  if (normalized.includes("missing actor") || normalized.includes("invalid actor")) {
    return toFailure("UNAUTHORIZED", message);
  }
  if (normalized.includes("access denied") || normalized.includes("permission")) {
    return toFailure("FORBIDDEN", message);
  }
  if (normalized.includes("invalid")) {
    return toFailure("VALIDATION_ERROR", message);
  }
  return toFailure("INTERNAL_ERROR", message);
};

export const createTestOrderHandler = (
  context: RequestContext,
  payload: CreateTestOrderPayload
): ApiResponse<CreateTestOrderResult> => {
  try {
    const actor = assertActor(context);
    if (!payload || typeof payload !== "object" || !payload.order) {
      return toFailure("VALIDATION_ERROR", "Invalid payload.order.");
    }
    const created = createTestOrder(actor, payload.order);
    return toSuccess(created);
  } catch (error) {
    return handleError(error);
  }
};

export const getTestOrderByIdHandler = (
  context: RequestContext,
  payload: GetTestOrderPayload
): ApiResponse<TestOrder> => {
  try {
    const actor = assertActor(context);
    const orderId = assertString(payload?.orderId, "orderId");
    const order = getTestOrderById(actor, orderId);
    if (!order) {
      return toFailure("NOT_FOUND", "Test order not found.");
    }
    return toSuccess(order);
  } catch (error) {
    return handleError(error);
  }
};

export const listBreederTestOrdersHandler = (
  context: RequestContext,
  payload: ListBreederOrdersPayload = {}
): ApiResponse<TestOrder[]> => {
  try {
    const actor = assertActor(context);
    const orders = listTestOrdersForBreeder(actor, payload?.breederUserId);
    return toSuccess(orders);
  } catch (error) {
    return handleError(error);
  }
};

export const listLabTestOrdersHandler = (
  context: RequestContext,
  payload: ListLabOrdersPayload = {}
): ApiResponse<TestOrder[]> => {
  try {
    const actor = assertActor(context);
    const orders = listTestOrdersForLabStaff(actor, payload?.labId);
    return toSuccess(orders);
  } catch (error) {
    return handleError(error);
  }
};

export const updateTestOrderStatusHandler = (
  context: RequestContext,
  payload: UpdateOrderStatusPayload
): ApiResponse<TestOrder> => {
  try {
    const actor = assertActor(context);
    const orderId = assertString(payload?.orderId, "orderId");
    const statusValue = assertString(payload?.status, "status");
    if (!TEST_ORDER_STATUSES.includes(statusValue as TestOrderStatus)) {
      return toFailure("VALIDATION_ERROR", "Invalid status value.", {
        allowed: [...TEST_ORDER_STATUSES],
      });
    }
    const status = statusValue as TestOrderStatus;
    const updated = updateOrderStatus(actor, orderId, status, payload?.reason);
    if (!updated) {
      return toFailure("NOT_FOUND", "Test order not found.");
    }
    return toSuccess(updated);
  } catch (error) {
    return handleError(error);
  }
};

export const getOrderStatusHistoryHandler = (
  context: RequestContext,
  payload: GetTestOrderPayload
): ApiResponse<StatusHistory[]> => {
  try {
    const actor = assertActor(context);
    const orderId = assertString(payload?.orderId, "orderId");

    const order = getTestOrderById(actor, orderId);
    if (!order) {
      return toFailure("NOT_FOUND", "Test order not found.");
    }

    const history = listStatusHistoryRecords("testOrder", orderId);
    return toSuccess(history);
  } catch (error) {
    return handleError(error);
  }
};

export const getAllowedOrderStatusTransitionsHandler = (
  context: RequestContext,
  payload: GetTestOrderPayload
): ApiResponse<TestOrderStatus[]> => {
  try {
    const actor = assertActor(context);
    const orderId = assertString(payload?.orderId, "orderId");
    const nextStatuses = getAllowedOrderStatusTransitions(actor, orderId);
    return toSuccess(nextStatuses);
  } catch (error) {
    return handleError(error);
  }
};

export const updateTestOrderPaymentStatusHandler = (
  context: RequestContext,
  payload: UpdateOrderPaymentStatusPayload
): ApiResponse<TestOrder> => {
  try {
    const actor = assertActor(context);
    const orderId = assertString(payload?.orderId, "orderId");
    const paymentStatusValue = assertString(payload?.paymentStatus, "paymentStatus");
    if (!ORDER_PAYMENT_STATUSES.includes(paymentStatusValue as OrderPaymentStatus)) {
      return toFailure("VALIDATION_ERROR", "Invalid paymentStatus value.", {
        allowed: [...ORDER_PAYMENT_STATUSES],
      });
    }

    const updated = updateOrderPaymentStatus(actor, orderId, paymentStatusValue as OrderPaymentStatus, payload?.reason);
    if (!updated) {
      return toFailure("NOT_FOUND", "Test order not found.");
    }
    return toSuccess(updated);
  } catch (error) {
    return handleError(error);
  }
};

export const getBreederOrderOutcomeHandler = async (
  context: RequestContext,
  payload: GetTestOrderPayload
): Promise<ApiResponse<{
  order: TestOrder;
  latestResult: {
    id: string;
    status: string;
    testCode: string;
    summary?: string;
    findings: Array<{ marker: string; outcome: string }>;
    reportedAt?: string;
    reviewedAt?: string;
    releasedAt?: string;
  } | null;
  geneticsUpdate: {
    applied: boolean;
    changeLogId?: string;
    reason: string;
    before: { morphs: string[]; hets: string[]; possibleHets?: string[] };
    after: { morphs: string[]; hets: string[]; possibleHets?: string[] };
  } | null;
  certificate: {
    id: string;
    status: string;
    certificateNumber: string;
    issuedAt?: string;
    fileUrl?: string;
    verificationCode?: string;
  } | null;
  resultHistory: Array<{
    id: string;
    status: string;
    testCode: string;
    summary?: string;
    findings: Array<{ marker: string; outcome: string }>;
    reportedAt?: string;
    reviewedAt?: string;
    releasedAt?: string;
    certificateId?: string;
  }>;
  labConfirmedMarkers: Array<{ marker: string; outcome: string }>;
  currentGenetics: { morphs: string[]; hets: string[]; possibleHets?: string[] } | null;
}>> => {
  try {
    const actor = assertActor(context);
    const orderId = assertString(payload?.orderId, "orderId");
    const summary = await getBreederOrderOutcomeSummary(actor, orderId);
    return toSuccess(summary);
  } catch (error) {
    return handleError(error);
  }
};

export const getBreederCertificateArtifactHandler = async (
  context: RequestContext,
  payload: GetTestOrderPayload
): Promise<ApiResponse<{
  certificateId: string;
  certificateNumber: string;
  issuedAt?: string;
  fileName: string;
  mimeType: "application/pdf";
  base64: string;
  byteLength: number;
}>> => {
  try {
    const actor = assertActor(context);
    const orderId = assertString(payload?.orderId, "orderId");
    const artifact = await getBreederCertificateArtifact(actor, orderId);
    return toSuccess(artifact);
  } catch (error) {
    return handleError(error);
  }
};

export const listAdminAllOrdersHandler = (
  context: RequestContext
): ApiResponse<TestOrder[]> => {
  try {
    const actor = assertActor(context);
    return toSuccess(listAllOrdersForAdmin(actor));
  } catch (error) {
    return handleError(error);
  }
};

export const getAdminOrderOversightHandler = (
  context: RequestContext,
  payload: GetTestOrderPayload
): ApiResponse<{
  order: TestOrder;
  statusHistory: StatusHistory[];
  results: Array<{
    id: string;
    status: string;
    testCode: string;
    findings: Array<{ marker: string; outcome: string }>;
    reportedAt?: string;
    reviewedAt?: string;
    releasedAt?: string;
    certificateId?: string;
  }>;
  certificates: Array<{
    id: string;
    status: string;
    certificateNumber: string;
    issuedAt?: string;
    fileUrl?: string;
  }>;
  geneticsChanges: Array<{
    id: string;
    status: string;
    source: string;
    changeType: string;
    resultId?: string;
    changedAt: string;
    reason?: string;
  }>;
}> => {
  try {
    const actor = assertActor(context);
    const orderId = assertString(payload?.orderId, "orderId");
    const oversight = getOrderOversightForAdmin(actor, orderId);
    return toSuccess({
      order: oversight.order,
      statusHistory: oversight.statusHistory,
      results: oversight.results.map((entry) => ({
        id: entry.id,
        status: entry.status,
        testCode: entry.testCode,
        findings: entry.findings,
        reportedAt: entry.reportedAt,
        reviewedAt: entry.reviewedAt,
        releasedAt: entry.releasedAt,
        certificateId: entry.certificateId,
      })),
      certificates: oversight.certificates.map((entry) => ({
        id: entry.id,
        status: entry.status,
        certificateNumber: entry.certificateNumber,
        issuedAt: entry.issuedAt,
        fileUrl: entry.fileUrl,
      })),
      geneticsChanges: oversight.geneticsChanges.map((entry) => ({
        id: entry.id,
        status: entry.status,
        source: entry.source,
        changeType: entry.changeType,
        resultId: entry.resultId,
        changedAt: entry.changedAt,
        reason: entry.reason,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
};

export const adminCorrectOrderStatusHandler = (
  context: RequestContext,
  payload: AdminCorrectOrderStatusPayload
): ApiResponse<TestOrder> => {
  try {
    const actor = assertActor(context);
    const orderId = assertString(payload?.orderId, "orderId");
    const statusValue = assertString(payload?.status, "status");
    if (!TEST_ORDER_STATUSES.includes(statusValue as TestOrderStatus)) {
      return toFailure("VALIDATION_ERROR", "Invalid status value.", {
        allowed: [...TEST_ORDER_STATUSES],
      });
    }
    const reason = assertString(payload?.reason, "reason");
    const corrected = correctOrderStatusAsAdmin(actor, orderId, statusValue as TestOrderStatus, reason);
    if (!corrected) {
      return toFailure("NOT_FOUND", "Test order not found.");
    }
    return toSuccess(corrected);
  } catch (error) {
    return handleError(error);
  }
};

export const TEST_ORDER_API_HANDLERS = {
  "lab.testOrders.create": createTestOrderHandler,
  "lab.testOrders.getById": getTestOrderByIdHandler,
  "lab.testOrders.listBreeder": listBreederTestOrdersHandler,
  "lab.testOrders.listLab": listLabTestOrdersHandler,
  "lab.testOrders.updateStatus": updateTestOrderStatusHandler,
  "lab.testOrders.updatePaymentStatus": updateTestOrderPaymentStatusHandler,
  "lab.testOrders.getStatusHistory": getOrderStatusHistoryHandler,
  "lab.testOrders.getAllowedTransitions": getAllowedOrderStatusTransitionsHandler,
  "lab.testOrders.getBreederOutcome": getBreederOrderOutcomeHandler,
  "lab.testOrders.getBreederCertificateArtifact": getBreederCertificateArtifactHandler,
  "lab.admin.listAllOrders": listAdminAllOrdersHandler,
  "lab.admin.getOrderOversight": getAdminOrderOversightHandler,
  "lab.admin.correctOrderStatus": adminCorrectOrderStatusHandler,
} as const;
