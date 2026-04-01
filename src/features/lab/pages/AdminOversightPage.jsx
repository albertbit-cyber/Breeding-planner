import React, { useEffect, useMemo, useState } from "react";
import { createLabApiClient } from "../api/client";
import {
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_PAYMENT_STATUS_TONES,
  TEST_ORDER_STATUS_LABELS,
  TEST_ORDER_STATUS_TONES,
} from "../../../types/labStatus";

const SHARED_ADMIN_STATUSES = [
  "order_created",
  "sample_received",
  "testing_in_progress",
  "completed",
  "cancelled",
];

const toneClass = {
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
};

const StatusBadge = ({ status }) => {
  const label = TEST_ORDER_STATUS_LABELS[status] || status;
  const tone = TEST_ORDER_STATUS_TONES[status] || "neutral";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

const PaymentBadge = ({ paymentStatus }) => {
  const label = ORDER_PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus;
  const tone = ORDER_PAYMENT_STATUS_TONES[paymentStatus] || "neutral";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

export default function AdminOversightPage() {
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [oversight, setOversight] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reason, setReason] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);

  const selectedOrder = useMemo(
    () => orders.find((entry) => String(entry.id) === String(selectedOrderId)) || null,
    [orders, selectedOrderId]
  );

  const loadOrders = async () => {
    setLoading(true);
    setError("");
    try {
      const api = createLabApiClient();
      const rows = await api.listAdminAllOrders();
      setOrders(Array.isArray(rows) ? rows : []);
      if (!selectedOrderId && Array.isArray(rows) && rows.length) {
        setSelectedOrderId(rows[0].id);
      }
    } catch (err) {
      setOrders([]);
      setError(err instanceof Error ? err.message : "Failed to load admin oversight orders.");
    } finally {
      setLoading(false);
    }
  };

  const loadOversight = async (orderId) => {
    const normalizedOrderId = String(orderId || "").trim();
    if (!normalizedOrderId) {
      setOversight(null);
      return;
    }
    try {
      const api = createLabApiClient();
      const details = await api.getAdminOrderOversight(normalizedOrderId);
      setOversight(details);
    } catch {
      setOversight(null);
    }
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedOrderId) return;
    loadOversight(selectedOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderId]);

  const handleAdminStatusCorrection = async (status) => {
    const orderId = String(selectedOrderId || "").trim();
    if (!orderId) return;
    if (!String(reason || "").trim()) {
      setError("Admin correction reason is required.");
      return;
    }

    setStatusLoading(true);
    setError("");
    try {
      const api = createLabApiClient();
      await api.adminCorrectOrderStatus({
        orderId,
        status,
        reason: String(reason || "").trim(),
      });
      await loadOrders();
      await loadOversight(orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin status correction failed.");
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900">Admin Shed Testing Oversight</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Cross-lab admin controls for order correction, payment exception approval, and audit-grade workflow review.
        </p>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">Loading admin oversight...</div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {!loading ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">All Test Orders</h2>
            <div className="mt-3 overflow-auto rounded-xl border border-neutral-200">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Order</th>
                    <th className="px-3 py-2 text-left font-semibold">Lab</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-3 py-2 text-left font-semibold">Payment</th>
                    <th className="px-3 py-2 text-left font-semibold">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const isActive = String(order.id) === String(selectedOrderId);
                    return (
                      <tr
                        key={order.id}
                        className={`cursor-pointer border-t border-neutral-100 align-top ${isActive ? "bg-sky-50" : ""}`}
                        onClick={() => setSelectedOrderId(order.id)}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium text-neutral-800">{order.orderNumber || order.id}</div>
                        </td>
                        <td className="px-3 py-2 text-neutral-700">{order.labId}</td>
                        <td className="px-3 py-2"><StatusBadge status={order.status} /></td>
                        <td className="px-3 py-2"><PaymentBadge paymentStatus={order.paymentStatus || "pending"} /></td>
                        <td className="px-3 py-2 text-neutral-700">{formatDateTime(order.submittedAt || order.createdAt)}</td>
                      </tr>
                    );
                  })}
                  {!orders.length ? (
                    <tr>
                      <td className="px-3 py-3 text-neutral-600" colSpan={5}>No test orders found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">Admin Controls</h2>
            {selectedOrder ? (
              <div className="mt-3 space-y-3 text-sm text-neutral-700">
                <div>
                  <span className="font-semibold">Selected order:</span> {selectedOrder.orderNumber || selectedOrder.id}
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Correction Reason</span>
                  <textarea
                    className="min-h-20 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Required for admin status corrections"
                  />
                </label>

                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Correct Workflow Status</div>
                  <div className="flex max-h-36 flex-wrap gap-2 overflow-auto pr-1">
                    {SHARED_ADMIN_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={statusLoading}
                        className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs hover:border-neutral-500 disabled:opacity-50"
                        onClick={() => handleAdminStatusCorrection(status)}
                      >
                        {TEST_ORDER_STATUS_LABELS[status] || status}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                  Shared backend admin corrections are limited to the hosted workflow states. Payment exceptions are not persisted by the backend yet.
                </div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-neutral-600">Select an order to use admin controls.</div>
            )}
          </section>
        </div>
      ) : null}

      {!loading && oversight ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-900">Genetics Update History</h3>
            <div className="mt-2 space-y-2 text-xs text-neutral-700">
              {oversight.geneticsChanges.length ? oversight.geneticsChanges.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5">
                  <div className="font-medium">{entry.changeType} ({entry.status})</div>
                  <div>{formatDateTime(entry.changedAt)}</div>
                  <div className="text-neutral-600">{entry.reason || "-"}</div>
                </div>
              )) : <div className="text-neutral-500">No genetics updates for this order.</div>}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-900">Certificate Records</h3>
            <div className="mt-2 space-y-2 text-xs text-neutral-700">
              {oversight.certificates.length ? oversight.certificates.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5">
                  <div className="font-medium">{entry.certificateNumber}</div>
                  <div>Status: {entry.status}</div>
                  <div>Issued: {formatDateTime(entry.issuedAt)}</div>
                  <div className="font-mono text-[11px] text-neutral-500">{entry.id}</div>
                </div>
              )) : <div className="text-neutral-500">No certificates linked to this order.</div>}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-900">Order Audit Trail</h3>
            <div className="mt-2 max-h-72 space-y-2 overflow-auto pr-1 text-xs text-neutral-700">
              {oversight.statusHistory.length ? oversight.statusHistory.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5">
                  <div className="font-medium">{entry.fromStatus || "(start)"} {"->"} {entry.toStatus}</div>
                  <div>{formatDateTime(entry.changedAt)}</div>
                  <div className="text-neutral-600">Reason: {entry.reason || "-"}</div>
                  <div className="text-neutral-500">Actor: {entry.changedByUserId || "system"}</div>
                </div>
              )) : <div className="text-neutral-500">No order history available.</div>}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
