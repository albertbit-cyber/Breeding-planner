// @ts-nocheck

import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type {
  AdvisorProgressStep,
  AdvisorProgressSummary,
  AdvisorStepStatus,
} from "../../features/breedingAdvisor/advisorProgressTypes";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BreedingAdvisorProgressModalProps {
  isOpen: boolean;
  isRunning: boolean;
  steps: AdvisorProgressStep[];
  summary: AdvisorProgressSummary | null;
  error: string | null;
  onClose: () => void;
  onRetry?: () => void;
  onViewResults: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function elapsedLabel(step: AdvisorProgressStep): string | null {
  if (!step.startedAt) return null;
  const end = step.completedAt ?? Date.now();
  const sec = ((end - step.startedAt) / 1000).toFixed(1);
  return `${sec}s`;
}

// ─── Status icon ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: AdvisorStepStatus }) {
  if (status === "running") {
    return (
      <span
        className="inline-block w-4 h-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin flex-shrink-0"
        aria-label="Running"
      />
    );
  }
  if (status === "completed") {
    return (
      <svg
        className="w-4 h-4 text-emerald-500 flex-shrink-0"
        viewBox="0 0 16 16"
        fill="none"
        aria-label="Completed"
      >
        <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4.75 8.25 L6.75 10.25 L11.25 5.75"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg
        className="w-4 h-4 text-rose-500 flex-shrink-0"
        viewBox="0 0 16 16"
        fill="none"
        aria-label="Failed"
      >
        <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  // pending
  return (
    <span
      className="inline-block w-4 h-4 rounded-full border-2 border-neutral-300 flex-shrink-0"
      aria-label="Pending"
    />
  );
}

// ─── Step row ─────────────────────────────────────────────────────────────────

function StepRow({ step }: { step: AdvisorProgressStep }) {
  const elapsed = elapsedLabel(step);
  const isActive = step.status === "running";

  return (
    <div
      className={[
        "flex items-start gap-2.5 px-3 py-2 rounded-lg transition-colors text-sm",
        isActive
          ? "bg-sky-50 border border-sky-100"
          : step.status === "failed"
          ? "bg-rose-50 border border-rose-100"
          : step.status === "completed"
          ? "bg-white border border-neutral-100"
          : "bg-white border border-neutral-100 opacity-60",
      ].join(" ")}
    >
      <div className="mt-0.5">
        <StatusIcon status={step.status} />
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={[
            "font-medium leading-snug",
            step.status === "failed"
              ? "text-rose-700"
              : isActive
              ? "text-sky-800"
              : "text-neutral-800",
          ].join(" ")}
        >
          {step.label}
        </div>

        {step.details && (
          <div className="text-xs text-neutral-500 mt-0.5 truncate">{step.details}</div>
        )}

        {/* Progress fraction when running & meta available */}
        {isActive &&
          step.meta &&
          typeof step.meta.completed === "number" &&
          typeof step.meta.total === "number" && (
            <div className="mt-1.5">
              <div className="flex items-center justify-between text-xs text-sky-700 mb-0.5">
                <span>
                  {step.meta.completed as number} / {step.meta.total as number}
                </span>
                <span>
                  {Math.round(
                    ((step.meta.completed as number) / Math.max(1, step.meta.total as number)) *
                      100
                  )}
                  %
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-sky-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      ((step.meta.completed as number) /
                        Math.max(1, step.meta.total as number)) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
      </div>

      <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-xs text-neutral-400">
        {step.startedAt && (
          <span title={`Started at ${formatTs(step.startedAt)}`}>
            {formatTs(step.startedAt)}
          </span>
        )}
        {elapsed && step.status !== "running" && (
          <span className="text-neutral-400">{elapsed}</span>
        )}
      </div>
    </div>
  );
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar({
  summary,
  error,
  isRunning,
}: {
  summary: AdvisorProgressSummary | null;
  error: string | null;
  isRunning: boolean;
}) {
  const { t } = useTranslation(["advisor", "common"]);

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11" r="0.75" fill="currentColor" />
        </svg>
        <span>{error}</span>
      </div>
    );
  }

  if (isRunning && !summary) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 bg-sky-50 border border-sky-100 rounded-xl text-sm text-sky-700">
        <span
          className="inline-block w-3.5 h-3.5 rounded-full border-2 border-sky-500 border-t-transparent animate-spin flex-shrink-0"
          aria-hidden="true"
        />
        {t("progress.running", { ns: "advisor", defaultValue: "Analysis in progress..." })}
      </div>
    );
  }

  if (!summary) return null;

  const scannedText =
    summary.totalSnakesScanned != null
      ? t("progress.scanned", {
          ns: "advisor",
          count: summary.totalSnakesScanned,
          defaultValue: "Processed {{count}} snakes",
        })
      : null;

  const relevantText =
    summary.relevantCandidates != null
      ? t("progress.relevant", {
          ns: "advisor",
          count: summary.relevantCandidates,
          defaultValue: "{{count}} relevant candidates",
        })
      : null;

  const strongText =
    summary.strongPairings != null
      ? t("progress.strongPairings", {
          ns: "advisor",
          count: summary.strongPairings,
          defaultValue: "{{count}} strong pairings found",
        })
      : null;

  if (!scannedText && !relevantText && !strongText) return null;

  return (
    <div className="px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
      <div className="space-y-0.5">
        {scannedText && <div>{scannedText}</div>}
        {relevantText && <div>{relevantText}</div>}
        {strongText && <div>{strongText}</div>}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BreedingAdvisorProgressModal({
  isOpen,
  isRunning,
  steps,
  summary,
  error,
  onClose,
  onRetry,
  onViewResults,
}: BreedingAdvisorProgressModalProps) {
  const { t } = useTranslation(["advisor", "common"]);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest step
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [steps.length]);

  if (!isOpen) return null;

  const canViewResults = !isRunning && !error && steps.length > 0;
  const canRetry = !isRunning && typeof onRetry === "function";

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 appearance-overlay"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-2xl shadow-xl border flex flex-col"
        style={{ maxHeight: "min(90vh, 600px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2.5">
            {isRunning && (
              <span
                className="inline-block w-4 h-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin flex-shrink-0"
                aria-hidden="true"
              />
            )}
            <span className="font-semibold text-neutral-900">
              {t("progress.titleRunning", {
                ns: "advisor",
                defaultValue: "Breeding Advisor Running",
              })}
            </span>
          </div>
          <button
            type="button"
            className="text-sm px-2 py-1 rounded border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition-colors"
            onClick={onClose}
            aria-label={t("actions.close", { ns: "common", defaultValue: "Close" })}
          >
            {t("actions.close", { ns: "common", defaultValue: "Close" })}
          </button>
        </div>

        {/* ── Step list ──────────────────────────────────────────────────── */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 min-h-0"
        >
          {steps.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-neutral-400">
              {t("progress.waiting", { ns: "advisor", defaultValue: "Waiting for analysis to start..." })}
            </div>
          ) : (
            steps.map((step) => <StepRow key={step.id} step={step} />)
          )}
        </div>

        {/* ── Summary ────────────────────────────────────────────────────── */}
        {(summary || error || isRunning) && (
          <div className="px-4 pb-3">
            <SummaryBar summary={summary} error={error} isRunning={isRunning} />
          </div>
        )}

        {/* ── Footer buttons ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t">
          <button
            type="button"
            className="px-3 py-2 rounded-xl text-sm border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors"
            onClick={onClose}
          >
            {t("actions.close", { ns: "common", defaultValue: "Close" })}
          </button>
          <button
            type="button"
            className={[
              "px-3 py-2 rounded-xl text-sm border transition-colors",
              canRetry
                ? "border-sky-300 text-sky-800 hover:bg-sky-50"
                : "border-sky-200 text-sky-400 cursor-not-allowed",
            ].join(" ")}
            onClick={canRetry ? onRetry : undefined}
            disabled={!canRetry}
          >
            {t("progress.retry", { ns: "advisor", defaultValue: "Retry" })}
          </button>
          <button
            type="button"
            className={[
              "px-3 py-2 rounded-xl text-sm appearance-btn",
              canViewResults
                ? "appearance-btn--filled"
                : "appearance-btn--filled opacity-50 cursor-not-allowed",
            ].join(" ")}
            onClick={canViewResults ? onViewResults : undefined}
            disabled={!canViewResults}
          >
            {t("progress.viewResults", { ns: "advisor", defaultValue: "View Results" })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BreedingAdvisorProgressModal;
