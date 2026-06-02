import React, { useEffect, useMemo, useState } from "react";
import { createLabApiClient } from "../api/client";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from "../constants/orderStatuses";
import { LAB_RESULT_STATUS_OPTIONS } from "../../../types/labResultEntry";
import { buildLabTestNumber } from "../../../services/lab/testNumber";

const toneClass = {
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

const ELIGIBLE_ORDER_STATUSES = new Set(["received", "in_progress"]);
const DEFAULT_METHOD = "PCR";

const createDefaultTestNumber = (orderId = "") => buildLabTestNumber(orderId || "lab-result");

const StatusBadge = ({ status }) => {
  const label = ORDER_STATUS_LABELS[status] || status;
  const tone = ORDER_STATUS_TONES[status] || "neutral";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

// Initialize per-animal row state from a template animal group
const initAnimalRows = (animalGroup) => {
  const savedItems = new Map(
    (Array.isArray(animalGroup?.existingResult?.items) ? animalGroup.existingResult.items : []).map(
      (item) => [item.orderedTestKey, item]
    )
  );
  return (animalGroup?.items || []).map((item) => {
    const saved = savedItems.get(item.orderedTestKey);
    return {
      orderedTestKey: item.orderedTestKey,
      geneName: item.geneName,
      sourceOrderedName: item.sourceOrderedName,
      resultStatus: String(saved?.resultStatus || "").trim(),
      notes: String(saved?.notes || "").trim(),
    };
  });
};

export default function ResultEntryPage() {
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState("");

  const [orderId, setOrderId] = useState("");
  const [testCode, setTestCode] = useState("");
  const [method, setMethod] = useState(DEFAULT_METHOD);
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");

  // Per-animal rows: Map<animalId, row[]>
  const [animalGroups, setAnimalGroups] = useState([]); // [{ animalId, animalName, rows }]
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState("");

  const [submitLoading, setSubmitLoading] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  // Load eligible orders
  useEffect(() => {
    let mounted = true;
    setLoadingOrders(true);
    setOrdersError("");

    const api = createLabApiClient();
    api.listLabTestOrders()
      .then((rows) => {
        if (!mounted) return;
        setOrders(
          (Array.isArray(rows) ? rows : []).filter((row) => ELIGIBLE_ORDER_STATUSES.has(row.status))
        );
      })
      .catch((err) => {
        if (!mounted) return;
        setOrders([]);
        setOrdersError(err instanceof Error ? err.message : "Failed to load orders.");
      })
      .finally(() => { if (mounted) setLoadingOrders(false); });

    return () => { mounted = false; };
  }, []);

  // Load template whenever orderId changes
  useEffect(() => {
    const normalized = String(orderId || "").trim();
    if (!normalized) {
      setAnimalGroups([]);
      setTemplateError("");
      setLoadingTemplate(false);
      setTestCode("");
      setMethod(DEFAULT_METHOD);
      setSummary("");
      setNotes("");
      return;
    }

    let mounted = true;
    setLoadingTemplate(true);
    setTemplateError("");

    const api = createLabApiClient();
    api.getLabResultEntryTemplate(normalized)
      .then((template) => {
        if (!mounted) return;

        // Use per-animal groups if available, otherwise wrap the flat list
        const groups = Array.isArray(template?.animals) && template.animals.length
          ? template.animals.map((group) => ({
              animalId: group.animalId,
              animalName: group.animalName || group.animalId,
              existingResultMeta: group.existingResult,
              rows: initAnimalRows(group),
            }))
          : [{
              animalId: "primary",
              animalName: "Animal",
              existingResultMeta: template?.existingResult,
              rows: initAnimalRows({ items: template?.items, existingResult: template?.existingResult }),
            }];

        setAnimalGroups(groups);

        // Use test code/method from the first animal's existing result
        const firstExisting = template?.animals?.[0]?.existingResult || template?.existingResult;
        setTestCode(
          String(firstExisting?.testCode || createDefaultTestNumber(normalized)).trim() ||
            createDefaultTestNumber(normalized)
        );
        setMethod(String(firstExisting?.method || DEFAULT_METHOD).trim() || DEFAULT_METHOD);
        setSummary(String(firstExisting?.summary || "").trim());
        setNotes(String(firstExisting?.notes || "").trim());
      })
      .catch((err) => {
        if (!mounted) return;
        setAnimalGroups([]);
        setTemplateError(err instanceof Error ? err.message : "Failed to load ordered tests.");
        setTestCode(createDefaultTestNumber(normalized));
        setMethod(DEFAULT_METHOD);
        setSummary("");
        setNotes("");
      })
      .finally(() => { if (mounted) setLoadingTemplate(false); });

    return () => { mounted = false; };
  }, [orderId]);

  const selectedOrder = useMemo(
    () => orders.find((entry) => String(entry.id) === String(orderId)) || null,
    [orders, orderId]
  );

  const totalRows = animalGroups.reduce((sum, g) => sum + g.rows.length, 0);
  const filledRows = animalGroups.reduce(
    (sum, g) => sum + g.rows.filter((r) => String(r.resultStatus || "").trim()).length,
    0
  );

  const updateRow = (animalId, orderedTestKey, patch) => {
    setAnimalGroups((prev) =>
      prev.map((group) =>
        group.animalId === animalId
          ? {
              ...group,
              rows: group.rows.map((row) =>
                row.orderedTestKey === orderedTestKey ? { ...row, ...patch } : row
              ),
            }
          : group
      )
    );
  };

  const runSave = async (mode) => {
    setSubmitError("");
    setSubmitSuccess("");

    const normalized = String(orderId || "").trim();
    if (!normalized) { setSubmitError("Select a test order first."); return; }
    if (!totalRows) { setSubmitError("No ordered tests were found for this order."); return; }

    if (mode === "draft" && filledRows === 0) {
      setSubmitError("Set at least one ordered gene status before saving a draft.");
      return;
    }
    if (mode === "submit" && filledRows !== totalRows) {
      setSubmitError("Set a result status for every ordered gene across all animals before submitting.");
      return;
    }

    // Build animalResults array
    const animalResults = animalGroups.map((group) => ({
      animalId: group.animalId === "primary"
        ? (selectedOrder?.animalId || group.animalId)
        : group.animalId,
      items: group.rows
        .filter((row) => String(row.resultStatus || "").trim())
        .map((row) => ({
          orderedTestKey: row.orderedTestKey,
          geneName: row.geneName,
          resultStatus: row.resultStatus,
          notes: String(row.notes || "").trim() || undefined,
        })),
    }));

    const payload = {
      orderId: normalized,
      testCode: String(testCode || "").trim() || createDefaultTestNumber(normalized),
      method: String(method || "").trim() || undefined,
      animalResults,
      summary: String(summary || "").trim() || undefined,
      notes: String(notes || "").trim() || undefined,
    };

    setSubmitLoading(mode);
    try {
      const api = createLabApiClient();
      const response = mode === "draft"
        ? await api.saveLabResultDraft(payload)
        : await api.submitLabResult(payload);

      const resultId = response?.result?.id || "(unknown)";
      const nextStatus = response?.order?.status || "(unknown)";
      setSubmitSuccess(
        mode === "draft"
          ? `Draft saved — result ID: ${resultId}. Order status: ${nextStatus}.`
          : `Result submitted. Order is now ${nextStatus}.`
      );

      if (response?.order?.id) {
        setOrders((prev) => {
          if (mode === "submit") return prev.filter((e) => String(e.id) !== normalized);
          return prev.map((e) => (String(e.id) === normalized ? response.order : e));
        });
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("lab:test-order-updated", {
            detail: { orderId: normalized, status: response?.order?.status, resultId, mode },
          })
        );
      }

      if (mode === "submit") setOrderId("");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Result save failed.");
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
        Select an order. For batch orders, each snake is shown as its own section. Fill in every
        gene result per snake, then submit all at once.
      </p>

      {/* ── Order selection ── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Order Selection</div>

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
              onChange={(e) => setOrderId(e.target.value)}
            >
              <option value="">Select order for result entry…</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber || order.id}
                  {Array.isArray(order.animalIds) && order.animalIds.length > 1
                    ? ` · ${order.animalIds.length} snakes`
                    : order.animalId
                    ? ` · ${order.animalId}`
                    : ""}
                  {" · "}
                  {ORDER_STATUS_LABELS[order.status] || order.status}
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
            {Array.isArray(selectedOrder.animalIds) && selectedOrder.animalIds.length > 1 ? (
              <span className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                Batch · {selectedOrder.animalIds.length} snakes
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ── Test number + method ── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Test Number</span>
            <input
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={testCode}
              onChange={(e) => setTestCode(e.target.value)}
              placeholder="260424PH1061"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Method</span>
            <input
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="PCR"
            />
          </label>
        </div>

        {/* Progress indicator */}
        {totalRows > 0 ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
            <div className="h-1.5 flex-1 rounded-full bg-neutral-200">
              <div
                className="h-1.5 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.round((filledRows / totalRows) * 100)}%` }}
              />
            </div>
            <span>{filledRows}/{totalRows} genes filled</span>
          </div>
        ) : null}

        {/* ── Per-animal sections ── */}
        <div className="mt-4 space-y-4">
          {loadingTemplate ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
              Loading ordered genes…
            </div>
          ) : null}
          {!loadingTemplate && templateError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{templateError}</div>
          ) : null}
          {!loadingTemplate && !templateError && orderId && !animalGroups.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              This order has no requested tests to prefill.
            </div>
          ) : null}

          {!loadingTemplate && !templateError && animalGroups.map((group, groupIdx) => (
            <div key={group.animalId} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              {/* Animal header */}
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-bold text-white">
                  {groupIdx + 1}
                </span>
                <div>
                  <div className="text-sm font-semibold text-neutral-800">
                    {group.animalName && group.animalName !== group.animalId
                      ? group.animalName
                      : "Snake"}
                  </div>
                  <div className="font-mono text-[10px] text-neutral-400">{group.animalId !== "primary" ? group.animalId : ""}</div>
                </div>
                <span className="ml-auto text-[11px] text-neutral-500">
                  {group.rows.filter((r) => r.resultStatus).length}/{group.rows.length} filled
                </span>
              </div>

              {/* Gene rows */}
              <div className="space-y-2">
                {group.rows.map((row) => (
                  <div key={row.orderedTestKey} className="rounded-xl border border-neutral-200 bg-white p-3">
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
                        onChange={(e) => updateRow(group.animalId, row.orderedTestKey, { resultStatus: e.target.value })}
                      >
                        <option value="">Select result…</option>
                        {LAB_RESULT_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <input
                      className="mt-2 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                      placeholder="Per-gene notes (optional)"
                      value={row.notes}
                      onChange={(e) => updateRow(group.animalId, row.orderedTestKey, { notes: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Summary + internal notes */}
        <div className="mt-4 grid gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Result Summary</span>
            <textarea
              className="min-h-[80px] w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Short technical summary for this result set"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Internal Lab Notes</span>
            <textarea
              className="min-h-[80px] w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal-only comments for QA/review handoff"
            />
          </label>
        </div>

        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          Save Draft keeps results in progress. Submit Result finalises all snakes and moves the order to Completed — immediately visible to the breeder.
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
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm disabled:opacity-60"
            disabled={Boolean(submitLoading) || loadingTemplate || Boolean(templateError)}
            onClick={() => runSave("draft")}
          >
            {submitLoading === "draft" ? "Saving…" : "Save Draft"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={Boolean(submitLoading) || loadingTemplate || Boolean(templateError)}
            onClick={() => runSave("submit")}
          >
            {submitLoading === "submit" ? "Submitting…" : "Submit Result"}
          </button>
        </div>
      </section>
    </section>
  );
}
