CREATE TABLE IF NOT EXISTS "subscription_tiers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "short_description" TEXT,
  "long_description" TEXT,
  "badge_text" TEXT,
  "monthly_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "yearly_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "trial_days" INTEGER NOT NULL DEFAULT 0,
  "setup_fee" DECIMAL(10,2),
  "discount_label" TEXT,
  "custom_price" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_public" BOOLEAN NOT NULL DEFAULT true,
  "is_recommended" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_tiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "feature_catalog" (
  "id" TEXT NOT NULL,
  "feature_key" TEXT NOT NULL,
  "feature_name" TEXT NOT NULL,
  "feature_group" TEXT NOT NULL,
  "description" TEXT,
  "default_limit_type" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feature_catalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tier_features" (
  "id" TEXT NOT NULL,
  "tier_id" TEXT NOT NULL,
  "feature_key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "limit_value" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tier_features_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_subscriptions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "tier_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "payment_status" TEXT NOT NULL DEFAULT 'none',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trial_ends_at" TIMESTAMP(3),
  "renews_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "payment_provider" TEXT,
  "payment_customer_id" TEXT,
  "payment_subscription_id" TEXT,
  "internal_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_feature_overrides" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "feature_key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "limit_override" INTEGER,
  "reason" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3),
  "created_by_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_feature_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "usage_tracking" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "feature_key" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "used_amount" INTEGER NOT NULL DEFAULT 0,
  "limit_amount" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "usage_tracking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_tiers_key_key" ON "subscription_tiers"("key");
CREATE INDEX IF NOT EXISTS "subscription_tiers_is_active_idx" ON "subscription_tiers"("is_active");
CREATE INDEX IF NOT EXISTS "subscription_tiers_is_public_idx" ON "subscription_tiers"("is_public");
CREATE INDEX IF NOT EXISTS "subscription_tiers_sort_order_idx" ON "subscription_tiers"("sort_order");

CREATE UNIQUE INDEX IF NOT EXISTS "feature_catalog_feature_key_key" ON "feature_catalog"("feature_key");
CREATE INDEX IF NOT EXISTS "feature_catalog_feature_group_idx" ON "feature_catalog"("feature_group");

CREATE UNIQUE INDEX IF NOT EXISTS "tier_features_tier_id_feature_key_key" ON "tier_features"("tier_id", "feature_key");
CREATE INDEX IF NOT EXISTS "tier_features_feature_key_idx" ON "tier_features"("feature_key");

CREATE INDEX IF NOT EXISTS "user_subscriptions_user_id_idx" ON "user_subscriptions"("user_id");
CREATE INDEX IF NOT EXISTS "user_subscriptions_tier_id_idx" ON "user_subscriptions"("tier_id");
CREATE INDEX IF NOT EXISTS "user_subscriptions_status_idx" ON "user_subscriptions"("status");

CREATE INDEX IF NOT EXISTS "user_feature_overrides_user_id_idx" ON "user_feature_overrides"("user_id");
CREATE INDEX IF NOT EXISTS "user_feature_overrides_feature_key_idx" ON "user_feature_overrides"("feature_key");
CREATE INDEX IF NOT EXISTS "user_feature_overrides_created_by_admin_id_idx" ON "user_feature_overrides"("created_by_admin_id");

CREATE UNIQUE INDEX IF NOT EXISTS "usage_tracking_user_id_feature_key_period_start_key" ON "usage_tracking"("user_id", "feature_key", "period_start");
CREATE INDEX IF NOT EXISTS "usage_tracking_user_id_idx" ON "usage_tracking"("user_id");
CREATE INDEX IF NOT EXISTS "usage_tracking_feature_key_idx" ON "usage_tracking"("feature_key");

ALTER TABLE "tier_features" ADD CONSTRAINT "tier_features_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "subscription_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tier_features" ADD CONSTRAINT "tier_features_feature_key_fkey" FOREIGN KEY ("feature_key") REFERENCES "feature_catalog"("feature_key") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "subscription_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_feature_overrides" ADD CONSTRAINT "user_feature_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_feature_overrides" ADD CONSTRAINT "user_feature_overrides_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_tracking" ADD CONSTRAINT "usage_tracking_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
