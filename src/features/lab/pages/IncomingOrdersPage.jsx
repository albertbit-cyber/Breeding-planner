import React, { useEffect, useMemo, useState } from "react";
import { createLabApiClient } from "../api/client";
import {
  ORDER_PAYMENT_STATUSES,
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_PAYMENT_STATUS_TONES,
  TEST_ORDER_STATUSES,
  TEST_ORDER_STATUS_LABELS,
  TEST_ORDER_STATUS_TONES,
} from "../../../types/labStatus";

const toneClass = {
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
};

const toRecentTs = (row) => {
  const parsed = new Date(row?.submittedAt || row?.createdAt || row?.updatedAt || "");
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const StatusBadge = ({ status }) => {
  const tone = TEST_ORDER_STATUS_TONES[status] || "neutral";
  const label = TEST_ORDER_STATUS_LABELS[status] || status;
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

const PaymentBadge = ({ status }) => {
  const tone = ORDER_PAYMENT_STATUS_TONES[status] || "neutral";
  const label = ORDER_PAYMENT_STATUS_LABELS[status] || status;
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

export default function IncomingOrdersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
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

        if (!mounted) return;
        setRows(hydrated);
      } catch (err) {
        if (!mounted) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load shed test orders.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

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
      const statusMatch = statusFilter === "all" || order.status === statusFilter;
      const paymentValue = order.paymentStatus || "pending";
      const paymentMatch = paymentFilter === "all" || paymentValue === paymentFilter;
      const textMatch = !needle || orderIdMatch || snakeMatch || breederMatch;

      return statusMatch && paymentMatch && textMatch;
    });
  }, [rows, search, statusFilter, paymentFilter]);

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
        <p className="mt-1 text-sm text-neutral-600">Search and manage shed testing orders with breeder, snake, payment, workflow, and QR-linked sample context.</p>
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
            <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Workflow Status</span>
            <select
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {TEST_ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>{TEST_ORDER_STATUS_LABELS[status] || status}</option>
              ))}
            </select>
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
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">Loading shed test orders...</div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {!loading && !error && !filteredRows.length ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
          No shed test orders match the current filters.
        </div>
      ) : null}

      {!loading && !error && filteredRows.length ? (
        <div className="overflow-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-[1700px] w-full text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Order</th>
                <th className="px-3 py-2 text-left font-semibold">Order Date</th>
                <th className="px-3 py-2 text-left font-semibold">Breeder</th>
                <th className="px-3 py-2 text-left font-semibold">Breeder Contact</th>
                <th className="px-3 py-2 text-left font-semibold">Snake ID</th>
                <th className="px-3 py-2 text-left font-semibold">Snake Name</th>
                <th className="px-3 py-2 text-left font-semibold">Current Genetics</th>
                <th className="px-3 py-2 text-left font-semibold">Requested Tests</th>
                <th className="px-3 py-2 text-left font-semibold">Payment</th>
                <th className="px-3 py-2 text-left font-semibold">Workflow</th>
                <th className="px-3 py-2 text-left font-semibold">Sample ID</th>
                <th className="px-3 py-2 text-left font-semibold">QR Token</th>
                <th className="px-3 py-2 text-left font-semibold">Certificate</th>
                <th className="px-3 py-2 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((entry) => {
                const order = entry.order;
                const paymentValue = order.paymentStatus || "pending";
                const breederName = order.breederUserId || order.requestedByUserId || "-";
                const breederContact = order.requestedByUserId || order.breederUserId || "-";
                const qrText = entry.qrToken ? `${entry.qrToken.slice(0, 10)}...${entry.qrToken.slice(-6)}` : "Generated (hidden)";
                const certificateText = order.certificateId
                  ? `Linked (${order.certificateId})`
                  : order.status === "certificate_issued"
                    ? "Issued"
                    : "Pending";

                return (
                  <tr key={order.id} className="border-t border-neutral-100 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium text-neutral-800">{order.orderNumber || order.id}</div>
                    </td>
                    <td className="px-3 py-2 text-neutral-700">{formatDate(order.submittedAt || order.createdAt)}</td>
                    <td className="px-3 py-2 text-neutral-700">{breederName}</td>
                    <td className="px-3 py-2 text-neutral-700">{breederContact}</td>
                    <td className="px-3 py-2 text-neutral-700 font-mono text-xs">{order.animalId || "-"}</td>
                    <td className="px-3 py-2 text-neutral-700">-</td>
                    <td className="px-3 py-2 text-neutral-700">-</td>
                    <td className="px-3 py-2 text-neutral-700 max-w-[220px] truncate" title={(order.requestedTests || []).join(", ")}>
                      {(order.requestedTests || []).join(", ") || "-"}
                    </td>
                    <td className="px-3 py-2"><PaymentBadge status={paymentValue} /></td>
                    <td className="px-3 py-2"><StatusBadge status={order.status} /></td>
                    <td className="px-3 py-2 font-mono text-xs text-neutral-700">{entry.primarySampleId || "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-neutral-700" title={entry.qrToken || "QR token is stored with sample record."}>{qrText}</td>
                    <td className="px-3 py-2 text-neutral-700">{certificateText}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs hover:border-neutral-500"
                        onClick={() => openDetails(order.id)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
