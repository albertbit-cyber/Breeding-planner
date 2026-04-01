-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'lab', 'breeder');

-- CreateEnum
CREATE TYPE "TestPricingType" AS ENUM ('morph', 'sex');

-- CreateEnum
CREATE TYPE "PricingTier" AS ENUM ('tier_1_9', 'tier_10_49', 'tier_50_plus');

-- CreateEnum
CREATE TYPE "ShedOrderStatus" AS ENUM ('submitted', 'received', 'in_progress', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShedTestCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "pricingType" "TestPricingType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "visibleInBreederApp" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShedTestCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingConfig" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "morphTier1to9FirstTest" DECIMAL(10,2) NOT NULL,
    "morphTier1to9AdditionalTest" DECIMAL(10,2) NOT NULL,
    "morphTier10to49FirstTest" DECIMAL(10,2) NOT NULL,
    "morphTier10to49AdditionalTest" DECIMAL(10,2) NOT NULL,
    "morphTier50PlusFirstTest" DECIMAL(10,2) NOT NULL,
    "morphTier50PlusAdditionalTest" DECIMAL(10,2) NOT NULL,
    "sexTier1to9" DECIMAL(10,2) NOT NULL,
    "sexTier10to49" DECIMAL(10,2) NOT NULL,
    "sexTier50Plus" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShedTestOrder" (
    "id" TEXT NOT NULL,
    "breederId" TEXT NOT NULL,
    "totalAnimals" INTEGER NOT NULL,
    "pricingTier" "PricingTier" NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "priceSnapshotJson" JSONB NOT NULL,
    "status" "ShedOrderStatus" NOT NULL DEFAULT 'submitted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShedTestOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShedTestOrderAnimal" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "animalName" TEXT,
    "morphBaseCost" DECIMAL(10,2) NOT NULL,
    "additionalMorphCost" DECIMAL(10,2) NOT NULL,
    "sexCost" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShedTestOrderAnimal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShedTestOrderAnimalTest" (
    "id" TEXT NOT NULL,
    "orderAnimalId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "testNameSnapshot" TEXT NOT NULL,
    "pricingTypeSnapshot" "TestPricingType" NOT NULL,
    "priceApplied" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShedTestOrderAnimalTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ShedTestOrder_breederId_idx" ON "ShedTestOrder"("breederId");

-- CreateIndex
CREATE INDEX "ShedTestOrder_status_idx" ON "ShedTestOrder"("status");

-- CreateIndex
CREATE INDEX "ShedTestOrderAnimal_orderId_idx" ON "ShedTestOrderAnimal"("orderId");

-- CreateIndex
CREATE INDEX "ShedTestOrderAnimalTest_orderAnimalId_idx" ON "ShedTestOrderAnimalTest"("orderAnimalId");

-- CreateIndex
CREATE INDEX "ShedTestOrderAnimalTest_testId_idx" ON "ShedTestOrderAnimalTest"("testId");

-- AddForeignKey
ALTER TABLE "ShedTestOrder" ADD CONSTRAINT "ShedTestOrder_breederId_fkey" FOREIGN KEY ("breederId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShedTestOrderAnimal" ADD CONSTRAINT "ShedTestOrderAnimal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShedTestOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShedTestOrderAnimalTest" ADD CONSTRAINT "ShedTestOrderAnimalTest_orderAnimalId_fkey" FOREIGN KEY ("orderAnimalId") REFERENCES "ShedTestOrderAnimal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShedTestOrderAnimalTest" ADD CONSTRAINT "ShedTestOrderAnimalTest_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ShedTestCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
