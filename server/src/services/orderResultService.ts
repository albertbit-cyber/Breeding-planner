import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";

type PersistOrderResultUser = {
  id: string;
  role: "admin" | "lab" | "breeder";
};

type ResultSaveMode = "draft" | "submit";

type PersistOrderResultPayload = {
  orderId?: unknown;
  testCode?: unknown;
  method?: unknown;
  items?: unknown;
  summary?: unknown;
  notes?: unknown;
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

const getSharedSampleId = (orderId: string, index: number): string =>
  `${sanitizeKeyPart(orderId)}-sample-${index + 1}`;

const assertLabUser = (user: PersistOrderResultUser): void => {
  if (user.role === "breeder") {
    throw new HttpError(403, "Breeder users cannot persist lab results.");
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
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const loadEditableOrder = async (orderId: string, user: PersistOrderResultUser) => {
  assertLabUser(user);

  const order = await prisma.shedTestOrder.findUnique({
    where: { id: orderId },
    include: {
      breeder: { select: { id: true, email: true, fullName: true, role: true } },
      animals: {
        include: {
          tests: true,
        },
      },
      results: {
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!order) {
    throw new HttpError(404, "Order not found.");
  }

  return order;
};

const buildOrderedTemplate = (order: any) => {
  const primaryAnimal = Array.isArray(order?.animals) ? order.animals[0] : null;
  const orderedTests = Array.isArray(primaryAnimal?.tests) ? primaryAnimal.tests : [];

  if (!primaryAnimal) {
    throw new HttpError(400, "Order does not contain an animal to attach results to.");
  }

  if (!orderedTests.length) {
    throw new HttpError(400, "Order has no requested tests to attach results to.");
  }

  return {
    primaryAnimal,
    items: orderedTests.map((test: any, index: number) => {
      const sourceOrderedName = String(test?.testNameSnapshot || test?.testId || "").trim();
      const orderedTestKey = `${order.id}:${sanitizeKeyPart(sourceOrderedName)}:${index + 1}`;
      return {
        orderedTestKey,
        geneName: sourceOrderedName,
        sourceOrderedName,
        catalogTestId: String(test?.testId || "").trim() || undefined,
      };
    }),
  };
};

const normalizeFindings = (templateItems: Array<Record<string, unknown>>, incomingItems: unknown, mode: ResultSaveMode) => {
  if (!Array.isArray(incomingItems) || !incomingItems.length) {
    throw new HttpError(400, "At least one ordered test result is required.");
  }

  const templateByKey = new Map(
    templateItems.map((item) => [String(item.orderedTestKey || "").trim(), item])
  );
  const seen = new Set<string>();

  const findings = incomingItems.map((entry, index) => {
    const orderedTestKey = requireNonEmpty((entry as any)?.orderedTestKey, `items[${index}].orderedTestKey`);
    const template = templateByKey.get(orderedTestKey);
    if (!template) {
      throw new HttpError(400, `Ordered test '${orderedTestKey}' does not belong to this order.`);
    }
    if (seen.has(orderedTestKey)) {
      throw new HttpError(400, `Ordered test '${orderedTestKey}' was provided more than once.`);
    }
    seen.add(orderedTestKey);

    const resultStatus = requireNonEmpty((entry as any)?.resultStatus, `items[${index}].resultStatus`) as IncomingResultStatus;
    if (!(resultStatus in RESULT_STATUS_TO_OUTCOME)) {
      throw new HttpError(400, `Invalid result status for ordered test '${orderedTestKey}'.`);
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
    throw new HttpError(400, "A submitted result must include a status for every ordered test.");
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
  const { primaryAnimal, items } = buildOrderedTemplate(order);
  const findings = normalizeFindings(items, payload?.items, mode);
  const sampleId = getSharedSampleId(order.id, 0);

  const nextOrderStatus = mode === "submit"
    ? "completed"
    : order.status === "received"
      ? "in_progress"
      : order.status;

  const result = await prisma.$transaction(async (tx: any) => {
    const savedResult = await tx.shedTestOrderResult.upsert({
      where: {
        orderId_testCode: {
          orderId: order.id,
          testCode,
        },
      },
      update: {
        animalId: String(primaryAnimal?.animalId || "").trim(),
        sampleId,
        status: mode === "submit" ? "completed" : "running",
        method: optionalString(payload?.method) || null,
        findingsJson: findings as any,
        summary: optionalString(payload?.summary) || null,
        reportedAt: mode === "submit" ? new Date() : null,
        analystUserId: user.id,
        notes: optionalString(payload?.notes) || null,
      },
      create: {
        orderId: order.id,
        animalId: String(primaryAnimal?.animalId || "").trim(),
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

    if (nextOrderStatus !== order.status) {
      await tx.shedTestOrder.update({
        where: { id: order.id },
        data: { status: nextOrderStatus },
      });
    }

    return savedResult;
  });

  const refreshedOrder = await prisma.shedTestOrder.findUnique({
    where: { id: order.id },
    include: {
      breeder: { select: { id: true, email: true, fullName: true, role: true } },
      animals: {
        include: {
          tests: true,
        },
      },
      results: {
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!refreshedOrder) {
    throw new HttpError(404, "Order not found after saving result.");
  }

  return {
    result,
    order: refreshedOrder,
    mode,
  };
};
