import { InlineKeyboard } from "grammy";
import type { ApplicationStatus, Confidence, ProposalKind, ProposalState } from "@/generated/prisma/enums";
import { STATUS_LABEL } from "./rules";

// Proposal cards are rendered with Telegram's HTML parse mode; every dynamic value is escaped.

// The target users are students in Israel; dates on cards are shown in local time.
const DISPLAY_TIME_ZONE = "Asia/Jerusalem";
const MAX_QUOTE_CHARS = 600;

export type CardData = {
  id: string;
  kind: ProposalKind;
  state: ProposalState;
  company: string;
  roleTitle: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  reasoning: string;
  evidenceQuote: string;
  confidence: Confidence;
  warnings: string[];
  expiresAt: Date;
  failureReason: string | null;
  currentStatus?: ApplicationStatus | null; // for STALE: what the application is now
  email: { fromAddress: string; fromName: string | null; subject: string; receivedAt: Date; gmailThreadId: string };
  gmailAddress: string | null;
};

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-GB", { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function gmailThreadUrl(gmailAddress: string | null, threadId: string): string {
  // Using the address (not /u/0) opens the right account when several are signed in.
  return `https://mail.google.com/mail/u/${encodeURIComponent(gmailAddress ?? "0")}/#all/${threadId}`;
}

export function renderCard(card: CardData): { text: string; keyboard: InlineKeyboard } {
  const e = escapeHtml;
  const change =
    card.kind === "CREATE_APPLICATION"
      ? `New application · ${STATUS_LABEL[card.toStatus]}`
      : `${STATUS_LABEL[card.fromStatus!]} → ${STATUS_LABEL[card.toStatus]}`;
  const quote = card.evidenceQuote.length > MAX_QUOTE_CHARS ? `${card.evidenceQuote.slice(0, MAX_QUOTE_CHARS)}…` : card.evidenceQuote;
  const sender = card.email.fromName ? `${card.email.fromName} <${card.email.fromAddress}>` : card.email.fromAddress;

  const lines = [
    `📩 <b>${card.kind === "CREATE_APPLICATION" ? "Track a new application" : "Proposed update"} · ${e(card.company)}</b>`,
    e(card.roleTitle),
    `<b>${e(change)}</b>`,
    "",
    `<b>Why:</b> ${e(card.reasoning)}`,
    "",
    "<b>Evidence (verbatim from the email):</b>",
    `<blockquote>${e(quote)}</blockquote>`,
    `From: ${e(sender)}`,
    `Subject: ${e(card.email.subject)}`,
    `Received: ${formatDate(card.email.receivedAt)}`,
    `Confidence: <b>${card.confidence}</b>`,
    ...card.warnings.map((w) => `⚠️ ${e(w)}`),
    "",
    statusLine(card),
  ];

  const keyboard = new InlineKeyboard().url("🔗 Open email", gmailThreadUrl(card.gmailAddress, card.email.gmailThreadId)).row();
  if (card.state === "PENDING") keyboard.text("✅ Approve", `p:a:${card.id}`).text("❌ Reject", `p:r:${card.id}`);
  if (card.state === "FAILED") keyboard.text("🔁 Retry", `p:x:${card.id}`).text("❌ Reject", `p:r:${card.id}`);
  return { text: lines.join("\n"), keyboard };
}

function statusLine(card: CardData): string {
  const e = escapeHtml;
  switch (card.state) {
    case "PENDING":
      return `<i>Nothing changes until you tap Approve. Expires ${formatDate(card.expiresAt)}.</i>`;
    case "EXECUTED":
      return card.kind === "CREATE_APPLICATION"
        ? `✅ <b>Approved.</b> Now tracking ${e(card.company)} as ${STATUS_LABEL[card.toStatus]}.`
        : `✅ <b>Approved.</b> ${e(card.company)} is now ${STATUS_LABEL[card.toStatus]}.`;
    case "REJECTED":
      return "❌ <b>Rejected.</b> Nothing was changed.";
    case "EXPIRED":
      return "⌛ <b>Expired</b> without a decision. Nothing was changed.";
    case "SUPERSEDED":
      return "↪️ <b>Replaced</b> by a newer proposal for the same application. Nothing was changed.";
    case "STALE":
      return card.currentStatus
        ? `⚠️ <b>Not applied:</b> the application changed since this proposal (it is now ${STATUS_LABEL[card.currentStatus]}).`
        : "⚠️ <b>Not applied:</b> this application is already being tracked.";
    case "FAILED":
      return `❌ <b>Couldn't apply it. Nothing was changed.</b> ${e(card.failureReason ?? "")} You can retry.`;
  }
}
