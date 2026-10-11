import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createLabApiClient } from "../api/client";
import LabQrScanner from "../components/LabQrScanner.jsx";
import { SAMPLE_STATUS_TONES, ORDER_PAYMENT_STATUS_TONES } from "../../../types/labStatus";
import { ORDER_STATUS_TONES } from "../constants/orderStatuses";
import { orderStatusLabel, paymentStatusLabel, sampleStatusLabel } from "../constants/statusLabelsI18n";
import { canResolveLabQrInput, toLabQrResolvePayload } from "../utils/qrLookupInput";

const toneClass = {
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
};

const Badge = ({ label, tone }) => (
  <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
    {label}
  </span>
);

/**
 * The manual way in, for a tube whose code will not scan: type the sample id
 * or paste the token, then do what the scan would have done. The scan button
 * is the normal path (GlobalScanOverlay).
 */
export default function SampleIntakePage({ presetToken }) {
  const { t } = useTranslation();
  const [qrToken, setQrToken] = useState("");
  const [resolved, setResolved] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const canLookup = useMemo(() => canResolveLabQrInput(String(qrToken || "").trim()), [qrToken]);

  const resolveSingleValue = useCallback(async (rawValue) => {
    const normalized = String(rawValue || "").trim();
    setActionError("");
    setActionSuccess("");
    setLookupError("");
    setResolved(null);

    try {
      toLabQrResolvePayload(normalized);
    } catch (err) {
      setLookupError(
        err instanceof Error
          ? err.message
          : t("lab.intake.invalidInput", { defaultValue: "Enter a valid QR token, sample ID, or payload." })
      );
      return;
    }

    setLookupLoading(true);
    try {
      const api = createLabApiClient();
      setResolved(await api.resolveLabSampleByQrToken(normalized));
    } catch (error) {
      setLookupError(
        error instanceof Error
          ? error.message
          : t("lab.intake.resolveFailed", { defaultValue: "Unable to resolve QR {{mode}}.", mode: "input" })
      );
    } finally {
      setLookupLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const normalized = String(presetToken || "").trim();
    if (!normalized) return;
    setQrToken(normalized);
    resolveSingleValue(normalized);
  }, [presetToken, resolveSingleValue]);

  const handleScanResult = useCallback((decoded) => {
    const normalized = String(decoded || "").trim();
    if (!normalized) return;
    setQrToken(normalized);
    resolveSingleValue(normalized);
  }, [resolveSingleValue]);

  const handleResolve = async (event) => {
    event?.preventDefault?.();
    resolveSingleValue(String(qrToken || "").trim());
  };

  const refresh = async () => {
    const sampleId = String(resolved?.sample?.id || "").trim();
    if (!sampleId) return;
    const api = createLabApiClient();
    setResolved(await api.resolveLabSampleBySampleId(sampleId));
  };

  const startTesting = async () => {
    const orderId = String(resolved?.testOrder?.id || "").trim();
    if (!orderId) return;
    setActionLoading("start");
    setActionError("");
    setActionSuccess("");
    try {
      const api = createLabApiClient();
      await api.updateLabOrderWorkflowStatus({ orderId, status: "in_progress" });
      await refresh();
      setActionSuccess(t("lab.intake.successTesting", { defaultValue: "Sample received and moved into testing." }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("lab.intake.submitFailed", { defaultValue: "Intake submission failed." }));
    } finally {
      setActionLoading("");
    }
  };

  const holdAtReceived = async () => {
    const orderId = String(resolved?.testOrder?.id || "").trim();
    if (!orderId) return;
    setActionLoading("hold");
    setActionError("");
    setActionSuccess("");
    try {
      const api = createLabApiClient();
      await api.holdSampleAtReceived(orderId);
      await refresh();
      setActionSuccess(
        t("lab.intake.successHeld", {
          defaultValue: "Sample marked received and held. Nothing will be tested until you move the order on.",
        })
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("lab.intake.submitFailed", { defaultValue: "Intake submission failed." }));
    } finally {
      setActionLoading("");
    }
  };

  const openOrderDetails = () => {
    const orderId = resolved?.testOrder?.id;
    if (!orderId || typeof window === "undefined") return;
    window.location.hash = `/lab/orders/${encodeURIComponent(orderId)}`;
  };

  const openResults = () => {
    const orderId = String(resolved?.testOrder?.id || "").trim();
    if (!orderId || typeof window === "undefined") return;
    const query = new URLSearchParams({ orderId });
    const animalId = String(resolved?.animal?.id || "").trim();
    if (animalId) query.set("animalId", animalId);
    window.location.hash = `/lab/result-entry?${query.toString()}`;
  };

  const status = String(resolved?.testOrder?.status || "").trim();
  const paymentStatus = resolved?.testOrder?.paymentStatus || "pending";
  const sampleStatus = resolved?.sample?.status || "expected";

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-neutral-900">
        {t("lab.shell.nav.sampleIntake", { defaultValue: "Sample Intake" })}
      </h1>
      <p className="text-sm text-neutral-600">
        {t("lab.intake.subtitleManual", {
          defaultValue:
            "The Scan button does this in one step. Use this page when a label will not scan: type the sample ID, then start testing.",
        })}
      </p>

      <form className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm" onSubmit={handleResolve}>
        <div className="text-xs uppercase tracking-wide text-neutral-500">
          {t("lab.intake.lookupTitle", { defaultValue: "QR Token Lookup" })}
        </div>
        <div className="mt-2">
          <LabQrScanner onScan={handleScanResult} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-neutral-200" />
          <span className="text-xs text-neutral-500">{t("lab.intake.orManual", { defaultValue: "or enter manually" })}</span>
          <div className="h-px flex-1 bg-neutral-200" />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono"
            placeholder={t("lab.intake.tokenPlaceholder", {
              defaultValue: "Paste 64-char QR token, sample ID, or full QR payload JSON",
            })}
            value={qrToken}
            onChange={(event) => setQrToken(event.target.value)}
          />
          <button
            type="submit"
            disabled={!canLookup || lookupLoading}
            className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {lookupLoading
              ? t("lab.intake.resolving", { defaultValue: "Resolving..." })
              : t("lab.intake.resolve", { defaultValue: "Resolve Token" })}
          </button>
        </div>
        {lookupError ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {lookupError}
          </div>
        ) : null}
      </form>

      {resolved ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-neutral-900">
                {t("lab.intake.linkedOrder", { defaultValue: "Linked Order Context" })}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge label={orderStatusLabel(t, status)} tone={ORDER_STATUS_TONES[status] || "neutral"} />
                <Badge label={paymentStatusLabel(t, paymentStatus)} tone={ORDER_PAYMENT_STATUS_TONES[paymentStatus] || "neutral"} />
                <Badge label={sampleStatusLabel(t, sampleStatus)} tone={SAMPLE_STATUS_TONES[sampleStatus] || "neutral"} />
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm text-neutral-700">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {t("lab.common.colOrder", { defaultValue: "Order" })}
                </dt>
                <dd><bdi>{resolved.testOrder?.orderNumber || resolved.testOrder?.id}</bdi></dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {t("lab.intake.orderDate", { defaultValue: "Order Date" })}
                </dt>
                <dd>{formatDate(resolved.testOrder?.submittedAt || resolved.testOrder?.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {t("lab.intake.sampleId", { defaultValue: "Sample ID" })}
                </dt>
                <dd className="font-mono text-xs"><bdi>{resolved.sample?.id || "-"}</bdi></dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {t("lab.intake.receivedAt", { defaultValue: "Received At" })}
                </dt>
                <dd>{formatDate(resolved.sample?.receivedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {t("lab.common.colSnake", { defaultValue: "Snake" })}
                </dt>
                <dd>
                  {resolved.animal?.name || t("lab.intake.unknownAnimal", { defaultValue: "Unknown" })}
                  <span className="ms-2 text-xs text-neutral-500">(<bdi>{resolved.animal?.id || "-"}</bdi>)</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {t("lab.intake.breeder", { defaultValue: "Breeder" })}
                </dt>
                <dd>{resolved.breeder?.displayName || resolved.breeder?.userId || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {t("lab.common.requestedTests", { defaultValue: "Requested Tests" })}
                </dt>
                <dd>{(resolved.requestedTests || resolved.testOrder?.requestedTests || []).join(", ") || "-"}</dd>
              </div>
            </dl>

            <button
              type="button"
              className="mt-3 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs"
              onClick={openOrderDetails}
            >
              {t("lab.intake.openFullOrder", { defaultValue: "Open Full Order Details" })}
            </button>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-neutral-900">
              {t("lab.intake.nextStepTitle", { defaultValue: "Next step" })}
            </div>

            {status === "submitted" || status === "received" ? (
              <div className="mt-3 space-y-3">
                <button
                  type="button"
                  onClick={startTesting}
                  disabled={Boolean(actionLoading)}
                  className="w-full rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionLoading === "start"
                    ? t("lab.intake.submitting", { defaultValue: "Submitting Intake..." })
                    : t("lab.intake.startTesting", { defaultValue: "Received, start testing" })}
                </button>
                {status === "submitted" ? (
                  <button
                    type="button"
                    onClick={holdAtReceived}
                    disabled={Boolean(actionLoading)}
                    className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionLoading === "hold"
                      ? t("lab.scan.holding", { defaultValue: "Holding…" })
                      : t("lab.intake.holdSample", { defaultValue: "Received, but hold it (problem with sample)" })}
                  </button>
                ) : null}
                <p className="text-xs text-neutral-500">
                  {t("lab.scan.problemHelp", {
                    defaultValue:
                      "Problem with sample keeps the order at Sample Received so nothing is tested until you have followed up with the breeder.",
                  })}
                </p>
              </div>
            ) : status === "in_progress" ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-neutral-700">
                  {t("lab.intake.alreadyTesting", { defaultValue: "This sample is already in testing." })}
                </p>
                <button
                  type="button"
                  onClick={openResults}
                  className="w-full rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
                >
                  {t("lab.intake.enterResults", { defaultValue: "Enter results" })}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-neutral-700">
                {t("lab.intake.nothingToDo", {
                  defaultValue: "This order is {{status}}. There is nothing to receive.",
                  status: orderStatusLabel(t, status),
                })}
              </p>
            )}

            {actionError ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {actionError}
              </div>
            ) : null}
            {actionSuccess ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {actionSuccess}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
