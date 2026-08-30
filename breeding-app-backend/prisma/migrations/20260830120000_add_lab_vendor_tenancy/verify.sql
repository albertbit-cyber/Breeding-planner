-- Backfill verification for 20260830120000_add_lab_vendor_tenancy.
--
-- Applying a migration to an empty database proves only that the SQL parses.
-- The parts that can actually lose or mis-attribute data are the backfills, and
-- those do nothing unless there are rows to back-fill. This script seeds a
-- realistic pre-migration state so the migration has real work to do, and then
-- asserts what it did.
--
-- Usage (see scripts/verify-lab-tenancy-migration.ps1, which drives it):
--   1. apply every migration EXCEPT the lab tenancy one
--   2. \i seed.sql   (the first half of this file)
--   3. apply the lab tenancy migration
--   4. \i verify.sql (the second half)

-- ── Assertions ───────────────────────────────────────────────────────────────
DO $$
DECLARE
    offering_count INTEGER;
    pricing_count INTEGER;
    template_count INTEGER;
    unattributed_orders INTEGER;
    unmapped_lines INTEGER;
    mapped_line_offering TEXT;
    legacy_catalog_id TEXT;
BEGIN
    -- 1. The existing lab was seeded with the catalogue it was already selling.
    SELECT count(*) INTO offering_count
    FROM "lab_test_offerings" WHERE "organization_id" = 'org_seed_lab';
    IF offering_count <> 2 THEN
        RAISE EXCEPTION 'Expected 2 seeded offerings for the existing lab, found %', offering_count;
    END IF;

    -- 2. It has pricing of its own, copied from the platform template.
    SELECT count(*) INTO pricing_count
    FROM "PricingConfig" WHERE "organization_id" = 'org_seed_lab';
    IF pricing_count <> 1 THEN
        RAISE EXCEPTION 'Expected the lab to have exactly 1 pricing row, found %', pricing_count;
    END IF;

    -- 3. The pre-existing global row survives as the platform template and is
    --    NOT attributed to any laboratory.
    SELECT count(*) INTO template_count
    FROM "PricingConfig" WHERE "organization_id" IS NULL;
    IF template_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly 1 null-org pricing template, found %', template_count;
    END IF;

    -- 4. With exactly one laboratory, historical orders are attributed to it.
    SELECT count(*) INTO unattributed_orders
    FROM "ShedTestOrder" WHERE "lab_organization_id" IS NULL;
    IF unattributed_orders <> 0 THEN
        RAISE EXCEPTION 'Expected every order attributed, % left unattributed', unattributed_orders;
    END IF;

    -- 5. Order lines were repointed at that laboratory's own offering.
    SELECT count(*) INTO unmapped_lines
    FROM "ShedTestOrderAnimalTest" WHERE "offering_id" IS NULL;
    IF unmapped_lines <> 0 THEN
        RAISE EXCEPTION 'Expected every order line mapped to an offering, % unmapped', unmapped_lines;
    END IF;

    -- 6. And repointed at the *right* one — the offering derived from the same
    --    catalogue test the line originally referenced.
    SELECT oat."offering_id", oat."testId"
      INTO mapped_line_offering, legacy_catalog_id
    FROM "ShedTestOrderAnimalTest" oat LIMIT 1;
    IF mapped_line_offering <> 'off_org_seed_lab_' || legacy_catalog_id THEN
        RAISE EXCEPTION 'Order line mapped to the wrong offering: % (legacy catalogue id %)',
            mapped_line_offering, legacy_catalog_id;
    END IF;

    -- 7. The legacy catalogue id survives as provenance rather than being wiped.
    IF legacy_catalog_id IS NULL THEN
        RAISE EXCEPTION 'Legacy catalogue id was lost; order history is no longer traceable';
    END IF;

    RAISE NOTICE 'Backfill verified: % offerings, own pricing, all orders attributed, all lines mapped.',
        offering_count;
END $$;
