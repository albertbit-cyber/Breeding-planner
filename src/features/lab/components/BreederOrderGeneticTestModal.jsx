import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createLabApiClient } from "../api/client";
import { useSharedBackend } from "../../../contexts/SharedBackendContext.jsx";
import {
  DEFAULT_SAMPLE_TYPE,
  SAMPLE_TYPE_OPTIONS,
  getSampleTypeGuidance,
} from "../utils/sampleTypeGuidance";

const normalizeTokenList = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
};

const unique = (items) => Array.from(new Set(items.filter(Boolean)));

export default function BreederOrderGeneticTestModal({
  open,
  snake,
  onClose,
  onOrderCreated,
  overlayClass,
}) {
  const { t } = useTranslation();
  const { snapshot, retry, sharedFeaturesEnabled } = useSharedBackend();
  const [priority, setPriority] = useState("routine");
  const [sampleType, setSampleType] = useState(DEFAULT_SAMPLE_TYPE);
  const [notes, setNotes] = useState("");
  const [selectedTests, setSelectedTests] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdOrder, setCreatedOrder] = useState(null);
  const [sampleTypeToast, setSampleTypeToast] = useState(null);
  const [catalogTests, setCatalogTests] = useState([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const autoCloseTimerRef = useRef(null);

  const snakeTokens = useMemo(() => {
    const morphs = normalizeTokenList(snake?.morphs);
    const hets = normalizeTokenList(snake?.hets).map((entry) => `${entry} (het)`);
    const possibleHets = normalizeTokenList(snake?.possibleHets).map((entry) => `${entry} (possible het)`);
    return unique([...morphs, ...hets, ...possibleHets]);
  }, [snake?.morphs, snake?.hets, snake?.possibleHets]);

  const testOptions = useMemo(() => {
    return catalogTests.map((entry) => ({
      id: entry.id,
      name: entry.name,
    }));
  }, [catalogTests]);

  useEffect(() => {
    if (!open) return;
    setIsLoadingCatalog(true);
    setCatalogError("");
    const api = createLabApiClient();
    api.getLabTestsCatalog({ breederView: true })
      .then((tests) => {
        setCatalogTests(tests || []);
        console.debug("[lab-pricing-debug] catalog response", {
          count: Array.isArray(tests) ? tests.length : 0,
          tests: tests || [],
        });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Unable to load lab test catalog.";
        setCatalogTests([]);
        setCatalogError(message);
      })
      .finally(() => setIsLoadingCatalog(false));
  }, [open]);

  const toggleTest = (testCode) => {
    setSelectedTests((prev) => {
      if (prev.includes(testCode)) {
        return prev.filter((entry) => entry !== testCode);
      }
      return [...prev, testCode];
    });
  };

  const showSampleTypeGuidance = (nextSampleType) => {
    const guidance = getSampleTypeGuidance(nextSampleType);
    if (!guidance) {
      setSampleTypeToast(null);
      return;
    }
    const toastMessage = t(guidance.messageKey, { defaultValue: guidance.defaultMessage });
    setSampleTypeToast({
      id: `${nextSampleType}_${Date.now()}`,
      message: toastMessage,
    });
  };

  const handleSampleTypeChange = (event) => {
    const nextSampleType = event.target.value;
    setSampleType(nextSampleType);
    showSampleTypeGuidance(nextSampleType);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setCreatedOrder(null);

    const requestedTests = unique(selectedTests);
    if (!requestedTests.length) {
      setSubmitError(t("lab.orders.testsRequired", { defaultValue: "Select at least one gene test." }));
      return;
    }

    if (!catalogTests.length) {
      setSubmitError(
        catalogError ||
          t("lab.orders.catalogRequired", { defaultValue: "No breeder-visible tests are available in the lab catalog." })
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const api = createLabApiClient();
      const result = await api.createTestOrderFromBreeder({
        snakeId: String(snake.id || "").trim(),
        requestedTests,
        priority,
        notes,
        sampleType,
      });
      setCreatedOrder(result.order);
      onOrderCreated?.(result);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lab:test-order-created", { detail: { orderId: result.order?.id } }));
      }

      autoCloseTimerRef.current = setTimeout(() => {
        closeAndReset();
      }, 1200);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeAndReset = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setSubmitError("");
    setCreatedOrder(null);
    setSelectedTests([]);
    setNotes("");
    setPriority("routine");
    setSampleType(DEFAULT_SAMPLE_TYPE);
    setSampleTypeToast(null);
    onClose?.();
  }, [onClose]);

  if (!open || !snake) return null;

  return (
    <div className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-50 ${overlayClass || "bg-black/40"}`} onClick={closeAndReset}>
      <div className="w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div>
            <div className="text-lg font-semibold">
              {t("lab.orders.createTitle", { defaultValue: "Order Genetic Test" })}
            </div>
            <div className="text-sm text-neutral-600">
              {t("lab.orders.createSubtitle", { defaultValue: "Create a shed testing order for this snake." })}
            </div>
          </div>
          <button className="rounded-xl border px-3 py-1.5 text-sm" onClick={closeAndReset}>
            {t("common.close", { defaultValue: "Close" })}
          </button>
        </div>

        <form className="space-y-4 px-5 py-4" onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <div className="font-medium">{snake?.name || t("snakeEdit.unnamed", { defaultValue: "Unnamed" })}</div>
            <div className="font-mono text-xs text-neutral-600">{snake?.id}</div>
            <div className="mt-1 text-xs text-neutral-600">
              {t("snakeEdit.geneticsShort", { defaultValue: "Genetics" })}: {snakeTokens.join(", ") || "-"}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-600">
                {t("lab.orders.priority", { defaultValue: "Priority" })}
              </span>
              <select className="w-full rounded-xl border px-3 py-2 text-sm" value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option value="routine">{t("lab.orders.priorityRoutine", { defaultValue: "Routine" })}</option>
                <option value="urgent">{t("lab.orders.priorityUrgent", { defaultValue: "Urgent" })}</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-600">
                {t("lab.orders.sampleType", { defaultValue: "Sample Type" })}
              </span>
              <select className="w-full rounded-xl border px-3 py-2 text-sm" value={sampleType} onChange={handleSampleTypeChange}>
                {SAMPLE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey, { defaultValue: option.defaultLabel })}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <div className="mb-2 text-xs text-neutral-600">
              {t("lab.orders.requestedTests", { defaultValue: "Requested Gene Tests" })}
            </div>
            <div className="grid max-h-52 grid-cols-1 gap-2 overflow-auto rounded-2xl border border-neutral-200 bg-white p-3 sm:grid-cols-2">
              {isLoadingCatalog ? (
                <div className="col-span-2 py-2 text-center text-xs text-neutral-500">
                  {t("common.loading", { defaultValue: "Loading tests..." })}
                </div>
              ) : catalogError ? (
                <div className="col-span-2 py-2 text-center text-xs text-rose-600">{catalogError}</div>
              ) : !testOptions.length ? (
                <div className="col-span-2 py-2 text-center text-xs text-neutral-500">
                  {t("lab.orders.catalogRequired", { defaultValue: "No breeder-visible tests are available in the lab catalog." })}
                </div>
              ) : (
                testOptions.map((option) => (
                  <label key={option.id} className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selectedTests.includes(option.id)} onChange={() => toggleTest(option.id)} />
                    <span>{option.name}</span>
                  </label>
                ))
              )}
            </div>

          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-600">{t("common.notes", { defaultValue: "Notes" })}</span>
            <textarea
              className="min-h-20 w-full rounded-xl border px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("lab.orders.notesPlaceholder", { defaultValue: "Optional intake notes for the lab" })}
            />
          </label>

          {submitError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{submitError}</div> : null}

          {!sharedFeaturesEnabled ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-semibold">{t("lab.sharedBackend.requiredTitle", { defaultValue: "Shared backend required" })}</div>
              <div className="mt-1">{snapshot.message || t("lab.sharedBackend.required", { defaultValue: "Order submission is blocked until the shared backend is reachable." })}</div>
              <button type="button" className="mt-3 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs" onClick={retry}>
                {t("common.retry", { defaultValue: "Retry" })}
              </button>
            </div>
          ) : null}

          {createdOrder ? (
            <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <div className="font-semibold text-emerald-800">{t("lab.orders.createdTitle", { defaultValue: "Shed Test Order Created" })}</div>
              <div>
                <span className="font-medium">{t("lab.orders.orderId", { defaultValue: "Order ID" })}:</span> {createdOrder.id}
              </div>
              <div>
                <span className="font-medium">{t("lab.orders.status", { defaultValue: "Status" })}:</span> {t("lab.orders.statusCreated", { defaultValue: "Order created" })}
              </div>
              <div className="text-xs text-emerald-700">
                {t("lab.orders.createdHelp", { defaultValue: "The order is saved immediately and will appear in the lab workflow." })}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={closeAndReset}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="submit"
              className="rounded-xl border bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting || isLoadingCatalog || !!catalogError || !testOptions.length || !sharedFeaturesEnabled}
            >
              {isSubmitting
                ? t("lab.orders.submitting", { defaultValue: "Submitting..." })
                : t("lab.orders.createAction", { defaultValue: "Create Shed Test Order" })}
            </button>
          </div>
        </form>
      </div>
      {sampleTypeToast ? (
        <div key={sampleTypeToast.id} className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-2xl border border-amber-200 bg-amber-50 shadow-2xl">
            <div className="px-5 py-4">
              <div className="mb-1 text-sm font-semibold text-amber-900">
                {t("lab.orders.guidance.title", { defaultValue: "Sample Guidance" })}
              </div>
              <p className="text-sm text-amber-800">{sampleTypeToast.message}</p>
            </div>
            <div className="flex justify-end border-t border-amber-200 px-5 py-3">
              <button
                type="button"
                className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700"
                onClick={() => setSampleTypeToast(null)}
              >
                {t("common.ok", { defaultValue: "OK" })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
