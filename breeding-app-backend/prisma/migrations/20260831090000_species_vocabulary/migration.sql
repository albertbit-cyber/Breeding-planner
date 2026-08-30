-- One species vocabulary, and a test can cover more than one species.
--
-- Two problems this fixes.
--
-- First, the ProHerper import wrote scientific ids (`python_regius`) while the
-- breeder app has always used slugs (`ball-python`) on its animals and gene
-- tables. Nothing matched: a ball python matched zero ball python tests. The
-- remap below aligns them onto the taxonomy the generator now emits for both.
--
-- Second, one test really can cover several species — ProHerper sells a single
-- colubrid sex determination test covering six of them — which a scalar column
-- cannot express. `species_id` becomes `species_ids`.

-- ── Laboratories declare the species they work with ──────────────────────────
ALTER TABLE "LabAccount" ADD COLUMN "served_species_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ── Offerings cover one or more species ──────────────────────────────────────
ALTER TABLE "lab_test_offerings" ADD COLUMN "species_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Remap onto the platform taxonomy. The colubrid entry was never a species at
-- all: it is a group, and expands to the six the laboratory actually serves.
UPDATE "lab_test_offerings" SET "species_ids" = CASE "species_id"
    WHEN 'python_regius'         THEN ARRAY['ball-python']
    WHEN 'pantherophis_guttatus' THEN ARRAY['corn-snake']
    WHEN 'boa_constrictor'       THEN ARRAY['boa-constrictor']
    WHEN 'python_bivittatus'     THEN ARRAY['burmese-python']
    WHEN 'morelia_viridis'       THEN ARRAY['green-tree-python']
    WHEN 'colubrid'              THEN ARRAY['corn-snake', 'hognose-snake', 'kingsnake',
                                            'rat-snake', 'bullsnake', 'garter-snake']
    -- Rows seeded by the tenancy migration were already ball python.
    WHEN 'ball-python'           THEN ARRAY['ball-python']
    ELSE ARRAY[]::TEXT[]
  END
WHERE "species_id" IS NOT NULL;

-- Each laboratory's served list is the union of what its tests cover, which is
-- true by construction and saves every existing vendor from re-declaring it.
UPDATE "LabAccount" la
   SET "served_species_ids" = sub.ids
  FROM (
    SELECT o."organization_id" AS org_id,
           ARRAY(SELECT DISTINCT unnest(array_agg(s))) AS ids
      FROM "lab_test_offerings" o, unnest(o."species_ids") AS s
     GROUP BY o."organization_id"
  ) sub
 WHERE la."organization_id" = sub.org_id;

DROP INDEX IF EXISTS "lab_test_offerings_organization_id_species_id_idx";
ALTER TABLE "lab_test_offerings" DROP COLUMN "species_id";
ALTER TABLE "lab_test_offerings" DROP COLUMN "species_label";

-- GIN, not btree: every lookup asks "which offerings cover this species", which
-- is an array-containment test.
CREATE INDEX "lab_test_offerings_species_ids_idx" ON "lab_test_offerings" USING GIN ("species_ids");
CREATE INDEX "LabAccount_served_species_ids_idx" ON "LabAccount" USING GIN ("served_species_ids");

DO $$
DECLARE
    unmapped INTEGER;
BEGIN
    SELECT count(*) INTO unmapped FROM "lab_test_offerings" WHERE cardinality("species_ids") = 0;
    IF unmapped > 0 THEN
        RAISE NOTICE 'Species remap left % offering(s) with no species. They are invisible to breeders until tagged in the Lab Portal.', unmapped;
    END IF;
END $$;
