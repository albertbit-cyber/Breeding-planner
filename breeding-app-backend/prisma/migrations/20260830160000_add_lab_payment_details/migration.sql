-- Payment details printed on the certificates a laboratory issues.
--
-- These existed before as part of a hardcoded certificate issuer belonging to
-- one specific laboratory, so every certificate the platform produced carried
-- that laboratory's bank account. Removing the constant left the certificate
-- template rendering IBAN/BIC lines with nothing able to fill them; this gives
-- each laboratory somewhere to put its own.
ALTER TABLE "LabAccount" ADD COLUMN "iban" TEXT;
ALTER TABLE "LabAccount" ADD COLUMN "bic" TEXT;
ALTER TABLE "LabAccount" ADD COLUMN "vat_number" TEXT;
