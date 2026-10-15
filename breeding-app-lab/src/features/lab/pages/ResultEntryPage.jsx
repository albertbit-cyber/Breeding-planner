import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createLabApiClient } from "../api/client";
import { ORDER_STATUS_TONES } from "../constants/orderStatuses";
import { orderStatusLabel } from "../constants/statusLabelsI18n";
import ResultSheet, { ELIGIBLE_STATUSES } from "../components/ResultSheet.jsx";

const toneClass = {
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

const StatusBadge = ({ status }) => {
  const { t } = useTranslation();
  const label = orderStatusLabel(t, status);
  const tone = ORDER_STATUS_TONES[status] || "neutral";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

/**
 * Pick an order (or arrive with one from the scan button) and fill in the
 * result sheet. The sheet is the same component the order page embeds.
 */
export default function ResultEntryPage({ presetOrderId, presetAnimalId }) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [orderId, setOrderId] = useState(() => String(presetOrderId || "").trim());
  const [focusAnimalId, setFocusAnimalId] = useState(() => String(presetAnimalId || "").trim());

  useEffect(() => {
    let mounted = true;
    setLoadingOrders(true);
    setOrdersError("");

    const api = createLabApiClient();
    api.listLabTestOrders()
      .then((rows) => {
        if (!mounted) return;
        setOrders((Array.isArray(rows) ? rows : []).filter((row) => ELIGIBLE_STATUSES.has(row.status)));
      })
      .catch((err) => {
        if (!mounted) return;
        setOrders([]);
        setOrdersError(
          err instanceof Error ? err.message : t("lab.results.loadOrdersFailed", { defaultValue: "Failed to load orders." })
        );
      })
      .finally(() => { if (mounted) setLoadingOrders(false); });

    return () => { mounted = false; };
  }, []);

  // Arrived here from the global Scan action, which already knows which order
  // and which snake the tube belongs to.
  useEffect(() => {
    const normalized = String(presetOrderId || "").trim();
    if (normalized) setOrderId(normalized);
    setFocusAnimalId(String(presetAnimalId || "").trim());
  }, [presetOrderId, presetAnimalId]);

  const selectedOrder = useMemo(
    () => orders.find((entry) => String(entry.id) === String(orderId)) || null,
    [orders, orderId]
  );

  const handleSaved = ({ mode, response }) => {
    if (response?.order?.id) {
      setOrders((prev) =>
        mode === "submit"
          ? prev.filter((entry) => String(entry.id) !== String(orderId))
          : prev.map((entry) => (String(entry.id) === String(orderId) ? response.order : entry))
      );
    }
    if (mode === "submit") {
      setOrderId("");
      setFocusAnimalId("");
    }
  };

  const openOrderDetails = () => {
    if (!orderId || typeof window === "undefined") return;
    window.location.hash = `/lab/orders/${encodeURIComponent(orderId)}`;
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-neutral-900">
        {t("lab.shell.nav.resultEntry", { defaultValue: "Result Entry" })}
      </h1>
      <p className="text-sm text-neutral-600">
        {t("lab.results.sheetSubtitle", {
          defaultValue:
            "Scan a tube or pick an order. Each ordered gene gets one answer in the words of its own inheritance; the breeder reads the genotype.",
        })}
      </p>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("lab.results.orderSelection", { defaultValue: "Order Selection" })}
        </div>

        {loadingOrders ? (
          <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
            {t("lab.results.loadingOrders", { defaultValue: "Loading eligible orders..." })}
          </div>
        ) : null}
        {!loadingOrders && ordersError ? (
          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{ordersError}</div>
        ) : null}
        {!loadingOrders && !ordersError ? (
          <div className="mt-2 grid gap-3 md:grid-cols-[1fr_auto]">
            <select
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setFocusAnimalId("");
              }}
            >
              <option value="">{t("lab.results.selectOrder", { defaultValue: "Select order for result entry…" })}</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber || order.id}
                  {Array.isArray(order.animalIds) && order.animalIds.length > 1
                    ? ` · ${t("lab.results.snakeCount", {
                        count: order.animalIds.length,
                        defaultValue_one: "{{count}} snake",
                        defaultValue_other: "{{count}} snakes",
                      })}`
                    : order.animalId
                    ? ` · ${order.animalId}`
                    : ""}
                  {" · "}
                  {orderStatusLabel(t, order.status)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
              onClick={openOrderDetails}
              disabled={!orderId}
            >
              {t("lab.results.openOrder", { defaultValue: "Open Order" })}
            </button>
          </div>
        ) : null}

        {selectedOrder ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-neutral-800"><bdi>{selectedOrder.orderNumber || selectedOrder.id}</bdi></span>
            <StatusBadge status={selectedOrder.status} />
            {Array.isArray(selectedOrder.animalIds) && selectedOrder.animalIds.length > 1 ? (
              <span className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                {t("lab.results.batchSnakes", {
                  count: selectedOrder.animalIds.length,
                  defaultValue_one: "Batch · {{count}} snake",
                  defaultValue_other: "Batch · {{count}} snakes",
                })}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {orderId ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <ResultSheet orderId={orderId} focusAnimalId={focusAnimalId} onSaved={handleSaved} />
        </section>
      ) : null}
    </section>
  );
}
