import {
  generateAllLabelsForOrder,
  generateSampleLabelsForOrder,
  generateShippingLabelForOrder,
  type AllOrderLabelsArtifactResponse,
  type SampleLabelsArtifactResponse,
  type ShippingLabelArtifactResponse,
} from "../../../services/lab/shipmentLabelService";
import type { ServiceActor } from "../../../services/lab/testOrderService";

type ShipmentLabelApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

type ShipmentLabelApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ShipmentLabelApiErrorCode; message: string } };

type ShipmentLabelContext = {
  actor?: ServiceActor;
};

const failure = (
  code: ShipmentLabelApiErrorCode,
  message: string
): ShipmentLabelApiResponse<never> => ({ ok: false, error: { code, message } });

const success = <T>(data: T): ShipmentLabelApiResponse<T> => ({ ok: true, data });

const assertActor = (context: ShipmentLabelContext): ServiceActor => {
  if (!context.actor?.userId || !context.actor?.role) {
    throw new Error("Missing actor context.");
  }
  return context.actor;
};

const mapError = (error: unknown): ShipmentLabelApiResponse<never> => {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  const lower = message.toLowerCase();
  if (lower.includes("missing actor") || lower.includes("invalid actor")) {
    return failure("UNAUTHORIZED", message);
  }
  if (lower.includes("access denied") || lower.includes("permission")) {
    return failure("FORBIDDEN", message);
  }
  if (lower.includes("not found")) {
    return failure("NOT_FOUND", message);
  }
  if (lower.includes("invalid") || lower.includes("required")) {
    return failure("VALIDATION_ERROR", message);
  }
  return failure("INTERNAL_ERROR", message);
};

export const getBreederShipmentLabelArtifactHandler = async (
  context: ShipmentLabelContext,
  payload: { orderId: string }
): Promise<ShipmentLabelApiResponse<ShippingLabelArtifactResponse>> => {
  try {
    const actor = assertActor(context);
    const orderId = String(payload?.orderId || "").trim();
    if (!orderId) {
      return failure("VALIDATION_ERROR", "orderId is required.");
    }
    const artifact = await generateShippingLabelForOrder(actor, orderId);
    return success(artifact);
  } catch (error) {
    return mapError(error);
  }
};

export const getBreederSampleLabelsArtifactHandler = async (
  context: ShipmentLabelContext,
  payload: { orderId: string }
): Promise<ShipmentLabelApiResponse<SampleLabelsArtifactResponse>> => {
  try {
    const actor = assertActor(context);
    const orderId = String(payload?.orderId || "").trim();
    if (!orderId) {
      return failure("VALIDATION_ERROR", "orderId is required.");
    }
    const artifact = await generateSampleLabelsForOrder(actor, orderId);
    return success(artifact);
  } catch (error) {
    return mapError(error);
  }
};

export const getBreederAllLabelsArtifactHandler = async (
  context: ShipmentLabelContext,
  payload: { orderId: string }
): Promise<ShipmentLabelApiResponse<AllOrderLabelsArtifactResponse>> => {
  try {
    const actor = assertActor(context);
    const orderId = String(payload?.orderId || "").trim();
    if (!orderId) {
      return failure("VALIDATION_ERROR", "orderId is required.");
    }
    const artifact = await generateAllLabelsForOrder(actor, orderId);
    return success(artifact);
  } catch (error) {
    return mapError(error);
  }
};
