import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { LAB_TEST_CATALOG_SEEDS } from "../../src/data/testCatalog";

const prisma = new PrismaClient();

type UserRoleValue = "admin" | "lab" | "breeder";
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
  await upsertUser("admin@proherper.dev", "Seed Admin", "admin", "admin1234");
  await upsertUser("lab@proherper.dev", "Seed Lab User", "lab", "demo1234");
  await upsertUser("breeder@proherper.dev", "Seed Breeder", "breeder", "breeder1234");

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

  console.log("Seed complete: admin/lab/breeder users + catalog + pricing created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
