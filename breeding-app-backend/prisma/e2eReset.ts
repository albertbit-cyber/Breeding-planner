import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const E2E_RESET_CONFIRM_VALUE = "local";

const E2E_USERS = {
  admin: {
    email: "admin@breedingplanner.dev",
    fullName: "BreedingPlanner Admin",
    password: "admin1234",
    role: "admin" as const,
  },
  breeder: {
    email: "breeder@proherper.dev",
    fullName: "Seed Breeder",
    password: "breeder1234",
    role: "breeder" as const,
  },
  lab: {
    email: "lab@proherper.dev",
    fullName: "Seed Lab User",
    password: "demo1234",
    role: "lab" as const,
  },
};

const E2E_ANIMAL = {
  id: "25Ath-1",
  name: "Athena - DEMO",
};

const E2E_BASELINE_ORDER = {
  id: "e2e-lab-order-baseline",
  orderNumber: "05AA00001",
  animalId: E2E_ANIMAL.id,
  animalName: E2E_ANIMAL.name,
  testId: "clown",
  testName: "Clown",
};

const forbiddenUrlParts = [
  "production",
  "prod",
  "staging",
  "render.com",
  "railway.app",
  "supabase",
  "neon.tech",
  "amazonaws.com",
  "rds.amazonaws.com",
  "heroku",
  "fly.dev",
  "vercel",
];

const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);

const assertLocalDatabaseUrl = () => {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for E2E reset.");
  }

  const confirm = String(process.env.E2E_RESET_CONFIRM || "").trim().toLowerCase();
  if (confirm !== E2E_RESET_CONFIRM_VALUE) {
    throw new Error("Set E2E_RESET_CONFIRM=local before running the E2E reset.");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }

  if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
    throw new Error("E2E reset only supports local PostgreSQL DATABASE_URL values.");
  }

  const hostname = parsed.hostname.toLowerCase();
  const databaseName = parsed.pathname.replace(/^\/+/, "").toLowerCase();
  const lowerUrl = databaseUrl.toLowerCase();
  const forbiddenMatch = forbiddenUrlParts.find((part) => lowerUrl.includes(part));

  if (!allowedHosts.has(hostname) || forbiddenMatch || !databaseName) {
    throw new Error("Refusing E2E reset because DATABASE_URL does not look like a local test database.");
  }

  return { hostname, databaseName };
};

const passwordHash = async (password: string) => bcrypt.hash(password, 12);

const upsertUser = async (user: (typeof E2E_USERS)[keyof typeof E2E_USERS]) =>
  prisma.user.upsert({
    where: { email: user.email },
    update: {
      fullName: user.fullName,
      role: user.role,
      isActive: true,
      passwordHash: await passwordHash(user.password),
    },
    create: {
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: true,
      passwordHash: await passwordHash(user.password),
    },
  });

const ensureCatalogAndPricing = async () => {
  await prisma.shedTestCatalog.upsert({
    where: { id: E2E_BASELINE_ORDER.testId },
    update: {
      name: E2E_BASELINE_ORDER.testName,
      shortLabel: "Clown",
      geneTarget: "Clown",
      category: "morph",
      pricingType: "morph",
      priceCents: 3500,
      currency: "EUR",
      allowedPriorities: ["routine", "priority", "urgent"],
      active: true,
      visibleInBreederApp: true,
      description: "Deterministic E2E Clown genetic test",
      sortOrder: 1,
    },
    create: {
      id: E2E_BASELINE_ORDER.testId,
      name: E2E_BASELINE_ORDER.testName,
      shortLabel: "Clown",
      geneTarget: "Clown",
      category: "morph",
      pricingType: "morph",
      priceCents: 3500,
      currency: "EUR",
      allowedPriorities: ["routine", "priority", "urgent"],
      active: true,
      visibleInBreederApp: true,
      description: "Deterministic E2E Clown genetic test",
      sortOrder: 1,
    },
  });

  const activePricing = await prisma.pricingConfig.findFirst({ where: { isActive: true } });
  if (!activePricing) {
    await prisma.pricingConfig.create({
      data: {
        currency: "EUR",
        morphTier1to9FirstTest: 35,
        morphTier1to9AdditionalTest: 20,
        morphTier10to49FirstTest: 30,
        morphTier10to49AdditionalTest: 20,
        morphTier50PlusFirstTest: 25,
        morphTier50PlusAdditionalTest: 20,
        sexTier1to9: 30,
        sexTier10to49: 25,
        sexTier50Plus: 20,
        isActive: true,
      },
    });
  }
};

const ensureLabAccount = async (labUserId: string) => {
  await prisma.labAccount.upsert({
    where: { userId: labUserId },
    update: {
      labName: "Seed Genetics Lab",
      contactPerson: E2E_USERS.lab.fullName,
      location: "Germany",
      status: "approved",
      permissionsJson: { can_manage_test_orders: true, can_upload_results: true },
      availableTestsJson: [E2E_BASELINE_ORDER.testId],
      pricingJson: { currency: "EUR", baseMorphTest: 35 },
    },
    create: {
      userId: labUserId,
      labName: "Seed Genetics Lab",
      contactPerson: E2E_USERS.lab.fullName,
      location: "Germany",
      status: "approved",
      permissionsJson: { can_manage_test_orders: true, can_upload_results: true },
      availableTestsJson: [E2E_BASELINE_ORDER.testId],
      pricingJson: { currency: "EUR", baseMorphTest: 35 },
    },
  });
};

const resetBreederLabOrders = async (breederId: string) => {
  await prisma.shedTestOrder.deleteMany({
    where: {
      breederId,
    },
  });
};

const createBaselineOrder = async (breederId: string) => {
  const orderData = {
    orderNumber: E2E_BASELINE_ORDER.orderNumber,
    breederId,
    totalAnimals: 1,
    pricingTier: "tier_1_9" as const,
    totalPrice: 35,
    currency: "EUR",
    status: "submitted" as const,
    paymentStatus: "pending" as const,
    priceSnapshotJson: {
      deterministicFixture: true,
      calculatedAt: "2026-05-01T00:00:00.000Z",
      breakdown: {
        total: 35,
        currency: "EUR",
        animals: 1,
        tests: [E2E_BASELINE_ORDER.testId],
      },
    },
    animals: {
      create: [
        {
          animalId: E2E_BASELINE_ORDER.animalId,
          animalName: E2E_BASELINE_ORDER.animalName,
          morphBaseCost: 35,
          additionalMorphCost: 0,
          sexCost: 0,
          total: 35,
          tests: {
            create: [
              {
                testId: E2E_BASELINE_ORDER.testId,
                testNameSnapshot: E2E_BASELINE_ORDER.testName,
                pricingTypeSnapshot: "morph",
                priceApplied: 35,
              },
            ],
          },
        },
      ],
    },
  };

  const order = await prisma.shedTestOrder.upsert({
    where: { id: E2E_BASELINE_ORDER.id },
    update: {
      ...orderData,
      animals: {
        deleteMany: {},
        create: orderData.animals.create,
      },
      results: {
        deleteMany: {},
      },
    },
    create: {
      id: E2E_BASELINE_ORDER.id,
      ...orderData,
    },
  });

  return order;
};

const main = async () => {
  const database = assertLocalDatabaseUrl();

  const [adminUser, breederUser, labUser] = await Promise.all([
    upsertUser(E2E_USERS.admin),
    upsertUser(E2E_USERS.breeder),
    upsertUser(E2E_USERS.lab),
  ]);

  await prisma.user.update({
    where: { id: breederUser.id },
    data: {
      subscriptionPlan: "breeder",
      subscriptionStatus: "active",
      subscriptionPaymentStatus: "paid",
      verificationStatus: "pending",
    },
  });

  await ensureCatalogAndPricing();
  await ensureLabAccount(labUser.id);
  await resetBreederLabOrders(breederUser.id);
  const baselineOrder = await createBaselineOrder(breederUser.id);

  console.log("E2E reset complete", {
    databaseHost: database.hostname,
    databaseName: database.databaseName,
    users: [adminUser.email, breederUser.email, labUser.email],
    baselineOrderNumber: baselineOrder.orderNumber,
  });
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
