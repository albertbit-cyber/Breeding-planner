-- CreateEnum
CREATE TYPE "ShedResultStatus" AS ENUM ('running', 'completed');

-- CreateTable
CREATE TABLE "ShedTestOrderResult" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "status" "ShedResultStatus" NOT NULL DEFAULT 'running',
    "testCode" TEXT NOT NULL,
    "method" TEXT,
    "findingsJson" JSONB NOT NULL,
    "summary" TEXT,
    "reportedAt" TIMESTAMP(3),
    "analystUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShedTestOrderResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShedTestOrderResult_orderId_testCode_key" ON "ShedTestOrderResult"("orderId", "testCode");

-- CreateIndex
CREATE INDEX "ShedTestOrderResult_orderId_idx" ON "ShedTestOrderResult"("orderId");

-- CreateIndex
CREATE INDEX "ShedTestOrderResult_status_idx" ON "ShedTestOrderResult"("status");

-- AddForeignKey
ALTER TABLE "ShedTestOrderResult" ADD CONSTRAINT "ShedTestOrderResult_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShedTestOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
