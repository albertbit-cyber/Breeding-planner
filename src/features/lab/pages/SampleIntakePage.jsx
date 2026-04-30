import React, { useCallback, useMemo, useState } from "react";
import { createLabApiClient } from "../api/client";
import LabQrScanner from "../components/LabQrScanner.jsx";
import {
  SAMPLE_STATUS_LABELS,
  SAMPLE_STATUS_TONES,
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_PAYMENT_STATUS_TONES,
} from "../../../types/labStatus";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from "../constants/orderStatuses";
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

const StatusBadge = ({ status }) => {
  const label = ORDER_STATUS_LABELS[status] || status;
  const tone = ORDER_STATUS_TONES[status] || "neutral";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

const PaymentBadge = ({ paymentStatus }) => {
  const normalized = paymentStatus || "pending";
  const label = ORDER_PAYMENT_STATUS_LABELS[normalized] || normalized;
  const tone = ORDER_PAYMENT_STATUS_TONES[normalized] || "neutral";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

const SampleBadge = ({ status }) => {
  const normalized = status || "expected";
  const label = SAMPLE_STATUS_LABELS[normalized] || normalized;
  const tone = SAMPLE_STATUS_TONES[normalized] || "neutral";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

export default function SampleIntakePage() {
  const [qrToken, setQrToken] = useState("");
  const [resolved, setResolved] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  const [received, setReceived] = useState(true);
  const [sampleCondition, setSampleCondition] = useState("acceptable");
  const [intakeNotes, setIntakeNotes] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const canLookup = useMemo(() => {
    const normalized = String(qrToken || "").trim();
    return canResolveLabQrInput(normalized);
  }, [qrToken]);

  const resetIntakeFeedback = useCallback(() => {
    setSubmitError("");
    setSubmitSuccess("");
  }, []);

  const resolveSingleValue = useCallback(async (rawValue) => {
    const normalized = String(rawValue || "").trim();
    resetIntakeFeedback();
    setLookupError("");
    setResolved(null);

    let lookupModeLabel = "";
    try {
      const parsed = toLabQrResolvePayload(normalized);
      lookupModeLabel = parsed.qrToken ? "token" : parsed.sampleId ? "sampleId" : "payload";
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Enter a valid QR token, sample ID, or payload.");
      return;
    }

    setLookupLoading(true);
    try {
      const api = createLabApiClient();
      const result = await api.resolveLabSampleByQrToken(normalized);
      setResolved(result);
      setReceived(true);
      setSampleCondition("acceptable");
      setIntakeNotes("");
    } catch (error) {
      setLookupError(
        error instanceof Error ? error.message : `Unable to resolve QR ${lookupModeLabel || "input"}.`
      );
    } finally {
      setLookupLoading(false);
    }
  }, [resetIntakeFeedback]);

  const handleScanResult = useCallback((decoded) => {
    const normalized = String(decoded || "").trim();
    if (!normalized) return;
    setQrToken(normalized);
    resolveSingleValue(normalized);
  }, [resolveSingleValue]);

  const handleResolve = async (event) => {
    event?.preventDefault?.();
    const normalized = String(qrToken || "").trim();
    resolveSingleValue(normalized);
  };

  const handleSubmitIntake = async (event) => {
    event.preventDefault();
    resetIntakeFeedback();

    if (!resolved?.testOrder?.id) {
      setSubmitError("Resolve a sample token before submitting intake.");
      return;
    }
    if (!received) {
      setSubmitError("Mark sample as received to continue.");
      return;
    }

    setSubmitLoading(true);
    try {
      const api = createLabApiClient();
      const sampleId = String(resolved.sample.id || "").trim();
      const updatedOrder = await api.submitLabSampleIntake({
        orderId: resolved.testOrder.id,
        sampleCondition,
        notes: String(intakeNotes || "").trim() || undefined,
        received,
      });
      const refreshed = sampleId
        ? await api.resolveLabSampleBySampleId(sampleId)
        : null;

      if (refreshed) {
        setResolved(refreshed);
      } else {
        setResolved((prev) => prev ? {
          ...prev,
          testOrder: {
            ...prev.testOrder,
            ...updatedOrder,
          },
        } : prev);
      }

      if (updatedOrder.status === "in_progress") {
        setSubmitSuccess("Sample received and moved into testing.");
      } else if (updatedOrder.status === "received") {
        setSubmitSuccess("Sample received. Intake remains pending because the sample was marked insufficient.");
      } else {
        setSubmitSuccess(`Sample intake updated. Order status is now ${updatedOrder.status}.`);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Intake submission failed.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const openOrderDetails = () => {
    const orderId = resolved?.testOrder?.id;
    if (!orderId || typeof window === "undefined") return;
    window.location.hash = `/lab/orders/${encodeURIComponent(orderId)}`;
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-neutral-900">Sample Intake</h1>
      <p className="text-sm text-neutral-600">
        Resolve a QR token, verify linked order context, and submit intake outcome. Scanner hookup can plug into this token field later.
      </p>

      <form className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm" onSubmit={handleResolve}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">QR Token Lookup</div>
        </div>
        <div className="mt-2">
          <LabQrScanner onScan={handleScanResult} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-neutral-200" />
          <span className="text-xs text-neutral-500">or enter manually</span>
          <div className="h-px flex-1 bg-neutral-200" />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono"
            placeholder="Paste 64-char QR token, sample ID, or full QR payload JSON"
            value={qrToken}
            onChange={(event) => setQrToken(event.target.value)}
          />
          <button
            type="submit"
            disabled={!canLookup || lookupLoading}
            className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {lookupLoading ? "Resolving..." : "Resolve Token"}
          </button>
        </div>
        <div className="mt-2 text-xs text-neutral-500">
          Accepts normalized 64-char QR token, raw QR payload string, or manual sample ID.
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
              <div className="text-sm font-semibold text-neutral-900">Linked Order Context</div>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={resolved.testOrder?.status} />
                <PaymentBadge paymentStatus={resolved.testOrder?.paymentStatus || "pending"} />
                <SampleBadge status={resolved.sample?.status} />
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm text-neutral-700">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Order</dt>
                <dd>{resolved.testOrder?.orderNumber || resolved.testOrder?.id}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Order Date</dt>
                <dd>{formatDate(resolved.testOrder?.submittedAt || resolved.testOrder?.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Sample ID</dt>
                <dd className="font-mono text-xs">{resolved.sample?.id || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Sample Status</dt>
                <dd>{SAMPLE_STATUS_LABELS[resolved.sample?.status || "expected"] || resolved.sample?.status || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Received At</dt>
                <dd>{formatDate(resolved.sample?.receivedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Snake</dt>
                <dd>
                  {resolved.animal?.name || "Unknown"}
                  <span className="ml-2 text-xs text-neutral-500">({resolved.animal?.id || resolved.testOrder?.animalId || "-"})</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Breeder</dt>
                <dd>{resolved.breeder?.displayName || resolved.breeder?.userId || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Requested Tests</dt>
                <dd>{(resolved.requestedTests || resolved.testOrder?.requestedTests || []).join(", ") || "-"}</dd>
              </div>
            </dl>

            <button
              type="button"
              className="mt-3 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs"
              onClick={openOrderDetails}
            >
              Open Full Order Details
            </button>
          </section>

          <form className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm" onSubmit={handleSubmitIntake}>
            <div className="text-sm font-semibold text-neutral-900">Intake Decision</div>

            <label className="mt-3 flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                checked={received}
                onChange={(event) => setReceived(event.target.checked)}
              />
              Sample received
            </label>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Sample Condition</span>
              <select
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                value={sampleCondition}
                onChange={(event) => setSampleCondition(event.target.value)}
              >
                <option value="acceptable">Acceptable</option>
                <option value="borderline">Borderline</option>
                <option value="degraded">Degraded</option>
                <option value="insufficient">Insufficient</option>
              </select>
            </label>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Intake Notes</span>
              <textarea
                className="min-h-[96px] w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                placeholder="Tube label verified, sample volume, contamination notes, etc."
                value={intakeNotes}
                onChange={(event) => setIntakeNotes(event.target.value)}
              />
            </label>

            <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              Acceptable, borderline, and degraded samples move the hosted order into active processing. Insufficient samples stay at received so the lab can follow up before testing.
            </div>

            {submitError ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {submitError}
              </div>
            ) : null}
            {submitSuccess ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {submitSuccess}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitLoading || !received}
              className="mt-3 rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitLoading ? "Submitting Intake..." : "Submit Intake Decision"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
