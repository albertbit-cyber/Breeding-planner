-- Incremental cloud sync: GET /api/breeder/snapshot?since=<ts> filters each table by
-- ownerId plus updatedAt. Without a composite index that is an index scan on ownerId followed by
-- a filter over every row the account owns, which defeats the point of asking for a delta.
--
-- CONCURRENTLY is deliberately not used: these tables are small enough that the brief lock is
-- cheaper than the extra deploy complexity, and `prisma migrate deploy` runs each migration in a
-- transaction, which CONCURRENTLY cannot.
CREATE INDEX "Animal_ownerId_updatedAt_idx" ON "Animal"("ownerId", "updatedAt");
CREATE INDEX "Pairing_ownerId_updatedAt_idx" ON "Pairing"("ownerId", "updatedAt");
CREATE INDEX "Clutch_ownerId_updatedAt_idx" ON "Clutch"("ownerId", "updatedAt");
