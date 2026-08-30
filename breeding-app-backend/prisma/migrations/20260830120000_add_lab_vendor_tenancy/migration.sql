-- Lab vendor tenancy (see docs/architecture/saas-implementation-plan.md §3 and
-- the 2026-08-30 decisions recorded there).
--
-- Turns the Lab side from "one implicit laboratory the platform runs" into
-- "several independent vendor tenants". Four things move:
--   1. tests become lab-owned          (lab_test_offerings)
--   2. tier pricing becomes lab-owned  (PricingConfig.organization_id)
--   3. orders name the lab they went to (ShedTestOrder.lab_organization_id)
--   4. labs carry their own identity    (LabAccount contact/address/logo)
--
-- Backfill policy: this migration never guesses. Where existing rows can be
-- attributed to a lab unambiguously (exactly one vendor lab exists, which is
-- the state every current deployment is in) it attributes them; where they
-- cannot, it leaves NULL rather than picking one, and the assertions at the end
-- report what was left behind instead of failing the deploy.

-- ── 1. Invite prefill ────────────────────────────────────────────────────────
ALTER TABLE "organization_invites" ADD COLUMN "creates_org_location" TEXT;
ALTER TABLE "organization_invites" ADD COLUMN "creates_org_contact" TEXT;

-- ── 2. Per-tenant lab identity ───────────────────────────────────────────────
ALTER TABLE "LabAccount" ADD COLUMN "contact_email" TEXT;
ALTER TABLE "LabAccount" ADD COLUMN "phone" TEXT;
ALTER TABLE "LabAccount" ADD COLUMN "address_line1" TEXT;
ALTER TABLE "LabAccount" ADD COLUMN "address_line2" TEXT;
ALTER TABLE "LabAccount" ADD COLUMN "city" TEXT;
ALTER TABLE "LabAccount" ADD COLUMN "postal_code" TEXT;
ALTER TABLE "LabAccount" ADD COLUMN "country" TEXT;
ALTER TABLE "LabAccount" ADD COLUMN "logo_url" TEXT;
ALTER TABLE "LabAccount" ADD COLUMN "public_description" TEXT;
ALTER TABLE "LabAccount" ADD COLUMN "turnaround_days" INTEGER;
ALTER TABLE "LabAccount" ADD COLUMN "listed_in_directory" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "LabAccount_listed_in_directory_idx" ON "LabAccount"("listed_in_directory");

-- ── 3. Lab-owned test offerings ──────────────────────────────────────────────
CREATE TABLE "lab_test_offerings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_label" TEXT,
    "category" TEXT NOT NULL,
    "pricing_type" "TestPricingType" NOT NULL,
    "price_cents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "gene_target" TEXT,
    "catalog_ref_id" TEXT,
    "allowed_priorities" TEXT[] DEFAULT ARRAY['routine', 'priority', 'urgent']::TEXT[],
    "turnaround_days" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "visible_in_breeder_app" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_test_offerings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lab_test_offerings_organization_id_name_key" ON "lab_test_offerings"("organization_id", "name");
CREATE INDEX "lab_test_offerings_organization_id_active_idx" ON "lab_test_offerings"("organization_id", "active");
CREATE INDEX "lab_test_offerings_catalog_ref_id_idx" ON "lab_test_offerings"("catalog_ref_id");

ALTER TABLE "lab_test_offerings" ADD CONSTRAINT "lab_test_offerings_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_test_offerings" ADD CONSTRAINT "lab_test_offerings_catalog_ref_id_fkey"
    FOREIGN KEY ("catalog_ref_id") REFERENCES "ShedTestCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed every existing vendor lab with the catalog it was already effectively
-- selling, so no lab wakes up with an empty test list. `catalog_ref_id` keeps
-- the provenance link, which is also what the order-line backfill below joins on.
INSERT INTO "lab_test_offerings" (
    "id", "organization_id", "name", "short_label", "category", "pricing_type",
    "price_cents", "currency", "gene_target", "catalog_ref_id", "allowed_priorities",
    "active", "visible_in_breeder_app", "description", "sort_order", "created_at", "updated_at"
)
SELECT
    'off_' || la."organization_id" || '_' || c."id",
    la."organization_id",
    c."name",
    c."shortLabel",
    c."category",
    c."pricingType",
    c."priceCents",
    c."currency",
    c."geneTarget",
    c."id",
    c."allowedPriorities",
    c."active",
    c."visibleInBreederApp",
    c."description",
    c."sortOrder",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "LabAccount" la
CROSS JOIN "ShedTestCatalog" c
ON CONFLICT ("organization_id", "name") DO NOTHING;

-- ── 4. Per-lab tier pricing ──────────────────────────────────────────────────
ALTER TABLE "PricingConfig" ADD COLUMN "organization_id" TEXT;

CREATE UNIQUE INDEX "PricingConfig_organization_id_key" ON "PricingConfig"("organization_id");

ALTER TABLE "PricingConfig" ADD CONSTRAINT "PricingConfig_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The pre-existing rows keep organization_id NULL and become the platform
-- template used to seed new vendors. Each existing lab gets its own copy so its
-- prices are genuinely its own from the first day, not a shared row.
INSERT INTO "PricingConfig" (
    "id", "organization_id", "currency",
    "morphTier1to9FirstTest", "morphTier1to9AdditionalTest",
    "morphTier10to49FirstTest", "morphTier10to49AdditionalTest",
    "morphTier50PlusFirstTest", "morphTier50PlusAdditionalTest",
    "sexTier1to9", "sexTier10to49", "sexTier50Plus",
    "isActive", "createdAt", "updatedAt"
)
SELECT
    'pricing_' || la."organization_id",
    la."organization_id",
    t."currency",
    t."morphTier1to9FirstTest", t."morphTier1to9AdditionalTest",
    t."morphTier10to49FirstTest", t."morphTier10to49AdditionalTest",
    t."morphTier50PlusFirstTest", t."morphTier50PlusAdditionalTest",
    t."sexTier1to9", t."sexTier10to49", t."sexTier50Plus",
    true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "LabAccount" la
CROSS JOIN LATERAL (
    SELECT * FROM "PricingConfig"
    WHERE "organization_id" IS NULL AND "isActive" = true
    ORDER BY "updatedAt" DESC
    LIMIT 1
) t
ON CONFLICT ("organization_id") DO NOTHING;

-- ── 5. Orders name their lab ─────────────────────────────────────────────────
ALTER TABLE "ShedTestOrder" ADD COLUMN "lab_organization_id" TEXT;

CREATE INDEX "ShedTestOrder_lab_organization_id_status_idx" ON "ShedTestOrder"("lab_organization_id", "status");

ALTER TABLE "ShedTestOrder" ADD CONSTRAINT "ShedTestOrder_lab_organization_id_fkey"
    FOREIGN KEY ("lab_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only attribute historical orders when there is exactly one vendor lab to
-- attribute them to. With two or more, any choice would be a guess, and a guess
-- here means showing one lab another lab's order history.
DO $$
DECLARE
    lab_count INTEGER;
    only_lab TEXT;
BEGIN
    SELECT count(*) INTO lab_count FROM "LabAccount";
    IF lab_count = 1 THEN
        SELECT "organization_id" INTO only_lab FROM "LabAccount" LIMIT 1;
        UPDATE "ShedTestOrder" SET "lab_organization_id" = only_lab WHERE "lab_organization_id" IS NULL;
        RAISE NOTICE 'Attributed all existing orders to the single vendor lab %', only_lab;
    ELSE
        RAISE NOTICE 'Found % vendor labs; existing orders left unattributed for manual assignment.', lab_count;
    END IF;
END $$;

-- ── 6. Order lines point at the lab's offering ───────────────────────────────
ALTER TABLE "ShedTestOrderAnimalTest" ADD COLUMN "offering_id" TEXT;

-- Drop the old catalog foreign key and let the column go null: from here it is
-- provenance only. The snapshot columns already make each line self-describing.
ALTER TABLE "ShedTestOrderAnimalTest" DROP CONSTRAINT IF EXISTS "ShedTestOrderAnimalTest_testId_fkey";
DROP INDEX IF EXISTS "ShedTestOrderAnimalTest_testId_idx";
ALTER TABLE "ShedTestOrderAnimalTest" ALTER COLUMN "testId" DROP NOT NULL;

CREATE INDEX "ShedTestOrderAnimalTest_offering_id_idx" ON "ShedTestOrderAnimalTest"("offering_id");

ALTER TABLE "ShedTestOrderAnimalTest" ADD CONSTRAINT "ShedTestOrderAnimalTest_offering_id_fkey"
    FOREIGN KEY ("offering_id") REFERENCES "lab_test_offerings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Route each historical line to the offering its own lab now holds for that
-- catalog test. Lines whose order has no lab stay null; they remain readable
-- through their snapshot columns.
-- Every condition lives in WHERE rather than in JOIN ... ON: Postgres does not
-- allow the UPDATE target (`oat`) to be referenced from a join condition inside
-- the FROM clause, only from WHERE.
UPDATE "ShedTestOrderAnimalTest" oat
SET "offering_id" = o."id"
FROM "ShedTestOrderAnimal" oa,
     "ShedTestOrder" ord,
     "lab_test_offerings" o
WHERE oa."id" = oat."orderAnimalId"
  AND ord."id" = oa."orderId"
  AND o."organization_id" = ord."lab_organization_id"
  AND o."catalog_ref_id" = oat."testId"
  AND oat."offering_id" IS NULL
  AND ord."lab_organization_id" IS NOT NULL;

-- ── 7. Report what could not be attributed ───────────────────────────────────
DO $$
DECLARE
    orphan_orders INTEGER;
    orphan_lines INTEGER;
BEGIN
    SELECT count(*) INTO orphan_orders FROM "ShedTestOrder" WHERE "lab_organization_id" IS NULL;
    SELECT count(*) INTO orphan_lines FROM "ShedTestOrderAnimalTest" WHERE "offering_id" IS NULL;
    IF orphan_orders > 0 OR orphan_lines > 0 THEN
        RAISE NOTICE 'Tenancy backfill left % order(s) and % order line(s) unattributed. They are readable but invisible to every lab queue until assigned.', orphan_orders, orphan_lines;
    END IF;
END $$;
