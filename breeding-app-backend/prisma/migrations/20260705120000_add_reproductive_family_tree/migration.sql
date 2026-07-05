-- ─────────────────────────────────────────────────────────────────────────────
-- Reproductive cycle tracking (per-female, per-season)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "reproductive_cycles" (
    "id"               TEXT NOT NULL,
    "ownerId"          TEXT NOT NULL,
    "femaleAnimalId"   TEXT NOT NULL,
    "femaleAppId"      TEXT NOT NULL,
    "maleAnimalId"     TEXT,
    "maleAppId"        TEXT,
    "pairingId"        TEXT,
    "pairingAppId"     TEXT,
    "season"           INTEGER NOT NULL,
    "cycleIndex"       INTEGER NOT NULL,
    "pairingStartDate" TEXT,
    "pairingEndDate"   TEXT,
    "ovulationDate"    TEXT,
    "preLayShedDate"   TEXT,
    "eggLayingDate"    TEXT,
    "eggCount"         INTEGER,
    "fertileCount"     INTEGER,
    "slugCount"        INTEGER,
    "notes"            TEXT,
    "payload"          JSONB,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reproductive_cycles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reproductive_cycles_femaleAnimalId_season_cycleIndex_key"
    ON "reproductive_cycles"("femaleAnimalId", "season", "cycleIndex");

CREATE INDEX "reproductive_cycles_femaleAnimalId_idx" ON "reproductive_cycles"("femaleAnimalId");
CREATE INDEX "reproductive_cycles_ownerId_idx"        ON "reproductive_cycles"("ownerId");
CREATE INDEX "reproductive_cycles_pairingId_idx"      ON "reproductive_cycles"("pairingId");

ALTER TABLE "reproductive_cycles"
    ADD CONSTRAINT "reproductive_cycles_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Individual lock events (natural dedup: female + date)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "lock_events" (
    "id"             TEXT NOT NULL,
    "ownerId"        TEXT NOT NULL,
    "femaleAnimalId" TEXT NOT NULL,
    "femaleAppId"    TEXT NOT NULL,
    "cycleId"        TEXT,
    "lockDate"       TEXT NOT NULL,
    "notes"          TEXT,
    "sourceType"     TEXT NOT NULL,
    "sourceId"       TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lock_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lock_events_femaleAnimalId_lockDate_key"
    ON "lock_events"("femaleAnimalId", "lockDate");

CREATE INDEX "lock_events_femaleAnimalId_idx" ON "lock_events"("femaleAnimalId");
CREATE INDEX "lock_events_cycleId_idx"         ON "lock_events"("cycleId");
CREATE INDEX "lock_events_ownerId_idx"         ON "lock_events"("ownerId");

ALTER TABLE "lock_events"
    ADD CONSTRAINT "lock_events_cycleId_fkey"
    FOREIGN KEY ("cycleId") REFERENCES "reproductive_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Computed analytics cache (rebuilt on every cycle/lock write)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "reproductive_analytics_cache" (
    "id"                      TEXT NOT NULL,
    "femaleAnimalId"          TEXT NOT NULL,
    "femaleAppId"             TEXT NOT NULL,
    "ownerId"                 TEXT NOT NULL,
    "totalCycles"             INTEGER NOT NULL DEFAULT 0,
    "avgLocksPerCycle"        DECIMAL(6,2),
    "avgDaysBetweenLocks"     DECIMAL(6,2),
    "avgFirstLockToOvulation"  DECIMAL(6,2),
    "avgLastLockToOvulation"   DECIMAL(6,2),
    "avgOvulationToPreLayShed" DECIMAL(6,2),
    "avgPreLayShedToEggLaying" DECIMAL(6,2),
    "avgOvulationToEggLaying"  DECIMAL(6,2),
    "avgFertilityRate"         DECIMAL(5,4),
    "confidenceLevel"          TEXT NOT NULL DEFAULT 'none',
    "patternTagsJson"          JSONB,
    "lastCalculatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reproductive_analytics_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reproductive_analytics_cache_femaleAnimalId_key"
    ON "reproductive_analytics_cache"("femaleAnimalId");

CREATE INDEX "reproductive_analytics_cache_ownerId_idx"
    ON "reproductive_analytics_cache"("ownerId");

-- ─────────────────────────────────────────────────────────────────────────────
-- Family tree: parent-child relationships between animals
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "parent_relationships" (
    "id"          TEXT NOT NULL,
    "childId"     TEXT NOT NULL,
    "parentId"    TEXT NOT NULL,
    "role"        TEXT NOT NULL,
    "confidence"  TEXT NOT NULL DEFAULT 'confirmed',
    "createdById" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "parent_relationships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "parent_relationships_childId_role_key"
    ON "parent_relationships"("childId", "role");

CREATE INDEX "parent_relationships_childId_idx"  ON "parent_relationships"("childId");
CREATE INDEX "parent_relationships_parentId_idx" ON "parent_relationships"("parentId");

ALTER TABLE "parent_relationships"
    ADD CONSTRAINT "parent_relationships_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "parent_relationships"
    ADD CONSTRAINT "parent_relationships_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Ownership history: transfer log per animal
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "ownership_history" (
    "id"           TEXT NOT NULL,
    "animalId"     TEXT NOT NULL,
    "ownerId"      TEXT NOT NULL,
    "ownerName"    TEXT,
    "fromDate"     TIMESTAMP(3) NOT NULL,
    "toDate"       TIMESTAMP(3),
    "transferType" TEXT NOT NULL,
    "notes"        TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ownership_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ownership_history_animalId_idx" ON "ownership_history"("animalId");
CREATE INDEX "ownership_history_ownerId_idx"  ON "ownership_history"("ownerId");

ALTER TABLE "ownership_history"
    ADD CONSTRAINT "ownership_history_animalId_fkey"
    FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
