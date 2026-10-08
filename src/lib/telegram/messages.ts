import type { InlineKeyboardMarkup, LinkPreviewOptions } from "grammy/types";
import type { AccountSummary } from "@/lib/account/manage";
import type { AnalysisSummary } from "@/lib/agent/analyze";
import { APP_NAME } from "@/lib/brand";
import { formatDateTime, formatUsd } from "@/lib/format";
import type { RevokeResult } from "@/lib/gmail/oauth";
import type { SyncSummary } from "@/lib/gmail/sync";
import {
  CHAT_DAILY_LIMIT_LOW,
  monthName,
  resetDateText,
  type BudgetMode,
  type BudgetScope,
  type NoticeKind,
  type ScopeStatus,
  type SpendBreakdown,
} from "@/lib/llm/budget-policy";
import type { Decision } from "@/lib/proposals/decide";
import type { ReviewSummary } from "@/lib/proposals/past-emails";
import type { DeferResult } from "@/lib/proposals/review";
import { CLOSED_STATUSES, OPEN_STATUSES, STATUS_DESCRIPTION } from "@/lib/proposals/rules";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { COMMANDS } from "./commands";

// Everything the bot says, except proposal cards (proposals/card.ts). Warm and plain, short
// lines, and an emoji only where it means something: ✅ done, ⚠️ a problem, ⏸ AI paused.

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const LINK_MINUTES = 10;

// ---------- Getting started ----------

export function welcomeText(opts: { firstName: string; isNew: boolean; gmailAddress: string | null; demo: boolean }): string {
  const { firstName, gmailAddress } = opts;
  if (gmailAddress) {
    return [
      `Welcome back, ${firstName} 👋`,
      "",
      `I'm reading ${gmailAddress} and check it every 5 minutes. /sync checks right now.`,
      "",
      "/status – your applications at a glance",
      "/pending – cards waiting for you",
      "/dashboard – everything in your browser",
      "/help – how it works",
    ].join("\n");
  }
  if (opts.demo) {
    return [
      `Welcome back, ${firstName} 👋 You're trying me out with sample emails.`,
      "",
      "/demo_email – a new sample email arrives",
      "/pending – cards waiting for you",
      "/dashboard – everything in your browser",
      "/demo_reset – remove the samples",
      "",
      "Ready for the real thing? /connect your Gmail.",
    ].join("\n");
  }
  return [
    opts.isNew ? `Hi ${firstName} 👋 I'm ${APP_NAME}.` : `Welcome back, ${firstName} 👋`,
    "",
    "I read the job emails in your Gmail and keep your applications up to date, so you don't have to.",
    "",
    "Three steps:",
    "1. /connect your Gmail. Read-only: I can never send, delete or change anything.",
    "2. /sync to read your job emails from the last 60 days.",
    "3. Review what I found. Each card quotes the email it's based on, and nothing changes until you tap Approve.",
    "",
    "Just looking around? /demo shows me at work on sample emails, no Gmail needed.",
    "",
    "You're in control: /disconnect stops me reading your email, and /delete_my_data erases everything.",
  ].join("\n");
}

export function helpText(): string {
  return [
    "How it works",
    "",
    "When a job email arrives, I send you a card: what changed, the sentence in the email that shows it, and how sure I am. Nothing changes until you tap Approve. A card expires after 7 days.",
    "",
    "Right after you connect, I read your past emails, then show what I found one card at a time. ⏭ Later moves a card to the end; /pending picks up where you stopped.",
    "",
    "I check your inbox every 5 minutes. /sync checks right now.",
    "",
    'You can also ask me anything about your applications, like "which companies haven\'t replied?"',
    "",
    "In the demo, /demo_email makes a new sample email arrive and /demo_reset removes the samples.",
    "",
    "Commands",
    ...COMMANDS.map((c) => `/${c.command} – ${c.description}`),
  ].join("\n");
}

// ---------- Links: a button, like "Open email" on the cards ----------

export type LinkReply = [text: string, options: { link_preview_options: LinkPreviewOptions; reply_markup?: InlineKeyboardMarkup }];

/**
 * A message whose point is one link. Telegram only takes https links in buttons, so a local
 * http://localhost link goes in the text instead. Previews stay off either way: Telegram's
 * preview crawler would open the link, and a sign-in link works only once.
 */
function linkReply(lines: (cta: string) => string[], button: string, link: string): LinkReply {
  const preview = { is_disabled: true };
  if (!link.startsWith("https://")) return [[...lines("Open the link below"), "", link].join("\n"), { link_preview_options: preview }];
  return [lines("Tap the button below").join("\n"), { link_preview_options: preview, reply_markup: { inline_keyboard: [[{ text: button, url: link }]] } }];
}

export function connectReply(link: string, gmailAddress: string | null, demo = false): LinkReply {
  return linkReply(
    (cta) => [
      gmailAddress
        ? `You're connected as ${gmailAddress}. To reconnect or switch accounts: ${cta.toLowerCase()} (it works for ${LINK_MINUTES} minutes).`
        : `${cta} to connect your Gmail. It works for ${LINK_MINUTES} minutes.`,
      "",
      "Google will ask to let me read your email. I keep only job-related emails, and I can never send, delete or change anything.",
      ...(demo ? ["", "Connecting ends the demo: I'll remove the sample emails first."] : []),
    ],
    "🔗 Connect Gmail",
    link,
  );
}

export function dashboardLinkReply(link: string): LinkReply {
  return linkReply(
    (cta) => [
      `${cta} to open your dashboard: your applications, the emails behind them and the cards waiting for you.`,
      "",
      `It signs you in once, within ${LINK_MINUTES} minutes. Send /dashboard again for a fresh link. Approving still happens here in Telegram.`,
    ],
    "🔗 Open dashboard",
    link,
  );
}

export function gmailConnectedText(address: string, endedDemo = false): string {
  return [
    `✅ Gmail connected: ${address}`,
    "",
    "I can only read: I can never send, delete or change anything.",
    ...(endedDemo ? ["The demo is over: I removed its sample emails."] : []),
    "",
    "Next, send /sync. I'll read your job emails from the last 60 days, then show you what I found, one card at a time. After that I check your inbox every 5 minutes on my own.",
  ].join("\n");
}

// ---------- /sync ----------

/** The /sync reply: what was fetched, what was read, and whether more is coming. */
export function syncReplyText(sync: SyncSummary, analysis: AnalysisSummary, stillQueued: number): string {
  const parts = [syncText(sync), analysisText(analysis, stillQueued)].filter(Boolean);
  // The cron keeps fetching and reading; /sync only does a batch now.
  if (!analysis.budget && !analysis.skippedNotConfigured && (sync.remaining > 0 || stillQueued > 0)) {
    parts.push("I'll keep going on my own every few minutes; /sync speeds it up.");
  }
  return parts.join("\n\n");
}

export function syncText({ fetched, candidates, remaining }: SyncSummary): string {
  if (fetched === 0 && remaining === 0) return "All caught up: no new emails since my last check.";
  const lines: string[] = [];
  if (fetched) lines.push(`Found ${plural(fetched, "new email")}; ${candidates} ${candidates === 1 ? "looks" : "look"} job-related.`);
  if (remaining > 0) lines.push(`${plural(remaining, "older email")} still to fetch.`);
  return lines.join(" ");
}

export function analysisText(s: AnalysisSummary, stillQueued: number): string {
  if (s.skippedNotConfigured) return "Reading emails isn't set up on this server (no AI key), so nothing was read.";
  if (s.analyzed === 0) return s.budget ? budgetWaitingText(s.budget) : "";
  const outcomes = [
    s.proposals ? `${plural(s.proposals, "card")} sent above` : null,
    s.held ? `${s.held} kept for your review` : null,
    s.noChange ? `${s.noChange} needed no change` : null,
    s.notJobRelated ? `${s.notJobRelated} not job-related` : null,
  ].filter(Boolean);
  const lines = [`Read ${plural(s.analyzed, "email")}${outcomes.length ? `: ${outcomes.join(", ")}` : ""}.`];
  if (s.held) lines.push("When I've read all your past emails, I'll show you what I found, one card at a time.");
  if (s.unverified) {
    lines.push(`${s.unverified} set aside: the sentence I'd quote isn't in the email word for word, so I won't suggest anything from it. I'll try again.`);
  }
  if (s.failed) lines.push(`${s.failed} couldn't be read right now. I'll try again.`);
  // Sending /sync again can't help while the budget is used up.
  if (s.budget) lines.push(budgetWaitingText(s.budget));
  else if (stillQueued) lines.push(`${stillQueued} more to read.`);
  return lines.join("\n");
}

export const SYNC_COOLDOWN_TEXT = "I checked less than a minute ago. Give it a moment and try again.";

export const GMAIL_UNREACHABLE_TEXT = "I couldn't reach Gmail just now. Nothing was lost; try /sync again in a minute.";

// ---------- AI budget (rules in lib/llm/budget-policy.ts) ----------

const money = formatUsd;
const budgetName = (scope: BudgetScope) => (scope === "user" ? "your monthly AI allowance" : "the shared monthly AI budget");
const STILL_WORKS = "/status, /pending, approving cards and the dashboard still work.";

function budgetWaitingText(b: NonNullable<AnalysisSummary["budget"]>): string {
  return `⏸ AI is paused until ${resetDateText(b.resetsOn)} because ${budgetName(b.scope)} is used up: ${plural(b.waiting, "email")} wait unread and will be read then.`;
}

/** The reply to a question while the AI is paused: whose budget, until when, and what still works. */
export function budgetPausedText(scope: BudgetScope, resetsOn: Date): string {
  return `${capital(budgetName(scope))} is used up, so I can't answer questions or read new emails until ${resetDateText(resetsOn)}. New emails wait and are read then. ${STILL_WORKS}`;
}

export function chatLimitText(mode: BudgetMode): string {
  const why = mode.level === "low" && mode.limitedBy ? ` while ${budgetName(mode.limitedBy)} is past 80% (until ${resetDateText(mode.resetsOn)})` : "";
  return `You've asked ${mode.chatDailyLimit} questions in the last 24 hours, which is the daily limit${why}. Try again later; /status still works.`;
}

/** Where this month's AI spend went, and where it's heading (for /status). */
export type SpendForText = { breakdown: SpendBreakdown; forecastUsd: number | null };

/** For /status: this month's spend, and what's limited or paused and until when. */
export function budgetStatusLines(mode: BudgetMode, spend?: SpendForText): string[] {
  const lines: string[] = [];
  const month = monthName(mode.resetsOn);
  if (mode.user) {
    lines.push(`AI this month: ${money(mode.user.spentUsd)} of your ${money(mode.user.capUsd)}.`);
    const parts = spend
      ? ([
          ["reading emails", spend.breakdown.emails],
          ["questions", spend.breakdown.chat],
          ["briefs for other agents", spend.breakdown.briefs],
        ] as const).filter(([, usd]) => usd > 0)
      : [];
    if (parts.length) lines.push(`That's ${parts.map(([label, usd]) => `${money(usd)} on ${label}`).join(", ")}.`);
    if (spend && spend.forecastUsd !== null) {
      lines.push(
        spend.forecastUsd > mode.user.capUsd
          ? `At this pace, you'd use it all before the end of ${month}.`
          : `At this pace, about ${money(spend.forecastUsd)} by the end of ${month}.`,
      );
    }
  }
  if (mode.service.level !== "ok") lines.push(`Shared AI budget: ${money(mode.service.spentUsd)} of ${money(mode.service.capUsd)}.`);
  const until = resetDateText(mode.resetsOn);
  if (mode.level === "low" && mode.limitedBy) {
    lines.push(
      `${capital(budgetName(mode.limitedBy))} is past 80%, so until ${until}: up to ${mode.chatDailyLimit} questions a day${mode.lighterEmailModel ? ", and emails are read with a lighter model" : ""}.`,
    );
  }
  if (mode.level === "out" && mode.limitedBy) {
    lines.push(`⏸ Paused until ${until} because ${budgetName(mode.limitedBy)} is used up: questions and reading new emails. ${STILL_WORKS}`);
  }
  return lines;
}

/** A once-a-month notice when a budget crosses 50% (admin only), 80% or is used up. */
export function budgetNoticeText(kind: NoticeKind, status: ScopeStatus, resetsOn: Date, lighterEmailModel: boolean): string {
  const month = monthName(resetsOn);
  const until = resetDateText(resetsOn);
  const amount = `${money(status.spentUsd)} of ${money(status.capUsd)}`;
  const limits = `up to ${CHAT_DAILY_LIMIT_LOW} questions a day${lighterEmailModel ? ", and emails are read with a lighter model" : ""}`;
  const paused = `I won't answer questions or read new emails until ${until}: they wait and are read then. ${STILL_WORKS}`;
  if (kind.audience === "admin") {
    if (kind.pct === 50) return `Admin: the shared AI budget is at 50% for ${month} (${amount}). Nothing changes yet.`;
    if (kind.pct === 80) return `Admin: the shared AI budget is past 80% for ${month} (${amount}). Until ${until} everyone gets ${limits}.`;
    return `Admin: the shared AI budget for ${month} is used up (${amount}). AI is paused for everyone until ${until}.`;
  }
  if (kind.scope === "user") {
    return kind.pct === 80
      ? `Heads up: you've used 80% of your AI allowance for ${month} (${amount}). To make it last, until ${until}: ${limits}. Everything else works as usual.`
      : `⏸ Your AI allowance for ${month} is used up (${amount}). ${paused}`;
  }
  return kind.pct === 80
    ? `Heads up: the shared AI budget for all users is past 80% for ${month}. To make it last, until ${until}: ${limits}. Everything else works as usual.`
    : `⏸ The shared AI budget for all users is used up for ${month}. ${paused}`;
}

// ---------- Cards and the review of past emails ----------

export const DECISION_TOAST: Record<Decision["kind"], string> = {
  executed: "✅ Done. Your tracker is updated.",
  rejected: "Rejected. Nothing changed.",
  stale: "Not applied: the application changed since this card.",
  failed: "Couldn't apply it. Nothing changed; you can retry.",
  already: "Already decided.",
  expired: "This card expired. Nothing changed.",
  "not-yours": "Only the owner of this application can decide this.",
  "not-found": "This card no longer exists.",
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
    `I've finished reading your past emails. ${plural(s.total, "update")} from ${plural(s.companies, "company", "companies")} ${s.total === 1 ? "is" : "are"} waiting for your review:`,
    ...SUMMARY_ORDER.filter((k) => s.byStatus[k]).map((k) => `• ${plural(s.byStatus[k]!, STATUS_NOUN[k])}`),
    "",
    "I'll show them one at a time, grouped by company. Nothing changes until you approve each one. ⏭ Later moves a card to the end, and /pending picks up where you stopped.",
  ].join("\n");
}

export const REVIEW_DONE_TEXT = "✅ That's everything from your past emails. From now on, I'll send a card as soon as a new job email arrives.";

export const STILL_READING_TEXT = "I'm still reading your past emails. When I'm done, I'll show you what I found, one card at a time.";

/** /pending and the review button while the past emails are still being read. */
export function stillReadingText(mode?: BudgetMode): string {
  if (!mode || mode.aiOn || !mode.limitedBy) return STILL_READING_TEXT;
  return `I'm still reading your past emails, but AI is paused until ${resetDateText(mode.resetsOn)} because ${budgetName(mode.limitedBy)} is used up. Your review starts once they're read.`;
}

export const NOTHING_TO_REVIEW_TOAST = "Nothing left to review.";

export const NOTHING_WAITING_TEXT = "You're all caught up: nothing is waiting for your decision.";

export const LATER_TOAST: Record<DeferResult, string> = {
  deferred: "Moved to the end of your review.",
  last: "This is the last one left to review.",
  "not-open": "This card isn't waiting for a decision anymore.",
  "not-yours": "Only the owner of this application can decide this.",
  "not-found": "This card no longer exists.",
};

// ---------- The demo (/demo, lib/demo) ----------

export const DEMO_EMAIL_DATA = "demo:email";

const demoEmailButton = (text: string): InlineKeyboardMarkup => ({ inline_keyboard: [[{ text, callback_data: DEMO_EMAIL_DATA }]] });

export function demoIntroText(firstName: string, inbox: { fetched: number; candidates: number }): string {
  return [
    `Hi ${firstName} 👋 Let's try me out on a sample inbox: ${inbox.fetched} fictional emails from the last five weeks, as if they were in your Gmail.`,
    "",
    `${inbox.candidates} of them look job-related, and I'm reading those now with the same AI I use on real email. This takes about half a minute…`,
  ].join("\n");
}

/** After the demo's first read, when the review summary couldn't be sent yet. */
export function demoReadText(s: AnalysisSummary, stillQueued: number): string {
  if (s.budget || s.skippedNotConfigured || !stillQueued) return analysisText(s, stillQueued) || "I've read the sample emails. /demo_email makes a new one arrive.";
  return `I've read ${plural(s.analyzed, "sample email")} so far. I'll read the other ${stillQueued} on my own within a few minutes and then show you what I found; /sync speeds it up.`;
}

/** The reply after a simulated new email, with the button for the next one. */
export function demoEmailReply(sent: { number: number; total: number }, s: AnalysisSummary): [text: string, options: { reply_markup?: InlineKeyboardMarkup }] {
  const which = `sample email ${sent.number} of ${sent.total}`;
  const last = sent.number >= sent.total;
  const text = s.budget
    ? analysisText(s, 1)
    : s.proposals
      ? `📨 That card came from ${which}, the moment it arrived, just as with real email. Approve or reject it above.`
      : s.failed || s.unverified
        ? `I couldn't read ${which} just now. I'll try again on my own in a few minutes.`
        : `I read ${which}: it didn't need a change, so there's no card.`;
  if (last) return [`${text}\n\nThat was the last sample. /demo_reset removes them all, and /connect brings in your real Gmail.`, {}];
  return [text, { reply_markup: demoEmailButton("📨 Another sample email") }];
}

/** The review's last message, for an account in the demo: the next step is a live email. */
export function reviewDoneReply(demo: boolean): [text: string, options: { reply_markup?: InlineKeyboardMarkup }] {
  if (!demo) return [REVIEW_DONE_TEXT, {}];
  return [
    "✅ That's everything from your sample inbox. From now on, a card arrives as soon as a new job email does. In the demo, you decide when that happens:",
    { reply_markup: demoEmailButton("📨 Simulate a new email") },
  ];
}

export function demoResetText(r: { emails: number; applications: number }): string {
  return `✅ Demo removed: ${plural(r.emails, "sample email")} and ${plural(r.applications, "application")}, with their cards. /demo starts over, and /connect brings in your real Gmail.`;
}

export const DEMO_GMAIL_CONNECTED_TEXT =
  "Your Gmail is connected, so I won't load the demo: sample emails would mix with your real ones. Everything the demo shows happens with your real email too.";

export const DEMO_ALREADY_TEXT = "You're already in the demo. /demo_email makes a new sample email arrive, /pending shows cards waiting for you, and /demo_reset removes the samples.";

export const DEMO_ONLY_TEXT = "That's for the demo, which isn't running. /demo starts it.";

export const DEMO_NO_MORE_TEXT = "That was the last sample email. /demo_reset removes them all, and /connect brings in your real Gmail.";

export const DEMO_SYNC_TEXT = "There's no real inbox in the demo, so nothing new to fetch. /demo_email makes a new sample email arrive.";

// ---------- /status ----------

export type StatsForText = {
  total: number;
  by_status: Partial<Record<ApplicationStatus, number>>;
  open: number;
  proposals_waiting_for_decision: number;
  coverage: { gmail: string | null; emails_since: string | null; last_gmail_check: string | null };
};

/** e.g. "15 Aug", from the stats' "2026-08-15". */
const dayText = (isoDay: string) => new Date(`${isoDay}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

/** /status: straight from the database, no AI, so it works even when the AI budget is used up. */
export function statusText(s: StatsForText, opts: { budget?: BudgetMode; spend?: SpendForText; demo?: boolean } = {}): string {
  if (!s.coverage.gmail && !opts.demo && s.total === 0) return NOT_CONNECTED_TEXT;
  // Open and closed are the two groups; each status belongs to exactly one.
  const group = (title: string, statuses: ApplicationStatus[]) => {
    const lines = statuses.filter((k) => s.by_status[k]).map((k) => `• ${capital(STATUS_DESCRIPTION[k])}: ${s.by_status[k]}`);
    return lines.length ? ["", title, ...lines] : [];
  };
  const waiting = s.proposals_waiting_for_decision;
  const { gmail, emails_since, last_gmail_check } = s.coverage;
  const source = opts.demo
    ? "These come from sample emails. /demo_email sends another; /demo_reset removes them."
    : gmail
      ? `Reading ${gmail}${emails_since ? `, emails since ${dayText(emails_since)}` : ""}.${last_gmail_check ? ` Last checked ${formatDateTime(new Date(last_gmail_check))}.` : ""}`
      : "Gmail is disconnected, so I'm not reading new emails; /connect resumes. You can still ask me about these applications.";
  return [
    `You're tracking ${plural(s.total, "application")}: ${s.open} open, ${s.total - s.open} closed.`,
    ...group("Open", OPEN_STATUSES),
    ...group("Closed", CLOSED_STATUSES),
    "",
    waiting ? `${plural(waiting, "card")} waiting for your decision: /pending` : "Nothing is waiting for your decision.",
    "",
    source,
    ...(opts.budget ? ["", ...budgetStatusLines(opts.budget, opts.spend)] : []),
    "",
    'Ask me anything, like "which companies haven\'t replied?"',
  ].join("\n");
}

// ---------- Your data: /disconnect and /delete_my_data ----------

const REVOKE_NOTE: Record<RevokeResult | "not-connected", string> = {
  revoked: "Google access is revoked.",
  "already-invalid": "Google access was already revoked.",
  failed: `I couldn't confirm the revoke with Google. To be sure, remove "${APP_NAME}" at https://myaccount.google.com/permissions`,
  "not-connected": "",
};

export function disconnectConfirmText(gmailAddress: string): string {
  return [
    `Disconnect ${gmailAddress}?`,
    "",
    "• I'll revoke my read access at Google and delete the stored token, so I stop reading your email.",
    "• Your tracker stays: your applications, their history, /status and questions keep working.",
    "• You can /connect again any time.",
    "",
    "Want to erase everything instead? Use /delete_my_data.",
  ].join("\n");
}

export function disconnectDoneText(revoke: RevokeResult): string {
  return `✅ Gmail disconnected. ${REVOKE_NOTE[revoke]}\n\nYour tracker is still here. /connect starts reading again.`;
}

export function deleteConfirmText(s: AccountSummary): string {
  return [
    "Delete everything I store about you?",
    "",
    `This permanently deletes ${plural(s.applications, "application")}, ${plural(s.emails, "stored email")} with their evidence, ${plural(s.proposals, "card")}, ${plural(s.questions, "chat question")} and your registration, and revokes Gmail access.`,
    "",
    "• Cost records stay, without your name; they hold no content.",
    "• Messages already in this chat stay. Clear the chat in Telegram to remove them.",
    "• This can't be undone.",
  ].join("\n");
}

export function deleteDoneText(revoke: RevokeResult | "not-connected"): string {
  return ["✅ Done. Everything I stored about you is deleted.", REVOKE_NOTE[revoke], "", "Send /start if you ever want to begin again."]
    .filter((line, i) => line || i !== 1)
    .join("\n");
}

export const CANCELLED_TEXT = "Cancelled. Nothing changed.";
export const CONFIRM_NOT_OWNER_TEXT = "Only the account owner can confirm this.";
export const CONFIRM_EXPIRED_TEXT = "This confirmation expired. Nothing changed; send the command again.";
export const ALREADY_DELETED_TEXT = "Already deleted.";
export const ALREADY_DISCONNECTED_TEXT = "Gmail was already disconnected.";

export const NOT_CONNECTED_FOR_DISCONNECT_TEXT = "Gmail isn't connected, so there's nothing to disconnect. To erase your data, use /delete_my_data.";

export const NOTHING_STORED_TEXT = "I don't store anything about you.";

// ---------- Anything else ----------

export const NOT_REGISTERED_TEXT = "Send /start first so I can set you up.";

export const NOT_CONNECTED_TEXT = "Connect your Gmail first with /connect, or try /demo to see me work on sample emails.";

export const UNKNOWN_COMMAND_TEXT = "I don't know that command. /help lists what I can do.";

export const TEXT_ONLY_TEXT = "I can only read text. Ask me about your applications, or send /help.";
