-- A buyer's standing request: "tell me when an animal like this is listed".
-- Additive only -- no existing table is touched, so this cannot fail the way
-- 20260907120000 did and block the migrations behind it.

CREATE TABLE IF NOT EXISTS "marketplace_wishlists" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "species" TEXT,
  "include_genes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "exclude_genes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sex" TEXT,
  "max_price" DECIMAL(12,2),
  "country" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_wishlists_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "marketplace_wishlists_user_id_idx" ON "marketplace_wishlists"("user_id");
CREATE INDEX IF NOT EXISTS "marketplace_wishlists_is_active_idx" ON "marketplace_wishlists"("is_active");

-- One row per animal a wishlist has already been told about. The unique pair is
-- the whole point: without it, every edit that re-publishes a listing notifies
-- the same buyer about the same snake again.
CREATE TABLE IF NOT EXISTS "marketplace_wishlist_matches" (
  "id" TEXT NOT NULL,
  "wishlist_id" TEXT NOT NULL,
  "listing_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_wishlist_matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_wishlist_matches_wishlist_id_listing_id_key"
  ON "marketplace_wishlist_matches"("wishlist_id", "listing_id");
CREATE INDEX IF NOT EXISTS "marketplace_wishlist_matches_wishlist_id_idx" ON "marketplace_wishlist_matches"("wishlist_id");
CREATE INDEX IF NOT EXISTS "marketplace_wishlist_matches_listing_id_idx" ON "marketplace_wishlist_matches"("listing_id");

-- The referenced tables carry @@map names; the model names do not exist in the
-- database. Naming a model here is what made 20260907120000 fail on first apply.
ALTER TABLE "marketplace_wishlists"
  ADD CONSTRAINT "marketplace_wishlists_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_wishlist_matches"
  ADD CONSTRAINT "marketplace_wishlist_matches_wishlist_id_fkey"
  FOREIGN KEY ("wishlist_id") REFERENCES "marketplace_wishlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_wishlist_matches"
  ADD CONSTRAINT "marketplace_wishlist_matches_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
