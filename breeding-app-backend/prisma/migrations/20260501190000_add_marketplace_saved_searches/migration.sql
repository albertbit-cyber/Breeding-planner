CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedSearch_ownerId_idx" ON "SavedSearch"("ownerId");
CREATE INDEX "SavedSearch_ownerId_updatedAt_idx" ON "SavedSearch"("ownerId", "updatedAt");

ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
