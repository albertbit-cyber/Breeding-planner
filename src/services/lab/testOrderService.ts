declare const require: any;

import type { Sample, SampleType, TestOrder } from "../../types/lab";
import type { OrderPaymentStatus, TestOrderStatus } from "../../types/labStatus";
import {
  createSampleRecord,
  createTestOrderRecord,
  getTestOrderRecordById,
  listTestOrderRecordsByBreederUserId,
  listTestOrderRecordsByLabId,
  updateTestOrderPaymentStatusRecord,
  updateTestOrderStatusRecord,
} from "../../db/labStore";
import { buildQrPayload, generateQrToken } from "../../utils/labToken";
import {
  actorCanRunLabWorkflow,
  getAllowedNextStatuses,
  statusRequiresLabWorkflowRole,
} from "./workflowRules";
import { finalizeLatestOrderResult } from "./resultFinalizationService";
import { emitShedWorkflowEvent } from "./workflowEvents";

export type ServiceRole = "breeder" | "lab_staff" | "admin";

export interface ServiceActor {
  userId: string;
  role: ServiceRole;
  labId?: string;
}

export interface CreateTestOrderRequest {
  id: string;
  labId: string;
  animalId: string;
  orderNumber?: string;
  requestedTests: string[];
  priority: TestOrder["priority"];
  breederUserId?: string;
  requestedByUserId?: string;
  submittedAt?: string;
  externalReference?: string;
  notes?: string;
  sampleIds?: string[];
  resultIds?: string[];
  certificateId?: string;
  paymentId?: string;
  paymentStatus?: OrderPaymentStatus;
  pricingSnapshot?: TestOrder["pricingSnapshot"];
  status?: TestOrderStatus;
  /** Sample type for the automatically created initial sample. Defaults to "shed". */
  sampleType?: SampleType;
}

/** Derives a time-ordered prefixed ID with secure random suffix. */
const makeInternalId = (prefix: string): string => {
  const rand = generateQrToken().slice(0, 16);
  return `${prefix}_${Date.now()}_${rand}`;
};

/** Return value of {@link createTestOrder}. */
export interface CreateTestOrderResult {
  order: TestOrder;
  sample: Sample;
  /** JSON string ready to pass to `QRCode.toDataURL()`. */
  qrPayload: string;
}

const assertNonEmptyString = (value: unknown, fieldName: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`Invalid ${fieldName}: value is required.`);
  }
  return normalized;
};

const assertStringArray = (value: unknown, fieldName: string): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${fieldName}: expected an array.`);
  }
  const normalized = value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  if (!normalized.length) {
    throw new Error(`Invalid ${fieldName}: at least one value is required.`);
  }
  return normalized;
};

const sanitizeDisplayToken = (value: unknown, fallback: string, maxLength = 24): string => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!normalized) return fallback;
  return normalized.slice(0, Math.max(1, maxLength));
};

const resolveBreederCode = (request: CreateTestOrderRequest, actorUserId: string): string => {
  const source = request.breederUserId || request.requestedByUserId || actorUserId;
  const emailLocal = String(source || "").split("@")[0];
  return sanitizeDisplayToken(emailLocal || source, "BREEDER", 12);
};

const resolveOrderYear = (submittedAt?: string): number => {
  if (typeof submittedAt === "string" && submittedAt.trim()) {
    const parsed = new Date(submittedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getFullYear();
    }
  }
  return new Date().getFullYear();
};

const resolveSnakeSegment = (animalId: string): string => {
  return sanitizeDisplayToken(animalId, "SNAKE", 24);
};

const extractSequenceForPrefix = (orderNumber: string, prefix: string): number | null => {
  const normalized = String(orderNumber || "").trim().toUpperCase();
  if (!normalized.startsWith(prefix)) return null;
  const suffix = normalized.slice(prefix.length);
  const match = suffix.match(/^(\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
};

const buildOrderNumber = (
  request: CreateTestOrderRequest,
  actorUserId: string,
  existingOrders: TestOrder[]
): string => {
  const breederCode = resolveBreederCode(request, actorUserId);
  const year = resolveOrderYear(request.submittedAt);
  const snakeSegment = resolveSnakeSegment(request.animalId);
  const prefix = `${breederCode}-${year}-${snakeSegment}-`;

  let maxSeq = 0;
  for (const entry of existingOrders) {
    const seq = extractSequenceForPrefix(entry?.orderNumber || "", prefix);
    if (Number.isFinite(seq) && (seq as number) > maxSeq) {
      maxSeq = seq as number;
    }
  }

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(2, "0")}`;
};

const PAYMENT_REQUIRED_LAB_STATUSES = new Set<TestOrderStatus>([
  "sample_received",
  "intake_approved",
  "testing_in_progress",
  "result_entered",
  "result_reviewed",
  "completed",
  "certificate_issued",
]);

// Optional gate: toggle to false if the lab wants to bypass payment restrictions temporarily.
const REQUIRE_PAYMENT_FOR_LAB_PROCESSING = true;

const normalizeOrderPaymentStatus = (paymentStatus: OrderPaymentStatus | undefined): OrderPaymentStatus =>
  paymentStatus || "pending";

const isProcessingPaymentEligible = (paymentStatus: OrderPaymentStatus | undefined): boolean => {
  const normalized = normalizeOrderPaymentStatus(paymentStatus);
  return normalized === "paid" || normalized === "manually_approved";
};

export const canAccessTestOrder = (actor: ServiceActor, order: TestOrder): boolean => {
  if (actor.role === "admin") return true;

  if (actor.role === "lab_staff") {
    return Boolean(actor.labId && actor.labId === order.labId);
  }

  return order.requestedByUserId === actor.userId || order.breederUserId === actor.userId;
};

const ensureCanAccessOrder = (actor: ServiceActor, order: TestOrder): void => {
  if (!canAccessTestOrder(actor, order)) {
    throw new Error("Access denied: you do not have permission to access this test order.");
  }
};

const normalizeCreateRequest = (request: CreateTestOrderRequest): CreateTestOrderRequest => {
  const requestedTests = assertStringArray(request.requestedTests, "requestedTests");
  const sampleIds = Array.isArray(request.sampleIds)
    ? request.sampleIds.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
  const resultIds = Array.isArray(request.resultIds)
    ? request.resultIds.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];

  return {
    ...request,
    id: assertNonEmptyString(request.id, "id"),
    labId: assertNonEmptyString(request.labId, "labId"),
    animalId: assertNonEmptyString(request.animalId, "animalId"),
    orderNumber: String(request.orderNumber ?? "").trim() || undefined,
    requestedTests,
    sampleIds,
    resultIds,
    status: request.status || "draft",
    paymentStatus: request.paymentStatus || "pending",
  };
};

export const createTestOrder = (actor: ServiceActor, request: CreateTestOrderRequest): CreateTestOrderResult => {
  const normalizedActorUserId = assertNonEmptyString(actor.userId, "actor.userId");
  const normalized = normalizeCreateRequest(request);

  if (actor.role === "breeder") {
    const ownerId = normalized.requestedByUserId || normalized.breederUserId || normalizedActorUserId;
    if (ownerId !== normalizedActorUserId) {
      throw new Error("Access denied: breeders can only create their own orders.");
    }
    normalized.requestedByUserId = normalizedActorUserId;
    normalized.breederUserId = ownerId;
  }

  if (actor.role === "lab_staff") {
    if (!actor.labId || actor.labId !== normalized.labId) {
      throw new Error("Access denied: lab staff can only create orders for their own lab.");
    }
  }

  if (!normalized.orderNumber) {
    const existingOrders = listTestOrderRecordsByLabId(normalized.labId);
    normalized.orderNumber = buildOrderNumber(normalized, normalizedActorUserId, existingOrders);
  }

  // Generate the QR token and sample ID before creating the order so we can
  // pre-populate the order's sampleIds array atomically.
  const qrToken = generateQrToken();
  const qrPayload = buildQrPayload(qrToken);
  const sampleId = makeInternalId("sample");

  const actorCtx = { userId: normalizedActorUserId, role: actor.role };

  const order = createTestOrderRecord(
    {
      id: normalized.id,
      labId: normalized.labId,
      animalId: normalized.animalId,
      orderNumber: normalized.orderNumber,
      status: normalized.status || "draft",
      requestedTests: normalized.requestedTests,
      priority: normalized.priority,
      breederUserId: normalized.breederUserId,
      requestedByUserId: normalized.requestedByUserId,
      submittedAt: normalized.submittedAt,
      // Pre-populate sampleIds so the order and sample are linked from the start.
      sampleIds: [sampleId, ...(normalized.sampleIds || [])],
      resultIds: normalized.resultIds || [],
      certificateId: normalized.certificateId,
      paymentId: normalized.paymentId,
      paymentStatus: normalized.paymentStatus || "pending",
      pricingSnapshot: normalized.pricingSnapshot,
      externalReference: normalized.externalReference,
      notes: normalized.notes,
    },
    actorCtx
  );

  const sample = createSampleRecord(
    {
      id: sampleId,
      labId: normalized.labId,
      orderId: order.id,
      animalId: normalized.animalId,
      status: "label_generated",
      type: request.sampleType ?? "shed",
      qrToken,
    },
    actorCtx
  );

  void emitShedWorkflowEvent({
    type: "test_order_created",
    orderId: order.id,
    labId: order.labId,
    animalId: order.animalId,
    actor: { userId: actor.userId, role: actor.role },
    metadata: {
      orderNumber: order.orderNumber,
      priority: order.priority,
      requestedTests: order.requestedTests,
      paymentStatus: order.paymentStatus,
    },
  });

  return { order, sample, qrPayload };
};

export const getTestOrderById = (actor: ServiceActor, orderId: string): TestOrder | null => {
  const normalizedOrderId = assertNonEmptyString(orderId, "orderId");
  const order = getTestOrderRecordById(normalizedOrderId);
  if (!order) return null;
  ensureCanAccessOrder(actor, order);
  return order;
};

export const listTestOrdersForBreeder = (actor: ServiceActor, breederUserId?: string): TestOrder[] => {
  if (actor.role !== "breeder" && actor.role !== "admin") {
    throw new Error("Access denied: only breeders or admins can list breeder test orders.");
  }

  const targetUserId = actor.role === "breeder"
    ? actor.userId
    : assertNonEmptyString(breederUserId, "breederUserId");

  const orders = listTestOrderRecordsByBreederUserId(targetUserId);
  if (actor.role === "breeder") {
    return orders.filter((order) => order.requestedByUserId === actor.userId || order.breederUserId === actor.userId);
  }
  return orders;
};

export const listTestOrdersForLabStaff = (actor: ServiceActor, labId?: string): TestOrder[] => {
  if (actor.role !== "lab_staff" && actor.role !== "admin") {
    throw new Error("Access denied: only lab staff or admins can list lab workflow orders.");
  }

  const targetLabId = actor.role === "lab_staff"
    ? assertNonEmptyString(actor.labId, "actor.labId")
    : assertNonEmptyString(labId, "labId");

  return listTestOrderRecordsByLabId(targetLabId);
};

export const updateOrderStatus = (
  actor: ServiceActor,
  orderId: string,
  status: TestOrderStatus,
  reason?: string
): TestOrder | null => {
  const normalizedOrderId = assertNonEmptyString(orderId, "orderId");
  const order = getTestOrderRecordById(normalizedOrderId);
  if (!order) return null;

  ensureCanAccessOrder(actor, order);

   const allowedNext = getAllowedNextStatuses(order.status, actor.role);
   if (!allowedNext.includes(status)) {
    throw new Error(
      `Invalid status transition: ${order.status} -> ${status}. Allowed: ${allowedNext.join(", ") || "none"}.`
    );
   }

   if (statusRequiresLabWorkflowRole(status) && !actorCanRunLabWorkflow(actor.role)) {
    throw new Error("Access denied: only lab staff or admin can run this workflow action.");
   }

  if (
    REQUIRE_PAYMENT_FOR_LAB_PROCESSING &&
    PAYMENT_REQUIRED_LAB_STATUSES.has(status) &&
    !isProcessingPaymentEligible(order.paymentStatus)
  ) {
    throw new Error(
      `Payment restriction: order processing is blocked until payment is paid or manually approved (current: ${normalizeOrderPaymentStatus(order.paymentStatus)}).`
    );
  }

  const updated = updateTestOrderStatusRecord(normalizedOrderId, status, { userId: actor.userId, role: actor.role }, reason);

  if (updated && status === "sample_received") {
    void emitShedWorkflowEvent({
      type: "sample_received",
      orderId: updated.id,
      labId: updated.labId,
      animalId: updated.animalId,
      actor: { userId: actor.userId, role: actor.role },
      metadata: { status, reason },
    });
  }

  if (updated && status === "testing_in_progress") {
    void emitShedWorkflowEvent({
      type: "testing_started",
      orderId: updated.id,
      labId: updated.labId,
      animalId: updated.animalId,
      actor: { userId: actor.userId, role: actor.role },
      metadata: { status, reason },
    });
  }

  if (updated && status === "paid" && updated.paymentStatus !== "paid") {
    return updateOrderPaymentStatus(actor, updated.id, "paid", "workflow_marked_paid") || updated;
  }

  if (
    updated &&
    (status === "result_entered" || status === "result_reviewed" || status === "completed" || status === "certificate_issued") &&
    actorCanRunLabWorkflow(actor.role)
  ) {
    // Keep genetics finalization centralized and idempotent for lab approval/finalization clicks.
    finalizeLatestOrderResult(actor, updated, { allowNoop: true }).catch(() => undefined);
  }

  return updated;
};

export const getAllowedOrderStatusTransitions = (
  actor: ServiceActor,
  orderId: string
): TestOrderStatus[] => {
  const normalizedOrderId = assertNonEmptyString(orderId, "orderId");
  const order = getTestOrderRecordById(normalizedOrderId);
  if (!order) {
    throw new Error("Test order not found.");
  }

  ensureCanAccessOrder(actor, order);
  const next = getAllowedNextStatuses(order.status, actor.role);
  if (!REQUIRE_PAYMENT_FOR_LAB_PROCESSING || isProcessingPaymentEligible(order.paymentStatus)) {
    return next;
  }
  return next.filter((entry) => !PAYMENT_REQUIRED_LAB_STATUSES.has(entry));
};

export const updateOrderPaymentStatus = (
  actor: ServiceActor,
  orderId: string,
  paymentStatus: OrderPaymentStatus,
  reason?: string
): TestOrder | null => {
  const normalizedOrderId = assertNonEmptyString(orderId, "orderId");
  const order = getTestOrderRecordById(normalizedOrderId);
  if (!order) return null;

  ensureCanAccessOrder(actor, order);
  if (actor.role !== "lab_staff" && actor.role !== "admin") {
    throw new Error("Access denied: only lab staff or admin can update payment status.");
  }

  const updated = updateTestOrderPaymentStatusRecord(
    normalizedOrderId,
    paymentStatus,
    { userId: actor.userId, role: actor.role },
    reason || "payment_status_updated"
  );

  if (updated && (paymentStatus === "paid" || paymentStatus === "manually_approved")) {
    void emitShedWorkflowEvent({
      type: "payment_confirmed",
      orderId: updated.id,
      labId: updated.labId,
      animalId: updated.animalId,
      actor: { userId: actor.userId, role: actor.role },
      metadata: {
        paymentStatus,
        confirmationMode: paymentStatus === "paid" ? "gateway_or_manual_paid" : "manual_approval",
        reason,
      },
    });
  }

  return updated;
};
