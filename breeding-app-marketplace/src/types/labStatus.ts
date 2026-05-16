export type LabStatusBadgeTone =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "danger";

export const TEST_ORDER_STATUSES = [
  "draft",
  "order_created",
  "payment_pending",
  "paid",
  "label_generated",
  "sample_sent",
  "sample_received",
  "intake_approved",
  "testing_in_progress",
  "result_entered",
  "result_reviewed",
  "completed",
  "certificate_issued",
  "cancelled",
] as const;

export type TestOrderStatus = (typeof TEST_ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "payment_pending",
  "authorized",
  "paid",
  "failed",
  "partially_refunded",
  "refunded",
  "voided",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
  "manually_approved",
] as const;

export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export const SAMPLE_STATUSES = [
  "expected",
  "label_generated",
  "sample_sent",
  "sample_received",
  "intake_approved",
  "intake_rejected",
  "testing_in_progress",
  "consumed",
  "archived",
] as const;

export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

export const CERTIFICATE_STATUSES = [
  "draft",
  "ready_for_issue",
  "issued",
  "void",
  "expired",
] as const;

export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

export const TEST_ORDER_STATUS_LABELS: Record<TestOrderStatus, string> = {
  draft: "Draft",
  order_created: "Order Created",
  payment_pending: "Payment Pending",
  paid: "Paid",
  label_generated: "Label Generated",
  sample_sent: "Sample Sent",
  sample_received: "Sample Received",
  intake_approved: "Intake Approved",
  testing_in_progress: "Testing In Progress",
  result_entered: "Result Entered",
  result_reviewed: "Result Reviewed",
  completed: "Completed",
  certificate_issued: "Certificate Issued",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  payment_pending: "Payment Pending",
  authorized: "Authorized",
  paid: "Paid",
  failed: "Failed",
  partially_refunded: "Partially Refunded",
  refunded: "Refunded",
  voided: "Voided",
};

export const ORDER_PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  manually_approved: "Manually Approved",
};

export const SAMPLE_STATUS_LABELS: Record<SampleStatus, string> = {
  expected: "Pending",
  label_generated: "Label Generated",
  sample_sent: "Shipped",
  sample_received: "Shed Received",
  intake_approved: "Intake Approved",
  intake_rejected: "Intake Rejected",
  testing_in_progress: "In Process",
  consumed: "Completed",
  archived: "Results Available",
};

export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = {
  draft: "Draft",
  ready_for_issue: "Ready For Issue",
  issued: "Issued",
  void: "Void",
  expired: "Expired",
};

export const TEST_ORDER_STATUS_TONES: Record<TestOrderStatus, LabStatusBadgeTone> = {
  draft: "neutral",
  order_created: "info",
  payment_pending: "warning",
  paid: "success",
  label_generated: "info",
  sample_sent: "info",
  sample_received: "info",
  intake_approved: "success",
  testing_in_progress: "info",
  result_entered: "info",
  result_reviewed: "success",
  completed: "success",
  certificate_issued: "success",
  cancelled: "danger",
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, LabStatusBadgeTone> = {
  payment_pending: "warning",
  authorized: "info",
  paid: "success",
  failed: "danger",
  partially_refunded: "warning",
  refunded: "neutral",
  voided: "neutral",
};

export const ORDER_PAYMENT_STATUS_TONES: Record<OrderPaymentStatus, LabStatusBadgeTone> = {
  pending: "warning",
  paid: "success",
  failed: "danger",
  refunded: "neutral",
  manually_approved: "info",
};

export const SAMPLE_STATUS_TONES: Record<SampleStatus, LabStatusBadgeTone> = {
  expected: "neutral",
  label_generated: "info",
  sample_sent: "info",
  sample_received: "info",
  intake_approved: "success",
  intake_rejected: "danger",
  testing_in_progress: "info",
  consumed: "neutral",
  archived: "neutral",
};

export const CERTIFICATE_STATUS_TONES: Record<CertificateStatus, LabStatusBadgeTone> = {
  draft: "neutral",
  ready_for_issue: "info",
  issued: "success",
  void: "danger",
  expired: "warning",
};

export const getTestOrderStatusLabel = (status: TestOrderStatus): string =>
  TEST_ORDER_STATUS_LABELS[status];

export const getPaymentStatusLabel = (status: PaymentStatus): string =>
  PAYMENT_STATUS_LABELS[status];

export const getSampleStatusLabel = (status: SampleStatus): string =>
  SAMPLE_STATUS_LABELS[status];

export const getCertificateStatusLabel = (status: CertificateStatus): string =>
  CERTIFICATE_STATUS_LABELS[status];

export const getTestOrderStatusTone = (status: TestOrderStatus): LabStatusBadgeTone =>
  TEST_ORDER_STATUS_TONES[status];

export const getPaymentStatusTone = (status: PaymentStatus): LabStatusBadgeTone =>
  PAYMENT_STATUS_TONES[status];

export const getOrderPaymentStatusLabel = (status: OrderPaymentStatus): string =>
  ORDER_PAYMENT_STATUS_LABELS[status];

export const getOrderPaymentStatusTone = (status: OrderPaymentStatus): LabStatusBadgeTone =>
  ORDER_PAYMENT_STATUS_TONES[status];

export const getSampleStatusTone = (status: SampleStatus): LabStatusBadgeTone =>
  SAMPLE_STATUS_TONES[status];

export const getCertificateStatusTone = (status: CertificateStatus): LabStatusBadgeTone =>
  CERTIFICATE_STATUS_TONES[status];
