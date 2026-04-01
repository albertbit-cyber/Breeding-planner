import React, { useEffect, useMemo, useState } from "react";
import { createLabApiClient } from "../api/client";
import {
  TEST_ORDER_STATUS_LABELS,
  TEST_ORDER_STATUS_TONES,
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_PAYMENT_STATUS_TONES,
} from "../../../types/labStatus";

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
  const sampleReceivedEntry = [...history]
    .reverse()
    .find((entry) => entry?.toStatus === "sample_received");

  if (!sampleReceivedEntry?.reason) {
    return {
      condition: null,
      notes: "",
      receivedAt: sampleReceivedEntry?.changedAt || null,
      approvedAt: [...history].reverse().find((entry) => entry?.toStatus === "intake_approved")?.changedAt || null,
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
      approvedAt: [...history].reverse().find((entry) => entry?.toStatus === "intake_approved")?.changedAt || null,
    };
  }

  const payload = reason.slice(idx + marker.length);
  const [conditionRaw, notesRaw] = payload.split("|").map((part) => String(part || "").trim());
  return {
    condition: conditionRaw || null,
    notes: notesRaw || "",
    receivedAt: sampleReceivedEntry?.changedAt || null,
    approvedAt: [...history].reverse().find((entry) => entry?.toStatus === "intake_approved")?.changedAt || null,
  };
};

const StatusBadge = ({ status }) => {
  const label = TEST_ORDER_STATUS_LABELS[status] || status;
  const tone = TEST_ORDER_STATUS_TONES[status] || "neutral";
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

  const normalizedOrderId = useMemo(() => String(orderId || "").trim(), [orderId]);

  const loadPage = async () => {
    if (!normalizedOrderId) {
      setError("Order ID is missing from route.");
      setLoading(false);
      return;
    }

    setLoading(true);
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
  };

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedOrderId]);

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
      await loadPage();
      setActionReason("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Status update failed.");
    } finally {
      setActionLoading("");
    }
  };

  const goToResultEntry = () => {
    if (typeof window === "undefined") return;
    window.location.hash = "/lab/result-entry";
  };

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Shed Test Order Details</h1>
            <p className="mt-1 text-sm text-neutral-600">Operational order view for intake, testing progression, and timeline review.</p>
            <div className="mt-2 text-xs font-mono text-neutral-500">Order route ID: {normalizedOrderId || "(missing)"}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
              onClick={goToResultEntry}
            >
              Open Result Entry
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">Loading order details...</div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {!loading && !error && order ? (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-neutral-900">Order Overview</h2>
              <dl className="mt-3 grid gap-2 text-sm text-neutral-700">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Order Number</dt>
                  <dd>{order.orderNumber || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Internal Order ID</dt>
                  <dd className="font-mono text-xs">{order.id}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Workflow Status</dt>
                  <dd><StatusBadge status={order.status} /></dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Payment Status</dt>
                  <dd><PaymentBadge paymentStatus={paymentStatus} /></dd>
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
              <h2 className="text-lg font-semibold text-neutral-900">Snake & Breeder</h2>
              <dl className="mt-3 grid gap-2 text-sm text-neutral-700">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Snake</dt>
                  <dd>{order.animalId || "-"} <span className="text-xs text-neutral-500">(shared backend)</span></dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Snake Code</dt>
                  <dd>-</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Breeder</dt>
                  <dd>{order.breederUserId || order.requestedByUserId || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Breeder Contact Key</dt>
                  <dd>{order.requestedByUserId || order.breederUserId || "-"}</dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-neutral-900">Sample & Intake Details</h2>
              <dl className="mt-3 grid gap-2 text-sm text-neutral-700">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Sample IDs</dt>
                  <dd>{(order.sampleIds || []).length ? order.sampleIds.join(", ") : "No sample IDs linked yet."}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">QR Token</dt>
                  <dd className="font-mono text-xs break-all">{sampleQrToken || "Token available once sample lookup resolves."}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Sample Received At</dt>
                  <dd>{formatDateTime(intakeInfo.receivedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Intake Approved At</dt>
                  <dd>{formatDateTime(intakeInfo.approvedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Sample Condition</dt>
                  <dd>{intakeInfo.condition || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Intake Notes</dt>
                  <dd>{intakeInfo.notes || "No intake notes captured yet."}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-neutral-900">Workflow Actions</h2>
              <p className="mt-1 text-xs text-neutral-600">
                Shared backend mode persists the hosted workflow stages only: sample received, testing in progress, completed, and cancelled.
              </p>

              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Action Note / Reason</span>
                <input
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                  placeholder="Optional transition note"
                />
              </label>

              {actionError ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</div>
              ) : null}

              <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                Payment status changes and persisted lab result records are not exposed by the shared backend yet. Use the workflow buttons below for the hosted status path.
              </div>

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
                      : `Set ${TEST_ORDER_STATUS_LABELS[nextStatus] || nextStatus}`}
                  </button>
                )) : (
                  <div className="text-sm text-neutral-500">No further workflow actions available from current status.</div>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">Test Results & Certificate</h2>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Latest Result</div>
                {orderOutcome?.latestResult ? (
                  <>
                    <div className="mt-1 text-sm font-semibold text-neutral-900">{orderOutcome.latestResult.testCode}</div>
                    <div className="text-xs text-neutral-600">Status: {orderOutcome.latestResult.status}</div>
                    <div className="mt-2 text-sm text-neutral-700">{orderOutcome.latestResult.summary || "No summary provided."}</div>
                    <div className="mt-2 text-xs text-neutral-600">
                      Findings: {(orderOutcome.latestResult.findings || []).map((f) => `${f.marker}: ${f.outcome}`).join("; ") || "-"}
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
                  </>
                ) : (
                  <div className="mt-1 text-sm text-neutral-600">Certificate not issued yet.</div>
                )}
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Result History</div>
              {(orderOutcome?.resultHistory || []).length ? (
                <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                  {orderOutcome.resultHistory.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-neutral-200 bg-white px-2 py-1">
                      <span className="font-medium">{entry.testCode}</span>
                      <span className="text-xs text-neutral-500"> ({entry.status})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-1 text-sm text-neutral-600">No result history entries yet.</div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">Status History Timeline</h2>
            {!history.length ? (
              <div className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-600">
                No status history entries yet.
              </div>
            ) : (
              <ol className="mt-3 space-y-2">
                {history.map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={entry.toStatus} />
                      <span className="text-xs text-neutral-500">{formatDateTime(entry.changedAt)}</span>
                    </div>
                    <div className="mt-1 text-neutral-700">
                      {entry.fromStatus ? `From ${entry.fromStatus} -> ` : ""}
                      <span className="font-medium">{entry.toStatus}</span>
                    </div>
                    {entry.reason ? <div className="mt-1 text-xs text-neutral-600">Reason: {entry.reason}</div> : null}
                    {entry.changedByUserId ? <div className="mt-1 text-xs text-neutral-500">By: {entry.changedByUserId}</div> : null}
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
