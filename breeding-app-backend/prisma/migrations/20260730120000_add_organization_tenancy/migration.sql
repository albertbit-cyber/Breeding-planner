-- Phase 1 tenancy foundation: introduces Organization / Membership /
-- OrganizationInvite above User, and moves LabAccount ownership onto an
-- Organization. See docs/architecture/saas-implementation-plan.md §3.
--
-- This migration is additive and backwards-compatible for existing accounts:
-- no column is dropped, LabAccount."userId" is retained, and every existing
-- tenant user is given an organization + owner membership so nothing about
-- their current experience changes.

-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('breeder', 'lab_vendor');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('owner', 'admin', 'billing_manager', 'member');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "OrganizationKind" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "billing_email" TEXT,
    "suspended_at" TIMESTAMP(3),
    "suspended_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_invites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "organization_id" TEXT,
    "creates_org_kind" "OrganizationKind",
    "creates_org_name" TEXT,
    "role" "OrgRole" NOT NULL DEFAULT 'member',
    "invited_by" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_invites_pkey" PRIMARY KEY ("id")
);

-- AlterTable
-- Added nullable here on purpose; the data migration below populates every row
-- and the column is then promoted to NOT NULL, so the end state matches the
-- Prisma schema (where organizationId is required) with no drift.
ALTER TABLE "LabAccount" ADD COLUMN     "organization_id" TEXT;

-- CreateIndex
CREATE INDEX "organizations_kind_idx" ON "organizations"("kind");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_key" ON "memberships"("user_id");

-- CreateIndex
CREATE INDEX "memberships_organization_id_idx" ON "memberships"("organization_id");

-- CreateIndex
CREATE INDEX "memberships_role_idx" ON "memberships"("role");

-- CreateIndex
CREATE UNIQUE INDEX "organization_invites_token_hash_key" ON "organization_invites"("token_hash");

-- CreateIndex
CREATE INDEX "organization_invites_organization_id_idx" ON "organization_invites"("organization_id");

-- CreateIndex
CREATE INDEX "organization_invites_email_idx" ON "organization_invites"("email");

-- CreateIndex
CREATE INDEX "organization_invites_status_idx" ON "organization_invites"("status");

-- CreateIndex
CREATE INDEX "organization_invites_expires_at_idx" ON "organization_invites"("expires_at");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- DataMigration: give every existing tenant user an Organization it owns.
--
-- Scope: only *tenant* users get an organization — those with role 'breeder' or
-- 'lab', plus (defensively) anyone who already holds a LabAccount regardless of
-- their role. Internal staff (admin/moderator/support) and marketplace-only
-- 'buyer' accounts are deliberately left without a membership: they are not
-- tenants, their access comes from the global User.role, and Membership is
-- optional in the schema precisely so they can have none. Giving them a
-- "personal organization" would add rows that mean nothing.
--
-- IDs are derived deterministically from the user id ('org_'/'mbr_' prefix)
-- rather than generated randomly. That is what lets the three statements below
-- correlate rows without a temp table: statement 2 and 3 can recompute exactly
-- the id statement 1 created. Prisma only requires ids be unique opaque
-- strings, so a derived id is as valid as a cuid.
--
-- Every existing account ends up as 'owner' of its own organization, which is
-- the "personal organization" pattern from the plan (§3.1): the single-user
-- experience is unchanged, but each account now has an org to grow into
-- multi-seat later without a second migration.
-- ---------------------------------------------------------------------------

INSERT INTO "organizations" ("id", "name", "kind", "status", "billing_email", "created_at", "updated_at")
SELECT
    'org_' || u."id",
    -- Prefer the real lab name for vendor labs, then the user's own name, and
    -- fall back to their email so the column is never blank.
    COALESCE(
        NULLIF(btrim(la."labName"), ''),
        NULLIF(btrim(u."fullName"), ''),
        u."email"
    ),
    CASE
        WHEN u."role" = 'lab' OR la."id" IS NOT NULL THEN 'lab_vendor'::"OrganizationKind"
        ELSE 'breeder'::"OrganizationKind"
    END,
    'active',
    -- Vendor-lab orgs are never billed (decided 2026-07-30, plan §4), so they
    -- get no billing contact. Breeder orgs default to the owner's address.
    CASE
        WHEN u."role" = 'lab' OR la."id" IS NOT NULL THEN NULL
        ELSE u."email"
    END,
    now(),
    now()
FROM "User" u
LEFT JOIN "LabAccount" la ON la."userId" = u."id"
WHERE u."role" IN ('breeder', 'lab')
   OR la."id" IS NOT NULL;

INSERT INTO "memberships" ("id", "user_id", "organization_id", "role", "created_at", "updated_at")
SELECT
    'mbr_' || u."id",
    u."id",
    'org_' || u."id",
    'owner'::"OrgRole",
    now(),
    now()
FROM "User" u
LEFT JOIN "LabAccount" la ON la."userId" = u."id"
WHERE u."role" IN ('breeder', 'lab')
   OR la."id" IS NOT NULL;

-- Point every existing LabAccount at its owner's newly created organization.
-- The WHERE clause above guarantees an org exists for every LabAccount holder,
-- so this cannot leave a NULL behind and the NOT NULL promotion below is safe.
UPDATE "LabAccount" SET "organization_id" = 'org_' || "userId";

-- Fail loudly rather than silently promoting a column with NULLs, in the event
-- the assumption above is ever violated by unexpected data.
DO $$
DECLARE orphaned INTEGER;
BEGIN
    SELECT count(*) INTO orphaned FROM "LabAccount" WHERE "organization_id" IS NULL;
    IF orphaned > 0 THEN
        RAISE EXCEPTION 'Migration aborted: % LabAccount row(s) could not be matched to an organization', orphaned;
    END IF;
END $$;

-- AlterTable
ALTER TABLE "LabAccount" ALTER COLUMN "organization_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "LabAccount_organization_id_key" ON "LabAccount"("organization_id");

-- AddForeignKey
ALTER TABLE "LabAccount" ADD CONSTRAINT "LabAccount_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
