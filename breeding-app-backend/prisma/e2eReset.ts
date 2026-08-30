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
  // A second laboratory exists purely so isolation can be proven rather than
  // asserted. With one laboratory, "a lab sees only its own orders" is
  // indistinguishable from "a lab sees every order".
  labB: {
    email: "lab-b@proherper.dev",
    fullName: "Second Lab User",
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
  // Tests are lab-owned now. The catalogue entry above is the platform's shared
  // seed library; this is the laboratory's own offering, and it is what an order
  // line actually references.
  offeringId: "e2e-offering-clown",
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

  const template = await prisma.pricingConfig.findFirst({
    where: { organizationId: null, isActive: true },
  });
  if (!template) {
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

/**
 * Everything the seeded laboratory needs in order to be orderable at all: the
 * tests it sells, and its own tier pricing. Without these the directory shows a
 * laboratory that rejects every quote, and no browser test can place an order.
 */
const ensureLabOfferingsAndPricing = async (organizationId: string, suffix = "") => {
  const offeringId = suffix
    ? `${E2E_BASELINE_ORDER.offeringId}-${suffix}`
    : E2E_BASELINE_ORDER.offeringId;
  const offering = {
    organizationId,
    name: E2E_BASELINE_ORDER.testName,
    shortLabel: "Clown",
    category: "morph",
    pricingType: "morph" as const,
    priceCents: 3500,
    currency: "EUR",
    geneTarget: "Clown",
    catalogRefId: E2E_BASELINE_ORDER.testId,
    allowedPriorities: ["routine", "priority", "urgent"],
    active: true,
    visibleInBreederApp: true,
    description: "Deterministic E2E Clown genetic test",
    sortOrder: 1,
  };

  await prisma.labTestOffering.upsert({
    where: { id: offeringId },
    update: offering,
    create: { id: offeringId, ...offering },
  });

  const template = await prisma.pricingConfig.findFirst({
    where: { organizationId: null, isActive: true },
  });
  const tiers = {
    currency: "EUR",
    morphTier1to9FirstTest: template?.morphTier1to9FirstTest ?? 35,
    morphTier1to9AdditionalTest: template?.morphTier1to9AdditionalTest ?? 20,
    morphTier10to49FirstTest: template?.morphTier10to49FirstTest ?? 30,
    morphTier10to49AdditionalTest: template?.morphTier10to49AdditionalTest ?? 20,
    morphTier50PlusFirstTest: template?.morphTier50PlusFirstTest ?? 25,
    morphTier50PlusAdditionalTest: template?.morphTier50PlusAdditionalTest ?? 20,
    sexTier1to9: template?.sexTier1to9 ?? 30,
    sexTier10to49: template?.sexTier10to49 ?? 25,
    sexTier50Plus: template?.sexTier50Plus ?? 20,
    isActive: true,
  };

  await prisma.pricingConfig.upsert({
    where: { organizationId },
    update: tiers,
    create: { id: `pricing_${organizationId}`, organizationId, ...tiers },
  });
};

// Mirrors the 20260730120000_add_organization_tenancy migration and seed.ts:
// every tenant user owns exactly one Organization, with ids derived from the
// user id so repeated resets are idempotent.
const ensureOrganizationFor = async (
  user: { id: string; email: string; fullName: string },
  kind: "breeder" | "lab_vendor",
  name: string
): Promise<string> => {
  const organizationId = `org_${user.id}`;
  await prisma.organization.upsert({
    where: { id: organizationId },
    update: { name, kind, status: "active" },
    create: {
      id: organizationId,
      name,
      kind,
      status: "active",
      billingEmail: kind === "breeder" ? user.email : null,
    },
  });
  await prisma.membership.upsert({
    where: { userId: user.id },
    update: { organizationId, role: "owner" },
    create: { id: `mbr_${user.id}`, userId: user.id, organizationId, role: "owner" },
  });
  return organizationId;
};

const ensureLabAccount = async (labUserId: string, organizationId: string) => {
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
      organizationId,
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

const createBaselineOrder = async (breederId: string, labOrganizationId: string) => {
  const orderData = {
    orderNumber: E2E_BASELINE_ORDER.orderNumber,
    breederId,
    labOrganizationId,
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
                offeringId: E2E_BASELINE_ORDER.offeringId,
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

  const [adminUser, breederUser, labUser, labBUser] = await Promise.all([
    upsertUser(E2E_USERS.admin),
    upsertUser(E2E_USERS.breeder),
    upsertUser(E2E_USERS.lab),
    upsertUser(E2E_USERS.labB),
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

  // Tenant users only — the admin account is internal staff and gets no org.
  const labOrganizationId = await ensureOrganizationFor(labUser, "lab_vendor", "Seed Genetics Lab");
  const labBOrganizationId = await ensureOrganizationFor(labBUser, "lab_vendor", "Second Genetics Lab");
  await ensureOrganizationFor(breederUser, "breeder", breederUser.fullName);

  await ensureCatalogAndPricing();
  await ensureLabAccount(labUser.id, labOrganizationId);
  await ensureLabAccount(labBUser.id, labBOrganizationId);
  await ensureLabOfferingsAndPricing(labOrganizationId);
  await ensureLabOfferingsAndPricing(labBOrganizationId, "b");
  await resetBreederLabOrders(breederUser.id);
  const baselineOrder = await createBaselineOrder(breederUser.id, labOrganizationId);

  console.log("E2E reset complete", {
    databaseHost: database.hostname,
    databaseName: database.databaseName,
    users: [adminUser.email, breederUser.email, labUser.email, labBUser.email],
    laboratories: [labOrganizationId, labBOrganizationId],
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
