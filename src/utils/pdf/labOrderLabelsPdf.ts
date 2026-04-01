import {
  buildSampleLabelContent,
  buildSampleLabelLayout,
  buildShippingLabelContent,
  buildShippingLabelLayout,
  fitQrToBox,
  fitTextToBox,
  LABEL_LAYOUT_CONSTANTS,
} from "../../features/lab/utils/labelLayout";
import {
  getActiveLabelSize,
  getLabelSafeArea,
  mmToPdfUnits,
  type LabLabelSizeSettings,
} from "../../features/lab/utils/labelSizing";
import type { LabSampleLabelData, LabShippingLabelData, RenderedLabelArtifact } from "../../types/labShipmentLabels";
import { applyPdfUnicodeFont, setPdfFont } from "../pdfFonts";

type PdfDoc = import("jspdf").jsPDF;

type OrderLabelsPdfInput = {
  shippingLabel: LabShippingLabelData;
  sampleLabels: LabSampleLabelData[];
  size?: LabLabelSizeSettings;
  debug?: boolean;
};

const digestHex = async (buffer: ArrayBuffer): Promise<string> => {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") {
    return "";
  }
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const drawDebugRect = (doc: PdfDoc, xMm: number, yMm: number, widthMm: number, heightMm: number, color: [number, number, number]) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.25);
  doc.rect(xMm, yMm, widthMm, heightMm);
};

const drawFittedText = (
  doc: PdfDoc,
  box: { xMm: number; yMm: number; widthMm: number; heightMm: number },
  content: string | string[],
  options: {
    maxFontPt?: number;
    minFontPt?: number;
    maxLines?: number;
    bold?: boolean;
  } = {}
) => {
  const fitted = fitTextToBox(content, { key: "text", ...box }, options);
  const lineHeightMm = fitted.fontSizePt * 0.42 + 0.9;
  const startX = box.xMm + LABEL_LAYOUT_CONSTANTS.innerPaddingMm;
  const textHeight = fitted.lines.length * lineHeightMm;
  const startY = box.yMm + LABEL_LAYOUT_CONSTANTS.innerPaddingMm + (lineHeightMm * 0.82);
  setPdfFont(doc, options.bold ? "bold" : "normal");
  doc.setFontSize(fitted.fontSizePt);
  doc.text(fitted.lines, startX, Math.min(box.yMm + box.heightMm - 0.8, startY));
  return { ...fitted, textHeightMm: textHeight };
};

export const renderShippingLabelPage = (
  doc: PdfDoc,
  data: LabShippingLabelData,
  size: LabLabelSizeSettings,
  debug = false
) => {
  const safeArea = getLabelSafeArea(size, LABEL_LAYOUT_CONSTANTS.safeMarginMm);
  const layout = buildShippingLabelLayout(size, safeArea);
  const content = buildShippingLabelContent(data);

  if (debug) {
    drawDebugRect(doc, safeArea.xMm, safeArea.yMm, safeArea.widthMm, safeArea.heightMm, [255, 102, 102]);
    drawDebugRect(doc, layout.destinationBox.xMm, layout.destinationBox.yMm, layout.destinationBox.widthMm, layout.destinationBox.heightMm, [59, 130, 246]);
    drawDebugRect(doc, layout.senderBox.xMm, layout.senderBox.yMm, layout.senderBox.widthMm, layout.senderBox.heightMm, [16, 185, 129]);
  }

  drawFittedText(doc, layout.destinationBox, content.destinationLines, {
    maxFontPt: clamp(Math.min(size.widthMm, size.heightMm) * 0.23, 8, 12),
    minFontPt: 6,
    maxLines: 7,
  });

  drawFittedText(doc, layout.senderBox, content.senderLines, {
    maxFontPt: clamp(Math.min(size.widthMm, size.heightMm) * 0.2, 7, 11),
    minFontPt: 6,
    maxLines: 6,
  });
};

export const renderSampleLabelPage = async (
  doc: PdfDoc,
  sample: LabSampleLabelData,
  size: LabLabelSizeSettings,
  debug = false
) => {
  const safeArea = getLabelSafeArea(size, LABEL_LAYOUT_CONSTANTS.safeMarginMm);
  const layout = buildSampleLabelLayout(size, safeArea);
  const content = buildSampleLabelContent(sample);
  const qrPlacement = fitQrToBox(layout.qrBox);

  if (debug) {
    drawDebugRect(doc, safeArea.xMm, safeArea.yMm, safeArea.widthMm, safeArea.heightMm, [255, 102, 102]);
    [layout.orderIdBox, layout.animalIdBox, layout.breederNameBox, layout.testsBox, layout.qrBox].forEach((box, index) => {
      const colors: [number, number, number][] = [
        [59, 130, 246],
        [37, 99, 235],
        [14, 165, 233],
        [16, 185, 129],
        [245, 158, 11],
      ];
      drawDebugRect(doc, box.xMm, box.yMm, box.widthMm, box.heightMm, colors[index]);
    });
    drawDebugRect(doc, qrPlacement.xMm, qrPlacement.yMm, qrPlacement.sizeMm, qrPlacement.sizeMm, [217, 119, 6]);
  }

  drawFittedText(doc, layout.orderIdBox, content.orderId, {
    maxFontPt: clamp(Math.min(size.widthMm, size.heightMm) * 0.18, 7, 10),
    minFontPt: 6,
    maxLines: 2,
    bold: true,
  });
  drawFittedText(doc, layout.animalIdBox, content.animalId, {
    maxFontPt: clamp(Math.min(size.widthMm, size.heightMm) * 0.2, 7.5, 11),
    minFontPt: 6,
    maxLines: 2,
    bold: true,
  });
  drawFittedText(doc, layout.breederNameBox, content.breederName, {
    maxFontPt: clamp(Math.min(size.widthMm, size.heightMm) * 0.16, 6.5, 9),
    minFontPt: 6,
    maxLines: 2,
  });
  drawFittedText(doc, layout.testsBox, content.requestedTests, {
    maxFontPt: clamp(Math.min(size.widthMm, size.heightMm) * 0.15, 6.5, 8.5),
    minFontPt: 6,
    maxLines: layout.variant === "side-by-side" ? 6 : 5,
  });

  try {
    const qr = await import("qrcode");
    const qrDataUrl = await qr.toDataURL(sample.qrPayload, {
      margin: 1,
      width: Math.round(Math.max(150, qrPlacement.sizeMm * 8)),
    });
    doc.addImage(qrDataUrl, "PNG", qrPlacement.xMm, qrPlacement.yMm, qrPlacement.sizeMm, qrPlacement.sizeMm);
  } catch (error) {
    console.error("[labOrderLabelsPdf] QR generation failed", { sampleId: sample.sampleId, error });
    if (debug) {
      setPdfFont(doc, "normal");
      doc.setFontSize(6);
      doc.text("QR unavailable", layout.qrBox.xMm + 2, layout.qrBox.yMm + 6);
    }
  }
};

export const generateOrderLabelsPdf = async (
  input: OrderLabelsPdfInput
): Promise<RenderedLabelArtifact> => {
  const activeSize = getActiveLabelSize(input.size);
  const orientation = activeSize.widthMm >= activeSize.heightMm ? "landscape" : "portrait";
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    unit: "mm",
    format: [mmToPdfUnits(activeSize.widthMm), mmToPdfUnits(activeSize.heightMm)],
    orientation,
  });
  await applyPdfUnicodeFont(doc);

  renderShippingLabelPage(doc, input.shippingLabel, activeSize, Boolean(input.debug));

  for (let index = 0; index < input.sampleLabels.length; index += 1) {
    doc.addPage([mmToPdfUnits(activeSize.widthMm), mmToPdfUnits(activeSize.heightMm)], orientation);
    await renderSampleLabelPage(doc, input.sampleLabels[index], activeSize, Boolean(input.debug));
  }

  const bytes = doc.output("arraybuffer") as ArrayBuffer;
  return {
    format: "pdf",
    byteLength: bytes.byteLength,
    sha256Hex: await digestHex(bytes),
    arrayBuffer: bytes,
    pageCount: Math.max(1, input.sampleLabels.length + 1),
    pageWidthMm: activeSize.widthMm,
    pageHeightMm: activeSize.heightMm,
  };
};
