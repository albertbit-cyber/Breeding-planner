ALTER TABLE "ShedTestOrder"
ADD COLUMN "orderNumber" TEXT;

CREATE UNIQUE INDEX "ShedTestOrder_orderNumber_key"
ON "ShedTestOrder"("orderNumber");
