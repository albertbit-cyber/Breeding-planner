import { applyPdfUnicodeFont, setPdfFont } from "../pdfFonts";
import type { LabCertificateTemplateData, RenderedCertificateArtifact } from "../../types/labCertificate";
import proHerperCertificateLogoDataUrl from "../../assets/lab/proherper-certificate-logo.png?inline";

export interface CertificatePdfRenderOptions {
  includeQr?: boolean;
}

const PAGE_BOTTOM_MM = 282;
const PAGE_WIDTH_MM = 210;
const HEADER_CENTER_X = PAGE_WIDTH_MM / 2;
const LOGO_WIDTH_MM = 58;
const LOGO_HEIGHT_MM = 34;
const LOGO_X_MM = HEADER_CENTER_X - (LOGO_WIDTH_MM / 2);
const LOGO_Y_MM = 7;

const digestHex = async (buffer: ArrayBuffer): Promise<string> => {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") {
    return "";
  }
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = Array.from(new Uint8Array(hash));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
};

const ensureSpace = (doc: any, y: number, requiredHeight: number): number => {
  if (y + requiredHeight <= PAGE_BOTTOM_MM) {
    return y;
  }
  doc.addPage();
  return 18;
};

const resolveFittedFontSize = (
  doc: any,
  value: string,
  maxWidth: number,
  maxFontSize: number,
  minFontSize: number
): number => {
  const normalized = String(value || "-").trim() || "-";
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 0.2) {
    doc.setFontSize(fontSize);
    if (doc.getTextWidth(normalized) <= maxWidth) {
      return fontSize;
    }
  }
  return minFontSize;
};

const buildBreederLines = (template: LabCertificateTemplateData): string[] => {
  const breederName = template.breeder.name || template.breeder.businessName || "-";
  const businessName = template.breeder.businessName && template.breeder.businessName !== breederName
    ? template.breeder.businessName
    : "";
  const addressLines = [
    template.breeder.addressLine1 || template.breeder.street,
    template.breeder.addressLine2,
    [
      template.breeder.postalCode,
      template.breeder.city,
      template.breeder.stateOrRegion,
    ]
      .filter(Boolean)
      .join(" "),
    template.breeder.country,
  ]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  const contactLine = [template.breeder.email, template.breeder.phone]
    .filter(Boolean)
    .join(" | ");

  return [
    `Name: ${breederName}`,
    businessName ? `Business: ${businessName}` : "",
    `Address: ${addressLines[0] || "-"}`,
    ...addressLines.slice(1),
    contactLine ? `Contact: ${contactLine}` : "",
  ].filter(Boolean);
};

const drawWrappedLines = (
  doc: any,
  lines: string[],
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number => {
  let cursorY = y;
  lines.forEach((line) => {
    const wrapped = doc.splitTextToSize(String(line || "-"), maxWidth);
    doc.text(wrapped, x, cursorY);
    cursorY += Math.max(lineHeight, wrapped.length * lineHeight);
  });
  return cursorY;
};

const loadImageElement = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Image loading is unavailable."));
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = url;
  });

const prepareSquareImageDataUrl = async (url: string): Promise<string | null> => {
  const normalized = String(url || "").trim();
  if (!normalized || typeof document === "undefined") return null;

  try {
    const image = await loadImageElement(normalized);
    const canvas = document.createElement("canvas");
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!naturalWidth || !naturalHeight) return null;

    const cropSize = Math.min(naturalWidth, naturalHeight);
    const sourceX = (naturalWidth - cropSize) / 2;
    const sourceY = (naturalHeight - cropSize) / 2;
    context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return normalized.startsWith("data:image/") ? normalized : null;
  }
};

const drawFittedCellValue = (
  doc: any,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  maxFontSize = 10,
  minFontSize = 5.8
) => {
  const normalized = String(value || "-").trim() || "-";
  const fittedFontSize = resolveFittedFontSize(doc, normalized, maxWidth, maxFontSize, minFontSize);
  doc.setFontSize(fittedFontSize);
  doc.text(normalized, x, y, { baseline: "alphabetic" });
};

const splitOversizedToken = (doc: any, token: string, maxWidth: number): string[] => {
  const normalized = String(token || "").trim();
  if (!normalized || doc.getTextWidth(normalized) <= maxWidth) return normalized ? [normalized] : [];

  const chunks: string[] = [];
  let current = "";
  Array.from(normalized).forEach((char) => {
    const candidate = `${current}${char}`;
    if (!current || doc.getTextWidth(candidate) <= maxWidth) {
      current = candidate;
      return;
    }
    chunks.push(current);
    current = char;
  });
  if (current) chunks.push(current);
  return chunks.length ? chunks : [normalized];
};

const wrapCellValue = (
  doc: any,
  value: string,
  maxWidth: number,
  fontSize: number,
  maxLines = 6
): string[] => {
  const normalized = String(value || "-").replace(/\s+/g, " ").trim() || "-";
  doc.setFontSize(fontSize);
  const words = normalized.split(" ").flatMap((word) => splitOversizedToken(doc, word, maxWidth));
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || doc.getTextWidth(candidate) <= maxWidth) {
      current = candidate;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  const ellipsis = "...";
  let last = clipped[clipped.length - 1] || "";
  while (last.length && doc.getTextWidth(`${last}${ellipsis}`) > maxWidth) {
    last = last.slice(0, -1).trimEnd();
  }
  clipped[clipped.length - 1] = last ? `${last}${ellipsis}` : ellipsis;
  return clipped;
};

const drawWrappedCellValue = (
  doc: any,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  options: { fontSize?: number; lineHeight?: number; maxLines?: number } = {}
): number => {
  const fontSize = options.fontSize ?? 7;
  const lineHeight = options.lineHeight ?? 3.4;
  const lines = wrapCellValue(doc, value, maxWidth, fontSize, options.maxLines ?? 6);
  doc.setFontSize(fontSize);
  doc.text(lines, x, y, { baseline: "alphabetic" });
  return lines.length * lineHeight;
};

const drawSnakeSummaryBlock = async (doc: any, template: LabCertificateTemplateData, y: number): Promise<number> => {
  const imageUrl = String(template.snake.imageUrl || "").trim();
  const hasImage = !!imageUrl;
  const blockX = 15;
  const blockWidth = 180;
  const photoSize = 32;
  const photoX = blockX + blockWidth - photoSize - 8;
  const textWidth = hasImage ? 126 : 168;
  const detailLineHeight = 4.4;
  const detailLines = [
    `Name: ${template.snake.name || "-"}`,
    `Snake ID: ${template.snake.displayId || template.snake.id || "-"}`,
    `Morph: ${template.snake.morph || "-"}`,
  ];

  setPdfFont(doc, "normal");
  doc.setFontSize(8.8);
  const wrappedDetails = detailLines.flatMap((line) => doc.splitTextToSize(line, textWidth));
  const blockHeight = Math.max(hasImage ? 42 : 32, 20 + (wrappedDetails.length * detailLineHeight));
  const photoY = y + ((blockHeight - photoSize) / 2);

  y = ensureSpace(doc, y, blockHeight + 6);

  doc.setDrawColor(205, 205, 205);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(blockX, y, blockWidth, blockHeight, 2, 2, "FD");

  setPdfFont(doc, "bold");
  doc.setFontSize(10.5);
  doc.text("Animal tested", blockX + 6, y + 8);

  setPdfFont(doc, "normal");
  doc.setFontSize(8.8);
  doc.text(wrappedDetails, blockX + 6, y + 15, { baseline: "alphabetic" });

  if (hasImage) {
    doc.setDrawColor(160, 160, 160);
    doc.setFillColor(255, 255, 255);
    doc.rect(photoX, photoY, photoSize, photoSize, "FD");
    const preparedImage = await prepareSquareImageDataUrl(imageUrl);
    if (preparedImage) {
      try {
        doc.addImage(preparedImage, "JPEG", photoX + 1, photoY + 1, photoSize - 2, photoSize - 2);
      } catch {
        doc.setFontSize(7.5);
        doc.text("Photo unavailable", photoX + (photoSize / 2), photoY + (photoSize / 2), { align: "center" });
      }
    }
  }

  return y + blockHeight + 6;
};

const drawResultBlock = (doc: any, row: LabCertificateTemplateData["resultRows"][number], y: number): number => {
  const topColumns = [
    { label: "Test", x: 15, width: 39, value: row.test },
    { label: "Phenotype", x: 55, width: 39, value: row.phenotype },
    { label: "Test Number", x: 95, width: 49, value: row.testNumber },
    { label: "Test Date", x: 145, width: 50, value: row.testDate },
  ];

  const bottomColumns = [
    { label: "Test #", x: 15, width: 30, value: row.testCode, maxLines: 3 },
    { label: "Snake ID", x: 47, width: 32, value: row.snakeId, maxLines: 8 },
    { label: "Morph", x: 81, width: 54, value: row.morph || "-", maxLines: 8 },
    { label: "Result", x: 137, width: 28, value: row.result, maxLines: 6 },
    { label: "Genotype", x: 167, width: 28, value: row.genotype, maxLines: 6 },
  ];
  const bottomFontSize = 7;
  const bottomLineHeight = 3.35;
  setPdfFont(doc, "normal");
  doc.setFontSize(bottomFontSize);
  const bottomRowHeight = Math.max(
    7,
    ...bottomColumns.map((column) =>
      wrapCellValue(doc, column.value, column.width, bottomFontSize, column.maxLines).length * bottomLineHeight
    )
  );
  const blockHeight = 24 + bottomRowHeight;
  if (y + blockHeight > PAGE_BOTTOM_MM) {
    doc.addPage();
    y = 18;
  }

  doc.setDrawColor(205, 205, 205);
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(15, y - 5, 180, blockHeight, 2, 2, "FD");
  doc.setFillColor(242, 242, 242);
  doc.rect(15, y - 5, 180, 8, "F");

  setPdfFont(doc, "bold");
  doc.setFontSize(9.5);
  topColumns.forEach((column) => {
    doc.text(column.label, column.x, y);
  });

  setPdfFont(doc, "normal");
  topColumns.forEach((column) => {
    drawFittedCellValue(doc, column.value, column.x, y + 6, column.width, 10.2, 6.1);
  });

  setPdfFont(doc, "bold");
  doc.setFontSize(9.5);
  bottomColumns.forEach((column) => {
    doc.text(column.label, column.x, y + 16);
  });

  setPdfFont(doc, "normal");
  bottomColumns.forEach((column) => {
    drawWrappedCellValue(doc, column.value, column.x, y + 22, column.width, {
      fontSize: bottomFontSize,
      lineHeight: bottomLineHeight,
      maxLines: column.maxLines,
    });
  });

  doc.setDrawColor(215, 215, 215);
  doc.line(15, y + 11, 195, y + 11);

  return y + blockHeight + 4;
};

export const renderLabCertificatePdf = async (
  template: LabCertificateTemplateData,
  _options: CertificatePdfRenderOptions = {}
): Promise<RenderedCertificateArtifact> => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await applyPdfUnicodeFont(doc);

  let y = 18;

  if (proHerperCertificateLogoDataUrl) {
    try {
      doc.addImage(proHerperCertificateLogoDataUrl, "PNG", LOGO_X_MM, LOGO_Y_MM, LOGO_WIDTH_MM, LOGO_HEIGHT_MM);
    } catch {
      setPdfFont(doc, "bold");
      doc.setFontSize(34);
      doc.text("PRO", HEADER_CENTER_X, y + 4, { align: "center" });
      doc.setFontSize(26);
      doc.text("HERPER", HEADER_CENTER_X, y + 15, { align: "center" });
    }
  } else {
    setPdfFont(doc, "bold");
    doc.setFontSize(34);
    doc.text("PRO", HEADER_CENTER_X, y + 4, { align: "center" });
    doc.setFontSize(26);
    doc.text("HERPER", HEADER_CENTER_X, y + 15, { align: "center" });
  }

  setPdfFont(doc, "normal");
  doc.setFontSize(9.5);
  const issuerLines = [
    template.issuer.ownerName,
    template.issuer.addressLine1,
    template.issuer.addressLine2,
    template.issuer.cityLine,
    template.issuer.phone ? `Tel: ${template.issuer.phone}` : "",
    template.issuer.email,
    template.issuer.iban ? `IBAN: ${template.issuer.iban}` : "",
    template.issuer.bic ? `BIC: ${template.issuer.bic}` : "",
  ]
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  drawWrappedLines(doc, issuerLines, 139, 14, 55, 4.6);

  y = 50;
  setPdfFont(doc, "bold");
  doc.setFontSize(12.5);
  doc.text("Genetisch Certificaat - Genetic Certificate", HEADER_CENTER_X, y, { align: "center" });
  y += 9;

  setPdfFont(doc, "normal");
  doc.setFontSize(10.5);
  doc.text("Breeder information:", 15, y);
  y += 6;
  doc.setFontSize(10);
  y = drawWrappedLines(doc, buildBreederLines(template), 25, y, 120, 5.4) + 6;
  y = await drawSnakeSummaryBlock(doc, template, y);

  const rows = Array.isArray(template.resultRows) ? template.resultRows : [];
  rows.forEach((row) => {
    y = ensureSpace(doc, y, 34);
    y = drawResultBlock(doc, row, y);
  });

  const interpretationItems = (template.disclaimers || [])
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => `• ${line}`);
  doc.setFontSize(9.4);
  const interpretationLines = interpretationItems.flatMap((line) => doc.splitTextToSize(line, 168));
  const interpretationHeight = 12 + (interpretationLines.length * 4.5);
  y = ensureSpace(doc, y + 2, interpretationHeight + 10);
  doc.setDrawColor(214, 214, 214);
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(15, y, 180, interpretationHeight, 3, 3, "FD");
  setPdfFont(doc, "bold");
  doc.setFontSize(11);
  doc.text("Interpretation of the results", 20, y + 8);
  setPdfFont(doc, "normal");
  doc.setFontSize(9.4);
  let interpretationY = y + 15;
  interpretationLines.forEach((line) => {
    doc.text(line, 20, interpretationY);
    interpretationY += 4.5;
  });
  y += interpretationHeight;

  const footerY = Math.min(PAGE_BOTTOM_MM - 6, Math.max(y + 10, 270));
  setPdfFont(doc, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  doc.text(`Certificate No: ${template.certificateNumber}`, 15, footerY);
  doc.text(`Issued: ${new Date(template.issueDateIso).toLocaleDateString("en-US")}`, 15, footerY + 4.5);
  doc.setTextColor(0, 0, 0);

  const bytes = doc.output("arraybuffer") as ArrayBuffer;
  const sha256Hex = await digestHex(bytes);

  return {
    format: "pdf",
    byteLength: bytes.byteLength,
    sha256Hex,
    qrEmbedded: false,
    arrayBuffer: bytes,
  };
};
