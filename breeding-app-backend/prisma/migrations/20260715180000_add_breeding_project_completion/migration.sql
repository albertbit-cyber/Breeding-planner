-- Add workflow completion metadata to pairings without rewriting biological history.
ALTER TABLE "Pairing" ADD COLUMN IF NOT EXISTS "workflow_status" TEXT;
ALTER TABLE "Pairing" ADD COLUMN IF NOT EXISTS "completion_reason" TEXT;
ALTER TABLE "Pairing" ADD COLUMN IF NOT EXISTS "outcome_confidence" TEXT;
ALTER TABLE "Pairing" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);
ALTER TABLE "Pairing" ADD COLUMN IF NOT EXISTS "completed_by_user_id" TEXT;
ALTER TABLE "Pairing" ADD COLUMN IF NOT EXISTS "completion_note" TEXT;
ALTER TABLE "Pairing" ADD COLUMN IF NOT EXISTS "reopened_at" TIMESTAMP(3);
ALTER TABLE "Pairing" ADD COLUMN IF NOT EXISTS "reopened_by_user_id" TEXT;

-- Backfill rule 1: preserve explicit workflow/status metadata from JSON payload.
UPDATE "Pairing"
SET
  "workflow_status" = COALESCE(NULLIF(payload->>'workflowStatus', ''), NULLIF(payload->>'status', ''), "workflow_status"),
  "completion_reason" = COALESCE(NULLIF(payload->>'completionReason', ''), "completion_reason"),
  "outcome_confidence" = COALESCE(NULLIF(payload->>'outcomeConfidence', ''), "outcome_confidence"),
  "completed_at" = COALESCE(
    CASE WHEN COALESCE(payload->>'completedAt', '') ~ '^\d{4}-\d{2}-\d{2}' THEN (payload->>'completedAt')::timestamp ELSE NULL END,
    "completed_at"
  ),
  "completed_by_user_id" = COALESCE(NULLIF(payload->>'completedBy', ''), "completed_by_user_id"),
  "completion_note" = COALESCE(NULLIF(payload->>'completionNote', ''), "completion_note"),
  "reopened_at" = COALESCE(
    CASE WHEN COALESCE(payload->>'reopenedAt', '') ~ '^\d{4}-\d{2}-\d{2}' THEN (payload->>'reopenedAt')::timestamp ELSE NULL END,
    "reopened_at"
  ),
  "reopened_by_user_id" = COALESCE(NULLIF(payload->>'reopenedBy', ''), "reopened_by_user_id")
WHERE payload IS NOT NULL;

-- Backfill rule 2: unambiguous productive legacy records with a recorded clutch are eggs_laid.
UPDATE "Pairing"
SET
  "workflow_status" = COALESCE("workflow_status", 'completed'),
  "completion_reason" = COALESCE("completion_reason", 'eggs_laid'),
  "outcome_confidence" = COALESCE("outcome_confidence", 'confirmed'),
  "completed_at" = COALESCE("completed_at", "updatedAt")
WHERE
  "deletedAt" IS NULL
  AND COALESCE("completion_reason", '') = ''
  AND (
    payload #>> '{clutch,recorded}' = 'true'
    OR NULLIF(payload #>> '{clutch,date}', '') IS NOT NULL
  );

-- Backfill rule 3: old completed statuses without unambiguous offspring remain unknown.
UPDATE "Pairing"
SET
  "workflow_status" = COALESCE("workflow_status", 'completed'),
  "completion_reason" = COALESCE("completion_reason", 'unknown_outcome'),
  "outcome_confidence" = COALESCE("outcome_confidence", 'unknown'),
  "completed_at" = COALESCE("completed_at", "updatedAt")
WHERE
  "deletedAt" IS NULL
  AND LOWER(COALESCE("status", payload->>'status', '')) = 'completed'
  AND COALESCE("completion_reason", '') = '';

UPDATE "Pairing"
SET "workflow_status" = 'active'
WHERE "workflow_status" IS NULL AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Pairing_ownerId_workflow_status_idx" ON "Pairing"("ownerId", "workflow_status");
CREATE INDEX IF NOT EXISTS "Pairing_ownerId_completion_reason_idx" ON "Pairing"("ownerId", "completion_reason");
CREATE INDEX IF NOT EXISTS "Pairing_completed_at_idx" ON "Pairing"("completed_at");
