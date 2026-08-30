-- A laboratory asking to be considered as a partner.
--
-- Creates no account, no organization and no access. Onboarding remains
-- invitation-only; this is a lead an administrator reads, whose only outcome is
-- that they decide to send a real invitation, or decline.

CREATE TABLE "partner_applications" (
    "id" TEXT NOT NULL,
    "lab_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT,
    "website" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_applications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "partner_applications_status_idx" ON "partner_applications"("status");
CREATE INDEX "partner_applications_email_idx" ON "partner_applications"("email");

-- SetNull rather than Cascade: an administrator leaving must not delete the
-- record of applications they reviewed.
ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
