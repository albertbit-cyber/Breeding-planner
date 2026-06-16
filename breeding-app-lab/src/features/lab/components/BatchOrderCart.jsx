import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBatchOrder } from "../contexts/BatchOrderContext";
import { createLabApiClient } from "../api/client";
import { useSharedBackend } from "../../../contexts/SharedBackendContext.jsx";

const formatPrice = (amount, currency = "EUR") => {
  try {
    return new Intl.NumberFormat("nl-BE", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
};

const base64ToBlob = (base64, mimeType) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || "application/pdf" });
};

export default function BatchOrderCart() {
  const { t } = useTranslation();
  const { cartItems, removeFromCart, clearCart } = useBatchOrder();
  const { sharedFeaturesEnabled, snapshot, retry } = useSharedBackend();

  const [isExpanded, setIsExpanded] = useState(false);
  const [priceBreakdown, setPriceBreakdown] = useState(null);
  const [isPricingLoading, setIsPricingLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdOrder, setCreatedOrder] = useState(null);
  const [labelError, setLabelError] = useState("");
  const priceDebounceRef = useRef(null);

  // Collapse when cart empties (unless showing success)
  useEffect(() => {
    if (!cartItems.length && !createdOrder) setIsExpanded(false);
  }, [cartItems.length, createdOrder]);

  // Live price preview, debounced
  useEffect(() => {
    if (!cartItems.length || !sharedFeaturesEnabled) {
      setPriceBreakdown(null);
      return;
    }
    if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
    priceDebounceRef.current = setTimeout(() => {
      setIsPricingLoading(true);
      const api = createLabApiClient();
      api
        .calculateLabOrderPrice({
          animals: cartItems.map((item) => ({
            animalId: item.snakeId,
            selectedTestIds: item.selectedTestIds,
          })),
        })
        .then((breakdown) => setPriceBreakdown(breakdown))
        .catch(() => setPriceBreakdown(null))
        .finally(() => setIsPricingLoading(false));
    }, 400);
    return () => {
      if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
    };
  }, [cartItems, sharedFeaturesEnabled]);

  const handleSubmit = useCallback(async () => {
    setSubmitError("");
    setLabelError("");
    setCreatedOrder(null);
    setIsSubmitting(true);
    try {
      const api = createLabApiClient();
      const result = await api.createBatchOrder(cartItems);
      setCreatedOrder(result.order);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("lab:test-order-created", { detail: { orderId: result.order?.id } })
        );
      }

      // Auto-download label PDF with all QR codes
      if (result.order?.id) {
        try {
          const artifacts = await api.getBreederAllLabelsArtifact(result.order.id);
          const pdf = artifacts?.labelsPdf;
          if (pdf?.base64) {
            const blob = base64ToBlob(pdf.base64, pdf.mimeType || "application/pdf");
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download =
              pdf.fileName ||
              `batch-order-labels-${result.order.orderNumber || result.order.id}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 30_000);
          }
        } catch (labelErr) {
          setLabelError(labelErr instanceof Error ? labelErr.message : "Label download failed.");
        }
      }

      clearCart();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit batch order.");
    } finally {
      setIsSubmitting(false);
    }
  }, [cartItems, clearCart]);

  // Nothing to show and no success banner
  if (!cartItems.length && !createdOrder) return null;

  // ── Success banner ──────────────────────────────────────────────────────────
  if (createdOrder) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-emerald-800">
              {t("lab.batch.createdTitle", { defaultValue: "Batch Order Submitted" })}
            </div>
            <div className="mt-1 text-sm text-emerald-700">
              {t("lab.batch.createdBody", {
                defaultValue:
                  "Order {{number}} created. Your label PDF with all QR codes is downloading now.",
                number: createdOrder.orderNumber || createdOrder.id,
              })}
            </div>
            {labelError ? (
              <div className="mt-1 text-xs text-rose-700">{labelError}</div>
            ) : null}
          </div>
          <button
            type="button"
            className="text-lg leading-none text-emerald-600 hover:text-emerald-800"
            onClick={() => setCreatedOrder(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  // ── Collapsed pill ──────────────────────────────────────────────────────────
  if (!isExpanded) {
    return (
      <button
        type="button"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-2xl border border-neutral-300 bg-white px-4 py-2.5 shadow-xl text-sm font-medium text-neutral-800 hover:bg-neutral-50"
        onClick={() => setIsExpanded(true)}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white">
          {cartItems.length}
        </span>
        {t("lab.batch.cartLabel", { defaultValue: "Batch Order" })}
        {!isPricingLoading && priceBreakdown ? (
          <span className="text-neutral-500">· {formatPrice(priceBreakdown.total)}</span>
        ) : null}
        <span className="text-neutral-500 text-xs">▲</span>
      </button>
    );
  }

  // ── Expanded panel ──────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl border border-neutral-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <div className="text-sm font-semibold text-neutral-800">
          {t("lab.batch.title", { defaultValue: "Batch Order" })}
          {" · "}
          {cartItems.length}{" "}
          {cartItems.length === 1
            ? t("lab.batch.snake", { defaultValue: "snake" })
            : t("lab.batch.snakes", { defaultValue: "snakes" })}
        </div>
        <button
          type="button"
          className="text-lg leading-none text-neutral-400 hover:text-neutral-700"
          onClick={() => setIsExpanded(false)}
          aria-label="Collapse"
        >
          ×
        </button>
      </div>

      {/* Snake list */}
      <div className="max-h-60 divide-y divide-neutral-100 overflow-y-auto">
        {cartItems.map((item) => (
          <div key={item.snakeId} className="flex items-start justify-between gap-2 px-4 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-neutral-800">{item.snakeName}</div>
              <div className="truncate font-mono text-[10px] text-neutral-400">{item.snakeId}</div>
              <div className="mt-0.5 text-[11px] text-neutral-600">
                {item.selectedTestIds.length}{" "}
                {item.selectedTestIds.length === 1
                  ? t("lab.batch.test", { defaultValue: "test" })
                  : t("lab.batch.tests", { defaultValue: "tests" })}
              </div>
            </div>
            <button
              type="button"
              className="mt-0.5 shrink-0 text-[11px] text-rose-600 hover:text-rose-800"
              onClick={() => removeFromCart(item.snakeId)}
            >
              {t("common.remove", { defaultValue: "Remove" })}
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="space-y-2 border-t border-neutral-100 px-4 py-3">
        {/* Price */}
        {isPricingLoading ? (
          <div className="text-xs text-neutral-500">
            {t("common.loading", { defaultValue: "Calculating price…" })}
          </div>
        ) : priceBreakdown ? (
          <div className="flex justify-between text-sm font-semibold text-neutral-800">
            <span>{t("lab.orders.priceTotal", { defaultValue: "Total" })}</span>
            <span>{formatPrice(priceBreakdown.total)}</span>
          </div>
        ) : null}

        {/* Backend unavailable warning */}
        {!sharedFeaturesEnabled ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <div className="font-semibold">
              {t("lab.sharedBackend.requiredTitle", { defaultValue: "Shared backend required" })}
            </div>
            <div className="mt-0.5 text-[11px]">
              {snapshot?.message || t("lab.sharedBackend.required", { defaultValue: "Connect the backend to submit orders." })}
            </div>
            <button
              type="button"
              className="mt-1 text-[11px] underline"
              onClick={retry}
            >
              {t("common.retry", { defaultValue: "Retry" })}
            </button>
          </div>
        ) : null}

        {/* Submit error */}
        {submitError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {submitError}
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            onClick={clearCart}
            disabled={isSubmitting}
          >
            {t("lab.batch.clearCart", { defaultValue: "Clear All" })}
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleSubmit}
            disabled={isSubmitting || !cartItems.length || !sharedFeaturesEnabled}
          >
            {isSubmitting
              ? t("lab.batch.submitting", { defaultValue: "Submitting…" })
              : t("lab.batch.submit", { defaultValue: "Submit Order" })}
          </button>
        </div>
      </div>
    </div>
  );
}
