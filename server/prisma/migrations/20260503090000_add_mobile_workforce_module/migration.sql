CREATE TABLE IF NOT EXISTS "mobile_scan_logs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "animal_id" TEXT,
  "qr_code" TEXT NOT NULL,
  "target_type" TEXT NOT NULL DEFAULT 'animal',
  "result_status" TEXT NOT NULL DEFAULT 'opened',
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mobile_scan_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "mobile_sync_queue" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "device_id" TEXT,
  "action_type" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "mobile_sync_queue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_device_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "device_name" TEXT,
  "platform" TEXT,
  "push_token" TEXT,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_device_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mobile_scan_logs_user_id_idx" ON "mobile_scan_logs"("user_id");
CREATE INDEX IF NOT EXISTS "mobile_scan_logs_animal_id_idx" ON "mobile_scan_logs"("animal_id");
CREATE INDEX IF NOT EXISTS "mobile_scan_logs_target_type_idx" ON "mobile_scan_logs"("target_type");
CREATE INDEX IF NOT EXISTS "mobile_scan_logs_created_at_idx" ON "mobile_scan_logs"("created_at");

CREATE INDEX IF NOT EXISTS "mobile_sync_queue_user_id_idx" ON "mobile_sync_queue"("user_id");
CREATE INDEX IF NOT EXISTS "mobile_sync_queue_device_id_idx" ON "mobile_sync_queue"("device_id");
CREATE INDEX IF NOT EXISTS "mobile_sync_queue_status_idx" ON "mobile_sync_queue"("status");
CREATE INDEX IF NOT EXISTS "mobile_sync_queue_action_type_idx" ON "mobile_sync_queue"("action_type");

CREATE UNIQUE INDEX IF NOT EXISTS "user_device_sessions_user_id_device_id_key" ON "user_device_sessions"("user_id", "device_id");
CREATE INDEX IF NOT EXISTS "user_device_sessions_user_id_idx" ON "user_device_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "user_device_sessions_last_seen_at_idx" ON "user_device_sessions"("last_seen_at");

ALTER TABLE "mobile_scan_logs" ADD CONSTRAINT "mobile_scan_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mobile_sync_queue" ADD CONSTRAINT "mobile_sync_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_device_sessions" ADD CONSTRAINT "user_device_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
