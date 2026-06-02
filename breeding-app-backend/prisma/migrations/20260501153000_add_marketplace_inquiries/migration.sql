CREATE TABLE "ListingInquiry" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "breederId" TEXT NOT NULL,
  "buyerId" TEXT,
  "buyerName" TEXT NOT NULL,
  "buyerEmail" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'new',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ListingInquiry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingInquiry_listingId_idx" ON "ListingInquiry"("listingId");
CREATE INDEX "ListingInquiry_breederId_idx" ON "ListingInquiry"("breederId");
CREATE INDEX "ListingInquiry_buyerId_idx" ON "ListingInquiry"("buyerId");
CREATE INDEX "ListingInquiry_status_idx" ON "ListingInquiry"("status");

ALTER TABLE "ListingInquiry" ADD CONSTRAINT "ListingInquiry_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ListingInquiry" ADD CONSTRAINT "ListingInquiry_breederId_fkey"
  FOREIGN KEY ("breederId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ListingInquiry" ADD CONSTRAINT "ListingInquiry_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
