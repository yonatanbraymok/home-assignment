import { db } from "@/lib/db";
import { statusEditsFor } from "./edit";
import type { ApplicationStatus, Confidence } from "@/generated/prisma/enums";
import type { Candidate } from "@/lib/proposals/create";
import { waitingForDecisionWhere } from "@/lib/proposals/rules";
import { READ_TOOLS } from "@/lib/tools/read";

// The dashboard's reads. Each one takes the user id and filters every query by it, so one user's
// id can never load another user's rows. Pages don't call these directly: they go through data.ts,
// which takes the id from the session cookie.

export type DashboardStats = {
  total: number;
  by_status: Partial<Record<ApplicationStatus, number>>;
  open: number;
  no_reply_yet: number;
  response_rate_percent: number | null;
  proposals_waiting_for_decision: number;
};

export function findSessionUser(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      telegramUsername: true,
      gmailAddress: true,
      gmailConnectedAt: true,
      gmailLastSyncAt: true,
      gmailSyncError: true,
      demoAt: true,
      telegramUserId: true,
    },
  });
}

/**
 * When each application's current status started: the date of the email behind the approval that
 * set it. `statusChangedAt` records the tap on Approve, which for past emails reviewed on the first
 * day can be weeks after the email. A later `statusChangedAt` means a later change by hand.
 */
async function statusStartDates(userId: string, applicationIds?: string[]) {
  const executed = await db.statusProposal.findMany({
    where: { userId, state: "EXECUTED", applicationId: applicationIds ? { in: applicationIds } : { not: null } },
    // Newest approval first; approvals made in the same instant are ordered by their email.
    orderBy: [{ executedAt: "desc" }, { email: { receivedAt: "desc" } }],
    select: { applicationId: true, toStatus: true, executedAt: true, email: { select: { receivedAt: true } } },
  });
  return (a: { id: string; status: ApplicationStatus; statusChangedAt: Date }) => {
    const p = executed.find((x) => x.applicationId === a.id && x.toStatus === a.status);
    return p?.executedAt && a.statusChangedAt <= p.executedAt ? p.email.receivedAt : a.statusChangedAt;
  };
}

export async function overviewFor(userId: string) {
  const [applications, waiting, stats, statusSince, lastEmails] = await Promise.all([
    db.jobApplication.findMany({
      where: { userId },
      select: { id: true, company: true, roleTitle: true, jobRef: true, status: true, statusChangedAt: true, lastEmailAt: true },
    }),
    db.statusProposal.findMany({
      where: waitingForDecisionWhere(userId, new Date()),
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        kind: true,
        state: true,
        applicationId: true,
        company: true,
        roleTitle: true,
        jobRef: true,
        candidates: true,
        fromStatus: true,
        toStatus: true,
        evidenceQuote: true,
        heldForReview: true,
        expiresAt: true,
        email: { select: { subject: true, receivedAt: true } },
      },
    }),
    // The same totals as /status and the chat, so the numbers agree everywhere.
    READ_TOOLS.get_stats.run(db, userId, {}) as Promise<DashboardStats>,
    statusStartDates(userId),
    // The newest job email of each application, for its "last email" button.
    db.emailMessage.findMany({
      where: { userId, applicationId: { not: null }, category: { not: "NOT_JOB_RELATED" } },
      orderBy: { receivedAt: "desc" },
      distinct: ["applicationId"],
      select: { applicationId: true, gmailMessageId: true },
    }),
  ]);
  const lastEmailOf = new Map(lastEmails.map((e) => [e.applicationId!, e.gmailMessageId]));
  const rows = applications
    .map((a) => {
      const since = statusSince(a);
      // The latest real-world date: the newest email, or the start of the current status.
      const lastUpdate = a.lastEmailAt && a.lastEmailAt > since ? a.lastEmailAt : since;
      return { ...a, statusSince: since, lastUpdate, lastEmailMessageId: lastEmailOf.get(a.id) ?? null };
    })
    .sort((a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime());
  return {
    applications: rows,
    waiting: waiting.map((p) => ({ ...p, candidates: (p.candidates as Candidate[] | null) ?? null })),
    stats,
  };
}

type Analysis = {
  reasoning?: string;
  evidenceQuote?: string;
  confidence?: Confidence;
  quoteVerified?: boolean;
  warnings?: string[];
  noProposalReason?: string;
};

/**
 * One application and its timeline: each email the agent linked to it, what the agent concluded
 * (reasoning, the verified quote, confidence) and what happened to its proposal. Null if the
 * application doesn't exist or isn't this user's.
 */
export async function applicationDetailFor(userId: string, applicationId: string) {
  const application = await db.jobApplication.findFirst({
    where: { id: applicationId, userId },
    select: { id: true, company: true, roleTitle: true, jobRef: true, status: true, source: true, appliedAt: true, statusChangedAt: true },
  });
  if (!application) return null;

  // An email belongs on this timeline if the agent linked it here, or if a proposal for it was
  // applied here (a "which application?" card links its email only once the owner chooses).
  const appliedHere = await db.statusProposal.findMany({ where: { userId, applicationId: application.id }, select: { emailId: true } });
  const emails = await db.emailMessage.findMany({
    where: { userId, OR: [{ applicationId: application.id }, { id: { in: appliedHere.map((p) => p.emailId) } }] },
    orderBy: { receivedAt: "asc" },
    select: { id: true, gmailMessageId: true, fromAddress: true, fromName: true, subject: true, receivedAt: true, category: true, analysis: true },
  });
  const [proposals, statusSince] = await Promise.all([
    db.statusProposal.findMany({
      where: { userId, emailId: { in: emails.map((e) => e.id) } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        emailId: true,
        kind: true,
        state: true,
        applicationId: true,
        candidates: true,
        fromStatus: true,
        toStatus: true,
        reasoning: true,
        evidenceQuote: true,
        confidence: true,
        warnings: true,
        heldForReview: true,
        expiresAt: true,
        decidedAt: true,
      },
    }),
    statusStartDates(userId, [application.id]),
  ]);
  const edits = await statusEditsFor(userId, application.id);
  // The newest proposal per email (normally the only one).
  const proposalFor = new Map(proposals.map((p) => [p.emailId, { ...p, candidates: (p.candidates as Candidate[] | null) ?? null }]));

  const timeline = emails.map(({ analysis, ...email }) => {
    const a = (analysis ?? {}) as Analysis;
    const proposal = proposalFor.get(email.id) ?? null;
    return {
      email,
      // A proposal carries what the owner was shown (confidence capped by code); without one,
      // the classification itself.
      reasoning: proposal?.reasoning ?? a.reasoning ?? null,
      evidenceQuote: proposal?.evidenceQuote ?? a.evidenceQuote ?? null,
      confidence: proposal?.confidence ?? a.confidence ?? null,
      // No proposal is ever made from a quote that isn't verbatim in the email.
      quoteVerified: proposal !== null || a.quoteVerified === true,
      warnings: proposal?.warnings ?? a.warnings ?? [],
      proposal,
      noProposalReason: proposal ? null : (a.noProposalReason ?? null),
    };
  });
  return { application: { ...application, statusSince: statusSince(application) }, timeline, edits };
}

/** What a new user has done so far, for the dashboard's getting-started checklist. */
/** The latest questions and answers, from either channel: the dashboard chat opens on them. */
export async function recentChatFor(userId: string, take = 6) {
  const rows = await db.actionLog.findMany({
    where: { userId, action: "CHAT_ANSWERED", createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    orderBy: { id: "desc" },
    take,
    select: { id: true, createdAt: true, payload: true },
  });
  return rows.reverse().flatMap((r) => {
    const p = r.payload as { question?: string; answer?: string; channel?: string } | null;
    return p?.question && p.answer ? [{ id: String(r.id), at: r.createdAt, question: p.question, answer: p.answer, channel: p.channel === "dashboard" ? ("dashboard" as const) : ("telegram" as const) }] : [];
  });
}

/** Counts for the settings page. */
export async function accountCountsFor(userId: string) {
  const [applications, jobEmails] = await Promise.all([
    db.jobApplication.count({ where: { userId } }),
    db.emailMessage.count({ where: { userId, state: "CLASSIFIED", category: { not: "NOT_JOB_RELATED" } } }),
  ]);
  return { applications, jobEmails };
}
