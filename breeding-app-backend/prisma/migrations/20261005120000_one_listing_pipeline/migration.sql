-- One listing pipeline.
--
-- Additive only: nothing is dropped and no row is rewritten, so this is safe
-- to deploy before or after scripts/copyLegacyListings.ts has run. Inquiries
-- and reports gain a link to marketplace_listings next to their legacy link,
-- and marketplace_listings records which legacy row it was copied from.
-- The legacy "Listing" table is frozen, not removed (see schema.prisma).

-- AlterTable
ALTER TABLE "ListingInquiry" ADD COLUMN     "marketplace_listing_id" TEXT,
ALTER COLUMN "listingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "related_marketplace_listing_id" TEXT;

-- AlterTable
ALTER TABLE "marketplace_listings" ADD COLUMN     "legacy_listing_id" TEXT;

-- CreateIndex
CREATE INDEX "ListingInquiry_marketplace_listing_id_idx" ON "ListingInquiry"("marketplace_listing_id");

-- CreateIndex
CREATE INDEX "Report_related_marketplace_listing_id_idx" ON "Report"("related_marketplace_listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_listings_legacy_listing_id_key" ON "marketplace_listings"("legacy_listing_id");

-- AddForeignKey
ALTER TABLE "ListingInquiry" ADD CONSTRAINT "ListingInquiry_marketplace_listing_id_fkey" FOREIGN KEY ("marketplace_listing_id") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_related_marketplace_listing_id_fkey" FOREIGN KEY ("related_marketplace_listing_id") REFERENCES "marketplace_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

