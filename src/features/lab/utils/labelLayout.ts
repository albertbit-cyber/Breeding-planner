import type { LabSampleLabelData, LabShippingLabelData } from "../../../types/labShipmentLabels";
import type { LabLabelSafeArea, LabLabelSizeSettings } from "./labelSizing";

export const LAB_LABEL_DEBUG_STORAGE_KEY = "breedingPlannerLabLabelDebug";

export const LABEL_LAYOUT_CONSTANTS = Object.freeze({
  safeMarginMm: 5,
  boxGapMm: 2,
  innerPaddingMm: 2,
  qrMinMm: 18,
  qrMaxMm: 32,
  minFontPt: 6,
  maxFontPt: 12,
  previewScaleWidthPx: 240,
  previewScaleHeightPx: 150,
  sampleWideAspectThreshold: 1.3,
});

export type LabelBox = {
  key: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
};

export type FittedText = {
  lines: string[];
  fontSizePt: number;
  truncated: boolean;
};

export type ShippingLabelLayout = {
  type: "shipping";
  safeArea: LabLabelSafeArea;
  destinationBox: LabelBox;
  senderBox: LabelBox;
};

export type SampleLabelLayout = {
  type: "sample";
  safeArea: LabLabelSafeArea;
  variant: "side-by-side" | "stacked";
  orderIdBox: LabelBox;
  animalIdBox: LabelBox;
  breederNameBox: LabelBox;
  testsBox: LabelBox;
  qrBox: LabelBox;
};

export const normalizeText = (value: unknown): string =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeLineList = (values: unknown[]): string[] =>
  values
    .map(normalizeText)
    .filter(Boolean);

export const normalizeRequestedTests = (tests: unknown): string[] => {
  if (!Array.isArray(tests)) return [];
  const unique = new Set<string>();
  tests.forEach((entry) => {
    const normalized = normalizeText(entry);
    if (normalized) unique.add(normalized);
  });
  return Array.from(unique.values());
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const ellipsize = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
};

const estimateLineWidthMm = (text: string, fontSizePt: number) =>
  Math.max(0, normalizeText(text).length * fontSizePt * 0.18);

const wrapLine = (text: string, maxWidthMm: number, fontSizePt: number): string[] => {
  const normalized = normalizeText(text) || "-";
  if (!normalized) return ["-"];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || estimateLineWidthMm(candidate, fontSizePt) <= maxWidthMm) {
      current = candidate;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
};

export const fitTextToBox = (
  text: string | string[],
  box: LabelBox,
  options: {
    maxFontPt?: number;
    minFontPt?: number;
    maxLines?: number;
    preferWrap?: boolean;
  } = {}
): FittedText => {
  const maxFontPt = options.maxFontPt ?? LABEL_LAYOUT_CONSTANTS.maxFontPt;
  const minFontPt = options.minFontPt ?? LABEL_LAYOUT_CONSTANTS.minFontPt;
  const maxLines = Math.max(1, options.maxLines ?? 2);
  const linesSource = Array.isArray(text) ? text : [text];
  const normalized = normalizeLineList(linesSource);
  const availableWidth = Math.max(4, box.widthMm - (LABEL_LAYOUT_CONSTANTS.innerPaddingMm * 2));
  const availableHeight = Math.max(4, box.heightMm - (LABEL_LAYOUT_CONSTANTS.innerPaddingMm * 2));

  for (let fontSizePt = maxFontPt; fontSizePt >= minFontPt; fontSizePt -= 0.5) {
    const lineHeightMm = fontSizePt * 0.42 + 0.9;
    const wrapped = normalized.flatMap((line) => wrapLine(line, availableWidth, fontSizePt));
    if (wrapped.length <= maxLines && (wrapped.length * lineHeightMm) <= availableHeight) {
      return {
        lines: wrapped,
        fontSizePt,
        truncated: false,
      };
    }
  }

  const fallbackFont = minFontPt;
  const lineHeightMm = fallbackFont * 0.42 + 0.9;
  const maxVisibleLines = Math.max(1, Math.min(maxLines, Math.floor(availableHeight / lineHeightMm)));
  const wrapped = normalizeLineList(linesSource).flatMap((line) => wrapLine(line, availableWidth, fallbackFont));
  const clipped = wrapped.slice(0, maxVisibleLines);
  if (clipped.length) {
    const approximateChars = Math.max(6, Math.floor(availableWidth / Math.max(0.9, fallbackFont * 0.18)));
    clipped[clipped.length - 1] = ellipsize(clipped[clipped.length - 1], approximateChars);
  }
  return {
    lines: clipped.length ? clipped : ["-"],
    fontSizePt: fallbackFont,
    truncated: true,
  };
};

export const fitQrToBox = (box: LabelBox) => {
  const maxSquare = Math.min(box.widthMm, box.heightMm) - (LABEL_LAYOUT_CONSTANTS.innerPaddingMm * 2);
  const sizeMm = clamp(maxSquare, LABEL_LAYOUT_CONSTANTS.qrMinMm, LABEL_LAYOUT_CONSTANTS.qrMaxMm);
  return {
    sizeMm,
    xMm: box.xMm + ((box.widthMm - sizeMm) / 2),
    yMm: box.yMm + ((box.heightMm - sizeMm) / 2),
  };
};

const box = (key: string, xMm: number, yMm: number, widthMm: number, heightMm: number): LabelBox => ({
  key,
  xMm,
  yMm,
  widthMm: Math.max(0, widthMm),
  heightMm: Math.max(0, heightMm),
});

const fitVerticalSections = (targetHeights: number[], availableHeightMm: number, gapMm: number): number[] => {
  const safeAvailable = Math.max(0, availableHeightMm);
  const totalGap = Math.max(0, targetHeights.length - 1) * gapMm;
  const contentAvailable = Math.max(0, safeAvailable - totalGap);
  const totalTarget = targetHeights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (totalTarget <= 0) {
    return targetHeights.map(() => 0);
  }
  const scaled = targetHeights.map((value) => Math.max(0, (value / totalTarget) * contentAvailable));
  const scaledTotal = scaled.reduce((sum, value) => sum + value, 0);
  const adjustment = contentAvailable - scaledTotal;
  if (scaled.length) {
    scaled[scaled.length - 1] += adjustment;
  }
  return scaled;
};

export const buildShippingLabelLayout = (
  _size: LabLabelSizeSettings,
  safeArea: LabLabelSafeArea
): ShippingLabelLayout => {
  const gap = LABEL_LAYOUT_CONSTANTS.boxGapMm;
  const destinationHeight = Math.max(12, (safeArea.heightMm * 0.58) - (gap / 2));
  const senderHeight = Math.max(10, safeArea.heightMm - destinationHeight - gap);
  return {
    type: "shipping",
    safeArea,
    destinationBox: box(
      "destination",
      safeArea.xMm,
      safeArea.yMm,
      safeArea.widthMm,
      destinationHeight
    ),
    senderBox: box(
      "sender",
      safeArea.xMm,
      safeArea.yMm + destinationHeight + gap,
      safeArea.widthMm,
      senderHeight
    ),
  };
};

export const buildSampleLabelLayout = (
  size: LabLabelSizeSettings,
  safeArea: LabLabelSafeArea
): SampleLabelLayout => {
  const gap = LABEL_LAYOUT_CONSTANTS.boxGapMm;
  const isWide = size.widthMm >= size.heightMm * LABEL_LAYOUT_CONSTANTS.sampleWideAspectThreshold;

  if (isWide) {
    const qrWidth = Math.max(20, Math.min(safeArea.widthMm * 0.36, safeArea.heightMm));
    const textWidth = safeArea.widthMm - qrWidth - gap;
    const rowTargets = [
      Math.max(6, safeArea.heightMm * 0.16),
      Math.max(6, safeArea.heightMm * 0.18),
      Math.max(6, safeArea.heightMm * 0.18),
      Math.max(8, safeArea.heightMm * 0.24),
    ];
    const [orderHeight, animalHeight, breederHeight, testsHeight] = fitVerticalSections(rowTargets, safeArea.heightMm, gap);
    let y = safeArea.yMm;
    const orderIdBox = box("orderId", safeArea.xMm, y, textWidth, orderHeight);
    y += orderHeight + gap;
    const animalIdBox = box("animalId", safeArea.xMm, y, textWidth, animalHeight);
    y += animalHeight + gap;
    const breederNameBox = box("breederName", safeArea.xMm, y, textWidth, breederHeight);
    y += breederHeight + gap;
    const testsBox = box("tests", safeArea.xMm, y, textWidth, testsHeight);
    const qrBox = box("qr", safeArea.xMm + textWidth + gap, safeArea.yMm, qrWidth, safeArea.heightMm);
    return {
      type: "sample",
      safeArea,
      variant: "side-by-side",
      orderIdBox,
      animalIdBox,
      breederNameBox,
      testsBox,
      qrBox,
    };
  }

  const qrHeightTarget = Math.max(12, Math.min(safeArea.heightMm * 0.33, safeArea.widthMm * 0.5));
  const rowTargets = [
    Math.max(6, safeArea.heightMm * 0.12),
    Math.max(7, safeArea.heightMm * 0.14),
    Math.max(6, safeArea.heightMm * 0.14),
    Math.max(8, safeArea.heightMm * 0.2),
    qrHeightTarget,
  ];
  const [orderHeight, animalHeight, breederHeight, testsHeight, qrHeight] = fitVerticalSections(rowTargets, safeArea.heightMm, gap);
  let y = safeArea.yMm;
  const orderIdBox = box("orderId", safeArea.xMm, y, safeArea.widthMm, orderHeight);
  y += orderHeight + gap;
  const animalIdBox = box("animalId", safeArea.xMm, y, safeArea.widthMm, animalHeight);
  y += animalHeight + gap;
  const breederNameBox = box("breederName", safeArea.xMm, y, safeArea.widthMm, breederHeight);
  y += breederHeight + gap;
  const testsBox = box("tests", safeArea.xMm, y, safeArea.widthMm, testsHeight);
  y += testsHeight + gap;
  const qrBox = box("qr", safeArea.xMm, y, safeArea.widthMm, qrHeight);
  return {
    type: "sample",
    safeArea,
    variant: "stacked",
    orderIdBox,
    animalIdBox,
    breederNameBox,
    testsBox,
    qrBox,
  };
};

export const buildShippingLabelContent = (data: LabShippingLabelData) => ({
  destinationLines: normalizeLineList([
    "TO",
    data.labName,
    data.labAddress?.line1,
    data.labAddress?.line2,
    [data.labAddress?.city, data.labAddress?.stateOrRegion, data.labAddress?.postalCode].filter(Boolean).join(", "),
    data.labAddress?.country,
  ]),
  senderLines: normalizeLineList([
    "FROM",
    data.breeder?.name,
    data.breeder?.address?.line1,
    data.breeder?.address?.line2,
    [data.breeder?.address?.city, data.breeder?.address?.stateOrRegion, data.breeder?.address?.postalCode].filter(Boolean).join(", "),
    data.breeder?.address?.country,
  ]),
});

export const buildSampleLabelContent = (sample: LabSampleLabelData) => ({
  orderId: `Order ID: ${normalizeText(sample.orderNumber || sample.orderId) || "-"}`,
  animalId: `Animal ID: ${normalizeText(sample.animalId) || "-"}`,
  breederName: `Breeder: ${normalizeText(sample.breederName) || "-"}`,
  requestedTests: normalizeRequestedTests(sample.requestedTests).length
    ? [`Requested Test(s): ${normalizeRequestedTests(sample.requestedTests).join(", ")}`]
    : ["Requested Test(s): -"],
});

export const getPreviewScaleStyle = (widthMm: number, heightMm: number) => {
  const safeWidth = Math.max(20, Number(widthMm) || 100);
  const safeHeight = Math.max(20, Number(heightMm) || 50);
  const scale = Math.min(
    LABEL_LAYOUT_CONSTANTS.previewScaleWidthPx / safeWidth,
    LABEL_LAYOUT_CONSTANTS.previewScaleHeightPx / safeHeight
  );
  return {
    width: `${Math.max(80, Math.round(safeWidth * scale))}px`,
    height: `${Math.max(48, Math.round(safeHeight * scale))}px`,
  };
};
