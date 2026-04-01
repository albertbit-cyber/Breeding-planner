import type { AnimalOrderInput } from "../types/api";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { calculateOrderBreakdown, toPublicBreakdown } from "./pricingService";
import { getActivePricing, listCatalog } from "./labConfigService";

const toPrice = (value: number) => Number(value.toFixed(2));

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

  const created = await prisma.$transaction(async (tx: any) => {
    const order = await tx.shedTestOrder.create({
      data: {
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
          total: toPrice(row.total),
        },
      });

      for (const test of row.selectedCatalogTests) {
        const isMorph = test.pricingType === "morph";
        const morphTests = row.selectedCatalogTests.filter((entry) => entry.pricingType === "morph");
        const morphIndex = isMorph ? morphTests.findIndex((entry) => entry.id === test.id) : -1;

        const priceApplied = (() => {
          if (test.pricingType === "sex") return row.sexCost > 0 ? row.sexCost : 0;
          if (morphIndex === 0) return row.morphBaseCost;
          if (morphIndex > 0 && morphTests.length > 1) return row.additionalMorphCost / (morphTests.length - 1);
          return 0;
        })();

        await tx.shedTestOrderAnimalTest.create({
          data: {
            orderAnimalId: orderAnimal.id,
            testId: test.id,
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

  return getOrderByIdForUser(created.id, { id: breederId, role: "breeder" });
};

export const listOrdersForUser = async (user: { id: string; role: "admin" | "lab" | "breeder" }) => {
  if (user.role === "admin" || user.role === "lab") {
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
  user: { id: string; role: "admin" | "lab" | "breeder" }
) => {
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
  user: { role: "admin" | "lab" | "breeder" }
) => {
  if (user.role === "breeder") {
    throw new HttpError(403, "Breeder users cannot update order status.");
  }

  const existing = await prisma.shedTestOrder.findUnique({ where: { id: orderId } });
  if (!existing) throw new HttpError(404, "Order not found.");

  return prisma.shedTestOrder.update({
    where: { id: orderId },
    data: { status },
  });
};

export const deleteAllOrders = async (user: { role: "admin" | "lab" | "breeder" }) => {
  if (user.role === "breeder") {
    throw new HttpError(403, "Breeder users cannot delete lab orders.");
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
