import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { ensureSharedOrderNumbers } from "./orderNumberService";
import type { AppRole } from "../types/auth";
import { isAdminRole, isLabRole } from "../auth/identity";
import { LAB_IDENTITY_SELECT } from "./orderService";
import { applyConfirmedResultGenetics, type LabGeneticsApplication } from "./labGeneticsService";
import { notifyResultsReady } from "./labOrderNotificationService";
import { recordCertificatesForSubmittedResults } from "./labCertificateService";
import { attachTestInheritance, type InheritanceKind, type TestInheritance } from "./geneInheritanceService";
import { ORDER_ANIMALS_INCLUDE } from "./orderService";

type PersistOrderResultUser = {
  id: string;
  role: AppRole;
};

/** The actor's organization, loaded once per request by `withOrgContext`. */
type OrgContext = { organizationId: string } | null | undefined;

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
  inheritance: TestInheritance;
};

type OrderedAnimalTemplate = {
  animal: unknown;
  animalId: string;
  animalIdx: number;
  items: OrderedTemplateItem[];
};

/**
 * What a laboratory may answer for one ordered test, by the gene's inheritance.
 *
 *   recessive            negative · heterozygous · homozygous
 *   incomplete dominant  negative · single gene  · super form
 *   dominant             not present · present
 *   sex determination    male · female
 *
 * `visual` is the old catch-all positive and is still accepted so stored drafts
 * and older clients keep working; new clients send the precise answer.
 *
 * `outcome` is what the genetics engine reads (labGeneticsRules). `label` is
 * what the breeder sees, and it is the genotype itself written the way it goes
 * onto the animal: "Negative", "het Clown", "Clown", "Fire", "Super Fire",
 * "Not present", "Pinstripe". Never a laboratory word like "visual" or
 * "heterozygous" on the breeder's side.
 */
type ResultStatusRule = {
  outcome: "notDetected" | "carrierDetected" | "positive" | "reported";
  kinds: ReadonlySet<InheritanceKind>;
  label: (gene: string) => string;
  /** The token written onto the animal for a decisive outcome. */
  genotype?: (gene: string) => string;
};

const GENE_KINDS: ReadonlySet<InheritanceKind> = new Set(["recessive", "incomplete_dominant", "dominant", "unknown"]);
const RECESSIVE_LIKE: ReadonlySet<InheritanceKind> = new Set(["recessive", "unknown"]);
const CODOMINANT: ReadonlySet<InheritanceKind> = new Set(["incomplete_dominant", "unknown"]);
const DOMINANT: ReadonlySet<InheritanceKind> = new Set(["dominant", "unknown"]);
const SEX: ReadonlySet<InheritanceKind> = new Set(["sex"]);

const RESULT_STATUS_RULES: Record<string, ResultStatusRule> = {
  not_detected: { outcome: "notDetected", kinds: GENE_KINDS, label: () => "Negative" },
  not_present: { outcome: "notDetected", kinds: DOMINANT, label: () => "Not present" },
  heterozygous: {
    outcome: "carrierDetected",
    kinds: RECESSIVE_LIKE,
    label: (gene) => `het ${gene}`,
    genotype: (gene) => gene,
  },
  homozygous: { outcome: "positive", kinds: RECESSIVE_LIKE, label: (gene) => gene, genotype: (gene) => gene },
  single_gene: { outcome: "positive", kinds: CODOMINANT, label: (gene) => gene, genotype: (gene) => gene },
  super_form: {
    outcome: "positive",
    kinds: CODOMINANT,
    label: (gene) => `Super ${gene}`,
    genotype: (gene) => `Super ${gene}`,
  },
  present: { outcome: "positive", kinds: DOMINANT, label: (gene) => gene, genotype: (gene) => gene },
  // Legacy catch-all positive, from before the vocabulary followed inheritance.
  visual: { outcome: "positive", kinds: GENE_KINDS, label: (gene) => gene, genotype: (gene) => gene },
  male: { outcome: "reported", kinds: SEX, label: () => "Male" },
  female: { outcome: "reported", kinds: SEX, label: () => "Female" },
};

export const RESULT_STATUSES = Object.keys(RESULT_STATUS_RULES);

const sanitizeKeyPart = (value: string): string =>
  String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9-]/g, "_") || "order";

/**
 * The id printed on the tube.
 *
 * Derived from the order *number*, because that is what the sample label carries
 * and what a technician reads back at intake. It used to be built from the
 * order's cuid with a different separator, so the id stored against a result
 * matched nothing on the physical sample -- invisible day to day, and exactly
 * the sort of thing that makes a sample impossible to trace when someone finally
 * needs to.
 *
 * Falls back to the id for an order that has not been assigned a number yet.
 */
const getSharedSampleId = (order: { id: string; orderNumber?: string | null }, animalIndex: number): string =>
  `${sanitizeKeyPart(String(order.orderNumber || order.id))}-${animalIndex + 1}`;

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

const loadEditableOrder = async (
  orderId: string,
  user: PersistOrderResultUser,
  org: OrgContext
) => {
  assertLabUser(user);
  await ensureSharedOrderNumbers();

  const order = await prisma.shedTestOrder.findUnique({
    where: { id: orderId },
    include: {
      breeder: { select: { id: true, email: true, fullName: true, role: true } },
      // Certificates are issued under the *issuing* lab's name and logo, so the
      // identity has to travel with the order rather than come from a constant.
      labOrganization: { select: LAB_IDENTITY_SELECT },
      animals: ORDER_ANIMALS_INCLUDE,
      results: { orderBy: { updatedAt: "desc" } },
    },
  });

  if (!order) throw new HttpError(404, "Order not found.");

  // Writing a result is the most consequential thing a lab does to an order —
  // it changes the animal's recorded genetics downstream — so the tenancy check
  // belongs here and not only on the read path.
  if (!isAdminRole(user.role)) {
    if (!org?.organizationId) {
      throw new HttpError(403, "This account does not belong to a laboratory.");
    }
    if (!order.labOrganizationId || order.labOrganizationId !== org.organizationId) {
      throw new HttpError(404, "Order not found.");
    }
  }

  return attachTestInheritance(order);
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
    const items = orderedTests.map((test: any, testIdx: number): OrderedTemplateItem => {
      const sourceOrderedName = String(test?.testNameSnapshot || test?.testId || "").trim();
      const inheritance: TestInheritance = test?.inheritance || {
        kind: "unknown",
        gene: sourceOrderedName,
        superGeneName: null,
        speciesId: null,
      };
      return {
        orderedTestKey: `${order.id}:${sanitizeKeyPart(animalId)}:${testIdx + 1}`,
        geneName: sourceOrderedName,
        sourceOrderedName,
        catalogTestId: String(test?.testId || "").trim() || undefined,
        inheritance,
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
    );
    const rule = RESULT_STATUS_RULES[resultStatus];
    if (!rule) {
      throw new HttpError(400, `Invalid result status '${resultStatus}' for animal ${animalId}.`);
    }
    const inheritance = template.inheritance;
    if (!rule.kinds.has(inheritance.kind)) {
      throw new HttpError(
        400,
        `'${resultStatus}' is not a valid answer for ${template.geneName} (${inheritance.kind.replace("_", " ")} gene).`
      );
    }

    // The gene as the species table spells it, so "Pied" ordered from a lab
    // lands on the animal as "Piebald" and matches what the breeder wrote.
    const gene = String(inheritance.gene || template.geneName || "").trim();

    return {
      orderedTestKey,
      marker: String(template.geneName || "").trim(),
      sourceOrderedName: String(template.sourceOrderedName || "").trim(),
      catalogTestId: String(template.catalogTestId || "").trim() || undefined,
      outcome: rule.outcome,
      resultStatus,
      label: rule.label(gene),
      genotype: rule.genotype ? rule.genotype(gene) : undefined,
      inheritance: inheritance.kind,
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
  mode: ResultSaveMode,
  org?: OrgContext
) => {
  const normalizedOrderId = requireNonEmpty(orderId, "orderId");
  const payloadOrderId = optionalString(payload?.orderId);
  if (payloadOrderId && payloadOrderId !== normalizedOrderId) {
    throw new HttpError(400, "Result payload orderId does not match the route orderId.");
  }

  const order = await loadEditableOrder(normalizedOrderId, user, org);
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

  if (mode === "draft") {
    animalResultInputs = animalResultInputs.filter(
      (animalInput) => Array.isArray(animalInput?.items) && animalInput.items.length > 0
    );
    if (!animalResultInputs.length) {
      throw new HttpError(400, "At least one result item is required to save a draft.");
    }
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

  let geneticsApplications: LabGeneticsApplication[] = [];

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
      const sampleId = getSharedSampleId(order, animalTemplate.animalIdx);

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

    // A submitted result is the point at which the finding becomes true about the
    // animal, so the genetics move in the same transaction. A draft says nothing
    // final yet and must not touch the breeder's collection.
    if (mode === "submit") {
      geneticsApplications = await applyConfirmedResultGenetics(tx, {
        order: order as any,
        results,
        actorUserId: user.id,
      });
    }

    return results;
  },
  // The default is 5 seconds. Result submission now also reads the ordered
  // offerings and writes the animals, and an order can carry fifty of them; a
  // timeout here would roll back a laboratory's completed work.
  { timeout: 20000 });

  const refreshedOrder = await prisma.shedTestOrder.findUnique({
    where: { id: order.id },
    include: {
      breeder: { select: { id: true, email: true, fullName: true, role: true } },
      // Certificates are issued under the *issuing* lab's name and logo, so the
      // identity has to travel with the order rather than come from a constant.
      labOrganization: { select: LAB_IDENTITY_SELECT },
      animals: ORDER_ANIMALS_INCLUDE,
      results: { orderBy: { updatedAt: "desc" } },
    },
  });

  if (!refreshedOrder) throw new HttpError(404, "Order not found after saving result.");
  const refreshedWithInheritance = await attachTestInheritance(refreshedOrder);

  // Only a submission is news. A draft is the analyst still working, and mailing
  // the breeder every time one is saved would train them to ignore the one that
  // matters.
  if (mode === "submit") {
    // The certificate becomes the breeder's here, not when someone opens it.
    // Stored before the notification, because the mail invites them to go and
    // download it, and after the transaction, because a certificate row failing
    // must never roll back a laboratory's completed work.
    try {
      await recordCertificatesForSubmittedResults({
        order: refreshedOrder as any,
        results: savedResults as any,
      });
    } catch (error) {
      console.error("[certificates] failed to record certificate for order", order.id, error);
    }

    await notifyResultsReady({ order: refreshedOrder as any, results: savedResults as any });
  }

  return {
    // Return the first saved result for backward compat (single-animal callers expect `result`)
    result: savedResults[0] || null,
    results: savedResults,
    order: refreshedWithInheritance,
    mode,
    genetics: geneticsApplications,
  };
};
