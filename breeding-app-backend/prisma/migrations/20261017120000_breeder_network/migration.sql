-- Breeder network: @handles, conversations with message requests, animal transfers, joint projects.
--
-- Additive only: one nullable column on "User" and six new tables. No existing row is touched.
-- Rollback: drop the six tables and the column; nothing outside them references them.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "handle" TEXT;

-- CreateTable
CREATE TABLE "network_threads" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'direct',
    "pair_key" TEXT,
    "created_by_id" TEXT,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_thread_participants" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "last_read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_thread_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender_user_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL,
    "attachment" JSONB,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_transfers" (
    "id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "receiver_user_id" TEXT NOT NULL,
    "sender_animal_id" TEXT NOT NULL,
    "sender_app_animal_id" TEXT NOT NULL,
    "receiver_animal_id" TEXT,
    "receiver_app_animal_id" TEXT,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "loan_until" TIMESTAMP(3),
    "thread_id" TEXT,
    "message_id" TEXT,
    "project_id" TEXT,
    "snapshot" JSONB NOT NULL,
    "responded_at" TIMESTAMP(3),
    "returned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "joint_projects" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "proposed_by_id" TEXT NOT NULL,
    "invited_user_id" TEXT NOT NULL,
    "male_owner_id" TEXT,
    "female_owner_id" TEXT,
    "male_animal_id" TEXT,
    "female_animal_id" TEXT,
    "male_snapshot" JSONB,
    "female_snapshot" JSONB,
    "partner_male_app_id" TEXT,
    "split_terms" JSONB,
    "split_agreed_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "joint_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "joint_project_split_proposals" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "proposed_by_id" TEXT NOT NULL,
    "terms" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "message_id" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "joint_project_split_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "network_threads_pair_key_key" ON "network_threads"("pair_key");

-- CreateIndex
CREATE INDEX "network_threads_last_message_at_idx" ON "network_threads"("last_message_at");

-- CreateIndex
CREATE INDEX "network_thread_participants_user_id_status_idx" ON "network_thread_participants"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "network_thread_participants_thread_id_user_id_key" ON "network_thread_participants"("thread_id", "user_id");

-- CreateIndex
CREATE INDEX "network_messages_thread_id_created_at_idx" ON "network_messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "network_messages_sender_user_id_idx" ON "network_messages"("sender_user_id");

-- CreateIndex
CREATE INDEX "animal_transfers_sender_user_id_status_idx" ON "animal_transfers"("sender_user_id", "status");

-- CreateIndex
CREATE INDEX "animal_transfers_receiver_user_id_status_idx" ON "animal_transfers"("receiver_user_id", "status");

-- CreateIndex
CREATE INDEX "animal_transfers_sender_animal_id_idx" ON "animal_transfers"("sender_animal_id");

-- CreateIndex
CREATE INDEX "animal_transfers_project_id_idx" ON "animal_transfers"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "joint_projects_thread_id_key" ON "joint_projects"("thread_id");

-- CreateIndex
CREATE INDEX "joint_projects_male_owner_id_status_idx" ON "joint_projects"("male_owner_id", "status");

-- CreateIndex
CREATE INDEX "joint_projects_female_owner_id_status_idx" ON "joint_projects"("female_owner_id", "status");

-- CreateIndex
CREATE INDEX "joint_projects_invited_user_id_status_idx" ON "joint_projects"("invited_user_id", "status");

-- CreateIndex
CREATE INDEX "joint_project_split_proposals_project_id_status_idx" ON "joint_project_split_proposals"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- AddForeignKey
ALTER TABLE "network_thread_participants" ADD CONSTRAINT "network_thread_participants_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "network_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_thread_participants" ADD CONSTRAINT "network_thread_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_messages" ADD CONSTRAINT "network_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "network_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_messages" ADD CONSTRAINT "network_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_transfers" ADD CONSTRAINT "animal_transfers_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_transfers" ADD CONSTRAINT "animal_transfers_receiver_user_id_fkey" FOREIGN KEY ("receiver_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "joint_projects" ADD CONSTRAINT "joint_projects_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "network_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "joint_projects" ADD CONSTRAINT "joint_projects_male_owner_id_fkey" FOREIGN KEY ("male_owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "joint_projects" ADD CONSTRAINT "joint_projects_female_owner_id_fkey" FOREIGN KEY ("female_owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "joint_project_split_proposals" ADD CONSTRAINT "joint_project_split_proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "joint_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

