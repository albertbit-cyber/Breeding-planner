-- CreateEnum
CREATE TYPE "ShedPaymentStatus" AS ENUM ('pending', 'invoiced', 'paid', 'waived');

-- AlterTable
ALTER TABLE "ShedTestOrder" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentRef" TEXT,
ADD COLUMN     "paymentRequestedAt" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" "ShedPaymentStatus" NOT NULL DEFAULT 'pending';
