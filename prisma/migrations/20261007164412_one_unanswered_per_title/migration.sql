-- DropIndex
DROP INDEX "JobApplication_userId_dedupeKey_key";

-- CreateIndex
CREATE INDEX "JobApplication_userId_dedupeKey_idx" ON "JobApplication"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "one_unanswered_per_dedupe_key" ON "JobApplication"("userId", "dedupeKey") WHERE (status = 'APPLIED');

