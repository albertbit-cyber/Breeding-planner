import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createLabApiClient } from "../api/client";
import SharedBackendGuard from "../../../components/SharedBackendGuard.jsx";
import {
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_PAYMENT_STATUS_TONES,
  TEST_ORDER_STATUS_LABELS,
  TEST_ORDER_STATUS_TONES,
} from "../../../types/labStatus";

const toneClass = {
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
};

const geneticsSnapshotToList = (snapshot) => {
  if (!snapshot) return [];
  return [
    ...(snapshot.morphs || []),
    ...(snapshot.hets || []).map((entry) => `100% het ${entry}`),
    ...(snapshot.possibleHets || []).map((entry) => `${entry} (possible)`),
  ]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
};

const base64ToBlob = (base64, mimeType) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
};

const artifactToBlobUrl = (artifact) => {
  const blob = base64ToBlob(artifact.base64, artifact.mimeType || "application/pdf");
  const blobUrl = URL.createObjectURL(blob);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
  return blobUrl;
};

const downloadArtifact = (artifact, fallbackName) => {
  const blobUrl = artifactToBlobUrl(artifact);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = artifact.fileName || fallbackName || "labels.pdf";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const previewArtifact = (artifact) => {
  const blobUrl = artifactToBlobUrl(artifact);
  window.open(blobUrl, "_blank", "noopener,noreferrer");
};

const StatusBadge = ({ label, tone }) => (
  <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium ${toneClass[tone] || toneClass.neutral}`}>
    {label}
  </span>
);

export default function BreederShedTestingPanel({ snake, refreshToken }) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [detailByOrderId, setDetailByOrderId] = useState({});
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [certificateActionByOrderId, setCertificateActionByOrderId] = useState({});
  const [labelActionByOrderId, setLabelActionByOrderId] = useState({});

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleOrdersChanged = () => setRevision((prev) => prev + 1);
    window.addEventListener("lab:test-order-created", handleOrdersChanged);
    window.addEventListener("lab:test-order-updated", handleOrdersChanged);
    window.addEventListener("lab:test-orders-cleared", handleOrdersChanged);

    return () => {
      window.removeEventListener("lab:test-order-created", handleOrdersChanged);
      window.removeEventListener("lab:test-order-updated", handleOrdersChanged);
      window.removeEventListener("lab:test-orders-cleared", handleOrdersChanged);
    };
  }, []);

  useEffect(() => {
    let isAlive = true;

    const load = async () => {
      const snakeId = String(snake?.id || "").trim();
      if (!snakeId) {
        if (isAlive) setOrders([]);
        return;
      }

      setIsLoading(true);
      setError("");
      setActiveOrderId(null);
      setDetailByOrderId({});

      try {
        const api = createLabApiClient();
        const rows = await api.listBreederTestOrdersForSnake(snakeId);
        if (!isAlive) return;
        setOrders(rows);
      } catch (err) {
        if (!isAlive) return;
        setError(err instanceof Error ? err.message : "Failed to load shed testing orders.");
        setOrders([]);
      } finally {
        if (isAlive) setIsLoading(false);
      }
    };

    load();
    return () => {
      isAlive = false;
    };
  }, [snake?.id, refreshToken, revision]);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aDate = String(a.submittedAt || a.createdAt || "");
      const bDate = String(b.submittedAt || b.createdAt || "");
      return bDate.localeCompare(aDate);
    });
  }, [orders]);

  const openDetails = async (orderId) => {
    const normalized = String(orderId || "").trim();
    if (!normalized) return;

    if (activeOrderId === normalized) {
      setActiveOrderId(null);
      return;
    }

    setActiveOrderId(normalized);
    if (detailByOrderId[normalized]) return;

    setLoadingDetailId(normalized);
    try {
      const api = createLabApiClient();
      const full = await api.getBreederTestOrderDetails(normalized);
      const outcome = await api.getBreederOrderOutcome(normalized);
      setDetailByOrderId((prev) => ({ ...prev, [normalized]: { order: full, outcome } }));
    } catch {
      // Keep the overview row visible; details can be retried.
    } finally {
      setLoadingDetailId(null);
    }
  };

  const previewOrderLabels = async (orderId) => {
    const normalized = String(orderId || "").trim();
    if (!normalized) return;
    setLabelActionByOrderId((prev) => ({ ...prev, [normalized]: { loading: true, error: "" } }));
    try {
      const api = createLabApiClient();
      const artifacts = await api.getBreederAllLabelsArtifact(normalized);
      previewArtifact(artifacts.labelsPdf);
      setLabelActionByOrderId((prev) => ({ ...prev, [normalized]: { loading: false, error: "" } }));
    } catch (err) {
      setLabelActionByOrderId((prev) => ({
        ...prev,
        [normalized]: {
          loading: false,
          error: err instanceof Error ? err.message : "Unable to generate order labels.",
        },
      }));
    }
  };

  const downloadOrderLabels = async (orderId) => {
    const normalized = String(orderId || "").trim();
    if (!normalized) return;
    setLabelActionByOrderId((prev) => ({ ...prev, [normalized]: { loading: true, error: "" } }));
    try {
      const api = createLabApiClient();
      const artifacts = await api.getBreederAllLabelsArtifact(normalized);
      downloadArtifact(artifacts.labelsPdf, `shed-order-labels-${normalized}.pdf`);
      setLabelActionByOrderId((prev) => ({ ...prev, [normalized]: { loading: false, error: "" } }));
    } catch (err) {
      setLabelActionByOrderId((prev) => ({
        ...prev,
        [normalized]: {
          loading: false,
          error: err instanceof Error ? err.message : "Unable to download labels.",
        },
      }));
    }
  };

  const openCertificate = async (orderId, mode) => {
    const normalized = String(orderId || "").trim();
    if (!normalized) return;

    setCertificateActionByOrderId((prev) => ({ ...prev, [normalized]: { loading: true, error: "" } }));
    try {
      const api = createLabApiClient();
      const artifact = await api.getBreederCertificateArtifact(normalized);
      const blob = base64ToBlob(artifact.base64, artifact.mimeType);
      const blobUrl = URL.createObjectURL(blob);

      if (mode === "view") {
        window.open(blobUrl, "_blank", "noopener,noreferrer");
      } else {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = artifact.fileName || `${artifact.certificateNumber || "certificate"}.pdf`;
        link.click();
      }

      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
      setCertificateActionByOrderId((prev) => ({ ...prev, [normalized]: { loading: false, error: "" } }));
    } catch (err) {
      setCertificateActionByOrderId((prev) => ({
        ...prev,
        [normalized]: {
          loading: false,
          error: err instanceof Error ? err.message : "Unable to load certificate.",
        },
      }));
    }
  };

  return (
    <SharedBackendGuard featureName="Breeder shed testing history">
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("lab.orders.snakePanel.title", { defaultValue: "Shed Testing Orders" })}
        </div>
        <span className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-600">
          {sortedOrders.length}
        </span>
      </div>

      <div className="mt-2 text-[11px] text-neutral-500">
        {t("lab.orders.snakePanel.subtitle", { defaultValue: "Order history for this snake. Filters and dashboard controls can be added later." })}
      </div>

      {isLoading ? (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          {t("common.loading", { defaultValue: "Loading..." })}
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      ) : null}

      {!isLoading && !error && !sortedOrders.length ? (
        <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-3 text-xs text-neutral-600">
          {t("lab.orders.snakePanel.empty", { defaultValue: "No shed testing orders yet for this snake." })}
        </div>
      ) : null}

      {!isLoading && !error && sortedOrders.length ? (
        <div className="mt-3 space-y-2">
          {sortedOrders.map((order) => {
            const paymentStatus = String(order?.paymentStatus || "pending");
            const statusLabel = TEST_ORDER_STATUS_LABELS[order.status] || order.status;
            const statusTone = TEST_ORDER_STATUS_TONES[order.status] || "neutral";
            const paymentLabel = ORDER_PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus;
            const paymentTone = ORDER_PAYMENT_STATUS_TONES[paymentStatus] || "neutral";
            const detailsBundle = detailByOrderId[order.id] || null;
            const details = detailsBundle?.order || null;
            const outcome = detailsBundle?.outcome || null;
            const isOpen = activeOrderId === order.id;
            const resultCount = Array.isArray(order.resultIds) ? order.resultIds.length : 0;
            const certificateActionState = certificateActionByOrderId[order.id] || { loading: false, error: "" };
            const labelActionState = labelActionByOrderId[order.id] || { loading: false, error: "" };

            return (
              <div key={order.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-800">{order.orderNumber || order.id}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge label={statusLabel} tone={statusTone} />
                    <StatusBadge label={paymentLabel} tone={paymentTone} />
                  </div>
                </div>

                <div className="mt-2 grid gap-2 text-xs text-neutral-700 sm:grid-cols-2">
                  <div>
                    <span className="font-semibold text-neutral-600">{t("lab.orders.orderDate", { defaultValue: "Order Date" })}:</span>{" "}
                    {formatDate(order.submittedAt || order.createdAt)}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-600">{t("lab.orders.requestedTests", { defaultValue: "Requested Tests" })}:</span>{" "}
                    {(order.requestedTests || []).join(", ") || "-"}
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-600">{t("lab.orders.linkedResults", { defaultValue: "Linked Results" })}:</span>{" "}
                    {resultCount}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      className="rounded-lg border px-2 py-1 text-[11px]"
                      onClick={() => openDetails(order.id)}
                    >
                      {isOpen
                        ? t("common.hideDetails", { defaultValue: "Hide details" })
                        : t("common.viewDetails", { defaultValue: "View details" })}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 disabled:opacity-60"
                      disabled={labelActionState.loading}
                      onClick={() => previewOrderLabels(order.id)}
                    >
                      {labelActionState.loading
                        ? t("common.loading", { defaultValue: "Loading..." })
                        : t("lab.orders.previewLabelsPdf", { defaultValue: "Preview Labels PDF" })}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 disabled:opacity-60"
                      disabled={labelActionState.loading}
                      onClick={() => downloadOrderLabels(order.id)}
                    >
                      {t("lab.orders.downloadLabelsPdf", { defaultValue: "Download Labels PDF" })}
                    </button>
                    {labelActionState.error ? (
                      <span className="text-[11px] text-rose-700">{labelActionState.error}</span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {outcome?.certificate?.certificateNumber
                      ? t("lab.orders.certificateReady", {
                          defaultValue: "Certificate: {{number}}",
                          number: outcome.certificate.certificateNumber,
                        })
                      : t("lab.orders.certificatePlaceholder", { defaultValue: "Certificate: available after completion" })}
                  </div>
                </div>

                {isOpen ? (
                  <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-2 text-xs text-neutral-700">
                    {loadingDetailId === order.id ? (
                      <div>{t("common.loading", { defaultValue: "Loading..." })}</div>
                    ) : details ? (
                      <div className="space-y-1">
                        <div>
                          <span className="font-semibold text-neutral-600">{t("lab.orders.details.orderNumber", { defaultValue: "Order Number" })}:</span> {details.orderNumber || details.id}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-600">{t("lab.orders.details.labId", { defaultValue: "Lab" })}:</span> {details.labId}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-600">{t("lab.orders.details.certificate", { defaultValue: "Certificate" })}:</span>{" "}
                          {outcome?.certificate?.certificateNumber
                            ? `${outcome.certificate.certificateNumber} (${outcome.certificate.status})`
                            : details.certificateId
                            ? t("lab.orders.details.certificateQueued", { defaultValue: "Queued (ID: {{id}})", id: details.certificateId })
                            : t("lab.orders.details.certificatePending", { defaultValue: "Not issued yet" })}
                        </div>
                        {outcome?.certificate?.verificationCode ? (
                          <div>
                            <span className="font-semibold text-neutral-600">{t("lab.orders.details.certificateVerification", { defaultValue: "Verification" })}:</span>{" "}
                            {outcome.certificate.verificationCode}
                          </div>
                        ) : null}
                        {outcome?.certificate?.id ? (
                          <div className="pt-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 disabled:opacity-60"
                                disabled={certificateActionState.loading}
                                onClick={() => openCertificate(order.id, "view")}
                              >
                                {t("lab.orders.details.viewCertificate", { defaultValue: "View Certificate" })}
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 disabled:opacity-60"
                                disabled={certificateActionState.loading}
                                onClick={() => openCertificate(order.id, "download")}
                              >
                                {t("lab.orders.details.downloadCertificate", { defaultValue: "Download PDF" })}
                              </button>
                            </div>
                            {certificateActionState.error ? (
                              <div className="mt-1 text-[11px] text-rose-700">{certificateActionState.error}</div>
                            ) : null}
                          </div>
                        ) : null}
                        <div>
                          <span className="font-semibold text-neutral-600">{t("lab.orders.details.latestResult", { defaultValue: "Latest Result" })}:</span>{" "}
                          {outcome?.latestResult
                            ? `${outcome.latestResult.testCode} (${outcome.latestResult.status})`
                            : t("lab.orders.details.resultPending", { defaultValue: "No finalized result yet" })}
                        </div>
                        {outcome?.latestResult?.findings?.length ? (
                          <div>
                            <span className="font-semibold text-neutral-600">{t("lab.orders.details.findings", { defaultValue: "Findings" })}:</span>{" "}
                            {outcome.latestResult.findings.map((entry) => `${entry.marker}: ${entry.outcome}`).join(", ")}
                          </div>
                        ) : null}
                        {outcome?.resultHistory?.length ? (
                          <div className="pt-1">
                            <div className="font-semibold text-neutral-600">{t("lab.orders.details.resultHistory", { defaultValue: "Result History" })}:</div>
                            <div className="mt-1 space-y-1">
                              {outcome.resultHistory.map((entry) => (
                                <div key={entry.id} className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1">
                                  <div className="font-medium text-neutral-800">{entry.testCode} ({entry.status})</div>
                                  <div className="text-[11px] text-neutral-600">
                                    {(entry.findings || []).map((finding) => `${finding.marker}: ${finding.outcome}`).join(", ") || "-"}
                                  </div>
                                  {entry.summary ? <div className="text-[11px] text-neutral-500">{entry.summary}</div> : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <span className="font-semibold text-neutral-600">{t("lab.orders.details.updatedGenetics", { defaultValue: "Updated Genetics" })}:</span>{" "}
                          {geneticsSnapshotToList(outcome?.currentGenetics).join(", ") || "-"}
                        </div>
                        {outcome?.labConfirmedMarkers?.length ? (
                          <div>
                            <span className="font-semibold text-emerald-700">{t("lab.orders.details.labConfirmedMarkers", { defaultValue: "Lab-confirmed markers" })}:</span>{" "}
                            {outcome.labConfirmedMarkers.map((entry) => `${entry.marker} (${entry.outcome})`).join(", ")}
                          </div>
                        ) : null}
                        {outcome?.geneticsUpdate?.applied ? (
                          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
                            {t("lab.orders.details.geneticsConfirmedContext", {
                              defaultValue: "Displayed genetics include lab-confirmed updates from this order.",
                            })}
                          </div>
                        ) : null}
                        {outcome?.geneticsUpdate?.changeLogId ? (
                          <div>
                            <span className="font-semibold text-neutral-600">{t("lab.orders.details.geneticsAudit", { defaultValue: "Genetics Audit" })}:</span>{" "}
                            {`Change ${outcome.geneticsUpdate.changeLogId} linked to result.`}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-amber-700">
                        {t("lab.orders.details.unavailable", { defaultValue: "Detailed view is not available yet. Retry later." })}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
    </SharedBackendGuard>
  );
}
