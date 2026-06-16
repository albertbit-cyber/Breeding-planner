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

const drawResultBlock = (doc: any, row: LabCertificateTemplateData["resultRows"][number], y: number): number => {
  const topColumns = [
    { label: "Test", x: 15, width: 39, value: row.test },
    { label: "Phenotype", x: 55, width: 39, value: row.phenotype },
    { label: "Test Number", x: 95, width: 49, value: row.testNumber },
    { label: "Test Date", x: 145, width: 50, value: row.testDate },
  ];

  const bottomColumns = [
    { label: "Test #", x: 15, width: 31, value: row.testCode },
    { label: "Snake ID", x: 47, width: 27, value: row.snakeId },
    { label: "Morph", x: 75, width: 63, value: row.morph || "-" },
    { label: "Result", x: 139, width: 27, value: row.result },
    { label: "Genotype", x: 167, width: 28, value: row.genotype },
  ];

  doc.setDrawColor(205, 205, 205);
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(15, y - 5, 180, 31, 2, 2, "FD");
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
    drawFittedCellValue(doc, column.value, column.x, y + 22, column.width, 10.2, 5.4);
  });

  doc.setDrawColor(215, 215, 215);
  doc.line(15, y + 11, 195, y + 11);

  return y + 35;
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
