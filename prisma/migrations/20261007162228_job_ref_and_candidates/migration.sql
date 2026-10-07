-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "jobRef" TEXT;

-- AlterTable
ALTER TABLE "StatusProposal" ADD COLUMN     "candidates" JSONB,
ADD COLUMN     "jobRef" TEXT;

