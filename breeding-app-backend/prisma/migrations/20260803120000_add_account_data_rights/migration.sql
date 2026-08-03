-- Right to erasure and right to data portability (GDPR Art. 17 and Art. 20).
--
-- Two changes, both prerequisites for self-service account deletion:
--
-- 1. "ShedTestOrder_breederId_fkey" was created ON DELETE RESTRICT (the Prisma
--    default for a required relation). Any user who had ever placed a lab order
--    could not be deleted at all — the database refused the row. Every other
--    User relation is already Cascade or SetNull, so this single constraint was
--    the one hard blocker on erasure. Switched to CASCADE; the order's child
--    rows (ShedTestOrderAnimal, ShedTestOrderResult) already cascade from the
--    order, so the whole tree goes with the user.
--
-- 2. The grace-period columns. Deletion is not immediate: the account is locked
--    and hidden at once, and the purge job hard-deletes only once
--    deletion_scheduled_at has passed. Signing in during the window cancels the
--    request and clears both columns. This protects against both regret and an
--    attacker who gains access and tries to destroy someone's records.

-- DropForeignKey
ALTER TABLE "ShedTestOrder" DROP CONSTRAINT "ShedTestOrder_breederId_fkey";

-- AddForeignKey
ALTER TABLE "ShedTestOrder" ADD CONSTRAINT "ShedTestOrder_breederId_fkey" FOREIGN KEY ("breederId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletion_requested_at" TIMESTAMP(3),
ADD COLUMN     "deletion_scheduled_at" TIMESTAMP(3);

-- Lets the purge job find due accounts without scanning the whole user table.
CREATE INDEX "User_deletion_scheduled_at_idx" ON "User"("deletion_scheduled_at");
