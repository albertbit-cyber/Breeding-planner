import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLabApiClient, formatLabOutcomeLabel, formatLabTestNumber } from "../api/client";
import { useAutoRefetch } from "../hooks/useAutoRefetch";
import InlineResultEntry, { ELIGIBLE_STATUSES as RESULT_ENTRY_STATUSES } from "../components/InlineResultEntry";
import { getCurrentAppRole, canAccessLabApp } from "../auth/roleGuard";
import {
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_PAYMENT_STATUS_TONES,
} from "../../../types/labStatus";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from "../constants/orderStatuses";

const toneClass = {
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
};

const parseIntakeFromHistory = (history = []) => {
  const reversed = [...history].reverse();
  const sampleReceivedEntry = reversed.find(
    (entry) => entry?.toStatus === "received" || entry?.toStatus === "sample_received"
  );

  if (!sampleReceivedEntry?.reason) {
    return {
      condition: null,
      notes: "",
      receivedAt: sampleReceivedEntry?.changedAt || null,
      approvedAt: reversed.find((entry) => entry?.toStatus === "in_progress" || entry?.toStatus === "intake_approved")?.changedAt || null,
    };
  }

  const reason = String(sampleReceivedEntry.reason);
  const marker = "intake_sample_received:";
  const idx = reason.indexOf(marker);
  if (idx < 0) {
    return {
      condition: null,
      notes: "",
      receivedAt: sampleReceivedEntry?.changedAt || null,
      approvedAt: reversed.find((entry) => entry?.toStatus === "in_progress" || entry?.toStatus === "intake_approved")?.changedAt || null,
    };
  }

  const payload = reason.slice(idx + marker.length);
  const [conditionRaw, notesRaw] = payload.split("|").map((part) => String(part || "").trim());
  return {
    condition: conditionRaw || null,
    notes: notesRaw || "",
    receivedAt: sampleReceivedEntry?.changedAt || null,
    approvedAt: reversed.find((entry) => entry?.toStatus === "in_progress" || entry?.toStatus === "intake_approved")?.changedAt || null,
  };
};

const formatFindingSummary = (findings = []) =>
  (Array.isArray(findings) ? findings : [])
    .map((entry) => `${entry.marker}: ${formatLabOutcomeLabel(entry.outcome)}`)
    .join("; ");

const base64ToBlob = (base64, mimeType) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType || "application/pdf" });
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
  const label = ORDER_PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus;
  const tone = ORDER_PAYMENT_STATUS_TONES[paymentStatus] || "neutral";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

export default function OrderDetailsPage({ orderId }) {
  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState([]);
  const [orderOutcome, setOrderOutcome] = useState(null);
  const [resolvedSample, setResolvedSample] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [actionError, setActionError] = useState("");
  const [allowedStatuses, setAllowedStatuses] = useState([]);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [certificateAction, setCertificateAction] = useState({ loading: false, error: "" });
  const [paymentAction, setPaymentAction] = useState({ loading: false, error: "" });

  const normalizedOrderId = useMemo(() => String(orderId || "").trim(), [orderId]);

  // Track whether the initial load has completed so background auto-refreshes
  // don't set loading=true, which would unmount InlineResultEntry and wipe
  // any unsaved result entry form state.
  const hasLoadedOnce = useRef(false);

  // Reset the "loaded" flag whenever the order being viewed changes.
  useEffect(() => {
    hasLoadedOnce.current = false;
  }, [normalizedOrderId]);

  const loadAll = useCallback(async () => {
    if (!normalizedOrderId) {
      setError("Order ID is missing from route.");
      setLoading(false);
      return;
    }

    // Only show the full-page loading skeleton on the very first load.
    // Background refreshes (polling / focus / event) must NOT toggle loading,
    // because that unmounts InlineResultEntry and erases unsaved form input.
    if (!hasLoadedOnce.current) setLoading(true);
    setError("");
    try {
      const api = createLabApiClient();
      const [orderData, historyData] = await Promise.all([
        api.getLabTestOrderDetails(normalizedOrderId),
        api.getLabOrderStatusHistory(normalizedOrderId),
      ]);

      setOrder(orderData);
      setHistory(Array.isArray(historyData) ? historyData : []);

      const outcomeData = await api.getLabOrderOutcome(orderData.id);

      const firstSampleId = Array.isArray(orderData.sampleIds) && orderData.sampleIds.length
        ? String(orderData.sampleIds[0]).trim()
        : "";
      const sampleData = firstSampleId
        ? await api.resolveLabSampleBySampleId(firstSampleId).catch(() => null)
        : null;

      const nextStatuses = await api.getLabAllowedWorkflowStatuses(orderData.id);

      setOrderOutcome(outcomeData || null);
      setResolvedSample(sampleData || null);
      setAllowedStatuses(Array.isArray(nextStatuses) ? nextStatuses : []);
      hasLoadedOnce.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order details.");
      setOrder(null);
      setHistory([]);
      setOrderOutcome(null);
      setResolvedSample(null);
      setAllowedStatuses([]);
    } finally {
      setLoading(false);
    }
  }, [normalizedOrderId]);

  const { refetch: refetchPage } = useAutoRefetch(loadAll, {
    intervalMs: 20_000,
    events: ["lab:test-order-updated"],
  });

  const paymentStatus = order?.paymentStatus || "pending";
  const intakeInfo = parseIntakeFromHistory(history);
  const sampleQrToken = resolvedSample?.sample?.qrToken || "";
  const nextStatuses = allowedStatuses;

  const handleAdvanceStatus = async (nextStatus) => {
    if (!order?.id) return;
    setActionLoading(nextStatus);
    setActionError("");
    try {
      const api = createLabApiClient();
      await api.updateLabOrderWorkflowStatus({
        orderId: order.id,
        status: nextStatus,
        reason: String(actionReason || "").trim() || undefined,
      });
      await loadAll();
      setActionReason("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Status update failed.");
    } finally {
      setActionLoading("");
    }
  };

  const currentRole = getCurrentAppRole();
  const isLabOrAdmin = canAccessLabApp(currentRole);
  const canEnterResults = isLabOrAdmin && order && RESULT_ENTRY_STATUSES.has(order.status);
  const canDeleteOrder = isLabOrAdmin && Boolean(order?.id);

  const handleDeleteOrder = async () => {
    if (!order?.id || deleteLoading) return;

    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(
        "Delete this lab order permanently?\n\nThe order will be removed from the lab portal and breeder history.\n\nThis cannot be undone."
      );

    if (!confirmed) return;

    setDeleteLoading(true);
    setDeleteError("");
    try {
      const api = createLabApiClient();
      await api.deleteLabOrder(order.id);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lab:test-order-updated", {
          detail: { orderId: order.id, deleted: true },
        }));
        window.location.hash = "/lab/incoming-orders";
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete order.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleMarkAsPaid = async (newStatus) => {
    if (!order?.id || paymentAction.loading) return;
    setPaymentAction({ loading: true, error: "" });
    try {
      const api = createLabApiClient();
      await api.updateLabOrderPaymentStatus({ orderId: order.id, paymentStatus: newStatus });
      await loadAll();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lab:test-order-updated", { detail: { orderId: order.id } }));
      }
    } catch (err) {
      setPaymentAction({ loading: false, error: err instanceof Error ? err.message : "Payment update failed." });
      return;
    }
    setPaymentAction({ loading: false, error: "" });
  };

  const handleCertificateAction = async (mode) => {
    if (!order?.id || certificateAction.loading) return;

    setCertificateAction({ loading: true, error: "" });
    try {
      const api = createLabApiClient();
      const artifact = await api.getBreederCertificateArtifact(order.id);
      const blob = base64ToBlob(artifact.base64, artifact.mimeType);
      const blobUrl = URL.createObjectURL(blob);

      if (mode === "download") {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = artifact.fileName || `${artifact.certificateNumber || "certificate"}.pdf`;
        link.click();
      } else {
        window.open(blobUrl, "_blank", "noopener,noreferrer");
      }

      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
      setCertificateAction({ loading: false, error: "" });
    } catch (err) {
      setCertificateAction({
        loading: false,
        error: err instanceof Error ? err.message : "Unable to load certificate.",
      });
    }
  };

  // Workflow step indicator
  const WORKFLOW_STEPS = [
    { key: "submitted", label: "Submitted" },
    { key: "payment", label: "Payment" },
    { key: "intake", label: "Sample Intake" },
    { key: "testing", label: "Testing" },
    { key: "results", label: "Results" },
    { key: "completed", label: "Certificate" },
  ];

  const getActiveStep = (status) => {
    if (!status) return 0;
    if (status === "completed") return 5;
    if (status === "in_progress" || status === "testing") return 3;
    if (status === "received" || status === "sample_received" || status === "intake_approved") return 2;
    if (status === "pending_payment" || status === "awaiting_payment") return 1;
    if (status === "cancelled") return -1;
    return 0;
  };

  const activeStep = getActiveStep(order?.status);

  return (
    <section className="space-y-4">
      {/* Header */}
      <header className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Order Details</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {order ? <StatusBadge status={order.status} /> : null}
              {order ? <PaymentBadge paymentStatus={paymentStatus} /> : null}
              {order?.orderNumber ? (
                <span className="text-sm text-neutral-500">#{order.orderNumber}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {order?.status === "completed" ? (
              <button
                type="button"
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => handleCertificateAction("download")}
                disabled={certificateAction.loading}
              >
                {certificateAction.loading ? "Loading..." : "Download Certificate PDF"}
              </button>
            ) : null}
            {canDeleteOrder ? (
              <button
                type="button"
                className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleDeleteOrder}
                disabled={deleteLoading}
              >
                {deleteLoading ? "Deleting..." : "Delete Order"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Workflow progress bar */}
        {order && activeStep >= 0 ? (
          <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
            {WORKFLOW_STEPS.map((step, idx) => (
              <React.Fragment key={step.key}>
                <div className={`flex shrink-0 flex-col items-center gap-1 ${idx <= activeStep ? "text-neutral-900" : "text-neutral-400"}`}>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    idx < activeStep ? "bg-emerald-500 text-white" :
                    idx === activeStep ? "bg-neutral-900 text-white" :
                    "bg-neutral-100 text-neutral-400"
                  }`}>
                    {idx < activeStep ? "✓" : idx + 1}
                  </div>
                  <span className="text-xs whitespace-nowrap">{step.label}</span>
                </div>
                {idx < WORKFLOW_STEPS.length - 1 ? (
                  <div className={`h-0.5 flex-1 rounded ${idx < activeStep ? "bg-emerald-400" : "bg-neutral-200"}`} />
                ) : null}
              </React.Fragment>
            ))}
          </div>
        ) : null}
      </header>

      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">Loading order details...</div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {deleteError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{deleteError}</div>
      ) : null}

      {!loading && !error && order ? (
        <>
          {/* Step 1 — Order Submission & Breeder */}
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">1</span>
                <h2 className="text-base font-semibold text-neutral-900">Order Submission</h2>
              </div>
              <dl className="grid gap-2 text-sm text-neutral-700">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Order Number</dt>
                  <dd>{order.orderNumber || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Internal ID</dt>
                  <dd className="font-mono text-xs">{order.id}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Submitted</dt>
                  <dd>{formatDateTime(order.submittedAt || order.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Requested Tests</dt>
                  <dd>{(order.requestedTests || []).join(", ") || "-"}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-600">→</span>
                <h2 className="text-base font-semibold text-neutral-900">Snake & Breeder</h2>
              </div>
              <dl className="grid gap-2 text-sm text-neutral-700">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Animal ID</dt>
                  <dd>{order.animalId || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Breeder User ID</dt>
                  <dd className="font-mono text-xs">{order.breederUserId || order.requestedByUserId || "-"}</dd>
                </div>
              </dl>
            </section>
          </div>

          {/* Step 2 — Payment */}
          {isLabOrAdmin ? (
            <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">2</span>
                  <h2 className="text-base font-semibold text-neutral-900">Payment</h2>
                  <PaymentBadge paymentStatus={paymentStatus} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {paymentStatus !== "paid" && paymentStatus !== "manually_approved" ? (
                    <button
                      type="button"
                      className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      disabled={paymentAction.loading}
                      onClick={() => handleMarkAsPaid("paid")}
                    >
                      {paymentAction.loading ? "Saving..." : "Mark as Paid"}
                    </button>
                  ) : null}
                  {paymentStatus === "paid" ? (
                    <button
                      type="button"
                      className="rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                      disabled={paymentAction.loading}
                      onClick={() => handleMarkAsPaid("pending")}
                    >
                      {paymentAction.loading ? "Saving..." : "Revert to Pending"}
                    </button>
                  ) : null}
                </div>
              </div>
              <dl className="grid gap-2 text-sm text-neutral-700 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Payment Requested</dt>
                  <dd>{formatDateTime(order.paymentRequestedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Paid At</dt>
                  <dd>{formatDateTime(order.paidAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Payment Reference</dt>
                  <dd className="font-mono text-xs">{order.paymentRef || "-"}</dd>
                </div>
              </dl>
              {paymentAction.error ? (
                <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {paymentAction.error}
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Step 3 — Sample Intake */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">3</span>
              <h2 className="text-base font-semibold text-neutral-900">Sample Intake</h2>
            </div>
            <dl className="grid gap-2 text-sm text-neutral-700 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">Sample IDs</dt>
                <dd>{(order.sampleIds || []).length ? order.sampleIds.join(", ") : "No sample IDs linked yet."}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">QR Token</dt>
                <dd className="break-all font-mono text-xs">{sampleQrToken || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">Sample Received</dt>
                <dd>{formatDateTime(intakeInfo.receivedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">Intake Approved</dt>
                <dd>{formatDateTime(intakeInfo.approvedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">Sample Condition</dt>
                <dd>{intakeInfo.condition || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">Intake Notes</dt>
                <dd>{intakeInfo.notes || "-"}</dd>
              </div>
            </dl>
          </section>

          {/* Step 4 — Testing / Workflow Actions */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">4</span>
              <h2 className="text-base font-semibold text-neutral-900">Testing & Workflow</h2>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Transition Note (optional)</span>
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                placeholder="Add a note before advancing the status"
              />
            </label>
            {actionError ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {nextStatuses.length ? nextStatuses.map((nextStatus) => (
                <button
                  key={nextStatus}
                  type="button"
                  disabled={Boolean(actionLoading)}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => handleAdvanceStatus(nextStatus)}
                >
                  {actionLoading === nextStatus
                    ? "Updating..."
                    : `→ ${ORDER_STATUS_LABELS[nextStatus] || nextStatus}`}
                </button>
              )) : (
                <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
                  No further actions available for the current status.
                </div>
              )}
            </div>
          </section>

          {/* Step 5 — Enter Results (lab staff only, when eligible) */}
          {canEnterResults ? (
            <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-700 text-xs font-semibold text-white">5</span>
                <h2 className="text-base font-semibold text-sky-900">Enter Results</h2>
              </div>
              <p className="mb-4 text-sm text-sky-700">Record gene findings for this order. Save a draft to work in stages, or submit to finalise and notify the breeder.</p>
              <InlineResultEntry orderId={order.id} onSaved={loadAll} />
            </section>
          ) : null}

          {/* Step 6 — Results & Certificate */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">6</span>
              <h2 className="text-base font-semibold text-neutral-900">Results & Certificate</h2>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Latest Result</div>
                {orderOutcome?.latestResult ? (
                  <>
                    <div className="mt-1 text-sm font-semibold text-neutral-900">
                      {formatLabTestNumber(
                        orderOutcome.latestResult.testCode,
                        `${order.id}:${orderOutcome.latestResult.id}`,
                        orderOutcome.latestResult.reportedAt || orderOutcome.latestResult.releasedAt || orderOutcome.latestResult.reviewedAt
                      )}
                    </div>
                    <div className="text-xs text-neutral-600">Status: {orderOutcome.latestResult.status}</div>
                    <div className="mt-2 text-sm text-neutral-700">{orderOutcome.latestResult.summary || "No summary provided."}</div>
                    <div className="mt-2 text-xs text-neutral-600">
                      Findings: {formatFindingSummary(orderOutcome.latestResult.findings) || "-"}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-sm text-neutral-600">No finalized result available yet.</div>
                )}
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Certificate</div>
                {orderOutcome?.certificate ? (
                  <>
                    <div className="mt-1 text-sm font-semibold text-neutral-900">{orderOutcome.certificate.certificateNumber}</div>
                    <div className="text-xs text-neutral-600">Status: {orderOutcome.certificate.status}</div>
                    <div className="text-xs text-neutral-600">Issued: {formatDateTime(orderOutcome.certificate.issuedAt)}</div>
                    <div className="mt-1 text-xs text-neutral-600">Verification: {orderOutcome.certificate.verificationCode || "-"}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => handleCertificateAction("view")}
                        disabled={certificateAction.loading}
                      >
                        {certificateAction.loading ? "Loading..." : "View Certificate"}
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => handleCertificateAction("download")}
                        disabled={certificateAction.loading}
                      >
                        Download PDF
                      </button>
                    </div>
                    {certificateAction.error ? (
                      <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {certificateAction.error}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-1 text-sm text-neutral-600">Certificate not issued yet.</div>
                )}
              </div>
            </div>

            {(orderOutcome?.resultHistory || []).length > 0 ? (
              <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Result History</div>
                <ul className="space-y-1 text-sm text-neutral-700">
                  {orderOutcome.resultHistory.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-neutral-200 bg-white px-2 py-1">
                      <span className="font-medium">
                        {formatLabTestNumber(
                          entry.testCode,
                          `${order.id}:${entry.id}`,
                          entry.reportedAt || entry.releasedAt || entry.reviewedAt
                        )}
                      </span>
                      <span className="text-xs text-neutral-500"> ({entry.status})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* Status History Timeline */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-neutral-900">Status History</h2>
            {!history.length ? (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-600">
                No status history entries yet.
              </div>
            ) : (
              <ol className="space-y-2">
                {history.map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={entry.toStatus} />
                      <span className="text-xs text-neutral-500">{formatDateTime(entry.changedAt)}</span>
                    </div>
                    {entry.fromStatus ? (
                      <div className="mt-1 text-xs text-neutral-500">{entry.fromStatus} → {entry.toStatus}</div>
                    ) : null}
                    {entry.reason ? <div className="mt-1 text-xs text-neutral-600">Note: {entry.reason}</div> : null}
                    {entry.changedByUserId ? <div className="mt-1 text-xs text-neutral-400">By: {entry.changedByUserId}</div> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
