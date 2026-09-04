-- Shed tests a breeder has saved but not yet ordered.
--
-- Sheds arrive one animal at a time over a season, so the queue is what a keeper builds up
-- between orders. It lives in the database rather than the browser because it is accumulated
-- over months: in localStorage a cleared cache would silently discard a season's collecting,
-- and it would never follow the keeper from their phone to their desk.
--
-- Rows are deleted on submission. The resulting shed test order is the durable record; keeping
-- a copy here would leave two answers to "what did I send?".
CREATE TABLE "pending_shed_tests" (
    "id" TEXT NOT NULL,
    "breeder_id" TEXT NOT NULL,
    "lab_organization_id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "animal_display_id" TEXT,
    "animal_name" TEXT,
    -- Offering ids as plain text, deliberately without a foreign key: a lab may retire a test
    -- while a keeper's draft still names it, and that must surface as a validation message at
    -- submit time rather than delete the draft out from under them.
    "selected_test_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "sample_type" TEXT NOT NULL DEFAULT 'shed',
    "notes" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_shed_tests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pending_shed_tests_breeder_id_idx" ON "pending_shed_tests"("breeder_id");

CREATE INDEX "pending_shed_tests_breeder_id_lab_organization_id_idx" ON "pending_shed_tests"("breeder_id", "lab_organization_id");

-- Cascade on both sides: a draft is an intention, not a record of work, so it must never block
-- deleting a user or an organization.
ALTER TABLE "pending_shed_tests" ADD CONSTRAINT "pending_shed_tests_breeder_id_fkey" FOREIGN KEY ("breeder_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pending_shed_tests" ADD CONSTRAINT "pending_shed_tests_lab_organization_id_fkey" FOREIGN KEY ("lab_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
