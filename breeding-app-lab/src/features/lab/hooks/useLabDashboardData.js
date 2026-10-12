import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

const buildSections = (orders, t) => {
  const rows = Array.isArray(orders) ? orders : [];
  const isPaidForProcessing = (row) => row?.paymentStatus === "paid" || row?.paymentStatus === "manually_approved";

  return [
    {
      id: "incoming",
      title: t("lab.dashboard.incomingTitle", { defaultValue: "New Incoming Test Orders" }),
      description: t("lab.dashboard.incomingDescription", {
        defaultValue: "Fresh breeder submissions that still need payment or initial lab triage.",
      }),
      orders: sortByRecentDesc(rows.filter((row) => NEW_INCOMING_STATUSES.has(row.status))),
      emptyMessage: t("lab.dashboard.incomingEmpty", { defaultValue: "No newly submitted orders right now." }),
    },
    {
      id: "payment-pending",
      title: t("lab.dashboard.paymentPendingTitle", { defaultValue: "Payment Pending Orders" }),
      description: t("lab.dashboard.paymentPendingDescription", {
        defaultValue: "Orders blocked on payment completion before sample shipment/intake.",
      }),
      orders: sortByRecentDesc(rows.filter((row) => row.paymentStatus === "pending")),
      emptyMessage: t("lab.dashboard.paymentPendingEmpty", { defaultValue: "No orders are waiting for payment." }),
    },
    {
      id: "paid-awaiting-sample",
      title: t("lab.dashboard.awaitingSampleTitle", { defaultValue: "Paid Orders Awaiting Samples" }),
      description: t("lab.dashboard.awaitingSampleDescription", {
        defaultValue: "Paid orders where the physical sample has not been received yet.",
      }),
      orders: sortByRecentDesc(rows.filter((row) => isPaidForProcessing(row) && PAID_AWAITING_SAMPLE_STATUSES.has(row.status))),
      emptyMessage: t("lab.dashboard.awaitingSampleEmpty", { defaultValue: "No paid orders are awaiting samples." }),
    },
    {
      id: "recent-receipts",
      title: t("lab.dashboard.receivedTitle", { defaultValue: "Recently Received Samples" }),
      description: t("lab.dashboard.receivedDescription", {
        defaultValue: "Orders marked as received/intake-approved (sample-level endpoint pending).",
      }),
      orders: sortByRecentDesc(rows.filter((row) => RECENTLY_RECEIVED_STATUSES.has(row.status))).slice(0, 12),
      emptyMessage: t("lab.dashboard.receivedEmpty", { defaultValue: "No recent sample receipts." }),
    },
    {
      id: "in-progress",
      title: t("lab.dashboard.inProgressTitle", { defaultValue: "Tests In Progress" }),
      description: t("lab.dashboard.inProgressDescription", {
        defaultValue: "Orders actively moving through testing, result entry, or review.",
      }),
      orders: sortByRecentDesc(rows.filter((row) => IN_PROGRESS_STATUSES.has(row.status))),
      emptyMessage: t("lab.dashboard.inProgressEmpty", { defaultValue: "No tests are currently in progress." }),
    },
    {
      id: "completed",
      title: t("lab.dashboard.completedTitle", { defaultValue: "Completed Tests" }),
      description: t("lab.dashboard.completedDescription", {
        defaultValue: "Finished or certificate-issued orders ready for archival/follow-up.",
      }),
      orders: sortByRecentDesc(rows.filter((row) => COMPLETED_STATUSES.has(row.status))).slice(0, 20),
      emptyMessage: t("lab.dashboard.completedEmpty", { defaultValue: "No completed tests yet." }),
    },
  ];
};

const DASHBOARD_EVENTS = [LAB_ORDER_CREATED_EVENT, LAB_ORDER_UPDATED_EVENT];

export function useLabDashboardData() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async ({ initial } = { initial: true }) => {
    // Only the first load blanks the dashboard. A background refresh keeps the
    // current cards on screen and swaps the numbers underneath them.
    if (initial) setIsLoading(true);
    setError("");
    try {
      const api = createLabApiClient();
      const rows = await api.listLabTestOrders();
      setOrders(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setOrders([]);
      setError(
        err instanceof Error
          ? err.message
          : t("lab.dashboard.loadFailed", { defaultValue: "Failed to load lab dashboard data." })
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const { refetch } = useAutoRefetch(load, {
    intervalMs: DASHBOARD_POLL_INTERVAL_MS,
    events: DASHBOARD_EVENTS,
  });

  const sections = useMemo(() => buildSections(orders, t), [orders, t]);

  return {
    orders,
    sections,
    isLoading,
    error,
    refetch,
  };
}
