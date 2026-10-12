-- Female breeding cards (SBR-02).
--
-- Additive only: two new tables, nothing dropped, no existing row rewritten. Legacy
-- "Pairing" rows stay exactly as they are and remain readable; the breeder app maps them
-- into breeding cycles with deterministic ids (bc-legacy-<pairing id>) and the mapping is
-- recorded in each cycle's payload (legacy.pairingIds). Rollback: drop the two tables
-- (see docs/runbooks/breeding-cycles-migration.md); no other table depends on them.

-- CreateTable
CREATE TABLE "breeding_cycles" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "appCycleId" TEXT NOT NULL,
  "femaleAnimalAppId" TEXT NOT NULL,
  "seasonLabel" TEXT,
  "startDate" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "closureOutcome" TEXT,
  "closedAt" TIMESTAMP(3),
  "multipleSires" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "breeding_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follicle_examinations" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "appExamId" TEXT NOT NULL,
  "femaleAnimalAppId" TEXT NOT NULL,
  "cycleAppId" TEXT,
  "examDate" TEXT,
  "method" TEXT,
  "result" TEXT,
  "largestDiameterMm" DOUBLE PRECISION,
  "payload" JSONB NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "follicle_examinations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "breeding_cycles_ownerId_appCycleId_key" ON "breeding_cycles"("ownerId", "appCycleId");
CREATE INDEX "breeding_cycles_ownerId_idx" ON "breeding_cycles"("ownerId");
CREATE INDEX "breeding_cycles_ownerId_updatedAt_idx" ON "breeding_cycles"("ownerId", "updatedAt");
CREATE INDEX "breeding_cycles_ownerId_femaleAnimalAppId_idx" ON "breeding_cycles"("ownerId", "femaleAnimalAppId");
CREATE INDEX "breeding_cycles_ownerId_status_idx" ON "breeding_cycles"("ownerId", "status");

-- One active cycle per female, enforced by the database. Paused duplicates (the sync service's
-- way of flagging a conflict for review) and closed cycles are allowed to coexist.
CREATE UNIQUE INDEX "breeding_cycles_one_active_per_female"
  ON "breeding_cycles"("ownerId", "femaleAnimalAppId")
  WHERE "status" = 'active' AND "deletedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "follicle_examinations_ownerId_appExamId_key" ON "follicle_examinations"("ownerId", "appExamId");
CREATE INDEX "follicle_examinations_ownerId_idx" ON "follicle_examinations"("ownerId");
CREATE INDEX "follicle_examinations_ownerId_updatedAt_idx" ON "follicle_examinations"("ownerId", "updatedAt");
CREATE INDEX "follicle_examinations_ownerId_femaleAnimalAppId_idx" ON "follicle_examinations"("ownerId", "femaleAnimalAppId");
CREATE INDEX "follicle_examinations_ownerId_cycleAppId_idx" ON "follicle_examinations"("ownerId", "cycleAppId");

-- AddForeignKey
ALTER TABLE "breeding_cycles" ADD CONSTRAINT "breeding_cycles_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follicle_examinations" ADD CONSTRAINT "follicle_examinations_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
