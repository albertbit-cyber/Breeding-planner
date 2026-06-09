import React, { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { createLabApiClient, formatLabOutcomeLabel, formatLabTestNumber } from "../api/client";
import { useAutoRefetch } from "../hooks/useAutoRefetch";
import OrderProgressBar from "./OrderProgressBar";
import SharedBackendGuard from "../../../components/SharedBackendGuard.jsx";
import {
  printCurrentWindowWithSystemDialog,
  saveLabelSizePref,
  loadLabelSizePref,
} from "../../../services/lab/labelProfileService";
import { useBatchOrder } from "../contexts/BatchOrderContext";
import { SampleLabelPreview, ShippingLabelPreview } from "./LabLabelPreview.jsx";
import {
  buildSampleLabelContent,
  buildSampleLabelLayout,
  buildShippingLabelContent,
  buildShippingLabelLayout,
  fitQrToBox,
  fitTextToBox,
  LABEL_LAYOUT_CONSTANTS,
  SAMPLE_LABEL_TESTS_FIT_OPTIONS,
} from "../utils/labelLayout";
import { getActiveLabelSize, getLabelSafeArea, LAB_LABEL_SIZE_PRESETS } from "../utils/labelSizing";
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

const formatFindingSummary = (findings = []) =>
  (Array.isArray(findings) ? findings : [])
    .map((entry) => `${entry.marker}: ${formatLabOutcomeLabel(entry.outcome)}`)
    .join(", ");

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

const mmStyle = (box, size) => ({
  position: "absolute",
  left: `${box.xMm}mm`,
  top: `${box.yMm}mm`,
  width: `${box.widthMm}mm`,
  height: `${box.heightMm}mm`,
  boxSizing: "border-box",
  padding: `${LABEL_LAYOUT_CONSTANTS.innerPaddingMm}mm`,
  overflow: "hidden",
});

const printableTextStyle = (fitted) => ({
  fontSize: `${fitted.fontSizePt}pt`,
  lineHeight: 1.15,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

const PrintableShippingLabel = ({ size, data, debug }) => {
  const activeSize = getActiveLabelSize(size);
  const safeArea = getLabelSafeArea(activeSize, LABEL_LAYOUT_CONSTANTS.safeMarginMm);
  const layout = buildShippingLabelLayout(activeSize, safeArea);
  const content = buildShippingLabelContent(data);
  const destinationFit = fitTextToBox(content.destinationLines, layout.destinationBox, { maxLines: 7, maxFontPt: 12, minFontPt: 6 });
  const senderFit = fitTextToBox(content.senderLines, layout.senderBox, { maxLines: 6, maxFontPt: 11, minFontPt: 6 });

  return (
    <section className="lab-print-label" style={{ width: `${activeSize.widthMm}mm`, height: `${activeSize.heightMm}mm` }}>
      {debug ? <div className="lab-print-debug-box" style={mmStyle(safeArea, activeSize)} /> : null}
      <div style={mmStyle(layout.destinationBox, activeSize)}><div style={printableTextStyle(destinationFit)}>{destinationFit.lines.join("\n")}</div></div>
      <div style={mmStyle(layout.senderBox, activeSize)}><div style={printableTextStyle(senderFit)}>{senderFit.lines.join("\n")}</div></div>
    </section>
  );
};

const PrintableSampleLabel = ({ size, data, qrDataUrl, debug }) => {
  const activeSize = getActiveLabelSize(size);
  const safeArea = getLabelSafeArea(activeSize, LABEL_LAYOUT_CONSTANTS.safeMarginMm);
  const layout = buildSampleLabelLayout(activeSize, safeArea);
  const content = buildSampleLabelContent(data);
  const orderFit = fitTextToBox(content.orderId, layout.orderIdBox, { maxLines: 2, maxFontPt: 10, minFontPt: 6 });
  const animalFit = fitTextToBox(content.animalId, layout.animalIdBox, { maxLines: 2, maxFontPt: 11, minFontPt: 6 });
  const breederFit = fitTextToBox(content.breederName, layout.breederNameBox, { maxLines: 2, maxFontPt: 9, minFontPt: 6 });
  const testsFit = fitTextToBox(content.requestedTests, layout.testsBox, {
    maxLines: SAMPLE_LABEL_TESTS_FIT_OPTIONS[layout.variant].maxLines,
    maxFontPt: SAMPLE_LABEL_TESTS_FIT_OPTIONS[layout.variant].maxFontPt,
    minFontPt: SAMPLE_LABEL_TESTS_FIT_OPTIONS[layout.variant].minFontPt,
  });
  const qrPlacement = fitQrToBox(layout.qrBox);

  return (
    <section className="lab-print-label" style={{ width: `${activeSize.widthMm}mm`, height: `${activeSize.heightMm}mm` }}>
      {debug ? <div className="lab-print-debug-box" style={mmStyle(safeArea, activeSize)} /> : null}
      <div style={mmStyle(layout.orderIdBox, activeSize)}><div style={printableTextStyle(orderFit)}>{orderFit.lines.join("\n")}</div></div>
      <div style={mmStyle(layout.animalIdBox, activeSize)}><div style={printableTextStyle(animalFit)}>{animalFit.lines.join("\n")}</div></div>
      <div style={mmStyle(layout.breederNameBox, activeSize)}><div style={printableTextStyle(breederFit)}>{breederFit.lines.join("\n")}</div></div>
      <div style={mmStyle(layout.testsBox, activeSize)}><div style={printableTextStyle(testsFit)}>{testsFit.lines.join("\n")}</div></div>
      {qrDataUrl ? (
        <img
          alt=""
          src={qrDataUrl}
          style={{
            position: "absolute",
            left: `${qrPlacement.xMm}mm`,
            top: `${qrPlacement.yMm}mm`,
            width: `${qrPlacement.sizeMm}mm`,
            height: `${qrPlacement.sizeMm}mm`,
          }}
        />
      ) : null}
    </section>
  );
};

const LabelPrintPreviewModal = ({ printData, qrDataUrls, error, isPrinting, onClose, onPrint, t, sizeOverride, onSizeChange }) => {
  if (!printData) return null;

  // sizeOverride is the user's saved preference; fall back to the order's stored size.
  const size = sizeOverride ? getActiveLabelSize(sizeOverride) : getActiveLabelSize(printData.labelSize);
  const firstSample = printData.sampleLabels?.[0] || null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 p-4 print:static print:bg-white print:p-0">
      {/*
        Print CSS rules injected into the document while the modal is open.

        @page sets the exact label dimensions so the OS print dialog uses the
        correct paper size.  margin: 0 removes all page margins — the label
        content provides its own safe-area padding.

        The OS print dialog remains fully in control of:
          - which printer is used
          - duplex / copies / colour settings
          - the final print scale (user should leave it at 100 %)
        This code never sets silent:true or pre-selects a printer.
      */}
      <style>{`
        @page {
          size: ${size.widthMm}mm ${size.heightMm}mm;
          margin: 0;
        }
        @media print {
          html, body, #root {
            width: ${size.widthMm}mm;
            min-height: ${size.heightMm}mm;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            /* Disable any browser-level zoom so labels print at 100 % scale */
            zoom: 1 !important;
            transform: none !important;
          }
          /* Hide everything except the printable labels */
          body * { visibility: hidden !important; }
          .lab-print-root, .lab-print-root * { visibility: visible !important; }
          .lab-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: ${size.widthMm}mm !important;
            margin: 0 !important;
            padding: 0 !important;
            transform: none !important;
            zoom: 1 !important;
          }
          .lab-print-label {
            position: relative !important;
            display: block !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            color: #111 !important;
            /* Ensure backgrounds (QR codes, colour fills) are printed */
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
            /* Each label on its own page; last one does not force a blank trailing page */
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .lab-print-label:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .lab-print-debug-box {
            position: absolute !important;
            border: 0.25mm solid #e11d48 !important;
            pointer-events: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-h-[92vh] max-w-5xl overflow-auto rounded-xl bg-white p-4 shadow-xl print:contents">
        {/* ── Header ── */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:hidden">
          <div>
            <div className="text-sm font-semibold text-neutral-900">
              {t("lab.orders.printPreviewTitle", { defaultValue: "Label print preview" })}
            </div>
            <div className="text-xs text-neutral-500">
              {t("lab.orders.printPreviewHelp", { defaultValue: "Review labels below, then click Print. Printer selection and final settings stay in the OS print dialog." })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onClose}>
              {t("modal.close", { defaultValue: "Close" })}
            </button>
            {/* Clicking Print calls window.print() (browser) or webContents.print({ silent: false }) (Electron).
                The OS print dialog opens — no printer is pre-selected and silent mode is never used. */}
            <button type="button" className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-60" onClick={onPrint} disabled={isPrinting}>
              {isPrinting ? t("lab.orders.openingPrintDialog", { defaultValue: "Opening..." }) : t("actions.print", { defaultValue: "Print" })}
            </button>
          </div>
        </div>

        {/* ── Label size selector (preference saved to localStorage) ── */}
        <div className="mb-4 print:hidden">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            {t("lab.orders.labelSize", { defaultValue: "Label size" })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LAB_LABEL_SIZE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                className={[
                  "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  size.presetKey === preset.key
                    ? "border-sky-400 bg-sky-50 text-sky-800"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50",
                ].join(" ")}
                onClick={() => onSizeChange({ presetKey: preset.key, widthMm: preset.widthMm, heightMm: preset.heightMm })}
              >
                {preset.label} <span className="text-neutral-400">({preset.widthMm}×{preset.heightMm} mm)</span>
              </button>
            ))}
          </div>
        </div>

        {error ? <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 print:hidden">{error}</div> : null}

        {/* ── On-screen preview (scaled to fit; not the print output) ── */}
        <div className="mb-4 grid gap-4 lg:grid-cols-2 print:hidden">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="mb-3 text-xs font-semibold text-neutral-700">{t("export.shippingLabelPreview", { defaultValue: "Shipping label preview" })}</div>
            <div className="flex justify-center"><ShippingLabelPreview size={size} data={printData.shippingLabel} debug={printData.debug} /></div>
          </div>
          {firstSample ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="mb-3 text-xs font-semibold text-neutral-700">{t("export.sampleLabelPreview", { defaultValue: "Sample label preview" })}</div>
              <div className="flex justify-center"><SampleLabelPreview size={size} data={firstSample} debug={printData.debug} /></div>
            </div>
          ) : null}
        </div>

        {/* ── Printable content — hidden on screen, shown only when printing ── */}
        {/* Each .lab-print-label is sized exactly in mm via inline style. The @page
            rule above sets the matching paper size so the OS dialog pre-fills it
            correctly. The user can still change paper/printer in the dialog. */}
        <div className="lab-print-root">
          <PrintableShippingLabel size={size} data={printData.shippingLabel} debug={printData.debug} />
          {(printData.sampleLabels || []).map((sample) => (
            <PrintableSampleLabel key={sample.sampleId} size={size} data={sample} qrDataUrl={qrDataUrls[sample.sampleId]} debug={printData.debug} />
          ))}
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ label, tone }) => (
  <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium ${toneClass[tone] || toneClass.neutral}`}>
    {label}
  </span>
);

export default function BreederShedTestingPanel({ snake, refreshToken }) {
  const { t } = useTranslation();
  const { isInCart, getCartItem } = useBatchOrder();
  const snakeId = String(snake?.id || "").trim();
  const stagedInCart = isInCart(snakeId);
  const cartEntry = stagedInCart ? getCartItem(snakeId) : null;
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailByOrderId, setDetailByOrderId] = useState({});
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [certificateActionByOrderId, setCertificateActionByOrderId] = useState({});
  const [labelActionByOrderId, setLabelActionByOrderId] = useState({});
  const [labelPrintPreview, setLabelPrintPreview] = useState(null);
  const [labelPrintError, setLabelPrintError] = useState("");
  const [labelQrDataUrls, setLabelQrDataUrls] = useState({});
  const [isPrintDialogOpening, setIsPrintDialogOpening] = useState(false);
  // Label size preference is saved to localStorage; printer choice stays in the OS dialog.
  const [labelSizeOverride, setLabelSizeOverride] = useState(() => loadLabelSizePref());

  const load = useCallback(async () => {
    const snakeId = String(snake?.id || "").trim();
    if (!snakeId) {
      setOrders([]);
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const api = createLabApiClient();
      const rows = await api.listBreederTestOrdersForSnake(snakeId, snake?.name);
      setOrders(rows);
      const completedRows = rows.filter((entry) => String(entry?.status || "").trim() === "completed");
      if (completedRows.length) {
        await Promise.all(
          completedRows.map((entry) => api.getBreederOrderOutcome(entry.id).catch(() => null))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shed testing orders.");
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [snake?.id, refreshToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useAutoRefetch(load, {
    intervalMs: 30_000,
    events: ["lab:test-order-created", "lab:test-order-updated", "lab:test-orders-cleared"],
  });

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

  const openLabelPrintPreview = async (orderId) => {
    const normalized = String(orderId || "").trim();
    if (!normalized) return;
    setLabelActionByOrderId((prev) => ({ ...prev, [normalized]: { loading: true, error: "" } }));
    setLabelPrintError("");
    try {
      const api = createLabApiClient();
      const printData = await api.getBreederAllLabelsPrintData(normalized);
      const qrEntries = await Promise.all(
        (printData.sampleLabels || []).map(async (sample) => {
          const dataUrl = await QRCode.toDataURL(sample.qrPayload || sample.sampleId, {
            margin: 0,
            errorCorrectionLevel: "M",
            scale: 6,
          });
          return [sample.sampleId, dataUrl];
        })
      );
      setLabelQrDataUrls(Object.fromEntries(qrEntries));
      setLabelPrintPreview(printData);
      setLabelActionByOrderId((prev) => ({ ...prev, [normalized]: { loading: false, error: "" } }));
    } catch (err) {
      setLabelActionByOrderId((prev) => ({
        ...prev,
        [normalized]: {
          loading: false,
          error: err instanceof Error ? err.message : "Unable to prepare labels for printing.",
        },
      }));
    }
  };

  const printPreviewedLabels = async () => {
    setIsPrintDialogOpening(true);
    setLabelPrintError("");
    try {
      // The OS controls final printer selection and printer settings; the app only supplies
      // exact millimeter label CSS and asks for the standard print dialog at 100% scale.
      await printCurrentWindowWithSystemDialog();
    } catch (err) {
      setLabelPrintError(err instanceof Error ? err.message : "Unable to open the system print dialog.");
    } finally {
      setIsPrintDialogOpening(false);
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
    <>
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("lab.orders.snakePanel.title", { defaultValue: "Shed Testing Orders" })}
        </div>
        <div className="flex items-center gap-1.5">
          {stagedInCart ? (
            <span className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              {t("lab.batch.stagedBadge", {
                defaultValue: "In batch · {{count}} test(s)",
                count: cartEntry?.selectedTestIds?.length ?? 0,
              })}
            </span>
          ) : null}
          <span className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-600">
            {sortedOrders.length}
          </span>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-neutral-500">
        {t("lab.orders.snakePanel.subtitle", {
          defaultValue: "Orders that include this snake. Batch orders show all snakes together.",
        })}
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
            const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status;
            const statusTone = ORDER_STATUS_TONES[order.status] || "neutral";
            const paymentLabel = ORDER_PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus;
            const paymentTone = ORDER_PAYMENT_STATUS_TONES[paymentStatus] || "neutral";
            const detailsBundle = detailByOrderId[order.id] || null;
            const details = detailsBundle?.order || null;
            const outcome = detailsBundle?.outcome || null;
            const isOpen = activeOrderId === order.id;
            const resultCount = Array.isArray(order.resultIds) ? order.resultIds.length : 0;
            const certificateActionState = certificateActionByOrderId[order.id] || { loading: false, error: "" };
            const labelActionState = labelActionByOrderId[order.id] || { loading: false, error: "" };

            const showPaymentBanner =
              order.status === "received" &&
              (paymentStatus === "pending" || paymentStatus === "payment_pending");

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

                {showPaymentBanner ? (
                  <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <div className="font-semibold">
                      {t("lab.payment.requestTitle", { defaultValue: "Payment due" })}
                    </div>
                    <div className="mt-0.5">
                      {t("lab.payment.requestBody", {
                        defaultValue:
                          "Your sample has been received. Please arrange payment for order {{number}} to continue processing.",
                        number: order.orderNumber || order.id,
                      })}
                    </div>
                    {order.paymentRequestedAt ? (
                      <div className="mt-1 text-[11px] text-amber-700">
                        {t("lab.payment.requestedAt", {
                          defaultValue: "Payment requested: {{date}}",
                          date: formatDate(order.paymentRequestedAt),
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3">
                  <OrderProgressBar status={order.status} />
                </div>

                <div className="mt-2 grid gap-2 text-xs text-neutral-700 sm:grid-cols-2">
                  <div>
                    <span className="font-semibold text-neutral-600">{t("lab.orders.orderDate", { defaultValue: "Order Date" })}:</span>{" "}
                    {formatDate(order.submittedAt || order.createdAt)}
                  </div>
                  {Array.isArray(order.animalIds) && order.animalIds.length > 1 ? (
                    <div>
                      <span className="font-semibold text-neutral-600">{t("lab.batch.batchLabel", { defaultValue: "Batch" })}:</span>{" "}
                      {t("lab.batch.animalCount", {
                        defaultValue: "{{count}} snakes in this order",
                        count: order.animalIds.length,
                      })}
                    </div>
                  ) : null}
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
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 disabled:opacity-60"
                      disabled={labelActionState.loading}
                      onClick={() => openLabelPrintPreview(order.id)}
                    >
                      {labelActionState.loading
                        ? t("common.loading", { defaultValue: "Loading..." })
                        : t("lab.orders.printLabels", { defaultValue: "Print Labels" })}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 disabled:opacity-60"
                      disabled={labelActionState.loading}
                      onClick={() => downloadOrderLabels(order.id)}
                    >
                      {t("lab.orders.downloadLabelsPdf", { defaultValue: "Download Labels PDF" })}
                    </button>
                    {order.status === "completed" ? (
                      <button
                        type="button"
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 disabled:opacity-60"
                        disabled={certificateActionState.loading}
                        onClick={() => openCertificate(order.id, "download")}
                      >
                        {certificateActionState.loading
                          ? t("common.loading", { defaultValue: "Loading..." })
                          : t("lab.orders.downloadCertificatePdf", { defaultValue: "Download Certificate PDF" })}
                      </button>
                    ) : null}
                    {labelActionState.error ? (
                      <span className="text-[11px] text-rose-700">{labelActionState.error}</span>
                    ) : null}
                    {certificateActionState.error ? (
                      <span className="text-[11px] text-rose-700">{certificateActionState.error}</span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {outcome?.certificate?.certificateNumber
                      ? t("lab.orders.certificateReady", {
                          defaultValue: "Certificate: {{number}}",
                          number: outcome.certificate.certificateNumber,
                        })
                      : order.status === "completed"
                      ? t("lab.orders.certificateReadyGeneric", { defaultValue: "Certificate: ready to download" })
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
                            ? `${formatLabTestNumber(
                                outcome.latestResult.testCode,
                                `${order.id}:${outcome.latestResult.id}`,
                                outcome.latestResult.reportedAt || outcome.latestResult.releasedAt || outcome.latestResult.reviewedAt
                              )} (${outcome.latestResult.status})`
                            : t("lab.orders.details.resultPending", { defaultValue: "No finalized result yet" })}
                        </div>
                        {outcome?.latestResult?.findings?.length ? (
                          <div>
                            <span className="font-semibold text-neutral-600">{t("lab.orders.details.findings", { defaultValue: "Findings" })}:</span>{" "}
                            {formatFindingSummary(outcome.latestResult.findings)}
                          </div>
                        ) : null}
                        {outcome?.resultHistory?.length ? (
                          <div className="pt-1">
                            <div className="font-semibold text-neutral-600">{t("lab.orders.details.resultHistory", { defaultValue: "Result History" })}:</div>
                            <div className="mt-1 space-y-1">
                              {outcome.resultHistory.map((entry) => (
                                <div key={entry.id} className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1">
                                  <div className="font-medium text-neutral-800">
                                    {formatLabTestNumber(
                                      entry.testCode,
                                      `${order.id}:${entry.id}`,
                                      entry.reportedAt || entry.releasedAt || entry.reviewedAt
                                    )} ({entry.status})
                                  </div>
                                  <div className="text-[11px] text-neutral-600">
                                    {formatFindingSummary(entry.findings) || "-"}
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
                            {outcome.labConfirmedMarkers.map((entry) => `${entry.marker} (${formatLabOutcomeLabel(entry.outcome)})`).join(", ")}
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
    <LabelPrintPreviewModal
      printData={labelPrintPreview}
      qrDataUrls={labelQrDataUrls}
      error={labelPrintError}
      isPrinting={isPrintDialogOpening}
      onClose={() => {
        setLabelPrintPreview(null);
        setLabelPrintError("");
        setLabelQrDataUrls({});
      }}
      onPrint={printPreviewedLabels}
      t={t}
      sizeOverride={labelSizeOverride}
      onSizeChange={(preset) => {
        setLabelSizeOverride(preset);
        // Persist the label size preference; the OS dialog controls printer choice.
        saveLabelSizePref(preset);
      }}
    />
    </>
    </SharedBackendGuard>
  );
}
