import React, { useCallback, useMemo, useState } from "react";
import { createLabApiClient } from "../api/client";
import { useAutoRefetch } from "../hooks/useAutoRefetch";
import {
  ORDER_PAYMENT_STATUSES,
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_PAYMENT_STATUS_TONES,
} from "../../../types/labStatus";
import {
  ORDER_STATUS_LIST,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
} from "../constants/orderStatuses";

const toneClass = {
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

const columnBg = {
  submitted: "bg-sky-50",
  received: "bg-amber-50",
  in_progress: "bg-violet-50",
  completed: "bg-emerald-50",
  cancelled: "bg-neutral-100",
};

const columnHeader = {
  submitted: "border-sky-200 text-sky-800",
  received: "border-amber-200 text-amber-800",
  in_progress: "border-violet-200 text-violet-800",
  completed: "border-emerald-200 text-emerald-800",
  cancelled: "border-neutral-200 text-neutral-600",
};

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString();
};

const toRecentTs = (row) => {
  const parsed = new Date(row?.submittedAt || row?.createdAt || row?.updatedAt || "");
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const PaymentBadge = ({ status }) => {
  const tone = ORDER_PAYMENT_STATUS_TONES[status] || "neutral";
  const label = ORDER_PAYMENT_STATUS_LABELS[status] || status;
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

// Kanban columns in display order — cancelled is at the end and collapsed by default
const KANBAN_COLUMNS = ["submitted", "received", "in_progress", "completed", "cancelled"];

function KanbanCard({ entry, onOpen }) {
  const order = entry.order;
  const paymentValue = order.paymentStatus || "pending";
  const tests = Array.isArray(order.requestedTests) ? order.requestedTests : [];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-neutral-900 leading-tight truncate">
          {order.orderNumber || order.id}
        </div>
        <PaymentBadge status={paymentValue} />
      </div>
      {order.animalId ? (
        <div className="text-xs text-neutral-500 font-mono truncate">{order.animalId}</div>
      ) : null}
      {tests.length ? (
        <div className="text-xs text-neutral-600 truncate" title={tests.join(", ")}>
          {tests.join(", ")}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-xs text-neutral-400">{formatDate(order.submittedAt || order.createdAt)}</span>
        <button
          type="button"
          className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs hover:border-neutral-500"
          onClick={() => onOpen(order.id)}
        >
          Open →
        </button>
      </div>
    </div>
  );
}

function KanbanColumn({ status, entries, onOpen }) {
  const label = ORDER_STATUS_LABELS[status] || status;
  const bg = columnBg[status] || "bg-neutral-50";
  const header = columnHeader[status] || "border-neutral-200 text-neutral-700";
  const tone = ORDER_STATUS_TONES[status] || "neutral";

  return (
    <div className={`rounded-2xl border ${toneClass[tone] ? "" : ""} flex flex-col min-w-0`}>
      <div className={`rounded-t-2xl border-b px-3 py-2 ${bg} ${header}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
          <span className="text-xs font-semibold tabular-nums">{entries.length}</span>
        </div>
      </div>
      <div className={`flex-1 space-y-2 overflow-y-auto p-2 ${bg} rounded-b-2xl`} style={{ maxHeight: "70vh" }}>
        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400">
            No orders
          </div>
        ) : (
          entries.map((entry) => (
            <KanbanCard key={entry.order.id} entry={entry} onOpen={onOpen} />
          ))
        )}
      </div>
    </div>
  );
}

export default function IncomingOrdersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [showCancelled, setShowCancelled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const api = createLabApiClient();
      const orders = await api.listLabTestOrders();

      const orderList = (Array.isArray(orders) ? orders : []).slice().sort((a, b) => toRecentTs(b) - toRecentTs(a));

      const sampleLookupEntries = await Promise.all(
        orderList.map(async (order) => {
          const sampleId = Array.isArray(order.sampleIds) && order.sampleIds.length ? String(order.sampleIds[0]).trim() : "";
          if (!sampleId) return [order.id, null];
          try {
            const resolved = await api.resolveLabSampleBySampleId(sampleId);
            return [order.id, resolved];
          } catch {
            return [order.id, null];
          }
        })
      );

      const sampleByOrderId = new Map(sampleLookupEntries);

      const hydrated = orderList.map((order) => {
        const resolved = sampleByOrderId.get(order.id);
        return {
          order,
          qrToken: resolved?.sample?.qrToken || "",
          primarySampleId: resolved?.sample?.id || (Array.isArray(order.sampleIds) ? order.sampleIds[0] : ""),
        };
      });

      setRows(hydrated);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load shed test orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefetch(load, {
    intervalMs: 20_000,
    events: ["lab:test-order-created", "lab:test-order-updated"],
  });

  const filteredRows = useMemo(() => {
    const needle = String(search || "").trim().toLowerCase();
    return rows.filter((row) => {
      const order = row.order;
      const snakeName = String(order.animalId || "").toLowerCase();
      const breederName = String(order.breederUserId || order.requestedByUserId || "").toLowerCase();
      const orderIdMatch = String(order.id || "").toLowerCase().includes(needle)
        || String(order.orderNumber || "").toLowerCase().includes(needle);
      const snakeMatch = snakeName.includes(needle);
      const breederMatch = breederName.includes(needle);
      const paymentValue = order.paymentStatus || "pending";
      const paymentMatch = paymentFilter === "all" || paymentValue === paymentFilter;
      const textMatch = !needle || orderIdMatch || snakeMatch || breederMatch;

      return paymentMatch && textMatch;
    });
  }, [rows, search, paymentFilter]);

  const columnEntries = useMemo(() => {
    const map = {};
    for (const status of KANBAN_COLUMNS) {
      map[status] = filteredRows.filter((r) => r.order.status === status);
    }
    return map;
  }, [filteredRows]);

  const visibleColumns = showCancelled ? KANBAN_COLUMNS : KANBAN_COLUMNS.filter((s) => s !== "cancelled");

  const openDetails = (orderId) => {
    if (typeof window === "undefined") return;
    const normalized = String(orderId || "").trim();
    if (!normalized) return;
    window.location.hash = `/lab/orders/${encodeURIComponent(normalized)}`;
  };

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900">All Shed Test Orders</h1>
        <p className="mt-1 text-sm text-neutral-600">Manage shed testing orders grouped by workflow status.</p>
      </header>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Search</span>
            <input
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Order number, snake, breeder"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Payment Status</span>
            <select
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value)}
            >
              <option value="all">All payment statuses</option>
              {ORDER_PAYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>{ORDER_PAYMENT_STATUS_LABELS[status] || status}</option>
              ))}
            </select>
          </label>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Showing</div>
            <div className="font-semibold text-neutral-900">{filteredRows.length} / {rows.length} orders</div>
          </div>

          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300"
                checked={showCancelled}
                onChange={(e) => setShowCancelled(e.target.checked)}
              />
              Show cancelled
            </label>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">Loading shed test orders...</div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {!loading && !error ? (
        <div className={`grid gap-3 ${visibleColumns.length <= 4 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5"}`}>
          {visibleColumns.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              entries={columnEntries[status] || []}
              onOpen={openDetails}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
