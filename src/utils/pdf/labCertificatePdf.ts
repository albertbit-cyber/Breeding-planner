import { applyPdfUnicodeFont, setPdfFont } from "../pdfFonts";
import type { LabCertificateTemplateData, RenderedCertificateArtifact } from "../../types/labCertificate";

export interface CertificatePdfRenderOptions {
  includeQr?: boolean;
}

const toLine = (label: string, value: string): string => `${label}: ${value || "-"}`;

const digestHex = async (buffer: ArrayBuffer): Promise<string> => {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") {
    return "";
  }
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = Array.from(new Uint8Array(hash));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
};

const buildVerificationQrDataUrl = async (value: string): Promise<string | null> => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  try {
    const qr = await import("qrcode");
    return await qr.toDataURL(normalized, { margin: 1, width: 120 });
  } catch {
    return null;
  }
};

export const renderLabCertificatePdf = async (
  template: LabCertificateTemplateData,
  options: CertificatePdfRenderOptions = {}
): Promise<RenderedCertificateArtifact> => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await applyPdfUnicodeFont(doc);

  const issueDate = new Date(template.issueDateIso);
  const issueDateLabel = Number.isNaN(issueDate.getTime()) ? template.issueDateIso : issueDate.toLocaleDateString();

  const lines = [
    toLine("Certificate", template.certificateNumber),
    toLine("Verification", template.verificationCode),
    toLine("Issue date", issueDateLabel),
    "",
    toLine("Snake ID", template.snake.id),
    toLine("Snake name", template.snake.name || "-"),
    toLine("ProHerper", template.snake.proHerperId || "-"),
    "",
    toLine("Breeder", template.breeder.businessName || template.breeder.name || "-"),
    toLine("Breeder contact", [template.breeder.email, template.breeder.phone].filter(Boolean).join(" | ") || "-"),
    "",
    toLine("Order ID", template.orderId),
    toLine("Lab", template.labId),
    "",
    `Tested genes: ${(template.testedGenes || []).join(", ") || "-"}`,
    "Confirmed results:",
    ...((template.confirmedResults || []).map((entry) => `- ${entry.marker}: ${entry.outcome}`)),
  ];

  let y = 18;
  setPdfFont(doc, "bold");
  doc.setFontSize(17);
  doc.text("Genetic Test Certificate", 15, y);
  y += 9;

  setPdfFont(doc, "normal");
  doc.setFontSize(10);

  lines.forEach((line) => {
    if (!line) {
      y += 4;
      return;
    }
    const wrapped = doc.splitTextToSize(line, 165);
    doc.text(wrapped, 15, y);
    y += Math.max(5, wrapped.length * 4.5);
  });

  let qrEmbedded = false;
  if (options.includeQr !== false) {
    const qrPayload = template.verificationUrl || template.verificationCode;
    const qrDataUrl = await buildVerificationQrDataUrl(qrPayload);
    if (qrDataUrl) {
      try {
        doc.addImage(qrDataUrl, "PNG", 170, 15, 25, 25);
        qrEmbedded = true;
      } catch {
        qrEmbedded = false;
      }
    }
  }

  const bytes = doc.output("arraybuffer") as ArrayBuffer;
  const sha256Hex = await digestHex(bytes);

  return {
    format: "pdf",
    byteLength: bytes.byteLength,
    sha256Hex,
    qrEmbedded,
    arrayBuffer: bytes,
  };
};
