import type { ServiceActor } from "./testOrderService";
import type { ShedSubmissionBatch } from "../../types/labShedTerminal";
import type { TestOrder } from "../../types/lab";

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
  doc.text(`Batch: ${batch.id}`, 15, 30);
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
  doc.text(senderName, 110, 60);
  if (senderLine2) doc.text(senderLine2, 110, 66);
  if (senderLine3) doc.text(senderLine3, 110, 72);

  doc.setFont("helvetica", "bold");
  doc.text("Included Snake Orders", 15, 96);
  doc.setFont("helvetica", "normal");

  let y = 104;
  orders.forEach((order, index) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(`${index + 1}. ${order.orderNumber || order.id}  |  Snake: ${order.animalId}`, 15, y);
    y += 7;
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
