-- Admin / laboratory / breeder separation.
--
-- Deliberately contains no enum DDL. `support` and `moderator` both already
-- exist in "UserRole", so folding one into the other is a plain UPDATE:
-- Postgres refuses to *use* an enum value added in the same transaction, and
-- Prisma runs each migration in one, so adding a value here and assigning it
-- below would fail on deploy. The owner role stays the existing `admin`, which
-- no API can mint a second copy of any more (see adminService.createAdminUser).

-- `support` silently normalized to `admin` in code, which handed every support
-- account the full admin key. It now reads as a read-only moderator. Idempotent:
-- re-running matches nothing.
UPDATE "User" SET "role" = 'moderator' WHERE "role" = 'support';

-- Where a moderator puts something they cannot act on themselves.
CREATE TABLE IF NOT EXISTS "admin_escalations" (
    "id" TEXT NOT NULL,
    "raised_by_user_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "subject_user_id" TEXT,
    "related_report_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_escalations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_escalations_status_idx" ON "admin_escalations"("status");
CREATE INDEX IF NOT EXISTS "admin_escalations_raised_by_user_id_idx" ON "admin_escalations"("raised_by_user_id");
CREATE INDEX IF NOT EXISTS "admin_escalations_subject_user_id_idx" ON "admin_escalations"("subject_user_id");
CREATE INDEX IF NOT EXISTS "admin_escalations_created_at_idx" ON "admin_escalations"("created_at");

ALTER TABLE "admin_escalations" ADD CONSTRAINT "admin_escalations_raised_by_user_id_fkey"
    FOREIGN KEY ("raised_by_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_escalations" ADD CONSTRAINT "admin_escalations_subject_user_id_fkey"
    FOREIGN KEY ("subject_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_escalations" ADD CONSTRAINT "admin_escalations_related_report_id_fkey"
    FOREIGN KEY ("related_report_id") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_escalations" ADD CONSTRAINT "admin_escalations_resolved_by_user_id_fkey"
    FOREIGN KEY ("resolved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
