-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApplicationSource" AS ENUM ('EMAIL', 'MANUAL');

-- CreateEnum
CREATE TYPE "EmailState" AS ENUM ('NEW', 'PREFILTERED_OUT', 'CLASSIFIED', 'FAILED', 'DEFERRED_BUDGET');

-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('APPLICATION_RECEIVED', 'ASSESSMENT_INVITE', 'INTERVIEW_INVITE', 'REJECTION', 'OFFER', 'OTHER_JOB_RELATED', 'NOT_JOB_RELATED');

-- CreateEnum
CREATE TYPE "ProposalKind" AS ENUM ('CREATE_APPLICATION', 'UPDATE_STATUS');

-- CreateEnum
CREATE TYPE "ProposalState" AS ENUM ('PENDING', 'EXECUTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'STALE', 'FAILED');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "Actor" AS ENUM ('AGENT', 'USER', 'SYSTEM', 'MCP_CLIENT');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('EMAIL_CLASSIFIED', 'PROPOSAL_CREATED', 'PROPOSAL_EXECUTED', 'PROPOSAL_REJECTED', 'PROPOSAL_EXPIRED', 'PROPOSAL_SUPERSEDED', 'PROPOSAL_STALE', 'PROPOSAL_FAILED', 'APPLICATION_EDITED', 'CHAT_ANSWERED', 'MCP_TOOL_CALLED', 'BUDGET_THRESHOLD', 'GMAIL_SYNC_FAILED');

-- CreateEnum
CREATE TYPE "LlmPurpose" AS ENUM ('CLASSIFY_EMAIL', 'CHAT', 'EVAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "telegramChatId" BIGINT NOT NULL,
    "telegramUsername" TEXT,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "gmailAddress" TEXT,
    "gmailRefreshTokenEnc" TEXT,
    "gmailConnectedAt" TIMESTAMP(3),
    "gmailLastSyncAt" TIMESTAMP(3),
    "gmailSyncError" TEXT,
    "mcpTokenHash" TEXT,
    "mcpTokenCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyDomain" TEXT,
    "roleTitle" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "location" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "source" "ApplicationSource" NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEmailAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "snippet" TEXT NOT NULL,
    "bodyText" TEXT,
    "state" "EmailState" NOT NULL DEFAULT 'NEW',
    "category" "EmailCategory",
    "analysis" JSONB,
    "applicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "applicationId" TEXT,
    "kind" "ProposalKind" NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "company" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "evidenceQuote" TEXT NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "warnings" TEXT[],
    "state" "ProposalState" NOT NULL DEFAULT 'PENDING',
    "telegramChatId" BIGINT,
    "telegramMessageId" INTEGER,
    "decidedByTelegramUserId" BIGINT,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT,
    "actor" "Actor" NOT NULL,
    "actorRef" TEXT,
    "action" "ActionType" NOT NULL,
    "proposalId" TEXT,
    "applicationId" TEXT,
    "payload" JSONB,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmUsage" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT,
    "purpose" "LlmPurpose" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_gmailAddress_key" ON "User"("gmailAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_mcpTokenHash_key" ON "User"("mcpTokenHash");

-- CreateIndex
CREATE INDEX "JobApplication_userId_status_idx" ON "JobApplication"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_userId_dedupeKey_key" ON "JobApplication"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "EmailMessage_userId_state_idx" ON "EmailMessage"("userId", "state");

-- CreateIndex
CREATE INDEX "EmailMessage_userId_receivedAt_idx" ON "EmailMessage"("userId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_userId_gmailMessageId_key" ON "EmailMessage"("userId", "gmailMessageId");

-- CreateIndex
CREATE INDEX "StatusProposal_userId_state_idx" ON "StatusProposal"("userId", "state");

-- CreateIndex
CREATE INDEX "StatusProposal_applicationId_state_idx" ON "StatusProposal"("applicationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "one_pending_per_application" ON "StatusProposal"("applicationId") WHERE (state = 'PENDING');

-- CreateIndex
CREATE UNIQUE INDEX "ActionLog_dedupeKey_key" ON "ActionLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "ActionLog_userId_id_idx" ON "ActionLog"("userId", "id");

-- CreateIndex
CREATE INDEX "LlmUsage_createdAt_idx" ON "LlmUsage"("createdAt");

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusProposal" ADD CONSTRAINT "StatusProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusProposal" ADD CONSTRAINT "StatusProposal_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusProposal" ADD CONSTRAINT "StatusProposal_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "StatusProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

