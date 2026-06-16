CREATE TABLE "Listing" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "appListingId" TEXT NOT NULL,
  "animalAppId" TEXT,
  "title" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "priceCents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Listing_ownerId_appListingId_key" ON "Listing"("ownerId", "appListingId");
CREATE INDEX "Listing_ownerId_idx" ON "Listing"("ownerId");
CREATE INDEX "Listing_status_idx" ON "Listing"("status");
CREATE INDEX "Listing_ownerId_status_idx" ON "Listing"("ownerId", "status");

ALTER TABLE "Listing" ADD CONSTRAINT "Listing_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
