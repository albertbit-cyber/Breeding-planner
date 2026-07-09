-- Tombstones let deletions propagate across devices without immediately
-- removing the canonical backend record.
ALTER TABLE "Animal" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Pairing" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Clutch" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Password reset tokens replace the legacy credential-recovery flow.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "passwordResetExpiry" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- Results are unique per animal in a multi-animal order.
DROP INDEX IF EXISTS "ShedTestOrderResult_orderId_testCode_key";
CREATE INDEX IF NOT EXISTS "ShedTestOrderResult_animalId_idx" ON "ShedTestOrderResult"("animalId");
CREATE UNIQUE INDEX IF NOT EXISTS "ShedTestOrderResult_orderId_animalId_testCode_key"
  ON "ShedTestOrderResult"("orderId", "animalId", "testCode");
