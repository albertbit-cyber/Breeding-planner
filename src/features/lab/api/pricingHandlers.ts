import type { ServiceActor } from "../../../services/lab/testOrderService";
import {
  calculateLabOrderPriceFromSelections,
  getLabTestsCatalog,
  getLabTestsPricing,
} from "../../../services/lab/pricingService";
import type {
  CalculatePriceRequest,
  OrderPriceBreakdown,
  PricingConfig,
  ShedTestCatalogItem,
} from "../../../types/labPricing";

type PricingApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

type PricingApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: PricingApiErrorCode; message: string } };

type PricingContext = {
  actor?: ServiceActor;
};

const success = <T>(data: T): PricingApiResponse<T> => ({ ok: true, data });

const failure = (code: PricingApiErrorCode, message: string): PricingApiResponse<never> => ({
  ok: false,
  error: { code, message },
});

const assertActor = (context: PricingContext): ServiceActor => {
  if (!context.actor?.userId || !context.actor?.role) {
    throw new Error("Missing actor context.");
  }
  return context.actor;
};

const mapError = (error: unknown): PricingApiResponse<never> => {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  const lower = message.toLowerCase();
  if (lower.includes("missing actor") || lower.includes("invalid actor") || lower.includes("signed in")) {
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

export const getLabTestsCatalogHandler = (
  context: PricingContext,
  payload?: { breederView?: boolean; labId?: string }
): PricingApiResponse<ShedTestCatalogItem[]> => {
  try {
    const actor = assertActor(context);
    const data = getLabTestsCatalog(actor, payload || {});
    console.debug("[lab-pricing-debug] GET /lab/tests/catalog", {
      actor: { userId: actor.userId, role: actor.role, labId: actor.labId },
      request: payload || {},
      responseCount: data.length,
    });
    return success(data);
  } catch (error) {
    return mapError(error);
  }
};

export const getLabTestsPricingHandler = (context: PricingContext): PricingApiResponse<PricingConfig> => {
  try {
    const actor = assertActor(context);
    const data = getLabTestsPricing(actor);
    console.debug("[lab-pricing-debug] GET /lab/tests/pricing", {
      actor: { userId: actor.userId, role: actor.role, labId: actor.labId },
      response: data,
    });
    return success(data);
  } catch (error) {
    return mapError(error);
  }
};

export const calculateLabOrderPriceHandler = (
  context: PricingContext,
  payload: CalculatePriceRequest
): PricingApiResponse<OrderPriceBreakdown> => {
  try {
    const actor = assertActor(context);
    console.debug("[lab-pricing-debug] POST /lab/orders/calculate-price request", {
      actor: { userId: actor.userId, role: actor.role, labId: actor.labId },
      payload,
    });
    const data = calculateLabOrderPriceFromSelections(actor, payload);
    console.debug("[lab-pricing-debug] POST /lab/orders/calculate-price response", data);
    return success(data);
  } catch (error) {
    return mapError(error);
  }
};
