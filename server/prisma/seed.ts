import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { LAB_TEST_CATALOG_SEEDS } from "../../src/data/testCatalog";

const prisma = new PrismaClient();

type UserRoleValue = "admin" | "lab" | "breeder" | "buyer";
type TestPricingTypeValue = "morph" | "sex";

const toBackendCatalogId = (name: string): string => {
  const normalized = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "genetic-test";

  if (normalized === "vpi-axanthic") return "axanthic";
  return normalized;
};

const toBackendCatalogCategory = (pricingType: TestPricingTypeValue): string =>
  pricingType === "sex" ? "sex-determination" : "morph";

async function upsertUser(email: string, fullName: string, role: UserRoleValue, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      role,
      isActive: true,
      passwordHash,
    },
    create: {
      email,
      fullName,
      role,
      isActive: true,
      passwordHash,
    },
  });
}

async function main() {
  const adminUser = await upsertUser("admin@breedingplanner.dev", "BreedingPlanner Admin", "admin", "admin1234");
  const labUser = await upsertUser("lab@proherper.dev", "Seed Lab User", "lab", "demo1234");
  const breederUser = await upsertUser("breeder@proherper.dev", "Seed Breeder", "breeder", "breeder1234");
  const buyerUser = await upsertUser("buyer@breedingplanner.dev", "Seed Buyer", "buyer", "buyer1234");

  await prisma.user.update({
    where: { id: breederUser.id },
    data: { verificationStatus: "pending" },
  });

  await prisma.profile.upsert({
    where: { userId: breederUser.id },
    update: {
      breederName: "Seed Morphs",
      location: "Germany",
      websiteUrl: "https://breedingplanner.dev/seed-morphs",
      isPublic: true,
    },
    create: {
      userId: breederUser.id,
      breederName: "Seed Morphs",
      location: "Germany",
      websiteUrl: "https://breedingplanner.dev/seed-morphs",
      isPublic: true,
    },
  });

  const tests = LAB_TEST_CATALOG_SEEDS.map((seed, index) => {
    const pricingType = seed.pricingType === "sex" ? "sex" : "morph";
    return {
      id: toBackendCatalogId(seed.name),
      name: seed.name,
      shortLabel: String(seed.shortLabel || seed.name).trim() || seed.name,
      geneTarget: String(seed.geneTarget || seed.name).trim() || seed.name,
      category: toBackendCatalogCategory(pricingType),
      pricingType,
      priceCents: typeof (seed as { priceCents?: unknown }).priceCents === "number"
        ? Number((seed as { priceCents?: number }).priceCents)
        : null,
      currency: String(seed.currency || "EUR").trim() || "EUR",
      allowedPriorities: Array.isArray(seed.allowedPriorities) && seed.allowedPriorities.length
        ? seed.allowedPriorities
        : ["routine", "priority", "urgent"],
      description: String(seed.description || "").trim() || `${seed.name} genetic test`,
      active: seed.active !== false,
      visibleInBreederApp: seed.isVisibleToBreeder !== false,
      sortOrder: index + 1,
    };
  });

  for (const test of tests) {
    await prisma.shedTestCatalog.upsert({
      where: { id: test.id },
        update: {
          name: test.name,
          shortLabel: test.shortLabel,
          geneTarget: test.geneTarget,
          category: test.category,
          pricingType: test.pricingType,
          priceCents: test.priceCents,
          currency: test.currency,
          allowedPriorities: test.allowedPriorities,
          active: test.active,
          visibleInBreederApp: test.visibleInBreederApp,
          description: test.description,
          sortOrder: test.sortOrder,
        },
        create: {
          id: test.id,
          name: test.name,
          shortLabel: test.shortLabel,
          geneTarget: test.geneTarget,
          category: test.category,
          pricingType: test.pricingType,
          priceCents: test.priceCents,
          currency: test.currency,
          allowedPriorities: test.allowedPriorities,
          active: test.active,
          visibleInBreederApp: test.visibleInBreederApp,
          description: test.description,
          sortOrder: test.sortOrder,
      },
    });
  }

  await prisma.pricingConfig.updateMany({ data: { isActive: false } });

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

  await prisma.report.upsert({
    where: { id: "seed-report-marketplace-1" },
    update: {
      reporterUserId: buyerUser.id,
      reportedUserId: breederUser.id,
      assignedAdminId: adminUser.id,
      type: "incorrect_genetics",
      status: "open",
      description: "Buyer reported that a marketplace listing may have incorrect genetics.",
    },
    create: {
      id: "seed-report-marketplace-1",
      reporterUserId: buyerUser.id,
      reportedUserId: breederUser.id,
      assignedAdminId: adminUser.id,
      type: "incorrect_genetics",
      status: "open",
      description: "Buyer reported that a marketplace listing may have incorrect genetics.",
    },
  });

  await prisma.marketplacePermission.upsert({
    where: { userId: breederUser.id },
    update: {
      canAccess: true,
      activeListingLimit: 50,
      requireApproval: false,
      featuredBreeder: true,
      disabledReason: null,
    },
    create: {
      userId: breederUser.id,
      canAccess: true,
      activeListingLimit: 50,
      requireApproval: false,
      featuredBreeder: true,
    },
  });

  await prisma.labAccount.upsert({
    where: { userId: labUser.id },
    update: {
      labName: "Seed Genetics Lab",
      contactPerson: "Seed Lab User",
      location: "Germany",
      status: "approved",
      permissionsJson: { can_manage_test_orders: true, can_upload_results: true },
      availableTestsJson: ["clown", "pied", "sex"],
      pricingJson: { currency: "EUR", baseMorphTest: 35, sexTest: 30 },
    },
    create: {
      userId: labUser.id,
      labName: "Seed Genetics Lab",
      contactPerson: "Seed Lab User",
      location: "Germany",
      status: "approved",
      permissionsJson: { can_manage_test_orders: true, can_upload_results: true },
      availableTestsJson: ["clown", "pied", "sex"],
      pricingJson: { currency: "EUR", baseMorphTest: 35, sexTest: 30 },
    },
  });

  await prisma.gdprRequest.upsert({
    where: { id: "seed-gdpr-export-1" },
    update: {
      userId: buyerUser.id,
      type: "data_export_requested",
      status: "data_export_requested",
      adminNote: "Seed request for GDPR tools.",
      reviewedBy: adminUser.id,
      reviewedAt: new Date(),
    },
    create: {
      id: "seed-gdpr-export-1",
      userId: buyerUser.id,
      type: "data_export_requested",
      status: "data_export_requested",
      adminNote: "Seed request for GDPR tools.",
      reviewedBy: adminUser.id,
      reviewedAt: new Date(),
    },
  });

  await prisma.verificationRequest.upsert({
    where: { id: "seed-verification-breeder-1" },
    update: {
      userId: breederUser.id,
      type: "breeder",
      status: "pending_review",
      submittedDataJson: {
        breederName: "Seed Morphs",
        realName: "Seed Breeder",
        country: "Germany",
        website: "https://breedingplanner.dev/seed-morphs",
        socialMedia: "@seedmorphs",
        yearsBreeding: "6",
        mainSpecies: "Ball python",
        businessRegistration: "Optional registration pending",
        facilityPhotos: "Provided",
        references: "Two breeder references",
        labTestingHistory: "Uses shed tests for recessive confirmation",
      },
      adminNote: null,
      reviewedBy: null,
      reviewedAt: null,
    },
    create: {
      id: "seed-verification-breeder-1",
      userId: breederUser.id,
      type: "breeder",
      status: "pending_review",
      submittedDataJson: {
        breederName: "Seed Morphs",
        realName: "Seed Breeder",
        country: "Germany",
        website: "https://breedingplanner.dev/seed-morphs",
        socialMedia: "@seedmorphs",
        yearsBreeding: "6",
        mainSpecies: "Ball python",
        businessRegistration: "Optional registration pending",
        facilityPhotos: "Provided",
        references: "Two breeder references",
        labTestingHistory: "Uses shed tests for recessive confirmation",
      },
    },
  });

  console.log("Seed complete: admin/lab/breeder/buyer users + catalog + pricing + admin advanced tool samples created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
