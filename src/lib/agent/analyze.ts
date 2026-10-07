import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { senderDomain } from "@/lib/gmail/parse";
import { BudgetExceeded, budgetStatus } from "@/lib/llm/budget";
import type { BudgetMode, BudgetScope } from "@/lib/llm/budget-policy";
import { llmConfigured } from "@/lib/llm/gemini";
import { proposeFromEmail } from "@/lib/proposals/create";
import { isPastEmail } from "@/lib/proposals/past-emails";
import { classifyEmail, type Classification } from "./classify";
import { CLAIMABLE, MAX_ATTEMPTS, NOT_YET_READ } from "./queue";
import { matchApplication } from "./match";
import { wordingSupportsCategory } from "./signals";
import { jobRefAppearsIn, quoteAppearsIn } from "./verify-quote";

// A claim older than this belongs to a run that died; another run may take the email over.
const CLAIM_TTL_MS = 5 * 60_000;

export type AnalysisSummary = {
  analyzed: number;
  proposals: number; // cards sent now
  held: number; // proposals from past emails, kept for the one-at-a-time review
  noChange: number; // job-related, but nothing to propose (already in that status, no company, ...)
  notJobRelated: number;
  unverified: number; // the model's quote wasn't in the email: no proposal
  failed: number;
  // Set when the AI budget stopped the run: nothing was claimed or changed, and the emails wait
  // unread until the reset.
  budget?: { scope: BudgetScope; resetsOn: Date; waiting: number };
  skippedNotConfigured?: boolean;
};

/**
 * Classifies a user's queued emails one by one (oldest first, so proposals follow the real order
 * of events) and turns verified results into proposals.
 */
export async function analyzePendingEmails(userId: string, limit: number, opts: { budget?: BudgetMode } = {}): Promise<AnalysisSummary> {
  const summary: AnalysisSummary = { analyzed: 0, proposals: 0, held: 0, noChange: 0, notJobRelated: 0, unverified: 0, failed: 0 };
  if (!llmConfigured()) return { ...summary, skippedNotConfigured: true };
  const mode = opts.budget ?? (await budgetStatus(userId));
  // Out of budget: return before claiming anything, so emails keep their state and wait.
  if (!mode.aiOn) return { ...summary, budget: { scope: mode.limitedBy ?? "service", resetsOn: mode.resetsOn, waiting: await waiting(userId) } };
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { gmailConnectedAt: true, backfillDoneAt: true } });

  const staleClaim = () => ({ state: "ANALYZING" as const, claimedAt: { lt: new Date(Date.now() - CLAIM_TTL_MS) } });
  const queued = await db.emailMessage.findMany({
    where: { userId, OR: [{ state: { in: [...CLAIMABLE] } }, staleClaim()] },
    orderBy: { receivedAt: "asc" },
    take: limit * 3, // FAILED ones past MAX_ATTEMPTS are filtered below
  });
  const emails = queued.filter((e) => attemptsOf(e.analysis) < MAX_ATTEMPTS).slice(0, limit);

  for (const email of emails) {
    // Claim it first: if the cron run and a /sync overlap, only one of them analyses each email.
    const { count: claimed } = await db.emailMessage.updateMany({
      where: { id: email.id, OR: [{ state: { in: [...CLAIMABLE] } }, staleClaim()] },
      data: { state: "ANALYZING", claimedAt: new Date() },
    });
    if (claimed === 0) continue;

    const attempts = attemptsOf(email.analysis) + 1;
    let classification: Classification;
    try {
      classification = await classifyEmail(email, userId, "CLASSIFY_EMAIL", mode.models.classify);
    } catch (err) {
      if (err instanceof BudgetExceeded) {
        // Another run spent the rest meanwhile: give this email back as it was (a legacy deferred
        // or stale claim becomes NEW) and stop. The rest were never claimed.
        await db.emailMessage.updateMany({
          where: { id: email.id, state: "ANALYZING" },
          data: { state: email.state === "FAILED" ? "FAILED" : "NEW", claimedAt: null },
        });
        summary.budget = { scope: err.scope, resetsOn: err.resetsOn, waiting: await waiting(userId) };
        break;
      }
      await markFailed(email.id, attempts, err instanceof Error ? err.message : String(err));
      summary.failed++;
      summary.analyzed++;
      continue;
    }
    summary.analyzed++;

    const quoteVerified = quoteAppearsIn(classification.evidenceQuote, email.subject, email.bodyText);
    // A job ID the email doesn't contain is dropped, never used to match or create.
    const extraWarnings: string[] = [];
    if (classification.jobRef && !jobRefAppearsIn(classification.jobRef, email.subject, email.bodyText)) {
      extraWarnings.push(`Ignored job ID "${classification.jobRef}": it isn't in the email`);
      classification = { ...classification, jobRef: null };
    }
    if (!quoteVerified) {
      await markFailed(email.id, attempts, "Evidence quote not found in the email", classification);
      summary.unverified++;
      continue;
    }

    if (classification.category === "NOT_JOB_RELATED") {
      await db.emailMessage.update({
        where: { id: email.id },
        data: { state: "CLASSIFIED", category: classification.category, bodyText: null, analysis: { ...classification, quoteVerified, attempts } },
      });
      await logClassified(userId, email.id, classification, null);
      summary.notJobRelated++;
      continue;
    }

    const applications = await db.jobApplication.findMany({
      where: { userId },
      select: { id: true, company: true, companyDomain: true, roleTitle: true, jobRef: true, status: true },
    });
    const match = matchApplication(classification, senderDomain(email.fromAddress), applications);
    const wordingOk = wordingSupportsCategory(classification.category, `${email.subject}\n${email.bodyText ?? ""}`);
    const outcome = await proposeFromEmail({
      userId,
      email,
      classification,
      match,
      wordingSupportsCategory: wordingOk,
      extraWarnings,
      holdForReview: isPastEmail(user, email.receivedAt),
    });

    const matchedId = match.kind === "matched" ? match.application.id : null;
    await db.emailMessage.update({
      where: { id: email.id },
      data: {
        state: "CLASSIFIED",
        category: classification.category,
        applicationId: matchedId,
        analysis: {
          ...classification,
          quoteVerified,
          wordingSupportsCategory: wordingOk,
          match:
            match.kind === "matched"
              ? { applicationId: matchedId, strength: match.strength }
              : match.kind === "ambiguous"
                ? { ambiguous: match.candidates.map((a) => a.id) }
                : null,
          ...(extraWarnings.length ? { warnings: extraWarnings } : {}),
          proposalId: outcome.proposalId,
          ...(outcome.proposalId === null ? { noProposalReason: outcome.reason } : {}),
          attempts,
        },
      },
    });
    if (matchedId) await db.jobApplication.update({ where: { id: matchedId }, data: { lastEmailAt: email.receivedAt } });
    await logClassified(userId, email.id, classification, outcome.proposalId);
    if (outcome.proposalId === null) summary.noChange++;
    else if (outcome.held) summary.held++;
    else summary.proposals++;
  }
  return summary;
}

function waiting(userId: string): Promise<number> {
  return db.emailMessage.count({ where: { userId, state: { in: [...NOT_YET_READ] } } });
}

function attemptsOf(analysis: Prisma.JsonValue | null): number {
  const value = analysis && typeof analysis === "object" && !Array.isArray(analysis) ? analysis.attempts : 0;
  return typeof value === "number" ? value : 0;
}

async function markFailed(emailId: string, attempts: number, error: string, classification?: Classification) {
  await db.emailMessage.update({
    where: { id: emailId },
    data: { state: "FAILED", analysis: { ...(classification ?? {}), error, attempts } },
  });
}

function logClassified(userId: string, emailId: string, c: Classification, proposalId: string | null) {
  return db.actionLog.create({
    data: {
      userId,
      actor: "AGENT",
      action: "EMAIL_CLASSIFIED",
      proposalId,
      payload: { emailId, category: c.category, confidence: c.confidence },
    },
  });
}
