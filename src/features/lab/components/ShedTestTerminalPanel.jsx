import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createLabApiClient } from "../api/client";
import { useSharedBackend } from "../../../contexts/SharedBackendContext.jsx";

const EMPTY_QUOTE = { items: [], subtotalCents: 0, totalCents: 0, currency: "EUR" };

const isPendingQueueUnavailableError = (error) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("Pending shed queue is not available on the shared backend")
    || message.includes("Shed submission batches are not available on the shared backend.");
};

const formatMoney = (currency, amountCents) => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format((Number(amountCents) || 0) / 100);
  } catch {
    return `${currency || "USD"} ${((Number(amountCents) || 0) / 100).toFixed(2)}`;
  }
};

const base64ToBlob = (base64, mimeType) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
};

const downloadArtifact = (artifact) => {
  if (!artifact?.base64) return;
  const blob = base64ToBlob(artifact.base64, artifact.mimeType);
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = artifact.fileName || "download.pdf";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
};

export default function ShedTestTerminalPanel({ activeSnakeId, onBatchSubmitted }) {
  const { t } = useTranslation();
  const { sharedFeaturesEnabled } = useSharedBackend();
  const [pendingItems, setPendingItems] = useState([]);
  const [batches, setBatches] = useState([]);
  const [queueUnavailable, setQueueUnavailable] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [pricingConfig, setPricingConfig] = useState(null);
  const [quote, setQuote] = useState(EMPTY_QUOTE);
  const [loading, setLoading] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [testEditorItemId, setTestEditorItemId] = useState(null);
  const [testEditorSelection, setTestEditorSelection] = useState([]);

  const catalogMap = useMemo(() => new Map((catalog || []).map((entry) => [entry.id, entry])), [catalog]);

  const refreshData = async () => {
    setLoading(true);
    setError("");
    setQueueUnavailable(false);
    try {
      const api = createLabApiClient();
      const [tests, pricing] = await Promise.all([
        api.getLabTestsCatalog({ breederView: true }),
        api.getLabTestsPricing(),
      ]);

      let pending = [];
      let nextBatches = [];
      let nextQueueUnavailable = false;

      try {
        [pending, nextBatches] = await Promise.all([
          api.listPendingShedTests(),
          api.listShedSubmissionBatches(),
        ]);
      } catch (err) {
        if (!isPendingQueueUnavailableError(err)) {
          throw err;
        }
        nextQueueUnavailable = true;
      }

      setPendingItems(nextQueueUnavailable ? [] : (pending || []));
      setCatalog(tests || []);
      setPricingConfig(pricing || null);
      setBatches(nextQueueUnavailable ? [] : (nextBatches || []));
      setQueueUnavailable(nextQueueUnavailable);
      console.debug("[lab-pricing-debug] pricing response", pricing || null);
      console.debug("[lab-pricing-debug] catalog response", tests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Shed Test Terminal.");
      setPricingConfig(null);
      setQueueUnavailable(false);
    } finally {
      setLoading(false);
    }
  };

  const refreshQuote = async (currentPending = pendingItems, currentCatalog = catalog, currentPricing = pricingConfig) => {
    const selectedItems = (currentPending || []).filter((entry) => entry.selected);
    if (!currentPricing) {
      setQuote(EMPTY_QUOTE);
      setError(t("lab.terminal.pricingUnavailable", { defaultValue: "Pricing is unavailable. Please refresh and try again." }));
      return;
    }
    if (!selectedItems.length) {
      setQuote({ ...EMPTY_QUOTE, currency: currentPricing.currency || "EUR" });
      return;
    }

    const animals = selectedItems.map((entry) => ({
      animalId: String(entry?.snakeId || entry?.id || "").trim(),
      selectedTestIds: Array.isArray(entry?.selectedTestIds)
        ? entry.selectedTestIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
    })).filter((entry) => entry.animalId);

    setLoadingQuote(true);
    try {
      const api = createLabApiClient();
      console.debug("[lab-pricing-debug] calculate request", { animals });
      const breakdown = await api.calculateLabOrderPrice({ animals });
      console.debug("[lab-pricing-debug] calculate response", breakdown);

      const byAnimalId = new Map((breakdown?.perAnimal || []).map((row) => [String(row?.animalId || ""), row]));
      const currency = currentPricing.currency || "EUR";
      const items = selectedItems.map((entry) => {
        const key = String(entry?.snakeId || entry?.id || "").trim();
        const animalBreakdown = byAnimalId.get(key);
        const tests = (entry?.selectedTestIds || []).map((testId) => {
          const test = (currentCatalog || []).find((catalogEntry) => catalogEntry?.id === testId);
          return {
            id: testId,
            name: test?.name || testId,
            priceCents: 0,
            currency,
          };
        });
        return {
          pendingItemId: entry.id,
          snakeId: entry.snakeId,
          tests,
          itemTotalCents: Number(animalBreakdown?.total || 0),
          currency,
          priority: entry.priority,
        };
      });

      setQuote({
        items,
        subtotalCents: Number(breakdown?.total || 0),
        totalCents: Number(breakdown?.total || 0),
        currency,
      });
    } catch (err) {
      setQuote(EMPTY_QUOTE);
      setError(err instanceof Error ? err.message : "Unable to calculate pricing.");
    } finally {
      setLoadingQuote(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    refreshQuote();
  }, [pendingItems, catalog, pricingConfig]);

  useEffect(() => {
    console.debug("[lab-pricing-debug] final terminal pricing values", {
      selectedItems: (quote?.items || []).length,
      totalCents: quote?.totalCents || 0,
      currency: quote?.currency || "EUR",
    });
  }, [quote]);

  const updateItem = async (pendingItemId, patch) => {
    try {
      const api = createLabApiClient();
      const updated = await api.updatePendingShedTest({ pendingItemId, ...patch });
      setPendingItems((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update terminal item.");
    }
  };

  const removeItem = async (pendingItemId) => {
    try {
      const api = createLabApiClient();
      await api.removePendingShedTest(pendingItemId);
      setPendingItems((prev) => prev.filter((entry) => entry.id !== pendingItemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove terminal item.");
    }
  };

  const openRelatedSnake = (item) => {
    if (typeof window === "undefined") return;
    const snakeId = String(item?.snakeId || "").trim();
    if (!snakeId) return;
    window.dispatchEvent(
      new CustomEvent("lab:open-related-snake", {
        detail: {
          snakeId,
          snakeDisplayId: item?.snakeDisplayId,
          snakeName: item?.snakeName,
        },
      })
    );
  };

  const beginEditTests = (item) => {
    const selected = Array.isArray(item?.selectedTestIds) ? item.selectedTestIds : [];
    setTestEditorItemId(item?.id || null);
    setTestEditorSelection(selected);
  };

  const cancelEditTests = () => {
    setTestEditorItemId(null);
    setTestEditorSelection([]);
  };

  const toggleEditorTest = (testId, checked) => {
    const normalized = String(testId || "").trim();
    if (!normalized) return;
    setTestEditorSelection((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      if (checked) {
        if (current.includes(normalized)) return current;
        return [...current, normalized];
      }
      return current.filter((id) => id !== normalized);
    });
  };

  const saveEditedTests = async () => {
    if (!testEditorItemId) return;
    const selectedTestIds = Array.from(new Set((testEditorSelection || []).map((id) => String(id || "").trim()).filter(Boolean)));
    if (!selectedTestIds.length) {
      setError(t("lab.orders.testsRequired", { defaultValue: "Select at least one gene test." }));
      return;
    }
    await updateItem(testEditorItemId, { selectedTestIds });
    cancelEditTests();
  };

  const submitBatch = async () => {
    const selected = pendingItems.filter((entry) => entry.selected);
    if (!selected.length) {
      setError(t("lab.terminal.selectAtLeastOne", { defaultValue: "Select at least one pending shed test." }));
      return;
    }
    if (!pricingConfig || loadingQuote) {
      setError(t("lab.terminal.pricingUnavailable", { defaultValue: "Pricing is unavailable. Please refresh and try again." }));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const api = createLabApiClient();
      const result = await api.submitPendingShedBatch(selected.map((entry) => entry.id));
      downloadArtifact(result.masterLabel);
      (result.individualLabels || []).forEach((artifact) => downloadArtifact(artifact));
      onBatchSubmitted?.(result);
      await refreshData();
      await refreshQuote([]);
      setShowHistory(true);
      setActiveBatchId(result.batch.id);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lab:test-order-created", { detail: { batchId: result.batch.id } }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit shed test batch.");
    } finally {
      setSubmitting(false);
    }
  };

  const redownloadBatch = async (batchId) => {
    try {
      const api = createLabApiClient();
      const artifacts = await api.getShedBatchArtifacts(batchId);
      downloadArtifact(artifacts.masterLabel);
      (artifacts.individualLabels || []).forEach((artifact) => downloadArtifact(artifact));
      setActiveBatchId(batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download batch labels.");
    }
  };

  const quotedByItemId = useMemo(() => {
    const map = new Map();
    (quote?.items || []).forEach((entry) => {
      map.set(entry.pendingItemId, entry);
    });
    return map;
  }, [quote]);

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("lab.terminal.title", { defaultValue: "Shed Test Terminal" })}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500">
            {t("lab.terminal.subtitle", {
              defaultValue: "Batch review and submission for pending shed tests across your snakes.",
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!queueUnavailable ? (
            <button
              type="button"
              className="rounded-lg border px-2 py-1 text-[11px]"
              onClick={() => setShowHistory((prev) => !prev)}
            >
              {showHistory
                ? t("lab.terminal.hideHistory", { defaultValue: "Hide Batch History" })
                : t("lab.terminal.showHistory", { defaultValue: "Show Batch History" })}
            </button>
          ) : null}
          <button type="button" className="rounded-lg border px-2 py-1 text-[11px]" onClick={refreshData}>
            {t("common.refresh", { defaultValue: "Refresh" })}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          {t("common.loading", { defaultValue: "Loading..." })}
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      ) : null}

      {!loading && !pendingItems.length ? (
        <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-3 text-xs text-neutral-600">
          {queueUnavailable || sharedFeaturesEnabled
            ? t("lab.terminal.sharedModeEmpty", { defaultValue: "Shared backend mode creates shed orders immediately. There is no pending local batch queue." })
            : t("lab.terminal.empty", { defaultValue: "No pending shed tests yet. Add items from snake cards." })}
          {queueUnavailable ? (
            <div className="mt-2 text-neutral-500">
              {t("lab.terminal.sharedModeHelp", {
                defaultValue: "Use Create Shed Test Order from a snake card. Submitted orders will appear in All Shed Orders immediately.",
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && pendingItems.length ? (
        <div className="mt-3 space-y-2">
          {pendingItems.map((item) => {
            const resolvedTests = item.selectedTestIds
              .map((testId) => catalogMap.get(testId)?.name || testId)
              .filter(Boolean);
            const quoteItem = quotedByItemId.get(item.id);
            const isActiveSnake = activeSnakeId && String(activeSnakeId) === String(item.snakeId);

            return (
              <div
                key={item.id}
                className={`rounded-lg border px-3 py-2 text-xs ${isActiveSnake ? "border-sky-300 bg-sky-50" : "border-neutral-200 bg-neutral-50"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <label className="inline-flex items-center gap-2 font-medium text-neutral-800">
                    <input
                      type="checkbox"
                      checked={Boolean(item.selected)}
                      onChange={(event) => updateItem(item.id, { selected: event.target.checked })}
                    />
                    {t("lab.terminal.snake", { defaultValue: "Snake" })}: {item.snakeId}
                  </label>
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[11px]"
                      onClick={() => openRelatedSnake(item)}
                    >
                      {t("lab.terminal.openSnake", { defaultValue: "Open Related Snake" })}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[11px]"
                      onClick={() => beginEditTests(item)}
                    >
                      {t("lab.terminal.editTests", { defaultValue: "Edit Tests" })}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[11px] text-rose-700"
                      onClick={() => removeItem(item.id)}
                    >
                      {t("common.remove", { defaultValue: "Remove" })}
                    </button>
                  </div>
                </div>

                {testEditorItemId === item.id ? (
                  <div className="mt-2 rounded-md border border-neutral-300 bg-white p-2">
                    <div className="mb-2 text-[11px] font-medium text-neutral-700">
                      {t("lab.terminal.editTestsHelp", { defaultValue: "Select tests for this snake." })}
                    </div>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {(catalog || []).map((test) => {
                        const testId = String(test?.id || "").trim();
                        if (!testId) return null;
                        const checked = testEditorSelection.includes(testId);
                        return (
                          <label key={`${item.id}-editor-${testId}`} className="inline-flex items-center gap-2 text-[11px] text-neutral-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => toggleEditorTest(testId, event.target.checked)}
                            />
                            <span>{test?.name || testId}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[11px]"
                        onClick={cancelEditTests}
                      >
                        {t("common.cancel", { defaultValue: "Cancel" })}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-neutral-900 bg-neutral-900 px-2 py-0.5 text-[11px] text-white"
                        onClick={saveEditedTests}
                      >
                        {t("common.save", { defaultValue: "Save" })}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">
                      {t("lab.terminal.tests", { defaultValue: "Tests" })}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {resolvedTests.map((testName) => (
                        <span key={`${item.id}-${testName}`} className="rounded-md border border-neutral-300 bg-white px-1.5 py-0.5">
                          {testName}
                        </span>
                      ))}
                    </div>
                  </div>
                  <label>
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
                      {t("lab.orders.priority", { defaultValue: "Priority" })}
                    </span>
                    <select
                      className="w-full rounded-md border bg-white px-2 py-1 text-xs"
                      value={item.priority}
                      onChange={(event) => updateItem(item.id, { priority: event.target.value })}
                    >
                      <option value="routine">{t("lab.orders.priorityRoutine", { defaultValue: "Routine" })}</option>
                      <option value="priority">{t("lab.orders.priorityPriority", { defaultValue: "Priority" })}</option>
                      <option value="urgent">{t("lab.orders.priorityUrgent", { defaultValue: "Urgent" })}</option>
                    </select>
                  </label>
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">
                      {t("lab.terminal.itemTotal", { defaultValue: "Item total" })}
                    </div>
                    <div className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium">
                      {formatMoney(quoteItem?.currency || quote.currency, quoteItem?.itemTotalCents || 0)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {queueUnavailable ? (
        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <div className="font-medium">
            {t("lab.terminal.sharedModeDirectOrdersTitle", { defaultValue: "Direct Order Mode" })}
          </div>
          <div className="mt-1 text-xs text-sky-800">
            {t("lab.terminal.sharedModeDirectOrdersBody", {
              defaultValue: "The hosted backend submits shed test orders immediately. Review pricing in the snake order modal, then create the order directly instead of building a local batch queue.",
            })}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <div className="text-[11px] text-neutral-500">{t("lab.terminal.selectedItems", { defaultValue: "Selected items" })}</div>
              <div className="font-medium text-neutral-800">{(quote.items || []).length}</div>
            </div>
            <div>
              <div className="text-[11px] text-neutral-500">{t("lab.terminal.total", { defaultValue: "Batch Total" })}</div>
              <div className="font-semibold text-neutral-900">{formatMoney(quote.currency, quote.totalCents)}</div>
            </div>
            <button
              type="button"
              className="rounded-lg border bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              disabled={submitting || loadingQuote || !pricingConfig || !(quote.items || []).length}
              onClick={submitBatch}
            >
              {submitting
                ? t("lab.terminal.submitting", { defaultValue: "Submitting..." })
                : t("lab.terminal.submit", { defaultValue: "Submit Order" })}
            </button>
          </div>
          {loadingQuote ? (
            <div className="mt-2 text-xs text-neutral-500">{t("common.loading", { defaultValue: "Loading..." })}</div>
          ) : null}
        </div>
      )}

      {showHistory && !queueUnavailable ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("lab.terminal.batchHistory", { defaultValue: "Batch History" })}
          </div>
          {!batches.length ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              {t("lab.terminal.batchHistoryEmpty", { defaultValue: "No submitted batches yet." })}
            </div>
          ) : (
            batches.map((batch) => (
              <div
                key={batch.id}
                className={`rounded-lg border px-3 py-2 text-xs ${activeBatchId === batch.id ? "border-emerald-300 bg-emerald-50" : "border-neutral-200 bg-white"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-neutral-800">{batch.id}</div>
                    <div className="text-neutral-500">{new Date(batch.submittedAt).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-neutral-500">{batch.itemCount} items</div>
                    <div className="font-medium text-neutral-800">{formatMoney(batch.currency, batch.totalCents)}</div>
                  </div>
                </div>
                <div className="mt-2">
                  <button
                    type="button"
                    className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-[11px]"
                    onClick={() => redownloadBatch(batch.id)}
                  >
                    {t("lab.terminal.downloadBatch", { defaultValue: "Re-download Full Batch Labels" })}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
