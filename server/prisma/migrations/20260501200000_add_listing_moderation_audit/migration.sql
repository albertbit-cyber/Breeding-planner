CREATE TABLE "ListingModerationAudit" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "actorId" TEXT,
    "previousStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingModerationAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingModerationAudit_listingId_idx" ON "ListingModerationAudit"("listingId");
CREATE INDEX "ListingModerationAudit_actorId_idx" ON "ListingModerationAudit"("actorId");
CREATE INDEX "ListingModerationAudit_createdAt_idx" ON "ListingModerationAudit"("createdAt");

ALTER TABLE "ListingModerationAudit" ADD CONSTRAINT "ListingModerationAudit_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ListingModerationAudit" ADD CONSTRAINT "ListingModerationAudit_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
