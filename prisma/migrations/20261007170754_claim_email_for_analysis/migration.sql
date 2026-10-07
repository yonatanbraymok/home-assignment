-- AlterEnum
ALTER TYPE "EmailState" ADD VALUE 'ANALYZING';

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "claimedAt" TIMESTAMP(3);

