-- Genes contributed by laboratories, pending review.
--
-- The generated Morphpedia tables stay canonical and regenerable; these are
-- merged over them at read time, so rebuilding the tables never discards a
-- laboratory's contribution.
CREATE TABLE "lab_gene_submissions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "species_id" TEXT NOT NULL,
    "gene_name" TEXT NOT NULL,
    "gene_type" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "complex" TEXT,
    "has_super_form" BOOLEAN NOT NULL DEFAULT false,
    "super_gene_name" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_gene_submissions_pkey" PRIMARY KEY ("id")
);

-- Two laboratories naming the same gene is one fact to review, not two.
CREATE UNIQUE INDEX "lab_gene_submissions_species_id_gene_name_key"
    ON "lab_gene_submissions"("species_id", "gene_name");
CREATE INDEX "lab_gene_submissions_status_idx" ON "lab_gene_submissions"("status");
CREATE INDEX "lab_gene_submissions_organization_id_idx" ON "lab_gene_submissions"("organization_id");

ALTER TABLE "lab_gene_submissions" ADD CONSTRAINT "lab_gene_submissions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull: a reviewer leaving must not delete the record of what they approved.
ALTER TABLE "lab_gene_submissions" ADD CONSTRAINT "lab_gene_submissions_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
