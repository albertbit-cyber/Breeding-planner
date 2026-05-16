import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { ensureSharedOrderNumbers } from "./orderNumberService";
import type { AppRole } from "../types/auth";
import { isLabRole } from "../auth/identity";

type PersistOrderResultUser = {
  id: string;
  role: AppRole;
};

type ResultSaveMode = "draft" | "submit";

type AnimalResultInput = {
  animalId: string;
  items: unknown[];
};

type PersistOrderResultPayload = {
  orderId?: unknown;
  testCode?: unknown;
  method?: unknown;
  // New: per-animal result groups
  animalResults?: AnimalResultInput[];
  // Legacy: flat items list (single-animal orders)
  items?: unknown;
  summary?: unknown;
  notes?: unknown;
};

type OrderedTemplateItem = {
  orderedTestKey: string;
  geneName: string;
  sourceOrderedName: string;
  catalogTestId?: string;
};

type OrderedAnimalTemplate = {
  animal: unknown;
  animalId: string;
  animalIdx: number;
  items: OrderedTemplateItem[];
};

const RESULT_STATUS_TO_OUTCOME = {
  not_detected: "notDetected",
  heterozygous: "carrierDetected",
  visual: "positive",
} as const;

type IncomingResultStatus = keyof typeof RESULT_STATUS_TO_OUTCOME;

const sanitizeKeyPart = (value: string): string =>
  String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9-]/g, "_") || "order";

const getSharedSampleId = (orderId: string, animalIndex: number): string =>
  `${sanitizeKeyPart(orderId)}-sample-${animalIndex + 1}`;

const assertLabUser = (user: PersistOrderResultUser): void => {
  if (!isLabRole(user.role)) {
    throw new HttpError(403, "Only admin or lab users can persist lab results.");
  }
};

const requireNonEmpty = (value: unknown, field: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new HttpError(400, `${field} is required.`);
  }
  return normalized;
};

const optionalString = (value: unknown): string | undefined => {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
};

const normalizeConfidence = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const loadEditableOrder = async (orderId: string, user: PersistOrderResultUser) => {
  assertLabUser(user);
  await ensureSharedOrderNumbers();

  const order = await prisma.shedTestOrder.findUnique({
    where: { id: orderId },
    include: {
      breeder: { select: { id: true, email: true, fullName: true, role: true } },
      animals: { include: { tests: true } },
      results: { orderBy: { updatedAt: "desc" } },
    },
  });

  if (!order) throw new HttpError(404, "Order not found.");
  return order;
};

// Build per-animal template items. Each item key: `${orderId}:${animalId}:${testIndex}`
const buildOrderedTemplates = (order: any): OrderedAnimalTemplate[] => {
  const animals = Array.isArray(order?.animals) ? order.animals : [];
  if (!animals.length) {
    throw new HttpError(400, "Order does not contain any animals to attach results to.");
  }

  return animals.map((animal: any, animalIdx: number) => {
    const animalId = String(animal?.animalId || "").trim();
    const orderedTests = Array.isArray(animal?.tests) ? animal.tests : [];
    if (!orderedTests.length) {
      throw new HttpError(400, `Animal ${animalId || animalIdx + 1} has no requested tests.`);
    }
    const items = orderedTests.map((test: any, testIdx: number) => {
      const sourceOrderedName = String(test?.testNameSnapshot || test?.testId || "").trim();
      return {
        orderedTestKey: `${order.id}:${sanitizeKeyPart(animalId)}:${testIdx + 1}`,
        geneName: sourceOrderedName,
        sourceOrderedName,
        catalogTestId: String(test?.testId || "").trim() || undefined,
      };
    });
    return { animal, animalId, animalIdx, items };
  });
};

const normalizeAnimalFindings = (
  templateItems: OrderedTemplateItem[],
  incomingItems: unknown,
  animalId: string,
  mode: ResultSaveMode
) => {
  if (!Array.isArray(incomingItems) || !incomingItems.length) {
    throw new HttpError(400, `At least one result item is required for animal ${animalId}.`);
  }

  const templateByKey = new Map(
    templateItems.map((item) => [String(item.orderedTestKey || "").trim(), item])
  );
  const seen = new Set<string>();

  const findings = incomingItems.map((entry, index) => {
    const orderedTestKey = requireNonEmpty(
      (entry as any)?.orderedTestKey,
      `animalResults[${animalId}].items[${index}].orderedTestKey`
    );
    const template = templateByKey.get(orderedTestKey);
    if (!template) {
      throw new HttpError(
        400,
        `Ordered test '${orderedTestKey}' does not belong to animal ${animalId} in this order.`
      );
    }
    if (seen.has(orderedTestKey)) {
      throw new HttpError(400, `Ordered test '${orderedTestKey}' was provided more than once.`);
    }
    seen.add(orderedTestKey);

    const resultStatus = requireNonEmpty(
      (entry as any)?.resultStatus,
      `animalResults[${animalId}].items[${index}].resultStatus`
    ) as IncomingResultStatus;
    if (!(resultStatus in RESULT_STATUS_TO_OUTCOME)) {
      throw new HttpError(400, `Invalid result status '${resultStatus}' for animal ${animalId}.`);
    }

    return {
      orderedTestKey,
      marker: String(template.geneName || "").trim(),
      sourceOrderedName: String(template.sourceOrderedName || "").trim(),
      catalogTestId: String(template.catalogTestId || "").trim() || undefined,
      outcome: RESULT_STATUS_TO_OUTCOME[resultStatus],
      confidence: normalizeConfidence((entry as any)?.confidence),
      notes: optionalString((entry as any)?.notes),
    };
  });

  if (mode === "submit" && seen.size !== templateItems.length) {
    throw new HttpError(
      400,
      `A submitted result must include a status for every ordered test for animal ${animalId}.`
    );
  }

  return findings;
};

export const saveOrderResult = async (
  orderId: string,
  payload: PersistOrderResultPayload,
  user: PersistOrderResultUser,
  mode: ResultSaveMode
) => {
  const normalizedOrderId = requireNonEmpty(orderId, "orderId");
  const payloadOrderId = optionalString(payload?.orderId);
  if (payloadOrderId && payloadOrderId !== normalizedOrderId) {
    throw new HttpError(400, "Result payload orderId does not match the route orderId.");
  }

  const order = await loadEditableOrder(normalizedOrderId, user);
  if (order.status === "cancelled") {
    throw new HttpError(409, "Cancelled orders cannot accept lab results.");
  }
  if (order.status === "submitted") {
    throw new HttpError(409, "Order must be received before lab results can be entered.");
  }
  if (mode === "draft" && order.status === "completed") {
    throw new HttpError(409, "Completed orders cannot be moved back to draft result entry.");
  }

  const testCode = requireNonEmpty(payload?.testCode, "testCode");
  const animalTemplates = buildOrderedTemplates(order);

  // Resolve which animals to process:
  // Prefer new `animalResults` array; fall back to legacy flat `items` bound to primary animal.
  let animalResultInputs: AnimalResultInput[];
  if (Array.isArray(payload?.animalResults) && payload.animalResults.length) {
    animalResultInputs = payload.animalResults;
  } else if (Array.isArray((payload as any)?.items)) {
    // Legacy single-animal fallback
    const primaryTemplate = animalTemplates[0];
    animalResultInputs = [{ animalId: primaryTemplate.animalId, items: (payload as any).items }];
  } else {
    throw new HttpError(400, "Either animalResults or items is required.");
  }

  // Validate all animals are present in submit mode
  if (mode === "submit") {
    const providedIds = new Set(animalResultInputs.map((ar) => ar.animalId));
    const missingAnimal = animalTemplates.find((at) => !providedIds.has(at.animalId));
    if (missingAnimal) {
      throw new HttpError(
        400,
        `Results are missing for animal ${missingAnimal.animalId}. All animals must be included when submitting.`
      );
    }
  }

  const nextOrderStatus =
    mode === "submit"
      ? "completed"
      : order.status === "received"
      ? "in_progress"
      : order.status;

  const savedResults = await prisma.$transaction(async (tx: any) => {
    const results: any[] = [];

    for (const animalInput of animalResultInputs) {
      const animalId = String(animalInput.animalId || "").trim();
      const animalTemplate = animalTemplates.find((at) => at.animalId === animalId);
      if (!animalTemplate) {
        throw new HttpError(400, `Animal ${animalId} is not part of this order.`);
      }

      const findings = normalizeAnimalFindings(
        animalTemplate.items,
        animalInput.items,
        animalId,
        mode
      );
      const sampleId = getSharedSampleId(order.id, animalTemplate.animalIdx);

      // Use findFirst + update/create instead of upsert to avoid relying on
      // the named compound unique key — Prisma client may be out of sync with
      // the schema if prisma generate hasn't been re-run yet.
      const existing = await tx.shedTestOrderResult.findFirst({
        where: { orderId: order.id, animalId, testCode },
      });

      const resultData = {
        sampleId,
        status: mode === "submit" ? "completed" : "running",
        method: optionalString(payload?.method) || null,
        findingsJson: findings as any,
        summary: optionalString(payload?.summary) || null,
        reportedAt: mode === "submit" ? new Date() : null,
        analystUserId: user.id,
        notes: optionalString(payload?.notes) || null,
      };

      const savedResult = existing
        ? await tx.shedTestOrderResult.update({
            where: { id: existing.id },
            data: resultData,
          })
        : await tx.shedTestOrderResult.create({
            data: {
              orderId: order.id,
              animalId,
              sampleId,
              status: mode === "submit" ? "completed" : "running",
              testCode,
              method: optionalString(payload?.method) || null,
              findingsJson: findings as any,
              summary: optionalString(payload?.summary) || null,
              reportedAt: mode === "submit" ? new Date() : null,
              analystUserId: user.id,
              notes: optionalString(payload?.notes) || null,
            },
          });

      results.push(savedResult);
    }

    if (nextOrderStatus !== order.status) {
      await tx.shedTestOrder.update({
        where: { id: order.id },
        data: { status: nextOrderStatus },
      });
    }

    return results;
  });

  const refreshedOrder = await prisma.shedTestOrder.findUnique({
    where: { id: order.id },
    include: {
      breeder: { select: { id: true, email: true, fullName: true, role: true } },
      animals: { include: { tests: true } },
      results: { orderBy: { updatedAt: "desc" } },
    },
  });

  if (!refreshedOrder) throw new HttpError(404, "Order not found after saving result.");

  return {
    // Return the first saved result for backward compat (single-animal callers expect `result`)
    result: savedResults[0] || null,
    results: savedResults,
    order: refreshedOrder,
    mode,
  };
};
