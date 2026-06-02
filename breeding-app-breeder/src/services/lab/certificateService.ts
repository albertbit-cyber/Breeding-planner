import {
  createCertificateRecord,
  getCertificateRecordById,
  getTestOrderRecordById,
  listCertificateRecordsByOrderId,
  listTestResultRecordsByOrderId,
  updateTestOrderCertificateIdRecord,
  updateTestResultCertificateIdRecord,
} from "../../db/labStore";
import type { Certificate, TestOrder, TestResult } from "../../types/lab";
import type { LabCertificateTemplateData } from "../../types/labCertificate";
import { buildLabCertificateTemplateData } from "./certificateTemplate";
import { loadBreederInfo, loadSnakeById } from "./labelProfileService";
import { renderLabCertificatePdf } from "../../utils/pdf/labCertificatePdf";
import { generateQrToken } from "../../utils/labToken";
import type { ServiceActor } from "./testOrderService";
import { emitShedWorkflowEvent } from "./workflowEvents";
const FINAL_RESULT_STATUSES = new Set<string>(["completed", "reviewed", "released"]);

const canIssueCertificateForStatus = (status: string): boolean =>
  status === "completed" || status === "certificate_issued";

const canAccessOrder = (actor: ServiceActor, order: TestOrder): boolean => {
  if (actor.role === "admin") return true;
  if (actor.role === "lab_staff") return Boolean(actor.labId && actor.labId === order.labId);
  return order.requestedByUserId === actor.userId || order.breederUserId === actor.userId;
};

const makeCertificateId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `cert_${crypto.randomUUID()}`;
  }
  return `cert_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const makeCertificateNumber = (order: TestOrder): string => {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  const suffix = String(order.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || "GEN";
  return `PH-GT-${stamp}-${suffix}`;
};

const toTemplateData = async (
  order: TestOrder,
  result: TestResult,
  certificateId: string,
  certificateNumber: string,
  verificationCode: string,
  issueDateIso?: string
): Promise<LabCertificateTemplateData> => {
  const [snake, breeder] = await Promise.all([loadSnakeById(order.animalId), loadBreederInfo()]);

  return buildLabCertificateTemplateData({
    order,
    result,
    certificateId,
    certificateNumber,
    verificationCode,
    issueDateIso,
    breeder: {
      name: breeder.name,
      businessName: breeder.businessName,
      email: breeder.email,
      phone: breeder.phone,
      street: breeder.street,
      addressLine1: breeder.addressLine1,
      addressLine2: breeder.addressLine2,
      city: breeder.city,
      stateOrRegion: breeder.stateOrRegion,
      postalCode: breeder.postalCode,
      country: breeder.country,
    },
    snake,
  });
};

const ensureExistingCertificateLinks = (
  certificate: Certificate,
  order: TestOrder,
  result: TestResult,
  actor: ServiceActor
): Certificate => {
  if (order.certificateId !== certificate.id) {
    updateTestOrderCertificateIdRecord(order.id, certificate.id, actor, "certificate_link_repair");
  }
  if (result.certificateId !== certificate.id) {
    updateTestResultCertificateIdRecord(result.id, certificate.id, actor, "certificate_link_repair");
  }
  return certificate;
};

export const issueCertificateForCompletedOrder = async (
  actor: ServiceActor,
  order: TestOrder,
  result: TestResult
): Promise<Certificate | null> => {
  if (!canIssueCertificateForStatus(order.status)) {
    return null;
  }

  if (order.certificateId) {
    const existingById = getCertificateRecordById(order.certificateId);
    if (existingById) {
      return ensureExistingCertificateLinks(existingById, order, result, actor);
    }
  }

  const existingByOrder = listCertificateRecordsByOrderId(order.id).find((entry) => {
    const resultIds = Array.isArray(entry.resultIds) ? entry.resultIds : [];
    return resultIds.includes(result.id) || entry.status === "issued";
  });
  if (existingByOrder) {
    return ensureExistingCertificateLinks(existingByOrder, order, result, actor);
  }

  const certificateId = makeCertificateId();
  const verificationCode = generateQrToken().slice(0, 24).toUpperCase();
  const certificateNumber = makeCertificateNumber(order);
  const templateData = await toTemplateData(order, result, certificateId, certificateNumber, verificationCode);

  const artifact = await renderLabCertificatePdf(templateData, { includeQr: false });

  const created = createCertificateRecord(
    {
      id: certificateId,
      labId: order.labId,
      orderId: order.id,
      animalId: order.animalId,
      status: "issued",
      certificateNumber,
      resultIds: [result.id],
      issuedAt: templateData.issueDateIso,
      fileUrl: `lab-certificate://${certificateId}`,
      signatureDigest: artifact.sha256Hex || verificationCode,
      issuedByUserId: actor.userId,
      notes: JSON.stringify({
        templateVersion: templateData.templateVersion,
        verificationCode,
        verificationUrl: templateData.verificationUrl,
        byteLength: artifact.byteLength,
        qrEmbedded: artifact.qrEmbedded,
      }),
    },
    actor
  );

  updateTestOrderCertificateIdRecord(order.id, created.id, actor, "certificate_generated");
  updateTestResultCertificateIdRecord(result.id, created.id, actor, "certificate_generated");

  void emitShedWorkflowEvent({
    type: "certificate_issued",
    orderId: order.id,
    labId: order.labId,
    animalId: order.animalId,
    actor: { userId: actor.userId, role: actor.role },
    metadata: {
      certificateId: created.id,
      certificateNumber: created.certificateNumber,
      verificationCode,
      issuedAt: created.issuedAt,
    },
  });

  const latestOrder = getTestOrderRecordById(order.id);
  if (latestOrder?.status === "completed") {
    // Keep current workflow state; certificate exists even if status remains completed.
  }

  return created;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  const maybeBuffer = (globalThis as { Buffer?: { from(input: Uint8Array): { toString(encoding: string): string } } }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(bytes).toString("base64");
  }

  if (typeof btoa === "function") {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...Array.from(chunk));
    }
    return btoa(binary);
  }

  throw new Error("Unable to encode certificate artifact.");
};

export const getBreederCertificateArtifact = async (
  actor: ServiceActor,
  orderId: string
): Promise<{
  certificateId: string;
  certificateNumber: string;
  issuedAt?: string;
  fileName: string;
  mimeType: "application/pdf";
  base64: string;
  byteLength: number;
}> => {
  const normalizedOrderId = String(orderId || "").trim();
  if (!normalizedOrderId) {
    throw new Error("Invalid orderId.");
  }

  const order = getTestOrderRecordById(normalizedOrderId);
  if (!order) {
    throw new Error("Test order not found.");
  }
  if (!canAccessOrder(actor, order)) {
    throw new Error("Access denied: you do not have permission to access this test order.");
  }

  const certificate = order.certificateId
    ? getCertificateRecordById(order.certificateId)
    : listCertificateRecordsByOrderId(order.id)[0] || null;

  if (!certificate) {
    throw new Error("Certificate is not available for this order yet.");
  }

  const orderResults = listTestResultRecordsByOrderId(order.id);
  const preferredResultId = (certificate.resultIds || [])[0];
  const result =
    orderResults.find((entry) => entry.id === preferredResultId) ||
    orderResults.find((entry) => FINAL_RESULT_STATUSES.has(entry.status)) ||
    null;

  if (!result) {
    throw new Error("No finalized result found for this certificate.");
  }

  let verificationCode = "";
  if (certificate.notes) {
    try {
      const parsed = JSON.parse(certificate.notes) as { verificationCode?: string };
      verificationCode = String(parsed?.verificationCode || "").trim();
    } catch {
      verificationCode = "";
    }
  }
  if (!verificationCode) {
    verificationCode = (certificate.signatureDigest || generateQrToken()).slice(0, 24).toUpperCase();
  }

  const template = await toTemplateData(
    order,
    result,
    certificate.id,
    certificate.certificateNumber,
    verificationCode,
    certificate.issuedAt
  );
  const artifact = await renderLabCertificatePdf(template, { includeQr: false });

  const safeFileStem = String(certificate.certificateNumber || certificate.id)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return {
    certificateId: certificate.id,
    certificateNumber: certificate.certificateNumber,
    issuedAt: certificate.issuedAt,
    fileName: `${safeFileStem || certificate.id}.pdf`,
    mimeType: "application/pdf",
    base64: bytesToBase64(new Uint8Array(artifact.arrayBuffer)),
    byteLength: artifact.byteLength,
  };
};
