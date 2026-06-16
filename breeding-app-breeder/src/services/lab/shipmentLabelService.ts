import { getSampleRecordById, getTestOrderRecordById } from "../../db/labStore";
import { getActiveLabelSize } from "../../features/lab/utils/labelSizing";
import type { Sample } from "../../types/lab";
import type { RenderedLabelArtifact } from "../../types/labShipmentLabels";
import { buildQrPayload } from "../../utils/labToken";
import { generateOrderLabelsPdf } from "../../utils/pdf/labOrderLabelsPdf";
import type { ServiceActor } from "./testOrderService";
import {
  LAB_PROFILE,
  isLabLabelDebugEnabled,
  loadBreederInfo,
  resolveBreederDisplayName,
  toBreederAddress,
} from "./labelProfileService";

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

type PdfArtifactResponse = {
  fileName: string;
  mimeType: "application/pdf";
  base64: string;
  byteLength: number;
  pageCount: number;
  labelCount: number;
  pageWidthMm: number;
  pageHeightMm: number;
};

export interface OrderLabelsArtifactResponse extends PdfArtifactResponse {
  orderId: string;
  orderNumber: string;
  sampleCount: number;
  sampleIds: string[];
}

export interface ShippingLabelArtifactResponse extends OrderLabelsArtifactResponse {}
export interface SampleLabelsArtifactResponse extends OrderLabelsArtifactResponse {}

export interface AllOrderLabelsArtifactResponse {
  orderId: string;
  orderNumber: string;
  labelsPdf: OrderLabelsArtifactResponse;
}

const toPdfArtifact = (
  rendered: RenderedLabelArtifact,
  fileName: string
): PdfArtifactResponse => ({
  fileName,
  mimeType: "application/pdf",
  base64: bytesToBase64(rendered.arrayBuffer),
  byteLength: rendered.byteLength,
  pageCount: rendered.pageCount,
  labelCount: rendered.pageCount,
  pageWidthMm: rendered.pageWidthMm,
  pageHeightMm: rendered.pageHeightMm,
});

const assertOrderAccess = (_actor: ServiceActor, orderId: string) => {
  const normalizedOrderId = String(orderId || "").trim();
  if (!normalizedOrderId) throw new Error("orderId is required.");
  const order = getTestOrderRecordById(normalizedOrderId);
  if (!order) throw new Error("Test order not found.");
  return order;
};

const loadOrderSamples = (actor: ServiceActor, orderId: string) => {
  const order = assertOrderAccess(actor, orderId);
  const samples = (Array.isArray(order.sampleIds) ? order.sampleIds : [])
    .map((sampleId) => getSampleRecordById(sampleId))
    .filter((sample): sample is Sample => Boolean(sample));
  return { order, samples };
};

export const generateOrderLabelsArtifactForOrder = async (
  actor: ServiceActor,
  orderId: string
): Promise<OrderLabelsArtifactResponse> => {
  const { order, samples } = loadOrderSamples(actor, orderId);
  const breeder = await loadBreederInfo();
  const breederName = resolveBreederDisplayName(order, breeder);
  const labelSize = getActiveLabelSize(breeder);
  const debug = await isLabLabelDebugEnabled();

  const rendered = await generateOrderLabelsPdf({
    size: labelSize,
    debug,
    shippingLabel: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      labName: LAB_PROFILE.name,
      labAddress: LAB_PROFILE.address,
      breeder: {
        name: breederName,
        address: toBreederAddress(breeder),
      },
      createdAt: order.submittedAt || order.createdAt,
      sampleCount: samples.length,
    },
    sampleLabels: samples.map((sample) => ({
      sampleId: sample.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      animalId: sample.animalId,
      breederName,
      requestedTests: [...order.requestedTests],
      sampleStatus: sample.status,
      qrPayload: buildQrPayload(sample.qrToken),
      sampleType: sample.type,
      labName: LAB_PROFILE.name,
    })),
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    sampleCount: samples.length,
    sampleIds: samples.map((sample) => sample.id),
    ...toPdfArtifact(rendered, `shed-order-labels-${order.orderNumber.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`),
  };
};

export const generateShippingLabelForOrder = async (
  actor: ServiceActor,
  orderId: string
): Promise<ShippingLabelArtifactResponse> => generateOrderLabelsArtifactForOrder(actor, orderId);

export const generateSampleLabelsForOrder = async (
  actor: ServiceActor,
  orderId: string
): Promise<SampleLabelsArtifactResponse> => generateOrderLabelsArtifactForOrder(actor, orderId);

export const generateAllLabelsForOrder = async (
  actor: ServiceActor,
  orderId: string
): Promise<AllOrderLabelsArtifactResponse> => {
  const order = assertOrderAccess(actor, orderId);
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    labelsPdf: await generateOrderLabelsArtifactForOrder(actor, order.id),
  };
};

export const generateShipmentLabelsForOrder = async (
  actor: ServiceActor,
  orderId: string,
  _labelCount = 1
): Promise<OrderLabelsArtifactResponse> => generateOrderLabelsArtifactForOrder(actor, orderId);
