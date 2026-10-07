import type { AccountSummary } from "@/lib/account/manage";
import type { AnalysisSummary } from "@/lib/agent/analyze";
import type { RevokeResult } from "@/lib/gmail/oauth";
import type { SyncSummary } from "@/lib/gmail/sync";
import type { Decision } from "@/lib/proposals/decide";
import type { ReviewSummary } from "@/lib/proposals/past-emails";
import type { DeferResult } from "@/lib/proposals/review";
import { CLOSED_STATUSES, OPEN_STATUSES, STATUS_DESCRIPTION } from "@/lib/proposals/rules";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { COMMANDS } from "./commands";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function welcomeText(firstName: string, isNew: boolean, gmailAddress: string | null) {
  return [
    isNew ? `Hi ${firstName}, you're registered.` : `Welcome back, ${firstName}.`,
    "",
    "I keep your internship applications up to date from your inbox:",
    "• I read job emails from your Gmail (read-only: I can never send, delete or change mail)",
    "• I spot confirmations, online assessments, interviews, rejections and offers",
    "• For each one I explain why, quoting the exact sentence from the email",
    "• I propose the change here with Approve / Reject buttons. Nothing changes until you tap Approve.",
    "• After you connect, I read your past emails first, then show you what I found one card at a time.",
    "",
    "Send /dashboard to see everything in your browser. You can /disconnect Gmail or /delete_my_data at any time.",
    "",
    gmailAddress ? `Gmail connected: ${gmailAddress}. Send /sync to check for new emails.` : "Next step: send /connect to link your Gmail.",
  ].join("\n");
}

export function helpText() {
  return [
    "How approvals work",
    "Every change I suggest comes with the email it's based on, the sentence that justifies it and how confident I am. Only you can approve changes to your own applications, and a card expires 7 days after I show it.",
    "",
    "Your past emails (from before you connected Gmail) come as one review, one card at a time. ⏭ Later moves a card to the end; /pending continues where you stopped.",
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
  const outcomes = [
    ...(s.proposals || !s.held ? [`${plural(s.proposals, "proposal")} sent above`] : []),
    ...(s.held ? [`${s.held} kept for your review`] : []),
    `${s.noChange} needed no change`,
    `${s.notJobRelated} not job-related`,
  ];
  const lines = [`Analysed ${s.analyzed}: ${outcomes.join(", ")}.`];
  if (s.held) lines.push("Once I've read all your past emails, I'll show you what I found one card at a time.");
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

const STATUS_NOUN: Record<ApplicationStatus, string> = {
  APPLIED: "application confirmation",
  ASSESSMENT: "online assessment",
  INTERVIEW: "interview invitation",
  OFFER: "offer",
  REJECTED: "rejection",
  WITHDRAWN: "withdrawal",
};
const SUMMARY_ORDER: ApplicationStatus[] = ["OFFER", "INTERVIEW", "ASSESSMENT", "REJECTED", "APPLIED", "WITHDRAWN"];

/** Sent once all past emails are read, instead of one card per email. */
export function reviewReadyText(s: ReviewSummary): string {
  return [
    `I've finished reading your past emails. ${plural(s.total, "update")} ${s.total === 1 ? "is" : "are"} waiting for your review, from ${s.companies} ${s.companies === 1 ? "company" : "companies"}:`,
    ...SUMMARY_ORDER.filter((k) => s.byStatus[k]).map((k) => `• ${plural(s.byStatus[k]!, STATUS_NOUN[k])}`),
    "",
    "Nothing changes until you approve each one. I'll show them one at a time, grouped by company. ⏭ Later moves a card to the end, and /pending continues where you stopped.",
  ].join("\n");
}

export const REVIEW_DONE_TEXT = "That's everything from your past emails. From now on, I'll send a card when a new job email arrives.";

export const STILL_READING_TEXT = "I'm still reading your past emails. When I'm done, I'll show you what I found one card at a time.";

export const LATER_TOAST: Record<DeferResult, string> = {
  deferred: "Moved to the end of your review.",
  last: "This is the last one left to review.",
  "not-open": "This card isn't waiting for a decision any more.",
  "not-yours": "Only the owner of this application can decide this.",
  "not-found": "This proposal no longer exists.",
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
  if (!s.coverage.gmail && s.total === 0) return "Gmail isn't connected yet. Send /connect to start.";
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
    s.coverage.gmail
      ? `From ${s.coverage.gmail}${s.coverage.emails_since ? ` since ${s.coverage.emails_since}` : ""}. Ask me anything about them, e.g. "which applications haven't replied?"`
      : "Gmail is disconnected, so nothing new is being read. Send /connect to resume. You can still ask me about these applications.",
  ].join("\n");
}

const REVOKE_NOTE: Record<RevokeResult | "not-connected", string> = {
  revoked: "Google access is revoked.",
  "already-invalid": "Google access was already revoked.",
  failed: "I couldn't confirm the revoke with Google. To be sure, remove \"Job Hunt Tracker\" at https://myaccount.google.com/permissions",
  "not-connected": "",
};

export function disconnectConfirmText(gmailAddress: string): string {
  return [
    `Disconnect ${gmailAddress}?`,
    "",
    "• I'll revoke my read access at Google and delete the stored token, so I stop reading your email.",
    "• Your tracker stays: applications, their history, /status and questions keep working.",
    "• You can /connect again at any time.",
    "",
    "To erase everything instead, use /delete_my_data.",
  ].join("\n");
}

export function disconnectDoneText(revoke: RevokeResult): string {
  return `Gmail disconnected. ${REVOKE_NOTE[revoke]}\n\nYour tracker is still here. Send /connect to start reading email again.`;
}

export function deleteConfirmText(s: AccountSummary): string {
  return [
    "Delete everything I store about you?",
    "",
    `This permanently deletes ${plural(s.applications, "application")}, ${plural(s.emails, "stored email")} with their evidence, ${plural(s.proposals, "card")}, ${plural(s.questions, "chat question")} and your registration, and revokes Gmail access.`,
    "",
    "• Cost records stay, without your name; they hold no content.",
    "• Messages already in this Telegram chat stay. Clear the chat in Telegram to remove them.",
    "• This can't be undone.",
  ].join("\n");
}

export function deleteDoneText(revoke: RevokeResult | "not-connected"): string {
  return ["Done. Everything I stored about you is deleted.", REVOKE_NOTE[revoke], "", "Send /start if you want to begin again."]
    .filter((line, i) => line || i !== 1)
    .join("\n");
}

/**
 * The /dashboard reply: the text and its send options together. Previews must stay off: Telegram's
 * preview crawler would open the link, and that would use it up before the user taps it.
 */
export function dashboardLinkReply(link: string) {
  return [dashboardLinkText(link), { link_preview_options: { is_disabled: true } }] as const;
}

export function dashboardLinkText(link: string): string {
  return [
    "Your dashboard. This link signs you in once, within 10 minutes:",
    link,
    "",
    "It shows your applications, the emails behind them and the cards waiting for you. Approving still happens here in Telegram. Send /dashboard again whenever you need a new link.",
  ].join("\n");
}

export const NOT_CONNECTED_FOR_DISCONNECT_TEXT = "Gmail isn't connected, so there's nothing to disconnect. To erase your data, use /delete_my_data.";

export const NOTHING_STORED_TEXT = "I don't store anything about you.";

export const NOT_REGISTERED_TEXT = "Send /start first so I can register you.";

export const NOT_CONNECTED_TEXT = "Connect your Gmail first with /connect.";

export const UNKNOWN_COMMAND_TEXT = "I don't know that command. Send /help to see what I can do.";
