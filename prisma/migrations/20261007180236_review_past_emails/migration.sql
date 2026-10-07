-- AlterTable
ALTER TABLE "StatusProposal" ADD COLUMN     "deferredAt" TIMESTAMP(3),
ADD COLUMN     "heldForReview" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "expiresAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "backfillDoneAt" TIMESTAMP(3);

-- Users who already finished their first sync have nothing to review: their cards were sent.
UPDATE "User" SET "backfillDoneAt" = now() WHERE "gmailLastSyncAt" IS NOT NULL;
