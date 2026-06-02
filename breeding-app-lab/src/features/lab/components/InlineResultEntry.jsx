import React, { useEffect, useState } from "react";
import { createLabApiClient } from "../api/client";
import { LAB_RESULT_STATUS_OPTIONS } from "../../../types/labResultEntry";
import { buildLabTestNumber } from "../../../services/lab/testNumber";

const DEFAULT_METHOD = "PCR";
const createDefaultTestNumber = (orderId = "") => buildLabTestNumber(orderId || "lab-inline-result");

const ELIGIBLE_STATUSES = new Set(["received", "in_progress"]);

// Build per-animal rows from a template animal group
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

/**
 * Inline result entry form embedded directly in OrderDetailsPage.
 * Supports both single-animal and multi-animal (batch) orders.
 *
 * Props:
 *   orderId   — the order to load the result template for
 *   onSaved   — called after draft or submit succeeds
 */
export default function InlineResultEntry({ orderId, onSaved }) {
  const [testCode, setTestCode] = useState("");
  const [method, setMethod] = useState(DEFAULT_METHOD);
  const [summary, setSummary] = useState("");
  const [labNotes, setLabNotes] = useState("");

  // Per-animal groups: [{ animalId, animalName, rows }]
  const [animalGroups, setAnimalGroups] = useState([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState("");

  const [submitLoading, setSubmitLoading] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  useEffect(() => {
    const normalized = String(orderId || "").trim();
    if (!normalized) return;

    let mounted = true;
    setLoadingTemplate(true);
    setTemplateError("");
    setSubmitError("");
    setSubmitSuccess("");

    const api = createLabApiClient();
    api.getLabResultEntryTemplate(normalized)
      .then((template) => {
        if (!mounted) return;

        const groups = Array.isArray(template?.animals) && template.animals.length
          ? template.animals.map((group) => ({
              animalId: group.animalId,
              animalName: group.animalName || group.animalId,
              rows: initAnimalRows(group),
            }))
          : [{
              animalId: "primary",
              animalName: "Animal",
              rows: initAnimalRows({ items: template?.items, existingResult: template?.existingResult }),
            }];

        setAnimalGroups(groups);

        const firstExisting = template?.animals?.[0]?.existingResult || template?.existingResult;
        setTestCode(
          String(firstExisting?.testCode || createDefaultTestNumber(normalized)).trim() ||
            createDefaultTestNumber(normalized)
        );
        setMethod(String(firstExisting?.method || DEFAULT_METHOD).trim() || DEFAULT_METHOD);
        setSummary(String(firstExisting?.summary || "").trim());
        setLabNotes(String(firstExisting?.notes || "").trim());
      })
      .catch((err) => {
        if (!mounted) return;
        setAnimalGroups([]);
        setTemplateError(err instanceof Error ? err.message : "Failed to load ordered tests.");
      })
      .finally(() => { if (mounted) setLoadingTemplate(false); });

    return () => { mounted = false; };
  }, [orderId]);

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
    if (!totalRows) { setSubmitError("No ordered tests found for this order."); return; }
    if (mode === "draft" && filledRows === 0) {
      setSubmitError("Set at least one gene status before saving a draft.");
      return;
    }
    if (mode === "submit" && filledRows !== totalRows) {
      setSubmitError("Set a result status for every gene across all animals before submitting.");
      return;
    }

    const animalResults = animalGroups.map((group) => ({
      animalId: group.animalId,
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
      notes: String(labNotes || "").trim() || undefined,
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
          ? `Draft saved — result ID: ${resultId}, order status: ${nextStatus}.`
          : `Result submitted — order is now ${nextStatus}.`
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("lab:test-order-updated", {
            detail: { orderId: normalized, status: response?.order?.status, resultId, mode },
          })
        );
      }

      onSaved?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSubmitLoading("");
    }
  };

  if (loadingTemplate) {
    return <div className="text-sm text-neutral-500">Loading ordered genes…</div>;
  }
  if (templateError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {templateError}
      </div>
    );
  }
  if (!animalGroups.length || !totalRows) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        No ordered tests found for this order.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Test code + method */}
      <div className="grid gap-3 sm:grid-cols-2">
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

      {/* Progress bar */}
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <div className="h-1.5 flex-1 rounded-full bg-neutral-200">
          <div
            className="h-1.5 rounded-full bg-emerald-500 transition-all"
            style={{ width: `${totalRows ? Math.round((filledRows / totalRows) * 100) : 0}%` }}
          />
        </div>
        <span>{filledRows}/{totalRows} genes filled</span>
      </div>

      {/* Per-animal sections */}
      {animalGroups.map((group, groupIdx) => (
        <div key={group.animalId} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
          {/* Animal header */}
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-bold text-white">
              {groupIdx + 1}
            </span>
            <div>
              <div className="text-sm font-semibold text-neutral-800">
                {group.animalName && group.animalName !== group.animalId ? group.animalName : "Snake"}
              </div>
              {group.animalId !== "primary" ? (
                <div className="font-mono text-[10px] text-neutral-400">{group.animalId}</div>
              ) : null}
            </div>
            <span className="ml-auto text-[11px] text-neutral-500">
              {group.rows.filter((r) => r.resultStatus).length}/{group.rows.length} filled
            </span>
          </div>

          {/* Gene rows */}
          <div className="space-y-2">
            {group.rows.map((row) => (
              <div key={row.orderedTestKey} className="rounded-xl border border-neutral-200 bg-white p-3">
                <div className="grid gap-2 sm:grid-cols-[1.3fr_1fr]">
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

      {/* Summary + lab notes */}
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Result Summary</span>
        <textarea
          className="min-h-[80px] w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Short technical summary"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Internal Lab Notes</span>
        <textarea
          className="min-h-[80px] w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          value={labNotes}
          onChange={(e) => setLabNotes(e.target.value)}
          placeholder="Internal-only comments"
        />
      </label>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        Save Draft keeps results in progress. Submit Result finalises all snakes and moves the order to Completed — visible to the breeder immediately.
      </div>

      {submitError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{submitError}</div>
      ) : null}
      {submitSuccess ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{submitSuccess}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm disabled:opacity-60"
          disabled={Boolean(submitLoading)}
          onClick={() => runSave("draft")}
        >
          {submitLoading === "draft" ? "Saving…" : "Save Draft"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={Boolean(submitLoading)}
          onClick={() => runSave("submit")}
        >
          {submitLoading === "submit" ? "Submitting…" : "Submit Result"}
        </button>
      </div>
    </div>
  );
}

export { ELIGIBLE_STATUSES };
