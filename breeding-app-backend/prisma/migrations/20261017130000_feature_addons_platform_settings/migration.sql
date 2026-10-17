-- "Build My Own" add-on prices on the feature catalogue, and a small key/value table for the
-- suggestions the owner edits in the admin (tier recommendations, extended-pedigree sharing).
--
-- Additive only: two nullable/defaulted columns and one new table; no existing row changes meaning.
-- Rollback: drop the table and the two columns.

-- AlterTable
ALTER TABLE "feature_catalog" ADD COLUMN "addon_available" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "feature_catalog" ADD COLUMN "addon_monthly_price" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);
