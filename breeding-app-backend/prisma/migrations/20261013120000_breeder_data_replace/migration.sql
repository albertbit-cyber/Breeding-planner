-- Full replace of a breeder's cloud data from a backup file.
--
-- Additive only: one column with a default on an existing table, and one new table. No existing
-- row is rewritten. Rollback: drop the table and the two columns; nothing else depends on them.

-- AlterTable
ALTER TABLE "breeder_planner_states" ADD COLUMN "dataGeneration" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "breeder_planner_states" ADD COLUMN "dataReplacedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "breeder_data_replacements" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "dataGeneration" INTEGER NOT NULL,
  "summary" JSONB NOT NULL,
  "previous" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "breeder_data_replacements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "breeder_data_replacements_ownerId_createdAt_idx" ON "breeder_data_replacements"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "breeder_data_replacements" ADD CONSTRAINT "breeder_data_replacements_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
