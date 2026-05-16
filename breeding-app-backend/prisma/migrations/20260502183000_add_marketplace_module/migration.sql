CREATE TABLE IF NOT EXISTS "marketplace_listings" (
  "id" TEXT NOT NULL,
  "seller_user_id" TEXT NOT NULL,
  "animal_id" TEXT,
  "title" TEXT NOT NULL,
  "species" TEXT,
  "category" TEXT,
  "genetics" TEXT,
  "sex" TEXT,
  "birth_date" TIMESTAMP(3),
  "year" INTEGER,
  "weight" DECIMAL(10,2),
  "price" DECIMAL(12,2),
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "availability" TEXT NOT NULL DEFAULT 'available',
  "country" TEXT,
  "city" TEXT,
  "shipping_available" BOOLEAN NOT NULL DEFAULT false,
  "pickup_available" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "feeding_notes" TEXT,
  "temperament_notes" TEXT,
  "public_data_settings_json" JSONB,
  "views_count" INTEGER NOT NULL DEFAULT 0,
  "favorites_count" INTEGER NOT NULL DEFAULT 0,
  "is_featured" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "published_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_listing_images" (
  "id" TEXT NOT NULL,
  "listing_id" TEXT NOT NULL,
  "image_url" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_listing_images_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_stores" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "store_name" TEXT NOT NULL,
  "logo_url" TEXT,
  "banner_url" TEXT,
  "about" TEXT,
  "country" TEXT,
  "city" TEXT,
  "website_url" TEXT,
  "social_links_json" JSONB,
  "terms" TEXT,
  "shipping_policy" TEXT,
  "payment_policy" TEXT,
  "is_verified" BOOLEAN NOT NULL DEFAULT false,
  "rating_average" DECIMAL(3,2) NOT NULL DEFAULT 0,
  "review_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_stores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_conversations" (
  "id" TEXT NOT NULL,
  "listing_id" TEXT NOT NULL,
  "buyer_user_id" TEXT,
  "seller_user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "last_message_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_messages" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "sender_user_id" TEXT,
  "message_text" TEXT NOT NULL,
  "offer_amount" DECIMAL(12,2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMP(3),
  CONSTRAINT "marketplace_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_favorites" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "listing_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_favorites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_sales" (
  "id" TEXT NOT NULL,
  "listing_id" TEXT NOT NULL,
  "seller_user_id" TEXT NOT NULL,
  "buyer_user_id" TEXT,
  "buyer_name" TEXT,
  "buyer_email" TEXT,
  "buyer_phone" TEXT,
  "buyer_country" TEXT,
  "sale_price" DECIMAL(12,2),
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "deposit_amount" DECIMAL(12,2),
  "payment_status" TEXT NOT NULL DEFAULT 'pending',
  "sale_status" TEXT NOT NULL DEFAULT 'inquiry',
  "handover_method" TEXT,
  "handover_date" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_reviews" (
  "id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "reviewer_user_id" TEXT,
  "seller_user_id" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "communication_rating" INTEGER,
  "accuracy_rating" INTEGER,
  "shipping_rating" INTEGER,
  "health_rating" INTEGER,
  "review_text" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "marketplace_listings_seller_user_id_idx" ON "marketplace_listings"("seller_user_id");
CREATE INDEX IF NOT EXISTS "marketplace_listings_status_idx" ON "marketplace_listings"("status");
CREATE INDEX IF NOT EXISTS "marketplace_listings_availability_idx" ON "marketplace_listings"("availability");
CREATE INDEX IF NOT EXISTS "marketplace_listings_species_idx" ON "marketplace_listings"("species");
CREATE INDEX IF NOT EXISTS "marketplace_listings_country_idx" ON "marketplace_listings"("country");
CREATE INDEX IF NOT EXISTS "marketplace_listings_is_featured_idx" ON "marketplace_listings"("is_featured");
CREATE INDEX IF NOT EXISTS "marketplace_listing_images_listing_id_idx" ON "marketplace_listing_images"("listing_id");
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_stores_user_id_key" ON "marketplace_stores"("user_id");
CREATE INDEX IF NOT EXISTS "marketplace_stores_is_verified_idx" ON "marketplace_stores"("is_verified");
CREATE INDEX IF NOT EXISTS "marketplace_conversations_listing_id_idx" ON "marketplace_conversations"("listing_id");
CREATE INDEX IF NOT EXISTS "marketplace_conversations_buyer_user_id_idx" ON "marketplace_conversations"("buyer_user_id");
CREATE INDEX IF NOT EXISTS "marketplace_conversations_seller_user_id_idx" ON "marketplace_conversations"("seller_user_id");
CREATE INDEX IF NOT EXISTS "marketplace_conversations_status_idx" ON "marketplace_conversations"("status");
CREATE INDEX IF NOT EXISTS "marketplace_messages_conversation_id_idx" ON "marketplace_messages"("conversation_id");
CREATE INDEX IF NOT EXISTS "marketplace_messages_sender_user_id_idx" ON "marketplace_messages"("sender_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_favorites_user_id_listing_id_key" ON "marketplace_favorites"("user_id", "listing_id");
CREATE INDEX IF NOT EXISTS "marketplace_favorites_listing_id_idx" ON "marketplace_favorites"("listing_id");
CREATE INDEX IF NOT EXISTS "marketplace_sales_listing_id_idx" ON "marketplace_sales"("listing_id");
CREATE INDEX IF NOT EXISTS "marketplace_sales_seller_user_id_idx" ON "marketplace_sales"("seller_user_id");
CREATE INDEX IF NOT EXISTS "marketplace_sales_buyer_user_id_idx" ON "marketplace_sales"("buyer_user_id");
CREATE INDEX IF NOT EXISTS "marketplace_sales_sale_status_idx" ON "marketplace_sales"("sale_status");
CREATE INDEX IF NOT EXISTS "marketplace_reviews_sale_id_idx" ON "marketplace_reviews"("sale_id");
CREATE INDEX IF NOT EXISTS "marketplace_reviews_seller_user_id_idx" ON "marketplace_reviews"("seller_user_id");
CREATE INDEX IF NOT EXISTS "marketplace_reviews_reviewer_user_id_idx" ON "marketplace_reviews"("reviewer_user_id");

ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_listing_images" ADD CONSTRAINT "marketplace_listing_images_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_stores" ADD CONSTRAINT "marketplace_stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_conversations" ADD CONSTRAINT "marketplace_conversations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_conversations" ADD CONSTRAINT "marketplace_conversations_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketplace_conversations" ADD CONSTRAINT "marketplace_conversations_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "marketplace_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketplace_favorites" ADD CONSTRAINT "marketplace_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_favorites" ADD CONSTRAINT "marketplace_favorites_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_sales" ADD CONSTRAINT "marketplace_sales_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_sales" ADD CONSTRAINT "marketplace_sales_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_sales" ADD CONSTRAINT "marketplace_sales_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "marketplace_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
