import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { createLabApiClient } from "../api/client";
import { useBatchOrder } from "../contexts/BatchOrderContext";
import LabPicker from "./LabPicker.jsx";
import {
  getSuggestedHetTestIds,
  matchSuggestedHetTests,
} from "../utils/shedTestSuggestions";

const normalizeTokenList = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
};

const unique = (items) => Array.from(new Set(items.filter(Boolean)));

export default function BreederOrderGeneticTestModal({
  open,
  snake,
  onClose,
  overlayClass,
}) {
  const { t } = useTranslation();
  const { addToCart, isInCart, getCartItem, selectedLab, selectedLabId } = useBatchOrder();

  const [selectedTests, setSelectedTests] = useState([]);
  const [catalogTests, setCatalogTests] = useState([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [added, setAdded] = useState(false);
  const [hasAppliedSuggestions, setHasAppliedSuggestions] = useState(false);
  const [changingLab, setChangingLab] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const snakeId = String(snake?.id || "").trim();
  // Ordering starts from the animal: which laboratories appear, and which of
  // their tests, both follow from what this animal is.
  const speciesId = String(snake?.species || "").trim() || "ball-python";
  const speciesLabel = String(snake?.speciesName || "").trim();
  const alreadyInCart = isInCart(snakeId);

  // Pre-populate test selection from cart if snake is already staged
  useEffect(() => {
    if (!open) return;
    const existing = getCartItem(snakeId);
    setSelectedTests(existing ? [...existing.selectedTestIds] : []);
    setAdded(false);
    setHasAppliedSuggestions(false);
  }, [open, snakeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the chosen laboratory's tests. Re-runs when the lab changes, because
  // the list of what can be ordered is a property of the lab, not of the app.
  useEffect(() => {
    if (!open || !selectedLabId) {
      setCatalogTests([]);
      return;
    }
    setIsLoadingCatalog(true);
    setCatalogError("");
    const api = createLabApiClient();
    api
      .getLabTestsCatalog({ breederView: true, labOrganizationId: selectedLabId, speciesId })
      .then((tests) => setCatalogTests(tests || []))
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Unable to load this laboratory's tests.";
        setCatalogTests([]);
        setCatalogError(message);
      })
      .finally(() => setIsLoadingCatalog(false));
  }, [open, selectedLabId, speciesId]);

  // Switching labs invalidates any staged selection for the same reason.
  useEffect(() => {
    setSelectedTests([]);
    setHasAppliedSuggestions(false);
  }, [selectedLabId]);

  const testOptions = useMemo(
    () => catalogTests.map((entry) => ({ id: entry.id, name: entry.name })),
    [catalogTests]
  );

  const suggestedHetTests = useMemo(
    () => matchSuggestedHetTests(snake, catalogTests),
    [snake, catalogTests]
  );

  useEffect(() => {
    if (!open || alreadyInCart || hasAppliedSuggestions || !catalogTests.length) return;
    const suggestedIds = getSuggestedHetTestIds(snake, catalogTests);
    if (suggestedIds.length) {
      setSelectedTests(suggestedIds);
    }
    setHasAppliedSuggestions(true);
  }, [alreadyInCart, catalogTests, hasAppliedSuggestions, open, snake]);

  const snakeTokens = useMemo(() => {
    const morphs = normalizeTokenList(snake?.morphs);
    const hets = normalizeTokenList(snake?.hets).map((entry) => `${entry} (het)`);
    const possHets = normalizeTokenList(snake?.possibleHets).map((entry) => `${entry} (possible het)`);
    return unique([...morphs, ...hets, ...possHets]);
  }, [snake?.morphs, snake?.hets, snake?.possibleHets]);

  const toggleTest = (testId) => {
    setSelectedTests((prev) =>
      prev.includes(testId) ? prev.filter((id) => id !== testId) : [...prev, testId]
    );
  };

  const handleAddToBatch = () => {
    const requestedTests = unique(selectedTests);
    if (!requestedTests.length) return;
    addToCart(snake, requestedTests);
    setAdded(true);
    // Brief confirmation, then close
    setTimeout(() => {
      onClose?.();
    }, 800);
  };

  /**
   * Banks the test in the saved queue instead of the batch cart.
   *
   * The cart is for a box going out now; this is for a shed that arrived today when the rest of
   * the season's are still weeks away. It is kept server-side, so months of collecting survive a
   * cleared cache and follow the keeper between devices.
   */
  const handleSaveForLater = async () => {
    const requestedTests = unique(selectedTests);
    if (!requestedTests.length || !selectedLabId) return;
    setSaveError("");
    setSaving(true);
    try {
      const api = createLabApiClient();
      await api.addPendingShedTest({
        snakeId: String(snake?.id || "").trim(),
        snakeDisplayId: snake?.displayId || snake?.code || undefined,
        snakeName: snake?.name || undefined,
        labId: selectedLabId,
        selectedTestIds: requestedTests,
      });
      setSaved(true);
      setTimeout(() => {
        onClose?.();
      }, 800);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unable to save this test for later.");
    } finally {
      setSaving(false);
    }
  };

  const closeAndReset = useCallback(() => {
    setAdded(false);
    setSaved(false);
    setSaveError("");
    setSelectedTests([]);
    onClose?.();
  }, [onClose]);

  if (!open || !snake) return null;

  const modal = (
    <div
      className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 ${overlayClass || "bg-black/40"} z-[10020]`}
      style={{ zIndex: 10020 }}
      onClick={closeAndReset}
    >
      <div
        className="relative z-[10021] w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white shadow-xl"
        style={{ zIndex: 10021 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div>
            <div className="text-lg font-semibold">
              {t("lab.orders.addToBatchTitle", { defaultValue: "Add to Batch Order" })}
            </div>
            <div className="text-sm text-neutral-600">
              {t("lab.orders.addToBatchSubtitle", {
                defaultValue:
                  "Select tests for this snake. Submit all snakes together from the batch cart.",
              })}
            </div>
          </div>
          <button
            type="button"
            className="rounded-xl border px-3 py-1.5 text-sm"
            onClick={closeAndReset}
          >
            {t("common.close", { defaultValue: "Close" })}
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Snake summary */}
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <div className="font-medium">
              {snake?.name || t("snakeEdit.unnamed", { defaultValue: "Unnamed" })}
            </div>
            <div className="font-mono text-xs text-neutral-500">{snake?.id}</div>
            {snakeTokens.length ? (
              <div className="mt-1 text-xs text-neutral-600">
                {t("snakeEdit.geneticsShort", { defaultValue: "Genetics" })}:{" "}
                {snakeTokens.join(", ")}
              </div>
            ) : null}
            {alreadyInCart && !added ? (
              <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                {t("lab.batch.alreadyStagedNote", {
                  defaultValue:
                    "This snake is already in the batch. Saving will update its test selection.",
                })}
              </div>
            ) : null}
          </div>

          {/* Laboratory selection. Everything below depends on it, so it comes
              first and the test list stays hidden until a lab is chosen. */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-3">
            {selectedLabId ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-neutral-500">
                    {t("lab.orders.sendingTo", { defaultValue: "Sending to" })}
                  </div>
                  <div className="truncate text-sm font-medium text-neutral-900">
                    {selectedLab?.labName}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-xl border px-3 py-1.5 text-xs"
                  onClick={() => setChangingLab((prev) => !prev)}
                >
                  {changingLab
                    ? t("common.cancel", { defaultValue: "Cancel" })
                    : t("lab.orders.changeLab", { defaultValue: "Change" })}
                </button>
              </div>
            ) : null}
            {!selectedLabId || changingLab ? (
              <div className={selectedLabId ? "mt-3" : ""}>
                <LabPicker
                  speciesId={speciesId}
                  speciesName={speciesLabel}
                  onChosen={() => setChangingLab(false)}
                />
              </div>
            ) : null}
          </div>

          {/* Test selection */}
          <div className={selectedLabId ? "" : "pointer-events-none opacity-40"}>
            <div className="mb-2 text-xs text-neutral-600">
              {t("lab.orders.requestedTests", { defaultValue: "Requested Gene Tests" })}
              {selectedLab?.labName ? (
                <span className="ml-1 text-neutral-400">
                  — {selectedLab.labName}
                </span>
              ) : null}
            </div>
            {suggestedHetTests.length ? (
              <div className="mb-3 rounded-2xl border border-sky-200 bg-sky-50 p-3">
                <div className="text-sm font-medium text-sky-950">
                  {t("lab.orders.suggestedHetTests", {
                    defaultValue: "Suggested het tests",
                  })}
                </div>
                <div className="mt-1 text-xs text-sky-800">
                  {t("lab.orders.suggestedHetTestsHelp", {
                    defaultValue:
                      "This snake has 66% het, 50% het, or possible het genetics. Select the genes you want the lab to confirm.",
                  })}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {suggestedHetTests.map((suggestion) =>
                    suggestion.matched ? (
                      <label
                        key={suggestion.key}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-sky-950"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTests.includes(suggestion.testId)}
                          onChange={() => toggleTest(suggestion.testId)}
                        />
                        <span>{suggestion.testName || suggestion.gene}</span>
                      </label>
                    ) : (
                      <div
                        key={suggestion.key}
                        className="rounded-xl border border-sky-100 bg-white/70 px-3 py-2 text-sm text-sky-900"
                      >
                        <div>{suggestion.gene}</div>
                        <div className="text-[11px] text-sky-700">
                          {t("lab.orders.noMatchingHetTest", {
                            defaultValue: "No matching breeder-visible catalog test",
                          })}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            ) : null}
            <div className="grid max-h-52 grid-cols-1 gap-2 overflow-auto rounded-2xl border border-neutral-200 bg-white p-3 sm:grid-cols-2">
              {isLoadingCatalog ? (
                <div className="col-span-2 py-2 text-center text-xs text-neutral-500">
                  {t("common.loading", { defaultValue: "Loading tests…" })}
                </div>
              ) : catalogError ? (
                <div className="col-span-2 py-2 text-center text-xs text-rose-600">
                  {catalogError}
                </div>
              ) : !testOptions.length ? (
                <div className="col-span-2 py-2 text-center text-xs text-neutral-500">
                  {t("lab.orders.catalogRequired", {
                    defaultValue: "No breeder-visible tests are available in the lab catalog.",
                  })}
                </div>
              ) : (
                testOptions.map((option) => (
                  <label key={option.id} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedTests.includes(option.id)}
                      onChange={() => toggleTest(option.id)}
                    />
                    <span>{option.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Success feedback */}
          {added ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {t("lab.batch.addedConfirm", {
                defaultValue:
                  "Added to batch. Open the batch cart (bottom-right) to review and submit.",
              })}
            </div>
          ) : null}

          {saveError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {saveError}
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              className="rounded-xl border px-4 py-2 text-sm"
              onClick={closeAndReset}
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            {/* Banks the shed for a later box, rather than the one going out now. */}
            <button
              type="button"
              className="rounded-xl border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!selectedLabId || !selectedTests.length || isLoadingCatalog || !!catalogError || saving || saved}
              onClick={handleSaveForLater}
            >
              {saved
                ? t("lab.pending.saved", { defaultValue: "Saved" })
                : saving
                  ? t("lab.pending.saving", { defaultValue: "Saving…" })
                  : t("lab.pending.saveForLater", { defaultValue: "Save for later" })}
            </button>
            <button
              type="button"
              className="rounded-xl border bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!selectedLabId || !selectedTests.length || isLoadingCatalog || !!catalogError || added}
              onClick={handleAddToBatch}
            >
              {alreadyInCart && !added
                ? t("lab.batch.updateInBatch", { defaultValue: "Update in Batch" })
                : t("lab.batch.addToBatch", { defaultValue: "Add to Batch" })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
