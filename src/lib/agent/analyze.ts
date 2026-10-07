import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { senderDomain } from "@/lib/gmail/parse";
import { BudgetExceeded } from "@/lib/llm/budget";
import { llmConfigured } from "@/lib/llm/gemini";
import { proposeFromEmail } from "@/lib/proposals/create";
import { classifyEmail, type Classification } from "./classify";
import { matchApplication } from "./match";
import { wordingSupportsCategory } from "./signals";
import { jobRefAppearsIn, quoteAppearsIn } from "./verify-quote";

const MAX_ATTEMPTS = 3;

export type AnalysisSummary = {
  analyzed: number;
  proposals: number;
  noChange: number; // job-related, but nothing to propose (already in that status, no company, ...)
  notJobRelated: number;
  unverified: number; // the model's quote wasn't in the email: no proposal
  failed: number;
  deferred: number; // budget cap reached
  skippedNotConfigured?: boolean;
};

/**
 * Classifies a user's queued emails one by one (oldest first, so proposals follow the real order
 * of events) and turns verified results into proposals.
 */
export async function analyzePendingEmails(userId: string, limit: number): Promise<AnalysisSummary> {
  const summary: AnalysisSummary = { analyzed: 0, proposals: 0, noChange: 0, notJobRelated: 0, unverified: 0, failed: 0, deferred: 0 };
  if (!llmConfigured()) return { ...summary, skippedNotConfigured: true };

  const queued = await db.emailMessage.findMany({
    where: { userId, state: { in: ["NEW", "FAILED", "DEFERRED_BUDGET"] } },
    orderBy: { receivedAt: "asc" },
    take: limit * 3, // FAILED ones past MAX_ATTEMPTS are filtered below
  });
  const emails = queued.filter((e) => attemptsOf(e.analysis) < MAX_ATTEMPTS).slice(0, limit);

  for (const email of emails) {
    const attempts = attemptsOf(email.analysis) + 1;
    let classification: Classification;
    try {
      classification = await classifyEmail(email, userId);
    } catch (err) {
      if (err instanceof BudgetExceeded) {
        // Leave the rest queued; they're picked up once the budget allows.
        await db.emailMessage.updateMany({ where: { id: { in: emails.map((e) => e.id) }, state: { not: "CLASSIFIED" } }, data: { state: "DEFERRED_BUDGET" } });
        summary.deferred = emails.length - summary.analyzed;
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
    const outcome = await proposeFromEmail({ userId, email, classification, match, wordingSupportsCategory: wordingOk, extraWarnings });

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
    if (outcome.proposalId) summary.proposals++;
    else summary.noChange++;
  }
  return summary;
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
