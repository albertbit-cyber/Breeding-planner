import { useCallback, useMemo, useState } from "react";
import { createLabApiClient } from "../api/client";
import { useAutoRefetch } from "./useAutoRefetch";

const LAB_ORDER_CREATED_EVENT = "lab:test-order-created";
const LAB_ORDER_UPDATED_EVENT = "lab:test-order-updated";
const DASHBOARD_POLL_INTERVAL_MS = 15_000;

const NEW_INCOMING_STATUSES = new Set(["submitted"]);
const PAID_AWAITING_SAMPLE_STATUSES = new Set(["paid", "label_generated", "sample_sent"]);
const RECENTLY_RECEIVED_STATUSES = new Set(["received"]);
const IN_PROGRESS_STATUSES = new Set(["in_progress"]);
const COMPLETED_STATUSES = new Set(["completed"]);

const toTimestamp = (order) => {
  const value = order?.updatedAt || order?.submittedAt || order?.createdAt || "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const sortByRecentDesc = (items) => [...items].sort((a, b) => toTimestamp(b) - toTimestamp(a));

const buildSections = (orders) => {
  const rows = Array.isArray(orders) ? orders : [];
  const isPaidForProcessing = (row) => row?.paymentStatus === "paid" || row?.paymentStatus === "manually_approved";

  return [
    {
      id: "incoming",
      title: "New Incoming Test Orders",
      description: "Fresh breeder submissions that still need payment or initial lab triage.",
      orders: sortByRecentDesc(rows.filter((row) => NEW_INCOMING_STATUSES.has(row.status))),
      emptyMessage: "No newly submitted orders right now.",
    },
    {
      id: "payment-pending",
      title: "Payment Pending Orders",
      description: "Orders blocked on payment completion before sample shipment/intake.",
      orders: sortByRecentDesc(rows.filter((row) => row.paymentStatus === "pending")),
      emptyMessage: "No orders are waiting for payment.",
    },
    {
      id: "paid-awaiting-sample",
      title: "Paid Orders Awaiting Samples",
      description: "Paid orders where the physical sample has not been received yet.",
      orders: sortByRecentDesc(rows.filter((row) => isPaidForProcessing(row) && PAID_AWAITING_SAMPLE_STATUSES.has(row.status))),
      emptyMessage: "No paid orders are awaiting samples.",
    },
    {
      id: "recent-receipts",
      title: "Recently Received Samples",
      description: "Orders marked as received/intake-approved (sample-level endpoint pending).",
      orders: sortByRecentDesc(rows.filter((row) => RECENTLY_RECEIVED_STATUSES.has(row.status))).slice(0, 12),
      emptyMessage: "No recent sample receipts.",
    },
    {
      id: "in-progress",
      title: "Tests In Progress",
      description: "Orders actively moving through testing, result entry, or review.",
      orders: sortByRecentDesc(rows.filter((row) => IN_PROGRESS_STATUSES.has(row.status))),
      emptyMessage: "No tests are currently in progress.",
    },
    {
      id: "completed",
      title: "Completed Tests",
      description: "Finished or certificate-issued orders ready for archival/follow-up.",
      orders: sortByRecentDesc(rows.filter((row) => COMPLETED_STATUSES.has(row.status))).slice(0, 20),
      emptyMessage: "No completed tests yet.",
    },
  ];
};

const DASHBOARD_EVENTS = [LAB_ORDER_CREATED_EVENT, LAB_ORDER_UPDATED_EVENT];

export function useLabDashboardData() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const api = createLabApiClient();
      const rows = await api.listLabTestOrders();
      setOrders(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setOrders([]);
      setError(err instanceof Error ? err.message : "Failed to load lab dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const { refetch } = useAutoRefetch(load, {
    intervalMs: DASHBOARD_POLL_INTERVAL_MS,
    events: DASHBOARD_EVENTS,
  });

  const sections = useMemo(() => buildSections(orders), [orders]);

  return {
    orders,
    sections,
    isLoading,
    error,
    refetch,
  };
}
