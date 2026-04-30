ALTER TABLE "ShedTestCatalog"
ADD COLUMN "shortLabel" TEXT,
ADD COLUMN "geneTarget" TEXT,
ADD COLUMN "priceCents" INTEGER,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN "allowedPriorities" TEXT[] NOT NULL DEFAULT ARRAY['routine', 'priority', 'urgent']::TEXT[];

UPDATE "ShedTestCatalog"
SET
  "category" = CASE
    WHEN LOWER(COALESCE("category", '')) IN ('sex', 'sex-determination') OR LOWER(COALESCE("category", '')) LIKE '%sex%' THEN 'sex-determination'
    WHEN LOWER(COALESCE("category", '')) = 'other' THEN 'other'
    ELSE 'morph'
  END,
  "shortLabel" = COALESCE(NULLIF(TRIM("shortLabel"), ''), "name"),
  "geneTarget" = COALESCE(NULLIF(TRIM("geneTarget"), ''), "name"),
  "currency" = COALESCE(NULLIF(TRIM("currency"), ''), 'EUR');
