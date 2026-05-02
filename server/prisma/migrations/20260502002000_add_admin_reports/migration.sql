CREATE TABLE "Report" (
  "id" TEXT NOT NULL,
  "reporterUserId" TEXT,
  "reportedUserId" TEXT,
  "relatedListingId" TEXT,
  "relatedMessageId" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "description" TEXT NOT NULL,
  "assignedAdminId" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Report_reporterUserId_idx" ON "Report"("reporterUserId");
CREATE INDEX "Report_reportedUserId_idx" ON "Report"("reportedUserId");
CREATE INDEX "Report_relatedListingId_idx" ON "Report"("relatedListingId");
CREATE INDEX "Report_assignedAdminId_idx" ON "Report"("assignedAdminId");
CREATE INDEX "Report_status_idx" ON "Report"("status");
CREATE INDEX "Report_type_idx" ON "Report"("type");
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");

ALTER TABLE "Report"
ADD CONSTRAINT "Report_reporterUserId_fkey"
FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Report"
ADD CONSTRAINT "Report_reportedUserId_fkey"
FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Report"
ADD CONSTRAINT "Report_relatedListingId_fkey"
FOREIGN KEY ("relatedListingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Report"
ADD CONSTRAINT "Report_assignedAdminId_fkey"
FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
