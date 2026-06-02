-- Core breeder records persisted by owner. Payload JSON keeps compatibility
-- with the current local/Electron app shape while typed columns support lookup.
CREATE TABLE "Animal" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "appAnimalId" TEXT NOT NULL,
  "name" TEXT,
  "sex" TEXT,
  "status" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Animal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pairing" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "appPairingId" TEXT NOT NULL,
  "label" TEXT,
  "maleAnimalAppId" TEXT,
  "femaleAnimalAppId" TEXT,
  "status" TEXT,
  "startDate" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Pairing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Clutch" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "pairingId" TEXT,
  "appClutchId" TEXT NOT NULL,
  "clutchNumber" INTEGER,
  "seasonYear" INTEGER,
  "laidDate" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Clutch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Animal_ownerId_appAnimalId_key" ON "Animal"("ownerId", "appAnimalId");
CREATE INDEX "Animal_ownerId_idx" ON "Animal"("ownerId");

CREATE UNIQUE INDEX "Pairing_ownerId_appPairingId_key" ON "Pairing"("ownerId", "appPairingId");
CREATE INDEX "Pairing_ownerId_idx" ON "Pairing"("ownerId");
CREATE INDEX "Pairing_ownerId_status_idx" ON "Pairing"("ownerId", "status");

CREATE UNIQUE INDEX "Clutch_ownerId_appClutchId_key" ON "Clutch"("ownerId", "appClutchId");
CREATE INDEX "Clutch_ownerId_idx" ON "Clutch"("ownerId");
CREATE INDEX "Clutch_pairingId_idx" ON "Clutch"("pairingId");

ALTER TABLE "Animal" ADD CONSTRAINT "Animal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pairing" ADD CONSTRAINT "Pairing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Clutch" ADD CONSTRAINT "Clutch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Clutch" ADD CONSTRAINT "Clutch_pairingId_fkey" FOREIGN KEY ("pairingId") REFERENCES "Pairing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
