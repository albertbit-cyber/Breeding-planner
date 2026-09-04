import type { AnimalOrderInput } from "../types/api";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { calculateOrderBreakdown, toPublicBreakdown } from "./pricingService";
import { getActivePricing, listCatalog } from "./labConfigService";
import { buildNextOrderNumber, ensureSharedOrderNumbers, getOrderMonthToken } from "./orderNumberService";
import type { AppRole } from "../types/auth";
import { isAdminRole, isLabRole } from "../auth/identity";

const toPrice = (value: number) => Number(value.toFixed(2));
// Prisma's unstated default is a 5 second budget, which an order covering a batch of animals
// could exhaust on round trips alone. Stated here so the limit is a decision rather than a
// default nobody chose, and matching the allowance the cloud-sync write already asks for.
const ORDER_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
};
type OrderActor = { id?: string; role: AppRole };

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

export const calculatePrice = async (animals: AnimalOrderInput[]) => {
  const [catalog, pricing] = await Promise.all([
    listCatalog(false),
    getActivePricing(),
  ]);

  const breakdown = calculateOrderBreakdown(animals, catalog, pricing);
  return toPublicBreakdown(breakdown);
};

export const createOrder = async (breederId: string, animals: AnimalOrderInput[]) => {
  const [catalog, pricing] = await Promise.all([
    listCatalog(false),
    getActivePricing(),
  ]);

  const breakdown = calculateOrderBreakdown(animals, catalog, pricing);
  const priceSnapshot = {
    calculatedAt: new Date().toISOString(),
    pricingConfigId: pricing.id,
    breakdown: toPublicBreakdown(breakdown),
  } as unknown as Record<string, unknown>;

  // Outside the transaction, deliberately. This is a one-off backfill of rows that predate
  // order numbering, not a step in creating an order. Run inside, its writes were rolled back
  // with the transaction whenever the whole thing overran -- so the next attempt found exactly
  // the same unnumbered rows, redid exactly the same work, and overran at exactly the same
  // point. Retrying could never clear it; submitting simply stopped working.
  await ensureSharedOrderNumbers();

  const created = await prisma.$transaction(async (tx: any) => {
    // Only this month's numbers, and only enough of them to find the highest. The previous
    // query selected every order number in the database to pick the next one, so the cost of
    // placing an order grew with the number of orders ever placed.
    const monthToken = getOrderMonthToken();
    const existingOrders = await tx.shedTestOrder.findMany({
      where: { orderNumber: { startsWith: monthToken } },
      select: { orderNumber: true },
      orderBy: { orderNumber: "desc" },
      take: 1,
    });
    const orderNumber = buildNextOrderNumber(
      existingOrders.map((entry: { orderNumber?: string | null }) => entry.orderNumber),
      new Date()
    );

    const order = await tx.shedTestOrder.create({
      data: {
        orderNumber,
        breederId,
        totalAnimals: breakdown.animalCount,
        pricingTier: breakdown.tier,
        totalPrice: toPrice(breakdown.total),
        currency: breakdown.currency,
        status: "submitted",
        priceSnapshotJson: priceSnapshot as any,
      },
    });

    // One round trip for every animal's row, then one for every test line, instead of a
    // separate INSERT per animal and per test in a loop. A large order used to spend its whole
    // budget on that chatter.
    const orderAnimals = await tx.shedTestOrderAnimal.createManyAndReturn({
      data: breakdown.perAnimal.map((row) => ({
        orderId: order.id,
        animalId: row.animalId,
        animalName: row.animalName,
        morphBaseCost: toPrice(row.morphBaseCost),
        additionalMorphCost: toPrice(row.additionalMorphCost),
        sexCost: toPrice(row.sexCost),
        total: toPrice(row.total),
      })),
      select: { id: true, animalId: true },
    });

    // createManyAndReturn preserves input order, but an order may legitimately carry the same
    // animalId twice, so the rows are paired by position rather than looked up by animal.
    const testRows = breakdown.perAnimal.flatMap((row, index) => {
      const orderAnimalId = orderAnimals[index]?.id;
      if (!orderAnimalId) return [];
      const morphTests = row.selectedCatalogTests.filter((entry) => entry.pricingType === "morph");
      return row.selectedCatalogTests.map((test) => {
        const morphIndex = test.pricingType === "morph"
          ? morphTests.findIndex((entry) => entry.id === test.id)
          : -1;

        const priceApplied = (() => {
          if (test.pricingType === "sex") return row.sexCost > 0 ? row.sexCost : 0;
          if (morphIndex === 0) return row.morphBaseCost;
          if (morphIndex > 0 && morphTests.length > 1) return row.additionalMorphCost / (morphTests.length - 1);
          return 0;
        })();

        return {
          orderAnimalId,
          testId: test.id,
          testNameSnapshot: test.name,
          pricingTypeSnapshot: test.pricingType,
          priceApplied: toPrice(priceApplied),
        };
      });
    });

    if (testRows.length) {
      await tx.shedTestOrderAnimalTest.createMany({ data: testRows });
    }

    return order;
  }, ORDER_TRANSACTION_OPTIONS);

  // Temporary debug log requested.
  console.log("[orders] order creation result", {
    orderId: created.id,
    breederId,
    totalAnimals: created.totalAnimals,
    totalPrice: created.totalPrice.toString(),
  });

  return getOrderByIdForUser(created.id, { id: breederId, role: "breeder" });
};

export const listOrdersForUser = async (user: { id: string; role: AppRole }) => {
  assertOrderWorkflowUser(user);
  await ensureSharedOrderNumbers();

  if (isAdminRole(user.role) || isLabRole(user.role)) {
    return prisma.shedTestOrder.findMany({
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
      animals: { include: { tests: true } },
      results: { orderBy: { updatedAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getOrderByIdForUser = async (
  orderId: string,
  user: { id: string; role: AppRole }
) => {
  assertOrderWorkflowUser(user);
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

  if (user.role === "breeder" && order.breederId !== user.id) {
    throw new HttpError(403, "You can only access your own orders.");
  }

  return order;
};

export const updateOrderStatus = async (
  orderId: string,
  status: "submitted" | "received" | "in_progress" | "completed" | "cancelled",
  user: { role: AppRole }
) => {
  assertLabWorkflowUser(user);

  const existing = await prisma.shedTestOrder.findUnique({ where: { id: orderId } });
  if (!existing) throw new HttpError(404, "Order not found.");

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
  user: { role: AppRole }
) => {
  assertLabWorkflowUser(user);

  const existing = await prisma.shedTestOrder.findUnique({ where: { id: orderId } });
  if (!existing) throw new HttpError(404, "Order not found.");

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
  user: { role: AppRole }
) => {
  assertLabWorkflowUser(user);
  const existing = await loadOrderForDeletion(orderId);
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

export const deleteAllOrders = async (user: { role: AppRole }) => {
  assertLabWorkflowUser(user);

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
