import type { ServiceRole } from "./testOrderService";
import type { TestOrderStatus } from "../../types/labStatus";

export const LAB_WORKFLOW_STATUSES: readonly TestOrderStatus[] = [
  "sample_received",
  "intake_approved",
  "testing_in_progress",
  "result_entered",
  "result_reviewed",
  "completed",
  "certificate_issued",
] as const;

const LAB_WORKFLOW_STATUS_SET = new Set<TestOrderStatus>(LAB_WORKFLOW_STATUSES);

const LAB_ALLOWED_ROLES = new Set<ServiceRole>(["lab_staff", "admin"]);

export const ORDER_STATUS_TRANSITIONS: Readonly<Record<TestOrderStatus, readonly TestOrderStatus[]>> = {
  draft: ["order_created", "payment_pending", "cancelled"],
  order_created: ["payment_pending", "paid", "cancelled"],
  payment_pending: ["paid", "cancelled"],
  paid: ["label_generated", "sample_sent", "cancelled"],
  label_generated: ["sample_sent", "cancelled"],
  sample_sent: ["sample_received", "cancelled"],
  sample_received: ["intake_approved", "cancelled"],
  intake_approved: ["testing_in_progress", "cancelled"],
  testing_in_progress: ["result_entered", "cancelled"],
  result_entered: ["result_reviewed", "cancelled"],
  result_reviewed: ["completed", "cancelled"],
  completed: ["certificate_issued"],
  certificate_issued: [],
  cancelled: [],
};

export const statusRequiresLabWorkflowRole = (nextStatus: TestOrderStatus): boolean =>
  LAB_WORKFLOW_STATUS_SET.has(nextStatus);

export const actorCanRunLabWorkflow = (role: ServiceRole): boolean => LAB_ALLOWED_ROLES.has(role);

export const getAllowedNextStatuses = (
  currentStatus: TestOrderStatus,
  role: ServiceRole
): TestOrderStatus[] => {
  const candidates = ORDER_STATUS_TRANSITIONS[currentStatus] || [];
  return candidates.filter((next) => {
    if (!statusRequiresLabWorkflowRole(next)) return true;
    return actorCanRunLabWorkflow(role);
  });
};
