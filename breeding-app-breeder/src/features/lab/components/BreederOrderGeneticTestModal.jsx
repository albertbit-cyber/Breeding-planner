import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { createLabApiClient } from "../api/client";
import { useBatchOrder } from "../contexts/BatchOrderContext";
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
  const { addToCart, isInCart, getCartItem } = useBatchOrder();

  const [selectedTests, setSelectedTests] = useState([]);
  const [catalogTests, setCatalogTests] = useState([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [added, setAdded] = useState(false);
  const [hasAppliedSuggestions, setHasAppliedSuggestions] = useState(false);

  const snakeId = String(snake?.id || "").trim();
  const alreadyInCart = isInCart(snakeId);

  // Pre-populate test selection from cart if snake is already staged
  useEffect(() => {
    if (!open) return;
    const existing = getCartItem(snakeId);
    setSelectedTests(existing ? [...existing.selectedTestIds] : []);
    setAdded(false);
    setHasAppliedSuggestions(false);
  }, [open, snakeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load catalog when modal opens
  useEffect(() => {
    if (!open) return;
    setIsLoadingCatalog(true);
    setCatalogError("");
    const api = createLabApiClient();
    api
      .getLabTestsCatalog({ breederView: true })
      .then((tests) => setCatalogTests(tests || []))
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Unable to load lab test catalog.";
        setCatalogTests([]);
        setCatalogError(message);
      })
      .finally(() => setIsLoadingCatalog(false));
  }, [open]);

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

  const closeAndReset = useCallback(() => {
    setAdded(false);
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

          {/* Test selection */}
          <div>
            <div className="mb-2 text-xs text-neutral-600">
              {t("lab.orders.requestedTests", { defaultValue: "Requested Gene Tests" })}
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

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              className="rounded-xl border px-4 py-2 text-sm"
              onClick={closeAndReset}
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              className="rounded-xl border bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!selectedTests.length || isLoadingCatalog || !!catalogError || added}
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
