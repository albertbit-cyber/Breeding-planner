import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { LAB_TEST_CATALOG_SEEDS } from "../../src/data/testCatalog";
import { FEATURE_CATALOG } from "../src/services/subscriptionCatalog";

const prisma = new PrismaClient();

type UserRoleValue = "admin" | "lab" | "breeder" | "buyer" | "moderator" | "support";
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

  for (const [index, item] of FEATURE_CATALOG.entries()) {
    await prisma.featureCatalog.upsert({
      where: { featureKey: item.featureKey },
      update: {
        featureName: item.featureName,
        featureGroup: item.featureGroup,
        description: item.description,
        defaultLimitType: item.defaultLimitType,
        sortOrder: index + 1,
      },
      create: {
        featureKey: item.featureKey,
        featureName: item.featureName,
        featureGroup: item.featureGroup,
        description: item.description,
        defaultLimitType: item.defaultLimitType,
        sortOrder: index + 1,
      },
    });
  }

  const featureKeys = FEATURE_CATALOG.map((item) => item.featureKey);
  const basicAnimal = featureKeys.filter((key) => key.startsWith("animals."));
  const breedingBasic = ["breeding.pairings", "breeding.clutches", "breeding.calendar"];
  const geneticsBasic = ["genetics.basic_calculator", "genetics.het_probability"];
  const qrBasic = ["qr.generate", "qr.pdf_export"];
  const spaces = featureKeys.filter((key) => key.startsWith("spaces."));
  const communication = featureKeys.filter((key) => key.startsWith("communication."));
  const lab = featureKeys.filter((key) => key.startsWith("lab."));
  const sales = featureKeys.filter((key) => key.startsWith("sales."));
  const ai = featureKeys.filter((key) => key.startsWith("ai."));
  const mobileBasic = ["mobile.scan", "mobile.profile", "mobile.quick_feed", "mobile.quick_weight", "mobile.quick_shed", "mobile.notes"];
  const mobileHobbyPlus = [...mobileBasic, "mobile.quick_clean", "mobile.quick_water", "mobile.tasks", "mobile.rack_mode", "mobile.communication", "mobile.offline_sync"];
  const dataBasic = ["data.csv_export", "data.pdf_export", "data.backup"];
  const allBreederFeatures = featureKeys.filter((key) => !key.startsWith("admin."));
  const labFeatures = [...lab, "data.csv_export", "data.pdf_export", "team.members"];

  const tiers = [
    { key: "free", name: "Free", shortDescription: "Basic records for small collections.", monthlyPrice: 0, yearlyPrice: 0, trialDays: 0, sortOrder: 1, features: [...basicAnimal.filter((key) => !["animals.delete", "animals.documents"].includes(key)), "animals.feeding_logs", "animals.weight_logs", "animals.shedding_logs", ...mobileBasic, "marketplace.view", "marketplace.favorite"], limits: { "animals.create": 20, "qr.pdf_export": 0, "ai.breeding_advisor": 0, "communication.telegram_updates": 0, "marketplace.create_listing": 0 } },
    { key: "hobby", name: "Hobby", shortDescription: "Animal management, basic breeding, basic genetics, and QR export.", monthlyPrice: 9, yearlyPrice: 90, trialDays: 14, sortOrder: 2, features: [...basicAnimal, ...breedingBasic, ...geneticsBasic, ...qrBasic, ...mobileBasic, ...dataBasic, "marketplace.view", "marketplace.favorite", "marketplace.contact_seller", "marketplace.create_listing", "marketplace.edit_listing"], limits: { "animals.create": 100, "qr.pdf_export": 25, "marketplace.create_listing": 5 } },
    { key: "hobby_plus", name: "Hobby Plus", shortDescription: "More capacity, spaces, communication basics, and limited AI.", monthlyPrice: 15, yearlyPrice: 150, trialDays: 14, sortOrder: 3, features: [...basicAnimal, ...breedingBasic, ...geneticsBasic, ...qrBasic, ...spaces, ...mobileHobbyPlus, "communication.inbox", "communication.activity_log", "ai.breeding_advisor", ...dataBasic, "marketplace.view", "marketplace.favorite", "marketplace.contact_seller", "marketplace.create_listing", "marketplace.edit_listing", "marketplace.store_page"], limits: { "animals.create": 250, "qr.pdf_export": 100, "ai.breeding_advisor": 25, "marketplace.create_listing": 15 } },
    { key: "breeder", name: "Breeder", shortDescription: "Advanced breeding, full genetics, Telegram, shed testing, and sales tools.", monthlyPrice: 29, yearlyPrice: 290, trialDays: 14, sortOrder: 4, isRecommended: true, features: [...allBreederFeatures.filter((key) => !key.startsWith("admin.") && !key.includes("api_access") && !key.includes("webhooks"))], limits: { "animals.create": 500, "qr.pdf_export": 500, "communication.telegram_updates": 500, "ai.breeding_advisor": 100, "lab.orders": 50, "sales.morphmarket_export": 50, "marketplace.create_listing": 50 } },
    { key: "professional_breeder", name: "Professional Breeder", shortDescription: "Full app access, AI advisor, MorphMarket export, teams, and priority support.", monthlyPrice: 59, yearlyPrice: 590, trialDays: 14, sortOrder: 5, features: allBreederFeatures, limits: {} },
    { key: "lab_partner", name: "Lab / Testing Partner", shortDescription: "Lab portal, catalog management, order scanning, result upload, and certificates.", monthlyPrice: 99, yearlyPrice: 990, trialDays: 30, sortOrder: 6, features: [...labFeatures, "mobile.scan", "mobile.lab", "mobile.offline_sync"], limits: { "lab.orders": 1000, "team.members": 10 } },
    { key: "enterprise", name: "Enterprise / Custom", shortDescription: "Custom features, team access, API access, white label options, and direct support.", monthlyPrice: 0, yearlyPrice: 0, customPrice: true, isPublic: true, trialDays: 0, sortOrder: 7, features: featureKeys, limits: {} },
  ];

  for (const tier of tiers) {
    const savedTier = await prisma.subscriptionTier.upsert({
      where: { key: tier.key },
      update: {
        name: tier.name,
        shortDescription: tier.shortDescription,
        longDescription: tier.shortDescription,
        monthlyPrice: tier.monthlyPrice,
        yearlyPrice: tier.yearlyPrice,
        trialDays: tier.trialDays,
        customPrice: Boolean((tier as { customPrice?: boolean }).customPrice),
        isPublic: (tier as { isPublic?: boolean }).isPublic !== false,
        isActive: true,
        isRecommended: Boolean((tier as { isRecommended?: boolean }).isRecommended),
        sortOrder: tier.sortOrder,
      },
      create: {
        key: tier.key,
        name: tier.name,
        shortDescription: tier.shortDescription,
        longDescription: tier.shortDescription,
        monthlyPrice: tier.monthlyPrice,
        yearlyPrice: tier.yearlyPrice,
        trialDays: tier.trialDays,
        customPrice: Boolean((tier as { customPrice?: boolean }).customPrice),
        isPublic: (tier as { isPublic?: boolean }).isPublic !== false,
        isActive: true,
        isRecommended: Boolean((tier as { isRecommended?: boolean }).isRecommended),
        sortOrder: tier.sortOrder,
      },
    });
    for (const featureKey of featureKeys) {
      await prisma.tierFeature.upsert({
        where: { tierId_featureKey: { tierId: savedTier.id, featureKey } },
        update: {
          enabled: tier.features.includes(featureKey),
          limitValue: (tier.limits as Record<string, number | undefined>)[featureKey] ?? null,
        },
        create: {
          tierId: savedTier.id,
          featureKey,
          enabled: tier.features.includes(featureKey),
          limitValue: (tier.limits as Record<string, number | undefined>)[featureKey] ?? null,
        },
      });
    }
  }

  await prisma.user.update({
    where: { id: breederUser.id },
    data: {
      verificationStatus: "pending",
      subscriptionPlan: "breeder",
      subscriptionStatus: "active",
      subscriptionPaymentStatus: "paid",
      subscriptionStartedAt: new Date("2026-05-01T00:00:00.000Z"),
      subscriptionRenewalAt: new Date("2027-05-01T00:00:00.000Z"),
    },
  });

  const breederTier = await prisma.subscriptionTier.findUnique({ where: { key: "breeder" } });
  if (breederTier) {
    const existingSubscription = await prisma.userSubscription.findFirst({
      where: { userId: breederUser.id, tierId: breederTier.id, status: "active" },
    });
    const subscriptionData = {
      userId: breederUser.id,
      tierId: breederTier.id,
      status: "active",
      paymentStatus: "paid",
      startedAt: new Date("2026-05-01T00:00:00.000Z"),
      renewsAt: new Date("2027-05-01T00:00:00.000Z"),
      paymentProvider: "manual",
      internalNote: "Seed active breeder subscription.",
    };
    if (existingSubscription) {
      await prisma.userSubscription.update({ where: { id: existingSubscription.id }, data: subscriptionData });
    } else {
      await prisma.userSubscription.create({ data: subscriptionData });
    }
  }

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

  await prisma.marketplaceStore.upsert({
    where: { userId: breederUser.id },
    update: {
      storeName: "Seed Morphs",
      about: "Seed public breeder store for Breeding Planner marketplace previews.",
      country: "Germany",
      city: "Berlin",
      websiteUrl: "https://breedingplanner.dev/seed-morphs",
      isVerified: true,
      terms: "Deposits reserve animals. Final handover terms are agreed directly with the buyer.",
      shippingPolicy: "Shipping available where legally permitted and weather safe.",
      paymentPolicy: "Bank transfer or approved digital payment methods.",
    },
    create: {
      userId: breederUser.id,
      storeName: "Seed Morphs",
      about: "Seed public breeder store for Breeding Planner marketplace previews.",
      country: "Germany",
      city: "Berlin",
      websiteUrl: "https://breedingplanner.dev/seed-morphs",
      isVerified: true,
      terms: "Deposits reserve animals. Final handover terms are agreed directly with the buyer.",
      shippingPolicy: "Shipping available where legally permitted and weather safe.",
      paymentPolicy: "Bank transfer or approved digital payment methods.",
    },
  });

  const seedMarketplaceListing = await prisma.marketplaceListing.upsert({
    where: { id: "seed-marketplace-animal-1" },
    update: {
      sellerUserId: breederUser.id,
      animalId: "seed-animal-1",
      title: "Pastel Clown Female",
      species: "Ball python",
      category: "Hatchling",
      genetics: "Pastel Clown, possible het Desert Ghost",
      sex: "female",
      year: 2025,
      weight: 240,
      price: 750,
      currency: "EUR",
      status: "available",
      availability: "available",
      country: "Germany",
      city: "Berlin",
      shippingAvailable: true,
      pickupAvailable: true,
      description: "Healthy, feeding well, documented project female from a planned Clown pairing.",
      feedingNotes: "Feeding consistently on frozen-thawed rodents.",
      temperamentNotes: "Calm handling temperament.",
      publicDataSettingsJson: { showFeedingHistory: true, showWeightHistory: true, showLineage: true },
      publishedAt: new Date(),
    },
    create: {
      id: "seed-marketplace-animal-1",
      sellerUserId: breederUser.id,
      animalId: "seed-animal-1",
      title: "Pastel Clown Female",
      species: "Ball python",
      category: "Hatchling",
      genetics: "Pastel Clown, possible het Desert Ghost",
      sex: "female",
      year: 2025,
      weight: 240,
      price: 750,
      currency: "EUR",
      status: "available",
      availability: "available",
      country: "Germany",
      city: "Berlin",
      shippingAvailable: true,
      pickupAvailable: true,
      description: "Healthy, feeding well, documented project female from a planned Clown pairing.",
      feedingNotes: "Feeding consistently on frozen-thawed rodents.",
      temperamentNotes: "Calm handling temperament.",
      publicDataSettingsJson: { showFeedingHistory: true, showWeightHistory: true, showLineage: true },
      publishedAt: new Date(),
    },
  });

  await prisma.marketplaceListingImage.upsert({
    where: { id: "seed-marketplace-image-1" },
    update: {
      listingId: seedMarketplaceListing.id,
      imageUrl: "https://images.unsplash.com/photo-1531386151447-fd76ad50012f?auto=format&fit=crop&w=900&q=80",
      sortOrder: 0,
      isPrimary: true,
    },
    create: {
      id: "seed-marketplace-image-1",
      listingId: seedMarketplaceListing.id,
      imageUrl: "https://images.unsplash.com/photo-1531386151447-fd76ad50012f?auto=format&fit=crop&w=900&q=80",
      sortOrder: 0,
      isPrimary: true,
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
