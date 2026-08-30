-- Promote species from a payload key to a real column so animals can be filtered and
-- grouped by species without reading every payload blob. Nullable on purpose: every
-- existing row predates multi-species support and is implicitly a ball python, but
-- backfilling that guess here would bake it in permanently. The app resolves a null
-- species to the tenant's default species instead, which stays correctable.
ALTER TABLE "Animal" ADD COLUMN "species" TEXT;

CREATE INDEX "Animal_ownerId_species_idx" ON "Animal"("ownerId", "species");
