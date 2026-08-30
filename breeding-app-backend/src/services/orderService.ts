import type { AnimalOrderInput } from "../types/api";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { calculateOrderBreakdown, toPublicBreakdown } from "./pricingService";
import { buildNextOrderNumber, ensureSharedOrderNumbers } from "./orderNumberService";
import type { AppRole } from "../types/auth";
import { isAdminRole, isLabRole } from "../auth/identity";

const toPrice = (value: number) => Number(value.toFixed(2));

/**
 * The issuing laboratory's identity, carried on every order the clients read.
 *
 * Certificates and shipping labels are rendered from this. They used to be
 * rendered from a constant naming a single laboratory, which meant every
 * vendor's documents went out under one lab's name, address and logo.
 */
export const LAB_IDENTITY_SELECT = {
  id: true,
  name: true,
  labAccount: {
    select: {
      labName: true,
      contactPerson: true,
      contactEmail: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      postalCode: true,
      country: true,
      logoUrl: true,
      turnaroundDays: true,
      iban: true,
      bic: true,
      vatNumber: true,
    },
  },
} as const;
type OrderActor = { id?: string; role: AppRole };

/**
 * The actor's organization, as loaded once per request by the `withOrgContext`
 * middleware. Passed in rather than looked up here so a request that touches
 * several orders makes one membership query, not one per order.
 */
type OrgContext = { organizationId: string } | null | undefined;

const assertOrderWorkflowUser = (user: OrderActor): void => {
  if (user.role === "buyer" || user.role === "viewer") {
    throw new HttpError(403, "Buyer users cannot access lab order workflows.");
  }
};

const assertLabWorkflowUser = (user: OrderActor): void => {
  if (!isLabRole(user.role)) {
    throw new HttpError(403, "Only admin or lab users can manage lab order workflows.");
  }
};

/**
 * The tenancy gate for every lab-side action on an order.
 *
 * Before this existed, any lab account could read and modify *every* order in
 * the system — with a single laboratory that was invisible, with two it is a
 * cross-tenant breach. Platform admins bypass it deliberately; that is what
 * makes the oversight console able to support vendors at all.
 *
 * A mismatch raises 404, not 403: telling one lab that an order id exists but
 * belongs to someone else is itself a small disclosure.
 */
const assertLabOwnsOrder = (
  user: OrderActor,
  org: OrgContext,
  order: { labOrganizationId?: string | null }
): void => {
  if (isAdminRole(user.role)) return;
  if (!org?.organizationId) {
    throw new HttpError(403, "This account does not belong to a laboratory.");
  }
  if (!order.labOrganizationId || order.labOrganizationId !== org.organizationId) {
    throw new HttpError(404, "Order not found.");
  }
};

/**
 * Resolves the tests and prices for one laboratory.
 *
 * Everything an order is priced and validated against comes from here, and it
 * takes a lab id with no default: there is no "the catalog" or "the pricing"
 * any more, only a given lab's. A lab without its own pricing row fails loudly
 * rather than falling back to a platform default, because a silent fallback
 * would quote one lab's prices for another lab's work.
 */
const resolveLabPricingContext = async (labOrganizationId: string) => {
  const [lab, offerings, pricing] = await Promise.all([
    prisma.labAccount.findFirst({
      where: {
        organizationId: labOrganizationId,
        status: "approved",
        organization: { status: "active", kind: "lab_vendor" },
      },
      select: { labName: true },
    }),
    // Every field the pricing engine reads must come back here: a missing
    // `priceCents` would silently price a panel at zero.
    (prisma as any).labTestOffering.findMany({
      where: { organizationId: labOrganizationId, active: true, visibleInBreederApp: true },
    }),
    (prisma as any).pricingConfig.findUnique({ where: { organizationId: labOrganizationId } }),
  ]);

  if (!lab) throw new HttpError(404, "That laboratory is not available for new orders.");
  if (!pricing) throw new HttpError(409, "That laboratory has not finished setting up its pricing yet.");
  if (!offerings.length) throw new HttpError(409, "That laboratory is not offering any tests yet.");

  return { labName: lab.labName, offerings, pricing };
};

const requireLabOrganizationId = (value: unknown): string => {
  const labOrganizationId = String(value || "").trim();
  if (!labOrganizationId) {
    throw new HttpError(400, "Choose a laboratory before requesting a price.");
  }
  return labOrganizationId;
};

export const calculatePrice = async (animals: AnimalOrderInput[], labOrganizationId: unknown) => {
  const { offerings, pricing } = await resolveLabPricingContext(requireLabOrganizationId(labOrganizationId));
  const breakdown = calculateOrderBreakdown(animals, offerings, pricing);
  return toPublicBreakdown(breakdown);
};

export const createOrder = async (
  breederId: string,
  animals: AnimalOrderInput[],
  labOrganizationId: unknown
) => {
  const resolvedLabId = requireLabOrganizationId(labOrganizationId);
  const { offerings, pricing } = await resolveLabPricingContext(resolvedLabId);

  const breakdown = calculateOrderBreakdown(animals, offerings, pricing);
  const priceSnapshot = {
    calculatedAt: new Date().toISOString(),
    pricingConfigId: pricing.id,
    breakdown: toPublicBreakdown(breakdown),
  } as unknown as Record<string, unknown>;

  const created = await prisma.$transaction(async (tx: any) => {
    await ensureSharedOrderNumbers(tx);
    // Scoped to the receiving lab: a shared sequence would let each vendor infer
    // the others' order volume from the gaps in its own numbering.
    const existingOrders = await tx.shedTestOrder.findMany({
      where: { labOrganizationId: resolvedLabId },
      select: { orderNumber: true },
    });
    const orderNumber = buildNextOrderNumber(
      existingOrders.map((entry: { orderNumber?: string | null }) => entry.orderNumber),
      new Date()
    );

    const order = await tx.shedTestOrder.create({
      data: {
        orderNumber,
        labOrganizationId: resolvedLabId,
        breederId,
        totalAnimals: breakdown.animalCount,
        pricingTier: breakdown.tier,
        totalPrice: toPrice(breakdown.total),
        currency: breakdown.currency,
        status: "submitted",
        priceSnapshotJson: priceSnapshot as any,
      },
    });

    for (const row of breakdown.perAnimal) {
      const orderAnimal = await tx.shedTestOrderAnimal.create({
        data: {
          orderId: order.id,
          animalId: row.animalId,
          animalName: row.animalName,
          morphBaseCost: toPrice(row.morphBaseCost),
          additionalMorphCost: toPrice(row.additionalMorphCost),
          sexCost: toPrice(row.sexCost),
          panelCost: toPrice(row.panelCost),
          total: toPrice(row.total),
        },
      });

      // Splitting the animal's total back across its lines, so each line records
      // what it actually cost rather than an even share.
      const isFlat = (entry: { priceModel?: string | null; testKind?: string | null }) =>
        String(entry.priceModel || "tier") === "flat" || String(entry.testKind || "") === "panel";
      const tieredMorphs = row.selectedCatalogTests.filter(
        (entry) => !isFlat(entry) && entry.pricingType === "morph"
      );
      const tieredSexTests = row.selectedCatalogTests.filter(
        (entry) => !isFlat(entry) && entry.pricingType === "sex"
      );

      for (const test of row.selectedCatalogTests) {
        const morphIndex = tieredMorphs.findIndex((entry) => entry.id === test.id);

        const priceApplied = (() => {
          // A flat-priced item carries its own price, whatever the order size.
          if (isFlat(test)) return (test.priceCents ?? 0) / 100;
          if (test.pricingType === "sex") {
            return tieredSexTests.length ? row.sexCost / tieredSexTests.length : 0;
          }
          if (morphIndex === 0) return row.morphBaseCost;
          if (morphIndex > 0) return row.additionalMorphCost / (tieredMorphs.length - 1);
          return 0;
        })();

        await tx.shedTestOrderAnimalTest.create({
          data: {
            orderAnimalId: orderAnimal.id,
            offeringId: test.id,
            testNameSnapshot: test.name,
            pricingTypeSnapshot: test.pricingType,
            priceApplied: toPrice(priceApplied),
          },
        });
      }
    }

    return order;
  });

  // Temporary debug log requested.
  console.log("[orders] order creation result", {
    orderId: created.id,
    breederId,
    totalAnimals: created.totalAnimals,
    totalPrice: created.totalPrice.toString(),
  });

  return getOrderByIdForUser(created.id, { id: breederId, role: "breeder" }, null);
};

export const listOrdersForUser = async (user: { id: string; role: AppRole }, org?: OrgContext) => {
  assertOrderWorkflowUser(user);
  await ensureSharedOrderNumbers();

  // Platform admins see every tenant's queue; that is the oversight console.
  if (isAdminRole(user.role)) {
    return prisma.shedTestOrder.findMany({
      include: {
        breeder: { select: { id: true, email: true, fullName: true, role: true } },
        labOrganization: { select: LAB_IDENTITY_SELECT },
        animals: { include: { tests: true } },
        results: { orderBy: { updatedAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // A lab sees the orders addressed to it, and nothing else. This used to be an
  // unfiltered findMany for any lab role.
  if (isLabRole(user.role)) {
    if (!org?.organizationId) {
      throw new HttpError(403, "This account does not belong to a laboratory.");
    }
    return prisma.shedTestOrder.findMany({
      where: { labOrganizationId: org.organizationId },
      include: {
        breeder: { select: { id: true, email: true, fullName: true, role: true } },
        animals: { include: { tests: true } },
        results: { orderBy: { updatedAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  return prisma.shedTestOrder.findMany({
    where: { breederId: user.id },
    include: {
      labOrganization: { select: LAB_IDENTITY_SELECT },
      animals: { include: { tests: true } },
      results: { orderBy: { updatedAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getOrderByIdForUser = async (
  orderId: string,
  user: { id: string; role: AppRole },
  org?: OrgContext
) => {
  assertOrderWorkflowUser(user);
  await ensureSharedOrderNumbers();

  const order = await prisma.shedTestOrder.findUnique({
    where: { id: orderId },
    include: {
      breeder: { select: { id: true, email: true, fullName: true, role: true } },
      labOrganization: { select: LAB_IDENTITY_SELECT },
      animals: { include: { tests: true } },
      results: { orderBy: { updatedAt: "desc" } },
    },
  });

  if (!order) throw new HttpError(404, "Order not found.");

  if (user.role === "breeder" && order.breederId !== user.id) {
    throw new HttpError(403, "You can only access your own orders.");
  }

  if (isLabRole(user.role) && !isAdminRole(user.role)) {
    assertLabOwnsOrder(user, org, order);
  }

  return order;
};

export const updateOrderStatus = async (
  orderId: string,
  status: "submitted" | "received" | "in_progress" | "completed" | "cancelled",
  user: { role: AppRole },
  org?: OrgContext
) => {
  assertLabWorkflowUser(user);

  const existing = await prisma.shedTestOrder.findUnique({ where: { id: orderId } });
  if (!existing) throw new HttpError(404, "Order not found.");
  assertLabOwnsOrder(user, org, existing);

  // When samples are marked as received, record that a payment request is now due.
  const extraData: Record<string, unknown> = {};
  if (status === "received" && existing.status !== "received") {
    extraData.paymentRequestedAt = new Date();
  }

  return prisma.shedTestOrder.update({
    where: { id: orderId },
    data: { status, ...extraData },
  });
};

export const updateOrderPayment = async (
  orderId: string,
  input: { paymentStatus: "pending" | "invoiced" | "paid" | "waived"; paymentRef?: string },
  user: { role: AppRole },
  org?: OrgContext
) => {
  assertLabWorkflowUser(user);

  const existing = await prisma.shedTestOrder.findUnique({ where: { id: orderId } });
  if (!existing) throw new HttpError(404, "Order not found.");
  assertLabOwnsOrder(user, org, existing);

  const PAYMENT_STATUSES = ["pending", "invoiced", "paid", "waived"] as const;
  if (!PAYMENT_STATUSES.includes(input.paymentStatus as any)) {
    throw new HttpError(400, `Invalid payment status. Allowed: ${PAYMENT_STATUSES.join(", ")}`);
  }

  return prisma.shedTestOrder.update({
    where: { id: orderId },
    data: {
      paymentStatus: input.paymentStatus as any,
      paidAt: input.paymentStatus === "paid" ? new Date() : existing.paidAt,
      paymentRef: input.paymentRef !== undefined ? input.paymentRef : existing.paymentRef,
    },
    include: {
      breeder: { select: { id: true, email: true, fullName: true, role: true } },
      animals: { include: { tests: true } },
      results: { orderBy: { updatedAt: "desc" } },
    },
  });
};

const loadOrderForDeletion = async (orderId: string) => {
  const existing = await prisma.shedTestOrder.findUnique({
    where: { id: orderId },
    include: {
      labOrganization: { select: { id: true } },
      animals: {
        include: {
          tests: {
            select: { id: true },
          },
        },
      },
      results: {
        select: { id: true },
      },
    },
  });

  if (!existing) {
    throw new HttpError(404, "Order not found.");
  }

  return existing;
};

const deleteOrderAndReturnCounts = async (existing: Awaited<ReturnType<typeof loadOrderForDeletion>>) => {
  const deletedAnimals = existing.animals.length;
  const deletedAnimalTests = existing.animals.reduce(
    (sum: number, animal: { tests: Array<{ id: string }> }) => sum + animal.tests.length,
    0
  );
  const deletedResults = existing.results.length;

  await prisma.shedTestOrder.delete({
    where: { id: existing.id },
  });

  return {
    deletedOrderId: existing.id,
    deletedAnimals,
    deletedAnimalTests,
    deletedResults,
  };
};

export const deleteOrderById = async (
  orderId: string,
  user: { role: AppRole },
  org?: OrgContext
) => {
  assertLabWorkflowUser(user);
  const existing = await loadOrderForDeletion(orderId);
  assertLabOwnsOrder(user, org, existing);
  return deleteOrderAndReturnCounts(existing);
};

export const cancelOwnOrderById = async (
  orderId: string,
  user: { id?: string; role: AppRole }
) => {
  const existing = await loadOrderForDeletion(orderId);

  if (existing.breederId !== user.id) {
    throw new HttpError(403, "You can only cancel your own orders.");
  }

  if (existing.status !== "submitted") {
    throw new HttpError(409, "Only orders that have not yet been received by the lab can be cancelled.");
  }

  return deleteOrderAndReturnCounts(existing);
};

/**
 * Wipes every order across every tenant. Admin-only at the service level, not
 * just at the route: `assertLabWorkflowUser` would also admit a lab user, and a
 * single vendor must never be able to delete another vendor's order history.
 */
export const deleteAllOrders = async (user: { role: AppRole }) => {
  if (!isAdminRole(user.role)) {
    throw new HttpError(403, "Only platform administrators can delete all orders.");
  }

  const result = await prisma.$transaction(async (tx: any) => {
    const deletedAnimalTests = await tx.shedTestOrderAnimalTest.deleteMany({});
    const deletedAnimals = await tx.shedTestOrderAnimal.deleteMany({});
    const deletedOrders = await tx.shedTestOrder.deleteMany({});

    return {
      deletedOrders: Number(deletedOrders?.count || 0),
      deletedAnimals: Number(deletedAnimals?.count || 0),
      deletedAnimalTests: Number(deletedAnimalTests?.count || 0),
    };
  });

  console.log("[orders] deleted all lab orders", result);
  return result;
};
