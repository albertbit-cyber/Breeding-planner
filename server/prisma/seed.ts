import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type UserRoleValue = "admin" | "lab" | "breeder";
type TestPricingTypeValue = "morph" | "sex";

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
  await upsertUser("lab@proherper.dev", "Seed Lab User", "lab", "lab12345");
  await upsertUser("breeder@proherper.dev", "Seed Breeder", "breeder", "breeder1234");

  const tests = [
    { id: "clown", name: "Clown", category: "Morph", pricingType: "morph" as TestPricingTypeValue, sortOrder: 1 },
    { id: "pied", name: "Pied", category: "Morph", pricingType: "morph" as TestPricingTypeValue, sortOrder: 2 },
    { id: "ultramel", name: "Ultramel", category: "Morph", pricingType: "morph" as TestPricingTypeValue, sortOrder: 3 },
    { id: "monsoon", name: "Monsoon", category: "Morph", pricingType: "morph" as TestPricingTypeValue, sortOrder: 4 },
    { id: "desert-ghost", name: "Desert Ghost", category: "Morph", pricingType: "morph" as TestPricingTypeValue, sortOrder: 5 },
    { id: "hypo", name: "Hypo", category: "Morph", pricingType: "morph" as TestPricingTypeValue, sortOrder: 6 },
    { id: "axanthic", name: "Axanthic", category: "Morph", pricingType: "morph" as TestPricingTypeValue, sortOrder: 7 },
    { id: "sex-determination", name: "Sex Determination", category: "Sex", pricingType: "sex" as TestPricingTypeValue, sortOrder: 8 },
  ];

  for (const test of tests) {
    await prisma.shedTestCatalog.upsert({
      where: { id: test.id },
      update: {
        name: test.name,
        category: test.category,
        pricingType: test.pricingType,
        active: true,
        visibleInBreederApp: true,
        description: `${test.name} genetic test`,
        sortOrder: test.sortOrder,
      },
      create: {
        id: test.id,
        name: test.name,
        category: test.category,
        pricingType: test.pricingType,
        active: true,
        visibleInBreederApp: true,
        description: `${test.name} genetic test`,
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
