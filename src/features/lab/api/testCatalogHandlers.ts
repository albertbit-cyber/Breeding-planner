import type { LabAvailableTest, LabAvailableTestBreederView, CreateLabAvailableTestInput, UpdateLabAvailableTestInput } from "../../../types/labTestCatalog";
import type { ServiceActor } from "../../../services/lab/testOrderService";
import {
  listBreederVisibleTests,
  listLabAvailableTests,
  createAvailableTest,
  updateAvailableTest,
  setAvailableTestActive,
  setAvailableTestVisibility,
} from "../../../services/lab/testCatalogService";

type CatalogApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

type CatalogApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: CatalogApiErrorCode; message: string } };

type CatalogContext = {
  actor?: ServiceActor;
};

const failure = (code: CatalogApiErrorCode, message: string): CatalogApiResponse<never> => ({
  ok: false,
  error: { code, message },
});

const success = <T>(data: T): CatalogApiResponse<T> => ({ ok: true, data });

const assertActor = (context: CatalogContext): ServiceActor => {
  if (!context.actor?.userId || !context.actor?.role) {
    throw new Error("Missing actor context.");
  }
  return context.actor;
};

const mapError = (error: unknown): CatalogApiResponse<never> => {
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

export const listBreederVisibleTestsHandler = (
  context: CatalogContext
): CatalogApiResponse<LabAvailableTestBreederView[]> => {
  try {
    const actor = assertActor(context);
    const tests = listBreederVisibleTests(actor);
    return success(tests);
  } catch (error) {
    return mapError(error);
  }
};

export const listLabAvailableTestsHandler = (
  context: CatalogContext,
  payload?: { labId?: string }
): CatalogApiResponse<LabAvailableTest[]> => {
  try {
    const actor = assertActor(context);
    const tests = listLabAvailableTests(actor, payload?.labId);
    return success(tests);
  } catch (error) {
    return mapError(error);
  }
};

export const createAvailableTestHandler = (
  context: CatalogContext,
  payload: CreateLabAvailableTestInput
): CatalogApiResponse<LabAvailableTest> => {
  try {
    const actor = assertActor(context);
    if (!payload || typeof payload !== "object") {
      return failure("VALIDATION_ERROR", "Invalid payload.");
    }
    const created = createAvailableTest(actor, payload);
    return success(created);
  } catch (error) {
    return mapError(error);
  }
};

export const updateAvailableTestHandler = (
  context: CatalogContext,
  payload: UpdateLabAvailableTestInput
): CatalogApiResponse<LabAvailableTest> => {
  try {
    const actor = assertActor(context);
    if (!payload?.id) {
      return failure("VALIDATION_ERROR", "Test id is required.");
    }
    const updated = updateAvailableTest(actor, payload);
    return success(updated);
  } catch (error) {
    return mapError(error);
  }
};

export const setAvailableTestActiveHandler = (
  context: CatalogContext,
  payload: { id: string; isActive: boolean }
): CatalogApiResponse<LabAvailableTest> => {
  try {
    const actor = assertActor(context);
    if (!payload?.id) {
      return failure("VALIDATION_ERROR", "Test id is required.");
    }
    const updated = setAvailableTestActive(actor, payload.id, Boolean(payload.isActive));
    return success(updated);
  } catch (error) {
    return mapError(error);
  }
};

export const setAvailableTestVisibilityHandler = (
  context: CatalogContext,
  payload: { id: string; isVisibleToBreeder: boolean }
): CatalogApiResponse<LabAvailableTest> => {
  try {
    const actor = assertActor(context);
    if (!payload?.id) {
      return failure("VALIDATION_ERROR", "Test id is required.");
    }
    const updated = setAvailableTestVisibility(actor, payload.id, Boolean(payload.isVisibleToBreeder));
    return success(updated);
  } catch (error) {
    return mapError(error);
  }
};
