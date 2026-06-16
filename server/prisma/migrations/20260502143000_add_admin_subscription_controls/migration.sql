ALTER TABLE "User"
ADD COLUMN "subscriptionStartedAt" TIMESTAMP(3),
ADD COLUMN "subscriptionRenewalAt" TIMESTAMP(3),
ADD COLUMN "subscriptionTrialEndsAt" TIMESTAMP(3),
ADD COLUMN "subscriptionPaymentStatus" TEXT NOT NULL DEFAULT 'none';
