-- Widen a lab's test offering to hold what a real catalogue actually contains.
--
-- Loading ProHerper's published catalogue showed the offering model was too
-- thin in three ways it could not fake: panels sold at one flat price, a sex
-- test priced on a different scale from every other test, and a sex test sold
-- as a cheap add-on to a morph test on the same animal. It also spans five
-- species, and lists tests under several names each.
--
-- All additive and all nullable/defaulted, so existing offerings keep behaving
-- exactly as before: tier-priced, morph kind, available.

ALTER TABLE "lab_test_offerings" ADD COLUMN "test_kind" TEXT NOT NULL DEFAULT 'morph';
ALTER TABLE "lab_test_offerings" ADD COLUMN "price_model" TEXT NOT NULL DEFAULT 'tier';
ALTER TABLE "lab_test_offerings" ADD COLUMN "tier_prices_json" JSONB;
ALTER TABLE "lab_test_offerings" ADD COLUMN "addon_price_cents" INTEGER;
ALTER TABLE "lab_test_offerings" ADD COLUMN "species_id" TEXT;
ALTER TABLE "lab_test_offerings" ADD COLUMN "species_label" TEXT;
ALTER TABLE "lab_test_offerings" ADD COLUMN "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "lab_test_offerings" ADD COLUMN "availability" TEXT NOT NULL DEFAULT 'available';
ALTER TABLE "lab_test_offerings" ADD COLUMN "panel_scope" TEXT;
ALTER TABLE "lab_test_offerings" ADD COLUMN "panel_member_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "lab_test_offerings_organization_id_species_id_idx"
    ON "lab_test_offerings"("organization_id", "species_id");

-- Existing offerings were seeded from the shared catalogue, which is ball
-- python only. Saying so is more useful than leaving it null, and it is true of
-- every row that exists at this point.
UPDATE "lab_test_offerings"
   SET "test_kind" = CASE WHEN "pricing_type" = 'sex' THEN 'sex' ELSE 'morph' END,
       "species_id" = 'python_regius',
       "species_label" = 'Ball python';

-- Panels are charged per animal like the other line items, so the invoice can
-- still be reconstructed from the order rows alone.
ALTER TABLE "ShedTestOrderAnimal" ADD COLUMN "panel_cost" DECIMAL(10,2) NOT NULL DEFAULT 0;
