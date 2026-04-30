/**
 * Canonical order status values — these match the backend `ShedOrderStatus` enum.
 * All frontend code should reference these constants instead of raw strings.
 */
export const ORDER_STATUSES = {
  SUBMITTED: "submitted",
  RECEIVED: "received",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

/** Ordered array of active (non-cancelled) statuses for iteration. */
export const ORDER_STATUS_LIST = ["submitted", "received", "in_progress", "completed", "cancelled"];

/** Human-readable labels for each status. */
export const ORDER_STATUS_LABELS = {
  submitted: "Submitted",
  received: "Sample Received",
  in_progress: "Testing in Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Tailwind tone for each status — maps to the toneClass objects in UI components. */
export const ORDER_STATUS_TONES = {
  submitted: "info",
  received: "warning",
  in_progress: "warning",
  completed: "success",
  cancelled: "danger",
};
