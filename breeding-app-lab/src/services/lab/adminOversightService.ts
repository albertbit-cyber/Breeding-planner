import {
  getTestOrderRecordById,
  listAllTestOrderRecords,
  listCertificateRecordsByOrderId,
  listGeneticsChangeRecordsByOrderId,
  listStatusHistoryRecords,
  listTestResultRecordsByOrderId,
  updateTestOrderStatusRecord,
} from "../../db/labStore";
import type { Certificate, GeneticsChangeLog, StatusHistory, TestOrder, TestResult } from "../../types/lab";
import type { TestOrderStatus } from "../../types/labStatus";
import type { ServiceActor } from "./testOrderService";
import { updateOrderPaymentStatus } from "./testOrderService";

const assertAdminActor = (actor: ServiceActor): void => {
  if (actor.role !== "admin") {
    throw new Error("Access denied: admin role is required.");
  }
};

const assertOrderId = (orderId: string): string => {
  const normalized = String(orderId || "").trim();
  if (!normalized) throw new Error("Invalid orderId.");
  return normalized;
};

export const listAllOrdersForAdmin = (actor: ServiceActor): TestOrder[] => {
  assertAdminActor(actor);
  return listAllTestOrderRecords();
};

export const getOrderOversightForAdmin = (
  actor: ServiceActor,
  orderId: string
): {
  order: TestOrder;
  statusHistory: StatusHistory[];
  results: TestResult[];
  certificates: Certificate[];
  geneticsChanges: GeneticsChangeLog[];
} => {
  assertAdminActor(actor);
  const normalizedOrderId = assertOrderId(orderId);
  const order = getTestOrderRecordById(normalizedOrderId);
  if (!order) {
    throw new Error("Test order not found.");
  }

  return {
    order,
    statusHistory: listStatusHistoryRecords("testOrder", order.id),
    results: listTestResultRecordsByOrderId(order.id),
    certificates: listCertificateRecordsByOrderId(order.id),
    geneticsChanges: listGeneticsChangeRecordsByOrderId(order.id),
  };
};

export const correctOrderStatusAsAdmin = (
  actor: ServiceActor,
  orderId: string,
  status: TestOrderStatus,
  reason?: string
): TestOrder | null => {
  assertAdminActor(actor);
  const normalizedOrderId = assertOrderId(orderId);
  const order = getTestOrderRecordById(normalizedOrderId);
  if (!order) return null;

  const adminReason = String(reason || "").trim();
  if (!adminReason) {
    throw new Error("Admin status correction requires a reason.");
  }

  const updated = updateTestOrderStatusRecord(
    normalizedOrderId,
    status,
    { userId: actor.userId, role: actor.role },
    `admin_override:${adminReason}`
  );

  if (updated && status === "paid") {
    updateOrderPaymentStatus(actor, updated.id, "paid", `admin_payment_sync:${adminReason}`);
  }

  return updated;
};
