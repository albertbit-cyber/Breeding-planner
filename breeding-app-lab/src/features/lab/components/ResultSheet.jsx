import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createLabApiClient } from "../api/client";
import { genotypeLabelFor, resultOptionsFor } from "../../../types/labResultEntry";
import { buildLabTestNumber } from "../../../services/lab/testNumber";
import { inheritanceKindLabel, resultStatusLabel } from "../constants/statusLabelsI18n";

/** Orders a result can be entered for. */
export const ELIGIBLE_STATUSES = new Set(["received", "in_progress"]);

const DEFAULT_METHOD = "PCR";
const createDefaultTestNumber = (orderId = "") => buildLabTestNumber(orderId || "lab-result");

const initAnimalRows = (animalGroup) => {
  const savedItems = new Map(
    (Array.isArray(animalGroup?.existingResult?.items) ? animalGroup.existingResult.items : []).map(
      (item) => [item.orderedTestKey, item]
    )
  );
  return (animalGroup?.items || []).map((item) => {
    const saved = savedItems.get(item.orderedTestKey);
    const options = resultOptionsFor(item.inheritance);
    const savedStatus = String(saved?.resultStatus || "").trim();
    return {
      orderedTestKey: item.orderedTestKey,
      geneName: item.geneName,
      sourceOrderedName: item.sourceOrderedName,
      inheritance: item.inheritance || { kind: "unknown", gene: item.geneName },
      options,
      // A draft saved under the old three-word vocabulary may hold "visual";
      // keep it readable but let the dropdown offer only the precise answers.
      resultStatus: savedStatus,
      notes: String(saved?.notes || "").trim(),
      noteOpen: Boolean(String(saved?.notes || "").trim()),
    };
  });
};

/**
 * One row per ordered test, one dropdown per row, and the dropdown speaks the
 * gene's own inheritance: a recessive gene is negative, het or homozygous; an
 * incomplete dominant gene is negative, single or super; a dominant gene is
 * present or not present. Next to each answer the sheet shows what the breeder
 * will read, which is the genotype itself ("het Clown", "Super Fire").
 *
 * Props:
 *   orderId        the order to enter results for
 *   focusAnimalId  the snake whose tube was scanned; its section opens, the
 *                  others fold away until asked for
 *   onSaved        called after a draft or a submission succeeds
 */
export default function ResultSheet({ orderId, focusAnimalId, onSaved }) {
  const { t } = useTranslation();
  const [testCode, setTestCode] = useState("");
  const [method, setMethod] = useState(DEFAULT_METHOD);
  const [summary, setSummary] = useState("");
  const [labNotes, setLabNotes] = useState("");

  const [animalGroups, setAnimalGroups] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState("");

  const [submitLoading, setSubmitLoading] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const focusRef = useRef(null);
  const normalizedFocus = String(focusAnimalId || "").trim();

  useEffect(() => {
    const normalized = String(orderId || "").trim();
    if (!normalized) {
      setAnimalGroups([]);
      setTemplateError("");
      return undefined;
    }

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
              animalName: t("lab.results.animalFallback", { defaultValue: "Animal" }),
              rows: initAnimalRows({ items: template?.items, existingResult: template?.existingResult }),
            }];

        setAnimalGroups(groups);
        const hasFocus = normalizedFocus && groups.some((group) => group.animalId === normalizedFocus);
        setExpanded(new Set(hasFocus ? [normalizedFocus] : groups.map((group) => group.animalId)));

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
        setTemplateError(
          err instanceof Error
            ? err.message
            : t("lab.results.loadTestsFailed", { defaultValue: "Failed to load ordered tests." })
        );
      })
      .finally(() => { if (mounted) setLoadingTemplate(false); });

    return () => { mounted = false; };
  }, [orderId, normalizedFocus]);

  // Bring the scanned snake into view once its section has rendered.
  useEffect(() => {
    if (!normalizedFocus || loadingTemplate) return;
    focusRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [normalizedFocus, loadingTemplate]);

  const totalRows = animalGroups.reduce((sum, group) => sum + group.rows.length, 0);
  const filledRows = animalGroups.reduce(
    (sum, group) => sum + group.rows.filter((row) => String(row.resultStatus || "").trim()).length,
    0
  );
  const allFilled = totalRows > 0 && filledRows === totalRows;

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

  const toggleGroup = (animalId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(animalId)) next.delete(animalId);
      else next.add(animalId);
      return next;
    });
  };

  const runSave = async (mode) => {
    setSubmitError("");
    setSubmitSuccess("");

    const normalized = String(orderId || "").trim();
    if (!totalRows) {
      setSubmitError(t("lab.results.noOrderedTests", { defaultValue: "No ordered tests found for this order." }));
      return;
    }
    if (mode === "draft" && filledRows === 0) {
      setSubmitError(
        t("lab.results.draftNeedsOne", { defaultValue: "Set at least one gene status before saving a draft." })
      );
      return;
    }
    if (mode === "submit" && !allFilled) {
      setSubmitError(
        t("lab.results.submitNeedsAll", {
          defaultValue: "Set a result status for every gene across all animals before submitting.",
        })
      );
      setExpanded(new Set(animalGroups.map((group) => group.animalId)));
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

      const resultId = response?.result?.id || "";
      setSubmitSuccess(
        mode === "draft"
          ? t("lab.results.sheetDraftSaved", { defaultValue: "Draft saved. Nothing has been sent to the breeder yet." })
          : t("lab.results.sheetSubmitted", {
              defaultValue: "Results sent. The order is complete and the breeder can see every answer.",
            })
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("lab:test-order-updated", {
            detail: { orderId: normalized, status: response?.order?.status, resultId, mode },
          })
        );
      }

      onSaved?.({ mode, response });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("lab.results.saveFailed", { defaultValue: "Save failed." }));
    } finally {
      setSubmitLoading("");
    }
  };

  const optionLabel = (row, value) => {
    const word = resultStatusLabel(t, value);
    const preview = genotypeLabelFor(value, row.inheritance?.gene || row.geneName);
    return preview && preview !== word ? `${word} · ${preview}` : word;
  };

  const multipleAnimals = animalGroups.length > 1;

  if (loadingTemplate) {
    return (
      <div className="text-sm text-neutral-500">
        {t("lab.results.loadingGenes", { defaultValue: "Loading ordered genes…" })}
      </div>
    );
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
        {t("lab.results.noOrderedTests", { defaultValue: "No ordered tests found for this order." })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <div className="h-1.5 flex-1 rounded-full bg-neutral-200">
          <div
            className="h-1.5 rounded-full bg-emerald-500 transition-all"
            style={{ width: `${totalRows ? Math.round((filledRows / totalRows) * 100) : 0}%` }}
          />
        </div>
        <span>
          {t("lab.results.genesFilled", {
            defaultValue: "{{filled}}/{{total}} genes filled",
            filled: filledRows,
            total: totalRows,
          })}
        </span>
      </div>

      {/* One section per snake */}
      {animalGroups.map((group, groupIdx) => {
        const isFocus = normalizedFocus && group.animalId === normalizedFocus;
        const isOpen = expanded.has(group.animalId);
        const groupFilled = group.rows.filter((row) => row.resultStatus).length;
        const groupDone = groupFilled === group.rows.length;
        return (
          <section
            key={group.animalId}
            ref={isFocus ? focusRef : null}
            className={`rounded-2xl border bg-neutral-50 p-3 ${
              isFocus ? "border-sky-400 ring-2 ring-sky-100" : "border-neutral-200"
            }`}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 text-start"
              onClick={() => toggleGroup(group.animalId)}
              aria-expanded={isOpen}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  groupDone ? "bg-emerald-600 text-white" : "bg-neutral-800 text-white"
                }`}
              >
                {groupDone ? "✓" : groupIdx + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-neutral-800">
                  {group.animalName && group.animalName !== group.animalId
                    ? group.animalName
                    : t("lab.results.snakeFallback", { defaultValue: "Snake" })}
                  {isFocus ? (
                    <span className="ms-2 rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-700">
                      {t("lab.results.scanned", { defaultValue: "Scanned" })}
                    </span>
                  ) : null}
                </span>
                {group.animalId !== "primary" ? (
                  <span className="block font-mono text-[10px] text-neutral-400"><bdi>{group.animalId}</bdi></span>
                ) : null}
              </span>
              <span className="text-[11px] text-neutral-500">
                {t("lab.results.rowsFilled", {
                  defaultValue: "{{filled}}/{{total}} filled",
                  filled: groupFilled,
                  total: group.rows.length,
                })}
              </span>
              {multipleAnimals ? (
                <span className="text-xs text-neutral-500">{isOpen ? "−" : "+"}</span>
              ) : null}
            </button>

            {isOpen || !multipleAnimals ? (
              <div className="mt-3 space-y-2">
                {group.rows.map((row) => {
                  const kind = row.inheritance?.kind || "unknown";
                  const preview = genotypeLabelFor(row.resultStatus, row.inheritance?.gene || row.geneName);
                  const options = row.options.includes(row.resultStatus) || !row.resultStatus
                    ? row.options
                    : [row.resultStatus, ...row.options];
                  return (
                    <div key={row.orderedTestKey} className="rounded-xl border border-neutral-200 bg-white p-3">
                      <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-neutral-900">{row.geneName}</div>
                          <div className="text-xs text-neutral-500">
                            {inheritanceKindLabel(t, kind)}
                            {kind === "unknown"
                              ? ` · ${t("lab.inheritance.unknownHint", { defaultValue: "recessive answers offered" })}`
                              : ""}
                            {row.sourceOrderedName && row.sourceOrderedName !== row.geneName
                              ? ` · ${t("lab.results.orderedAs", { defaultValue: "Ordered as:" })} ${row.sourceOrderedName}`
                              : ""}
                          </div>
                        </div>
                        <select
                          className={`rounded-lg border px-2 py-1.5 text-sm ${
                            row.resultStatus ? "border-neutral-300" : "border-amber-300 bg-amber-50/40"
                          }`}
                          value={row.resultStatus}
                          onChange={(e) => updateRow(group.animalId, row.orderedTestKey, { resultStatus: e.target.value })}
                          aria-label={row.geneName}
                        >
                          <option value="">{t("lab.results.selectResult", { defaultValue: "Select result…" })}</option>
                          {options.map((value) => (
                            <option key={value} value={value}>{optionLabel(row, value)}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="justify-self-start text-xs text-neutral-500 underline-offset-2 hover:underline sm:justify-self-end"
                          onClick={() => updateRow(group.animalId, row.orderedTestKey, { noteOpen: !row.noteOpen })}
                        >
                          {row.noteOpen
                            ? t("lab.results.hideNote", { defaultValue: "Hide note" })
                            : t("lab.results.addNote", { defaultValue: "Add note" })}
                        </button>
                      </div>
                      {preview ? (
                        <div className="mt-1 text-xs text-neutral-600">
                          {t("lab.results.breederSees", { defaultValue: "Breeder sees:" })}{" "}
                          <span className="font-medium text-neutral-800">{preview}</span>
                        </div>
                      ) : null}
                      {row.noteOpen ? (
                        <input
                          className="mt-2 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                          placeholder={t("lab.results.geneNotesPlaceholder", { defaultValue: "Per-gene notes (optional)" })}
                          value={row.notes}
                          onChange={(e) => updateRow(group.animalId, row.orderedTestKey, { notes: e.target.value })}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}

      {/* Everything that is not an answer lives behind one disclosure. */}
      <details className="rounded-2xl border border-neutral-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-neutral-800">
          {t("lab.results.detailsTitle", { defaultValue: "Test number, method, summary and notes" })}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {t("lab.results.testNumber", { defaultValue: "Test Number" })}
            </span>
            <input
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={testCode}
              onChange={(e) => setTestCode(e.target.value)}
              placeholder="260424PH1061"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {t("lab.results.method", { defaultValue: "Method" })}
            </span>
            <input
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="PCR"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {t("lab.results.summary", { defaultValue: "Result Summary" })}
            </span>
            <textarea
              className="min-h-[64px] w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t("lab.results.summaryPlaceholderShort", { defaultValue: "Short technical summary" })}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {t("lab.results.internalNotes", { defaultValue: "Internal Lab Notes" })}
            </span>
            <textarea
              className="min-h-[64px] w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              value={labNotes}
              onChange={(e) => setLabNotes(e.target.value)}
              placeholder={t("lab.results.internalNotesPlaceholderShort", { defaultValue: "Internal-only comments" })}
            />
          </label>
        </div>
      </details>

      {submitError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{submitError}</div>
      ) : null}
      {submitSuccess ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{submitSuccess}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm disabled:opacity-60"
          disabled={Boolean(submitLoading)}
          onClick={() => runSave("draft")}
        >
          {submitLoading === "draft"
            ? t("lab.results.saving", { defaultValue: "Saving…" })
            : t("lab.results.saveDraft", { defaultValue: "Save Draft" })}
        </button>
        <button
          type="button"
          className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={Boolean(submitLoading)}
          onClick={() => runSave("submit")}
        >
          {submitLoading === "submit"
            ? t("lab.results.submitting", { defaultValue: "Submitting…" })
            : t("lab.results.submitResult", { defaultValue: "Submit Result" })}
        </button>
        <span className="text-xs text-neutral-500">
          {allFilled
            ? t("lab.results.sheetReady", { defaultValue: "Submitting completes the order and sends every answer to the breeder." })
            : t("lab.results.sheetIncomplete", { defaultValue: "Every gene on every snake needs an answer before you can submit." })}
        </span>
      </div>
    </div>
  );
}
