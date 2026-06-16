CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_name" TEXT,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_session_id" TEXT,
    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");
CREATE INDEX "refresh_sessions_expires_at_idx" ON "refresh_sessions"("expires_at");
CREATE INDEX "refresh_sessions_revoked_at_idx" ON "refresh_sessions"("revoked_at");

ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_events_type_idx" ON "security_events"("type");
CREATE INDEX "security_events_actor_user_id_idx" ON "security_events"("actor_user_id");
CREATE INDEX "security_events_outcome_idx" ON "security_events"("outcome");
CREATE INDEX "security_events_created_at_idx" ON "security_events"("created_at");

ALTER TABLE "security_events" ADD CONSTRAINT "security_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "marketplace_media" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "listing_id" TEXT,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_validation',
    "scan_status" TEXT NOT NULL DEFAULT 'not_scanned',
    "public_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketplace_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_media_storage_key_key" ON "marketplace_media"("storage_key");
CREATE INDEX "marketplace_media_owner_user_id_idx" ON "marketplace_media"("owner_user_id");
CREATE INDEX "marketplace_media_listing_id_idx" ON "marketplace_media"("listing_id");
CREATE INDEX "marketplace_media_status_idx" ON "marketplace_media"("status");
CREATE INDEX "marketplace_media_scan_status_idx" ON "marketplace_media"("scan_status");

ALTER TABLE "marketplace_media" ADD CONSTRAINT "marketplace_media_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_media" ADD CONSTRAINT "marketplace_media_listing_id_fkey"
FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "marketplace_message_reports" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "reporter_user_id" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketplace_message_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketplace_message_reports_message_id_idx" ON "marketplace_message_reports"("message_id");
CREATE INDEX "marketplace_message_reports_reporter_user_id_idx" ON "marketplace_message_reports"("reporter_user_id");
CREATE INDEX "marketplace_message_reports_status_idx" ON "marketplace_message_reports"("status");
CREATE INDEX "marketplace_message_reports_created_at_idx" ON "marketplace_message_reports"("created_at");

ALTER TABLE "marketplace_message_reports" ADD CONSTRAINT "marketplace_message_reports_message_id_fkey"
FOREIGN KEY ("message_id") REFERENCES "marketplace_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_message_reports" ADD CONSTRAINT "marketplace_message_reports_reporter_user_id_fkey"
FOREIGN KEY ("reporter_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "marketplace_user_blocks" (
    "id" TEXT NOT NULL,
    "blocker_user_id" TEXT NOT NULL,
    "blocked_user_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketplace_user_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_user_blocks_blocker_user_id_blocked_user_id_key"
ON "marketplace_user_blocks"("blocker_user_id", "blocked_user_id");
CREATE INDEX "marketplace_user_blocks_blocked_user_id_idx" ON "marketplace_user_blocks"("blocked_user_id");

ALTER TABLE "marketplace_user_blocks" ADD CONSTRAINT "marketplace_user_blocks_blocker_user_id_fkey"
FOREIGN KEY ("blocker_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_user_blocks" ADD CONSTRAINT "marketplace_user_blocks_blocked_user_id_fkey"
FOREIGN KEY ("blocked_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Animal" ADD COLUMN "globalId" TEXT;
ALTER TABLE "Animal" ADD COLUMN "privacyLevel" TEXT NOT NULL DEFAULT 'private';
CREATE INDEX "Animal_globalId_idx" ON "Animal"("globalId");

CREATE TABLE "parent_relationships" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'confirmed',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "parent_relationships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "parent_relationships_childId_role_key" ON "parent_relationships"("childId", "role");
CREATE INDEX "parent_relationships_childId_idx" ON "parent_relationships"("childId");
CREATE INDEX "parent_relationships_parentId_idx" ON "parent_relationships"("parentId");

ALTER TABLE "parent_relationships" ADD CONSTRAINT "parent_relationships_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parent_relationships" ADD CONSTRAINT "parent_relationships_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ownership_history" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerName" TEXT,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3),
    "transferType" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ownership_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ownership_history_animalId_idx" ON "ownership_history"("animalId");
CREATE INDEX "ownership_history_ownerId_idx" ON "ownership_history"("ownerId");

ALTER TABLE "ownership_history" ADD CONSTRAINT "ownership_history_animalId_fkey"
FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
