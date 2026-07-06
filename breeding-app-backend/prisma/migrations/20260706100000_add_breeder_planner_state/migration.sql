CREATE TABLE "breeder_planner_states" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "breeder_planner_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "breeder_planner_states_ownerId_key" ON "breeder_planner_states"("ownerId");
CREATE INDEX "breeder_planner_states_ownerId_idx" ON "breeder_planner_states"("ownerId");

ALTER TABLE "breeder_planner_states"
  ADD CONSTRAINT "breeder_planner_states_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
