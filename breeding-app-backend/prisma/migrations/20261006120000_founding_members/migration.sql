-- Founding members.
--
-- Additive only: one new table, nothing existing is altered. Rows are the
-- waitlist addresses that keep the founding-member price; checkout matches an
-- account's email against them (see src/services/billingService.ts).

-- CreateTable
CREATE TABLE "founding_members" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'waitlist',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founding_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "founding_members_email_key" ON "founding_members"("email");
