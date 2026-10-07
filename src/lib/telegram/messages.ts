import type { AnalysisSummary } from "@/lib/agent/analyze";
import type { SyncSummary } from "@/lib/gmail/sync";
import type { Decision } from "@/lib/proposals/decide";
import { CLOSED_STATUSES, OPEN_STATUSES, STATUS_DESCRIPTION } from "@/lib/proposals/rules";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { COMMANDS } from "./commands";

export function welcomeText(firstName: string, isNew: boolean, gmailAddress: string | null) {
  return [
    isNew ? `Hi ${firstName}, you're registered.` : `Welcome back, ${firstName}.`,
    "",
    "I keep your internship applications up to date from your inbox:",
    "• I read job emails from your Gmail (read-only: I can never send, delete or change mail)",
    "• I spot confirmations, online assessments, interviews, rejections and offers",
    "• For each one I explain why, quoting the exact sentence from the email",
    "• I propose the change here with Approve / Reject buttons. Nothing changes until you tap Approve.",
    "",
    gmailAddress ? `Gmail connected: ${gmailAddress}. Send /sync to check for new emails.` : "Next step: send /connect to link your Gmail.",
  ].join("\n");
}

export function helpText() {
  return [
    "How approvals work",
    "Every change I suggest comes with the email it's based on, the sentence that justifies it and how confident I am. Only you can approve changes to your own applications, and an unanswered proposal expires after 7 days.",
    "",
    "Commands",
    ...COMMANDS.map((c) => `/${c.command} – ${c.description}`),
  ].join("\n");
}

export function connectText(link: string, gmailAddress: string | null) {
  return [
    gmailAddress
      ? `Gmail connected: ${gmailAddress}. To reconnect or switch accounts, open this link within 10 minutes:`
      : "Open this link within 10 minutes to connect your Gmail:",
    link,
    "",
    "Google will ask to let me read your email. I only keep job-related emails, and I can never send, delete or change anything.",
  ].join("\n");
}

export function syncText({ fetched, candidates, skipped, remaining }: SyncSummary) {
  if (fetched === 0 && remaining === 0) return "Up to date: no new emails since the last check.";
  const lines = [
    `Fetched ${fetched} new email${fetched === 1 ? "" : "s"}: ${candidates} look job-related and are queued for analysis, ${skipped} skipped as unrelated.`,
  ];
  if (remaining > 0) lines.push(`${remaining} older emails still to fetch. Send /sync again to continue.`);
  return lines.join("\n");
}

export function analysisText(s: AnalysisSummary, stillQueued: number): string {
  if (s.skippedNotConfigured) return "Email analysis isn't configured yet, so nothing was analysed.";
  if (s.analyzed === 0 && s.deferred === 0) return "";
  const lines = [
    `Analysed ${s.analyzed}: ${s.proposals} proposal${s.proposals === 1 ? "" : "s"} sent above, ${s.noChange} needed no change, ${s.notJobRelated} not job-related.`,
  ];
  if (s.unverified) lines.push(`${s.unverified} skipped: I couldn't find my evidence quote in the email, so I won't propose anything from it (I'll retry).`);
  if (s.failed) lines.push(`${s.failed} couldn't be analysed right now (I'll retry).`);
  if (s.deferred) lines.push(`The monthly AI budget is used up: ${s.deferred} emails are waiting until it resets.`);
  if (stillQueued) lines.push(`${stillQueued} more queued. Send /sync again to continue.`);
  return lines.join("\n");
}

export const DECISION_TOAST: Record<Decision["kind"], string> = {
  executed: "Done: application updated.",
  rejected: "Rejected. Nothing was changed.",
  stale: "Not applied: the application changed since this proposal.",
  failed: "Couldn't apply it. Nothing was changed; you can retry.",
  already: "Already decided.",
  expired: "This proposal expired. Nothing was changed.",
  "not-yours": "Only the owner of this application can decide this.",
  "not-found": "This proposal no longer exists.",
  "needs-choice": "Tap the application this email is about.",
};

export type StatsForText = {
  total: number;
  by_status: Partial<Record<ApplicationStatus, number>>;
  open: number;
  proposals_waiting_for_decision: number;
  coverage: { gmail: string | null; emails_since: string | null; last_gmail_check: string | null };
};

/** /status: straight from the database, no AI, so it works even when the AI budget is used up. */
export function statusText(s: StatsForText): string {
  if (!s.coverage.gmail) return "Gmail isn't connected yet. Send /connect to start.";
  // Open and closed are the two groups; each status belongs to exactly one.
  const group = (statuses: ApplicationStatus[]) =>
    statuses.filter((k) => s.by_status[k]).map((k) => `  • ${STATUS_DESCRIPTION[k][0].toUpperCase()}${STATUS_DESCRIPTION[k].slice(1)}: ${s.by_status[k]}`);
  const closed = s.total - s.open;
  return [
    `Tracking ${s.total} application${s.total === 1 ? "" : "s"}.`,
    "",
    `Open: ${s.open}`,
    ...group(OPEN_STATUSES),
    `Closed: ${closed}`,
    ...group(CLOSED_STATUSES),
    "",
    `Waiting for your decision: ${s.proposals_waiting_for_decision}${s.proposals_waiting_for_decision ? " (/pending)" : ""}`,
    "",
    `From ${s.coverage.gmail}${s.coverage.emails_since ? ` since ${s.coverage.emails_since}` : ""}. Ask me anything about them, e.g. "which applications haven't replied?"`,
  ].join("\n");
}

export const NOT_REGISTERED_TEXT = "Send /start first so I can register you.";

export const NOT_CONNECTED_TEXT = "Connect your Gmail first with /connect.";

export const UNKNOWN_COMMAND_TEXT = "I don't know that command. Send /help to see what I can do.";
