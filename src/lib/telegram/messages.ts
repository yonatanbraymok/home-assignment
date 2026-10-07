import { COMMANDS } from "./commands";

export function welcomeText(firstName: string, isNew: boolean) {
  return [
    isNew ? `Hi ${firstName}, you're registered.` : `Welcome back, ${firstName}.`,
    "",
    "I keep your internship applications up to date from your inbox:",
    "• I read job emails from your Gmail (read-only: I can never send, delete or change mail)",
    "• I spot confirmations, online assessments, interviews, rejections and offers",
    "• For each one I explain why, quoting the exact sentence from the email",
    "• I propose the change here with Approve / Reject buttons. Nothing changes until you tap Approve.",
    "",
    "Connecting Gmail isn't available yet. Send /help for details.",
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

export const NOT_REGISTERED_TEXT = "Send /start first so I can register you.";

export const FREE_TEXT_NOT_READY =
  "I can't answer questions yet. Send /help to see what I can do.";
