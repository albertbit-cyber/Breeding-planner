-- Two things a laboratory does with a finished order, told apart.
--
-- Archiving files the order away: every row stays, it just leaves the working
-- queues. Deleting removes the laboratory's copy. Neither may cost the breeder
-- the result, so the certificate stops being a document re-derived from the
-- live order on every open and becomes a row of its own.

-- 1. Archive ------------------------------------------------------------------
ALTER TABLE "ShedTestOrder" ADD COLUMN "archived_at" TIMESTAMP(3);
ALTER TABLE "ShedTestOrder" ADD COLUMN "archived_by_id" TEXT;

-- The lab queues read "this lab's orders that are not archived", so the index
-- covers both columns rather than making the filter a post-scan.
CREATE INDEX "ShedTestOrder_lab_organization_id_archived_at_idx"
  ON "ShedTestOrder" ("lab_organization_id", "archived_at");

-- 2. Certificates -------------------------------------------------------------
CREATE TABLE "ShedTestCertificate" (
  "id"                  TEXT NOT NULL,
  "order_id"            TEXT,
  "breeder_id"          TEXT NOT NULL,
  "lab_organization_id" TEXT,
  "animal_app_id"       TEXT NOT NULL,
  "result_id"           TEXT,
  "order_number"        TEXT,
  "certificate_number"  TEXT NOT NULL,
  "verification_code"   TEXT NOT NULL,
  "issued_at"           TIMESTAMP(3) NOT NULL,
  "snapshot_json"       JSONB NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShedTestCertificate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShedTestCertificate_certificate_number_key"
  ON "ShedTestCertificate" ("certificate_number");
CREATE UNIQUE INDEX "ShedTestCertificate_verification_code_key"
  ON "ShedTestCertificate" ("verification_code");
CREATE UNIQUE INDEX "ShedTestCertificate_breeder_id_animal_app_id_certificate_number_key"
  ON "ShedTestCertificate" ("breeder_id", "animal_app_id", "certificate_number");
CREATE INDEX "ShedTestCertificate_breeder_id_idx" ON "ShedTestCertificate" ("breeder_id");
CREATE INDEX "ShedTestCertificate_animal_app_id_idx" ON "ShedTestCertificate" ("animal_app_id");
CREATE INDEX "ShedTestCertificate_lab_organization_id_idx" ON "ShedTestCertificate" ("lab_organization_id");
CREATE INDEX "ShedTestCertificate_order_id_idx" ON "ShedTestCertificate" ("order_id");

-- ON DELETE SET NULL is the whole point: the laboratory removing the order must
-- not remove what it certified. The snapshot is self-contained, so the
-- certificate stays readable with no order behind it.
ALTER TABLE "ShedTestCertificate"
  ADD CONSTRAINT "ShedTestCertificate_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "ShedTestOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShedTestCertificate"
  ADD CONSTRAINT "ShedTestCertificate_breeder_id_fkey"
  FOREIGN KEY ("breeder_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict, not Cascade: retiring a laboratory organization must not erase the
-- certificates it issued while it was operating.
ALTER TABLE "ShedTestCertificate"
  ADD CONSTRAINT "ShedTestCertificate_lab_organization_id_fkey"
  FOREIGN KEY ("lab_organization_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
