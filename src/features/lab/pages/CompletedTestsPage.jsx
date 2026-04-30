import React, { useEffect, useMemo, useState } from "react";
import { createLabApiClient } from "../api/client";
import { ORDER_STATUS_LABELS } from "../constants/orderStatuses";

const COMPLETED = new Set(["completed"]);

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
};

export default function CompletedTestsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const api = createLabApiClient();
        const orders = await api.listLabTestOrders();
        const completed = (Array.isArray(orders) ? orders : [])
          .filter((order) => COMPLETED.has(order.status))
          .sort((a, b) => {
            const left = new Date(a.updatedAt || a.createdAt || "").getTime() || 0;
            const right = new Date(b.updatedAt || b.createdAt || "").getTime() || 0;
            return right - left;
          });

        const withOutcome = await Promise.all(
          completed.map(async (order) => {
            try {
              const outcome = await api.getLabOrderOutcome(order.id);
              return { order, outcome };
            } catch {
              return { order, outcome: null };
            }
          })
        );

        if (!mounted) return;
        setRows(withOutcome);
      } catch (err) {
        if (!mounted) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load completed tests.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(({ order, outcome }) => {
      const orderText = `${order.id} ${order.orderNumber || ""} ${order.animalId || ""}`.toLowerCase();
      const certText = String(outcome?.certificate?.certificateNumber || "").toLowerCase();
      return orderText.includes(needle) || certText.includes(needle);
    });
  }, [rows, query]);

  const openOrder = (orderId) => {
    if (typeof window === "undefined") return;
    window.location.hash = `/lab/orders/${encodeURIComponent(String(orderId || "").trim())}`;
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-neutral-900">Completed Tests</h1>
      <p className="text-sm text-neutral-600">Archive of completed and certificate-issued shed test orders for follow-up and audit.</p>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Search Completed Orders</span>
          <input
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Order number, snake ID, certificate number"
          />
        </label>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">Loading completed tests...</div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {!loading && !error && !filtered.length ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
          No completed orders found.
        </div>
      ) : null}

      {!loading && !error && filtered.length ? (
        <div className="overflow-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Order</th>
                <th className="px-3 py-2 text-left font-semibold">Snake</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Submitted</th>
                <th className="px-3 py-2 text-left font-semibold">Result Summary</th>
                <th className="px-3 py-2 text-left font-semibold">Certificate</th>
                <th className="px-3 py-2 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ order, outcome }) => (
                <tr key={order.id} className="border-t border-neutral-100 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-neutral-800">{order.orderNumber || order.id}</div>
                  </td>
                  <td className="px-3 py-2 text-neutral-700">{order.animalId || "-"}</td>
                  <td className="px-3 py-2 text-neutral-700">{ORDER_STATUS_LABELS[order.status] || order.status}</td>
                  <td className="px-3 py-2 text-neutral-700">{formatDate(order.submittedAt || order.createdAt)}</td>
                  <td className="px-3 py-2 text-neutral-700 max-w-[280px] truncate" title={outcome?.latestResult?.summary || ""}>
                    {outcome?.latestResult?.summary || "No summary"}
                  </td>
                  <td className="px-3 py-2 text-neutral-700">
                    {outcome?.certificate?.certificateNumber
                      ? `${outcome.certificate.certificateNumber} (${outcome.certificate.status})`
                      : "Not issued"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs hover:border-neutral-500"
                      onClick={() => openOrder(order.id)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
