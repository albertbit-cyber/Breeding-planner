import type { ServiceActor } from "./testOrderService";
import type { ShedSubmissionBatch } from "../../types/labShedTerminal";
import type { TestOrder } from "../../types/lab";

type PdfDoc = import("jspdf").jsPDF;

const BREEDER_INFO_STORAGE_KEY = "breedingPlannerBreederInfo";

import { resolveLabProfileForOrder } from "./labelProfileService";

type BreederInfo = {
  name?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
};

const bytesToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const loadBreederInfo = (): BreederInfo => {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(BREEDER_INFO_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BreederInfo;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const formatCurrency = (currency: string, amountCents: number): string => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amountCents / 100);
  } catch {
    return `${currency} ${(amountCents / 100).toFixed(2)}`;
  }
};

const splitOversizedToken = (doc: PdfDoc, token: string, maxWidthMm: number): string[] => {
  const normalized = String(token || "").trim();
  if (!normalized) return [];
  if (doc.getTextWidth(normalized) <= maxWidthMm) return [normalized];

  const chunks: string[] = [];
  let current = "";
  Array.from(normalized).forEach((char) => {
    const candidate = `${current}${char}`;
    if (!current || doc.getTextWidth(candidate) <= maxWidthMm) {
      current = candidate;
      return;
    }
    chunks.push(current);
    current = char;
  });
  if (current) chunks.push(current);
  return chunks.length ? chunks : [normalized];
};

const wrapText = (doc: PdfDoc, text: string, maxWidthMm: number): string[] => {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const words = normalized.split(" ").flatMap((word) => splitOversizedToken(doc, word, maxWidthMm));
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || doc.getTextWidth(candidate) <= maxWidthMm) {
      current = candidate;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  return lines;
};

const ellipsizeLine = (doc: PdfDoc, text: string, maxWidthMm: number): string => {
  const ellipsis = "...";
  let value = String(text || "").trim();
  if (!value || doc.getTextWidth(value) <= maxWidthMm) return value;
  while (value.length && doc.getTextWidth(`${value}${ellipsis}`) > maxWidthMm) {
    value = value.slice(0, -1).trimEnd();
  }
  return value ? `${value}${ellipsis}` : ellipsis;
};

const drawBoundedText = (
  doc: PdfDoc,
  text: string,
  xMm: number,
  yMm: number,
  maxWidthMm: number,
  maxLines = 1,
  lineHeightMm = 6
): number => {
  const lines = wrapText(doc, text, maxWidthMm);
  const visible = lines.slice(0, Math.max(1, maxLines));
  if (lines.length > visible.length && visible.length) {
    visible[visible.length - 1] = ellipsizeLine(doc, visible[visible.length - 1], maxWidthMm);
  }
  doc.text(visible.length ? visible : ["-"], xMm, yMm);
  return yMm + (Math.max(1, visible.length) * lineHeightMm);
};

export interface MasterShipmentLabelArtifact {
  batchId: string;
  fileName: string;
  mimeType: "application/pdf";
  base64: string;
  byteLength: number;
}

export const generateMasterShipmentLabelArtifact = async (
  actor: ServiceActor,
  batch: ShedSubmissionBatch,
  orders: TestOrder[]
): Promise<MasterShipmentLabelArtifact> => {
  const { jsPDF } = await import("jspdf");
  const breeder = loadBreederInfo();

  const senderName = breeder.businessName || breeder.name || actor.userId;
  const senderLine2 = [breeder.email, breeder.phone].filter(Boolean).join(" | ");
  const senderLine3 = [breeder.city, breeder.country].filter(Boolean).join(", ");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("MASTER SHIPMENT LABEL", 15, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  drawBoundedText(doc, `Batch: ${batch.id}`, 15, 30, 180);
  doc.text(`Submitted: ${new Date(batch.submittedAt).toLocaleString()}`, 15, 36);
  doc.text(`Total: ${formatCurrency(batch.currency, batch.totalCents)}`, 15, 42);

  doc.setFont("helvetica", "bold");
  doc.text("SHIP TO", 15, 54);
  doc.setFont("helvetica", "normal");
  // Addressed to the laboratory this batch was actually submitted to, not to a
  // single hardcoded lab.
  const labProfile = resolveLabProfileForOrder(batch);
  const shipTo = [
    labProfile.name,
    labProfile.address.contactName,
    labProfile.address.line1,
    [labProfile.address.postalCode, labProfile.address.city].filter(Boolean).join(" ") +
      (labProfile.address.country ? `, ${labProfile.address.country}` : ""),
    labProfile.address.phone ? `Tel: ${labProfile.address.phone}` : "",
  ].filter((line) => String(line || "").trim());
  shipTo.forEach((line, index) => doc.text(String(line), 15, 60 + index * 6));

  doc.setFont("helvetica", "bold");
  doc.text("FROM", 110, 54);
  doc.setFont("helvetica", "normal");
  let senderY = drawBoundedText(doc, senderName, 110, 60, 85, 2);
  if (senderLine2) senderY = drawBoundedText(doc, senderLine2, 110, senderY, 85, 2);
  if (senderLine3) drawBoundedText(doc, senderLine3, 110, senderY, 85, 2);

  doc.setFont("helvetica", "bold");
  doc.text("Included Snake Orders", 15, 96);
  doc.setFont("helvetica", "normal");

  let y = 104;
  orders.forEach((order, index) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    const lineY = drawBoundedText(
      doc,
      `${index + 1}. ${order.orderNumber || order.id}  |  Snake: ${order.animalId}`,
      15,
      y,
      180,
      2
    );
    y = Math.max(y + 7, lineY + 1);
  });

  const buffer = doc.output("arraybuffer") as ArrayBuffer;
  const base64 = bytesToBase64(buffer);
  return {
    batchId: batch.id,
    fileName: `master-shipment-${batch.id}.pdf`,
    mimeType: "application/pdf",
    base64,
    byteLength: buffer.byteLength,
  };
};
