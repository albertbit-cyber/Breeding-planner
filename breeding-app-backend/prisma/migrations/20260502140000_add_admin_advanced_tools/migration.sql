CREATE TABLE "MarketplacePermission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "canAccess" BOOLEAN NOT NULL DEFAULT true,
  "activeListingLimit" INTEGER NOT NULL DEFAULT 25,
  "requireApproval" BOOLEAN NOT NULL DEFAULT false,
  "featuredBreeder" BOOLEAN NOT NULL DEFAULT false,
  "disabledReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketplacePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplacePermission_userId_key" ON "MarketplacePermission"("userId");
CREATE INDEX "MarketplacePermission_canAccess_idx" ON "MarketplacePermission"("canAccess");
CREATE INDEX "MarketplacePermission_featuredBreeder_idx" ON "MarketplacePermission"("featuredBreeder");

ALTER TABLE "MarketplacePermission"
ADD CONSTRAINT "MarketplacePermission_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LabAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "labName" TEXT NOT NULL,
  "contactPerson" TEXT,
  "location" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "permissionsJson" JSONB NOT NULL,
  "availableTestsJson" JSONB NOT NULL,
  "pricingJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LabAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LabAccount_userId_key" ON "LabAccount"("userId");
CREATE INDEX "LabAccount_status_idx" ON "LabAccount"("status");

ALTER TABLE "LabAccount"
ADD CONSTRAINT "LabAccount_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GdprRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'data_export_requested',
  "adminNote" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GdprRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GdprRequest_userId_idx" ON "GdprRequest"("userId");
CREATE INDEX "GdprRequest_reviewedBy_idx" ON "GdprRequest"("reviewedBy");
CREATE INDEX "GdprRequest_type_idx" ON "GdprRequest"("type");
CREATE INDEX "GdprRequest_status_idx" ON "GdprRequest"("status");
CREATE INDEX "GdprRequest_createdAt_idx" ON "GdprRequest"("createdAt");

ALTER TABLE "GdprRequest"
ADD CONSTRAINT "GdprRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GdprRequest"
ADD CONSTRAINT "GdprRequest_reviewedBy_fkey"
FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
