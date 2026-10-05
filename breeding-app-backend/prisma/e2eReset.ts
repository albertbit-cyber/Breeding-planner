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
  // A marketplace buyer: someone with no collection of their own, which is the
  // account the buyer journey has to work for.
  buyer: {
    email: "buyer@proherper.dev",
    fullName: "Seed Buyer",
    password: "buyer1234",
    role: "buyer" as const,
  },
};

/**
 * Marketplace stock for the buyer-journey spec. Fixed ids and a fixed publish
 * date so a reset always yields the same catalogue. The genetics are chosen so
 * a "Clown" search has a right answer: one visual Clown, one het Clown that a
 * visual search must not return.
 */
const E2E_PUBLISHED_AT = new Date("2026-09-01T09:00:00.000Z");
const E2E_LISTINGS = [
  {
    id: "e2e-listing-clown",
    title: "Clown het Pied female",
    species: "Ball python",
    genetics: "Clown het Pied",
    sex: "female",
    category: "Juvenile",
    price: 450,
    weight: 640,
  },
  {
    id: "e2e-listing-pastel",
    title: "Pastel het Clown male",
    species: "Ball python",
    genetics: "Pastel het Clown",
    sex: "male",
    category: "Hatchling",
    price: 220,
    weight: 180,
  },
  {
    id: "e2e-listing-corn",
    title: "Amel corn snake",
    species: "Corn snake",
    genetics: "Amel 50% het Anery",
    sex: "female",
    category: "Sub-adult",
    price: 90,
    weight: 260,
  },
];

// The species the seeded animal belongs to, and therefore the one the seeded
// laboratory has to serve for the breeder flow to be exercisable at all.
const E2E_SERVED_SPECIES = ["ball-python"];

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

// Fixed rather than "now", so a reset produces byte-identical rows every time.
const VERIFIED_AT = new Date("2026-05-01T00:00:00.000Z");

const upsertUser = async (user: (typeof E2E_USERS)[keyof typeof E2E_USERS]) =>
  prisma.user.upsert({
    where: { email: user.email },
    update: {
      fullName: user.fullName,
      role: user.role,
      isActive: true,
      // Verified, because placing an order requires it and these fixtures stand
      // in for established accounts. Without this the seeded breeder could sign
      // in, browse a laboratory's catalogue, and get a bare 403 at the one step
      // the fixtures exist to exercise.
      emailVerified: true,
      emailVerifiedAt: VERIFIED_AT,
      passwordHash: await passwordHash(user.password),
    },
    create: {
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: true,
      emailVerified: true,
      emailVerifiedAt: VERIFIED_AT,
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
    speciesIds: E2E_SERVED_SPECIES,
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

// Named per laboratory: two approved labs both called "Seed Genetics Lab" made
// the breeder's laboratory picker show the same row twice, which is unreadable
// for a human and unaddressable for a test.
const ensureLabAccount = async (labUserId: string, organizationId: string, labName: string) => {
  await prisma.labAccount.upsert({
    where: { userId: labUserId },
    update: {
      labName,
      contactPerson: E2E_USERS.lab.fullName,
      location: "Germany",
      status: "approved",
      permissionsJson: { can_manage_test_orders: true, can_upload_results: true },
      availableTestsJson: [E2E_BASELINE_ORDER.testId],
      pricingJson: { currency: "EUR", baseMorphTest: 35 },
      // A breeder's laboratory directory is filtered to the species they are
      // ordering for. Without this the seeded laboratory exists, is approved and
      // is listed -- and every breeder still sees "no laboratories are accepting
      // orders right now", which is what the fixtures were quietly reproducing.
      servedSpeciesIds: E2E_SERVED_SPECIES,
      listedInDirectory: true,
    },
    create: {
      userId: labUserId,
      organizationId,
      labName,
      contactPerson: E2E_USERS.lab.fullName,
      location: "Germany",
      status: "approved",
      permissionsJson: { can_manage_test_orders: true, can_upload_results: true },
      availableTestsJson: [E2E_BASELINE_ORDER.testId],
      pricingJson: { currency: "EUR", baseMorphTest: 35 },
      // A breeder's laboratory directory is filtered to the species they are
      // ordering for. Without this the seeded laboratory exists, is approved and
      // is listed -- and every breeder still sees "no laboratories are accepting
      // orders right now", which is what the fixtures were quietly reproducing.
      servedSpeciesIds: E2E_SERVED_SPECIES,
      listedInDirectory: true,
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

const resetMarketplace = async (sellerId: string, buyerId: string) => {
  const listingIds = E2E_LISTINGS.map((listing) => listing.id);
  // Everything the spec can create: threads (messages cascade), saves, sales,
  // saved searches and blocks between the two seeded accounts.
  await prisma.marketplaceConversation.deleteMany({ where: { listingId: { in: listingIds } } });
  await prisma.marketplaceFavorite.deleteMany({ where: { listingId: { in: listingIds } } });
  await prisma.marketplaceSale.deleteMany({ where: { listingId: { in: listingIds } } });
  await prisma.savedSearch.deleteMany({ where: { ownerId: buyerId } });
  await prisma.marketplaceUserBlock.deleteMany({
    where: {
      OR: [
        { blockerUserId: buyerId, blockedUserId: sellerId },
        { blockerUserId: sellerId, blockedUserId: buyerId },
      ],
    },
  });

  await prisma.marketplaceStore.upsert({
    where: { userId: sellerId },
    update: { storeName: "Seed Breeder Reptiles", country: "Germany", city: "Berlin" },
    create: { userId: sellerId, storeName: "Seed Breeder Reptiles", country: "Germany", city: "Berlin" },
  });

  for (const listing of E2E_LISTINGS) {
    const data = {
      sellerUserId: sellerId,
      title: listing.title,
      species: listing.species,
      genetics: listing.genetics,
      sex: listing.sex,
      category: listing.category,
      price: listing.price,
      weight: listing.weight,
      currency: "EUR",
      status: "available",
      availability: "available",
      country: "Germany",
      city: "Berlin",
      shippingAvailable: true,
      pickupAvailable: true,
      description: "Seeded for the marketplace buyer-journey test.",
      favoritesCount: 0,
      viewsCount: 0,
      archivedAt: null,
      publishedAt: E2E_PUBLISHED_AT,
    };
    await prisma.marketplaceListing.upsert({
      where: { id: listing.id },
      update: data,
      create: { id: listing.id, ...data },
    });
  }
};

const main = async () => {
  const database = assertLocalDatabaseUrl();

  const [adminUser, breederUser, labUser, labBUser, buyerUser] = await Promise.all([
    upsertUser(E2E_USERS.admin),
    upsertUser(E2E_USERS.breeder),
    upsertUser(E2E_USERS.lab),
    upsertUser(E2E_USERS.labB),
    upsertUser(E2E_USERS.buyer),
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
  await ensureLabAccount(labUser.id, labOrganizationId, "Seed Genetics Lab");
  await ensureLabAccount(labBUser.id, labBOrganizationId, "Second Genetics Lab");
  await ensureLabOfferingsAndPricing(labOrganizationId);
  await ensureLabOfferingsAndPricing(labBOrganizationId, "b");
  await resetBreederLabOrders(breederUser.id);
  const baselineOrder = await createBaselineOrder(breederUser.id, labOrganizationId);
  await resetMarketplace(breederUser.id, buyerUser.id);

  console.log("E2E reset complete", {
    databaseHost: database.hostname,
    databaseName: database.databaseName,
    users: [adminUser.email, breederUser.email, labUser.email, labBUser.email, buyerUser.email],
    marketplaceListings: E2E_LISTINGS.map((listing) => listing.id),
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
