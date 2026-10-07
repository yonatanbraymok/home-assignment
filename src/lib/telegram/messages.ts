import type { SyncSummary } from "@/lib/gmail/sync";
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

export const NOT_REGISTERED_TEXT = "Send /start first so I can register you.";

export const NOT_CONNECTED_TEXT = "Connect your Gmail first with /connect.";

export const FREE_TEXT_NOT_READY =
  "I can't answer questions yet. Send /help to see what I can do.";
