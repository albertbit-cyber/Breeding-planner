-- Cloud photo storage: one row per stored photo, the bytes themselves in object storage.
--
-- Additive only: one new table, no existing row touched. MarketplaceMedia keeps its own rows (new
-- uploads simply land under users/{userId}/marketplace/ in the bucket), so nothing about listings
-- changes here. Rollback: drop the table; nothing else references it.

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "animal_app_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'gallery',
    "storage_key" TEXT NOT NULL,
    "thumb_key" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "photos_storage_key_key" ON "photos"("storage_key");

-- CreateIndex
CREATE INDEX "photos_owner_user_id_animal_app_id_idx" ON "photos"("owner_user_id", "animal_app_id");

-- CreateIndex
CREATE INDEX "photos_status_deleted_at_idx" ON "photos"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "photos_owner_user_id_checksum_key" ON "photos"("owner_user_id", "checksum");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
