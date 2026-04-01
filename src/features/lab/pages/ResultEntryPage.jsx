import React, { useEffect, useMemo, useState } from "react";
import { createLabApiClient } from "../api/client";
import { TEST_ORDER_STATUS_LABELS, TEST_ORDER_STATUS_TONES } from "../../../types/labStatus";
import { LAB_RESULT_STATUS_OPTIONS } from "../../../types/labResultEntry";

const toneClass = {
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

const ELIGIBLE_ORDER_STATUSES = new Set([
  "intake_approved",
  "testing_in_progress",
  "result_entered",
]);
const DEFAULT_TEST_CODE = "shed_panel_v1";
const DEFAULT_METHOD = "PCR";

const createTemplateRow = (item) => ({
  orderedTestKey: item.orderedTestKey,
  geneName: item.geneName,
  sourceOrderedName: item.sourceOrderedName,
  resultStatus: "",
  notes: "",
});

const StatusBadge = ({ status }) => {
  const label = TEST_ORDER_STATUS_LABELS[status] || status;
  const tone = TEST_ORDER_STATUS_TONES[status] || "neutral";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

export default function ResultEntryPage() {
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState("");

  const [orderId, setOrderId] = useState("");
  const [testCode, setTestCode] = useState(DEFAULT_TEST_CODE);
  const [method, setMethod] = useState(DEFAULT_METHOD);
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");

  const [templateRows, setTemplateRows] = useState([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState("");

  const [submitLoading, setSubmitLoading] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadOrders = async () => {
      setLoadingOrders(true);
      setOrdersError("");
      try {
        const api = createLabApiClient();
        const rows = await api.listLabTestOrders();
        const filtered = (Array.isArray(rows) ? rows : []).filter((row) => ELIGIBLE_ORDER_STATUSES.has(row.status));
        if (!mounted) return;
        setOrders(filtered);
      } catch (error) {
        if (!mounted) return;
        setOrders([]);
        setOrdersError(error instanceof Error ? error.message : "Failed to load orders.");
      } finally {
        if (mounted) setLoadingOrders(false);
      }
    };

    loadOrders();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const normalizedOrderId = String(orderId || "").trim();

    if (!normalizedOrderId) {
      setTemplateRows([]);
      setTemplateError("");
      setLoadingTemplate(false);
      setTestCode(DEFAULT_TEST_CODE);
      setMethod(DEFAULT_METHOD);
      setSummary("");
      setNotes("");
      return () => {
        mounted = false;
      };
    }

    const loadTemplate = async () => {
      setLoadingTemplate(true);
      setTemplateError("");
      try {
        const api = createLabApiClient();
        const template = await api.getLabResultEntryTemplate(normalizedOrderId);
        if (!mounted) return;
        const savedItems = new Map(
          (Array.isArray(template?.existingResult?.items) ? template.existingResult.items : [])
            .map((item) => [item.orderedTestKey, item])
        );
        const rows = Array.isArray(template?.items)
          ? template.items.map((item) => {
              const saved = savedItems.get(item.orderedTestKey);
              return {
                ...createTemplateRow(item),
                resultStatus: String(saved?.resultStatus || "").trim(),
                notes: String(saved?.notes || "").trim(),
              };
            })
          : [];
        setTemplateRows(rows);
        setTestCode(String(template?.existingResult?.testCode || DEFAULT_TEST_CODE).trim() || DEFAULT_TEST_CODE);
        setMethod(String(template?.existingResult?.method || DEFAULT_METHOD).trim() || DEFAULT_METHOD);
        setSummary(String(template?.existingResult?.summary || "").trim());
        setNotes(String(template?.existingResult?.notes || "").trim());
      } catch (error) {
        if (!mounted) return;
        setTemplateRows([]);
        setTemplateError(error instanceof Error ? error.message : "Failed to load ordered tests for this order.");
        setTestCode(DEFAULT_TEST_CODE);
        setMethod(DEFAULT_METHOD);
        setSummary("");
        setNotes("");
      } finally {
        if (mounted) setLoadingTemplate(false);
      }
    };

    loadTemplate();
    return () => {
      mounted = false;
    };
  }, [orderId]);

  const selectedOrder = useMemo(
    () => orders.find((entry) => String(entry.id) === String(orderId)) || null,
    [orders, orderId]
  );

  const updateTemplateRow = (orderedTestKey, patch) => {
    setTemplateRows((prev) => prev.map((row) => (
      row.orderedTestKey === orderedTestKey ? { ...row, ...patch } : row
    )));
  };

  const runSave = async (mode) => {
    setSubmitError("");
    setSubmitSuccess("");

    const normalizedOrderId = String(orderId || "").trim();
    if (!normalizedOrderId) {
      setSubmitError("Select a test order first.");
      return;
    }

    const selectedItems = templateRows
      .filter((row) => String(row.resultStatus || "").trim())
      .map((row) => ({
        orderedTestKey: row.orderedTestKey,
        geneName: row.geneName,
        resultStatus: row.resultStatus,
        notes: String(row.notes || "").trim() || undefined,
      }));

    if (!templateRows.length) {
      setSubmitError("No ordered tests were found for this order.");
      return;
    }

    if (mode === "draft" && !selectedItems.length) {
      setSubmitError("Set at least one ordered gene status before saving a draft.");
      return;
    }

    if (mode === "submit" && selectedItems.length !== templateRows.length) {
      setSubmitError("Set a result status for every ordered gene before submitting.");
      return;
    }

    const payload = {
      orderId: normalizedOrderId,
      testCode: String(testCode || "").trim(),
      method: String(method || "").trim() || undefined,
      items: selectedItems,
      summary: String(summary || "").trim() || undefined,
      notes: String(notes || "").trim() || undefined,
    };

    if (!payload.testCode) {
      setSubmitError("Test code is required.");
      return;
    }

    setSubmitLoading(mode);
    try {
      const api = createLabApiClient();
      const response = mode === "draft"
        ? await api.saveLabResultDraft(payload)
        : await api.submitLabResult(payload);

      const createdResultId = response?.result?.id || "(unknown)";
      const nextOrderStatus = response?.order?.status || "(unknown)";
      setSubmitSuccess(
        mode === "draft"
          ? `Draft saved. Result ID: ${createdResultId}. Order status: ${nextOrderStatus}.`
          : `Result submitted. Result ID: ${createdResultId}. Order status: ${nextOrderStatus}.`
      );

      if (response?.order?.id) {
        setOrders((prev) => {
          if (mode === "submit") {
            return prev.filter((entry) => String(entry.id) !== normalizedOrderId);
          }
          return prev.map((entry) => (
            String(entry.id) === normalizedOrderId ? response.order : entry
          ));
        });
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lab:test-order-updated", {
          detail: {
            orderId: normalizedOrderId,
            status: response?.order?.status,
            resultId: response?.result?.id,
            mode,
          },
        }));
      }

      if (mode === "submit") {
        setOrderId("");
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Result save failed.");
    } finally {
      setSubmitLoading("");
    }
  };

  const openOrderDetails = () => {
    if (!orderId || typeof window === "undefined") return;
    window.location.hash = `/lab/orders/${encodeURIComponent(orderId)}`;
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-neutral-900">Result Entry</h1>
      <p className="text-sm text-neutral-600">
        Ordered genes are auto-loaded from the selected breeder order. Drafts and submitted hosted results are stored on the shared backend and reused when you reopen the order.
      </p>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-neutral-500">Order Selection</div>

        {loadingOrders ? (
          <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">Loading eligible orders...</div>
        ) : null}

        {!loadingOrders && ordersError ? (
          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{ordersError}</div>
        ) : null}

        {!loadingOrders && !ordersError ? (
          <div className="mt-2 grid gap-3 md:grid-cols-[1fr_auto]">
            <select
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              <option value="">Select order for result entry...</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber || order.id} | {order.animalId} | {TEST_ORDER_STATUS_LABELS[order.status] || order.status}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
              onClick={openOrderDetails}
              disabled={!orderId}
            >
              Open Order
            </button>
          </div>
        ) : null}

        {selectedOrder ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-neutral-800">{selectedOrder.orderNumber || selectedOrder.id}</span>
            <StatusBadge status={selectedOrder.status} />
            <span className="text-xs text-neutral-600">Requested: {(selectedOrder.requestedTests || []).join(", ") || "-"}</span>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Test Code</span>
            <input
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={testCode}
              onChange={(event) => setTestCode(event.target.value)}
              placeholder="shed_panel_v1"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Method</span>
            <input
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              placeholder="PCR"
            />
          </label>
        </div>

        <div className="mt-4">
          <h2 className="text-sm font-semibold text-neutral-900">Ordered Genes & Result Status</h2>

          {loadingTemplate ? (
            <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
              Loading ordered genes for this test order...
            </div>
          ) : null}

          {!loadingTemplate && templateError ? (
            <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{templateError}</div>
          ) : null}

          {!loadingTemplate && !templateError && orderId && !templateRows.length ? (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              This order has no requested tests to prefill.
            </div>
          ) : null}

          {!loadingTemplate && !templateError && templateRows.length ? (
            <div className="mt-2 space-y-2">
              {templateRows.map((row) => (
                <div key={row.orderedTestKey} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="grid gap-2 md:grid-cols-[1.3fr_1fr]">
                    <div>
                      <div className="text-sm font-medium text-neutral-900">{row.geneName}</div>
                      {row.sourceOrderedName && row.sourceOrderedName !== row.geneName ? (
                        <div className="text-xs text-neutral-500">Ordered as: {row.sourceOrderedName}</div>
                      ) : null}
                    </div>
                    <select
                      className="rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                      value={row.resultStatus}
                      onChange={(event) => updateTemplateRow(row.orderedTestKey, { resultStatus: event.target.value })}
                    >
                      <option value="">Select status...</option>
                      {LAB_RESULT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-2">
                    <input
                      className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                      placeholder="Per-gene notes (optional)"
                      value={row.notes}
                      onChange={(event) => updateTemplateRow(row.orderedTestKey, { notes: event.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Result Summary</span>
            <textarea
              className="min-h-[90px] w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Short technical summary for this result set"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Internal Lab Notes</span>
            <textarea
              className="min-h-[90px] w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Internal-only comments for QA/review handoff"
            />
          </label>
        </div>

        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          Save Draft keeps the hosted result in progress. Submit Result stores the final findings and moves the shared order to Completed for breeder visibility.
        </div>

        {submitError ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{submitError}</div>
        ) : null}
        {submitSuccess ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{submitSuccess}</div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm"
            disabled={Boolean(submitLoading) || loadingTemplate || Boolean(templateError)}
            onClick={() => runSave("draft")}
          >
            {submitLoading === "draft" ? "Saving..." : "Save Draft"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={Boolean(submitLoading) || loadingTemplate || Boolean(templateError)}
            onClick={() => runSave("submit")}
          >
            {submitLoading === "submit" ? "Submitting..." : "Submit Result"}
          </button>
        </div>
      </section>
    </section>
  );
}
