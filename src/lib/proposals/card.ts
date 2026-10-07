import { InlineKeyboard } from "grammy";
import type { ApplicationStatus, Confidence, ProposalKind, ProposalState } from "@/generated/prisma/enums";
import type { Candidate } from "./create";
import { STATUS_LABEL } from "./rules";

// Proposal cards are rendered with Telegram's HTML parse mode; every dynamic value is escaped.

// The target users are students in Israel; dates on cards are shown in local time.
const DISPLAY_TIME_ZONE = "Asia/Jerusalem";
const MAX_QUOTE_CHARS = 600;
const MAX_BUTTON_CHARS = 60;

export type CardData = {
  id: string;
  kind: ProposalKind;
  state: ProposalState;
  applicationId: string | null;
  company: string;
  roleTitle: string;
  jobRef: string | null;
  candidates: Candidate[] | null;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  reasoning: string;
  evidenceQuote: string;
  confidence: Confidence;
  warnings: string[];
  expiresAt: Date | null; // null while waiting in the review queue (not shown yet)
  heldForReview: boolean;
  reviewRemaining?: number | null; // on the open review card: cards still waiting after it
  failureReason: string | null;
  application?: { status: ApplicationStatus; roleTitle: string; jobRef: string | null } | null; // current state
  email: { fromAddress: string; fromName: string | null; subject: string; receivedAt: Date; gmailMessageId: string };
  gmailAddress: string | null;
};

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-GB", { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function gmailMessageUrl(gmailAddress: string | null, messageId: string): string {
  // ?authuser=<address> opens the right account when several are signed in. (The address inside
  // the path, percent-encoded, made Gmail answer "account temporarily unavailable".)
  return gmailAddress
    ? `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(gmailAddress)}#all/${messageId}`
    : `https://mail.google.com/mail/u/0/#all/${messageId}`;
}

/** A "which application is this?" card the owner hasn't answered yet. */
export function needsChoice(card: Pick<CardData, "candidates" | "applicationId">): boolean {
  return Boolean(card.candidates?.length) && !card.applicationId;
}

export function renderCard(card: CardData): { text: string; keyboard: InlineKeyboard } {
  const e = escapeHtml;
  const choosing = needsChoice(card);
  const roleTitle = card.application?.roleTitle ?? card.roleTitle;
  const jobRef = card.application?.jobRef ?? card.jobRef;
  const title =
    card.kind === "CREATE_APPLICATION" ? "Track a new application" : choosing ? "Which application is this?" : "Proposed update";
  const change =
    card.kind === "CREATE_APPLICATION"
      ? `New application · ${STATUS_LABEL[card.toStatus]}`
      : choosing
        ? `The email says: ${STATUS_LABEL[card.toStatus]}`
        : `${STATUS_LABEL[card.fromStatus!]} → ${STATUS_LABEL[card.toStatus]}`;
  const quote = card.evidenceQuote.length > MAX_QUOTE_CHARS ? `${card.evidenceQuote.slice(0, MAX_QUOTE_CHARS)}…` : card.evidenceQuote;
  const sender = card.email.fromName ? `${card.email.fromName} <${card.email.fromAddress}>` : card.email.fromAddress;
  const savesJobRef = card.state === "PENDING" && !choosing && card.jobRef && card.application && !card.application.jobRef;

  const lines = [
    `📩 <b>${title} · ${e(card.company)}</b>`,
    e(roleTitle) + (jobRef ? ` · Job ID ${e(jobRef)}` : ""),
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
    ...(savesJobRef ? [`Approving also saves job ID ${e(card.jobRef!)} to this application.`] : []),
    "",
    statusLine(card, choosing),
  ];

  const keyboard = new InlineKeyboard().url("🔗 Open email", gmailMessageUrl(card.gmailAddress, card.email.gmailMessageId)).row();
  const queued = card.state === "PENDING" && !card.expiresAt;
  const open = !queued && (card.state === "PENDING" || card.state === "FAILED");
  if (open && choosing) {
    card.candidates!.forEach((c, i) => keyboard.text(truncate(c.label), `p:c:${card.id}:${i}`).row());
    keyboard.text("➕ It's a new application", `p:c:${card.id}:n`).row();
    keyboard.text("❌ Ignore", `p:r:${card.id}`);
  } else if (open && card.state === "PENDING") {
    keyboard.text("✅ Approve", `p:a:${card.id}`).text("❌ Reject", `p:r:${card.id}`);
  } else if (card.state === "FAILED") {
    keyboard.text("🔁 Retry", `p:x:${card.id}`).text("❌ Reject", `p:r:${card.id}`);
  }
  if (open && card.state === "PENDING" && card.heldForReview) keyboard.row().text("⏭ Later", `p:l:${card.id}`);
  return { text: lines.join("\n"), keyboard };
}

function truncate(text: string): string {
  return text.length > MAX_BUTTON_CHARS ? `${text.slice(0, MAX_BUTTON_CHARS - 1)}…` : text;
}

function statusLine(card: CardData, choosing: boolean): string {
  const e = escapeHtml;
  const name = `${e(card.company)} · ${e(card.application?.roleTitle ?? card.roleTitle)}`;
  switch (card.state) {
    case "PENDING": {
      if (!card.expiresAt) return "⏭ <i>Waiting in your review queue. Nothing changes until you decide.</i>";
      const review =
        card.reviewRemaining == null
          ? ""
          : `🗂 <b>Past emails:</b> ${card.reviewRemaining ? `${card.reviewRemaining} more after this one` : "this is the last one"}.\n`;
      return (
        review +
        (choosing
          ? `<i>Tap the application this email is about to mark it ${STATUS_LABEL[card.toStatus]}. Nothing changes until you tap. Expires ${formatDate(card.expiresAt)}.</i>`
          : `<i>Nothing changes until you tap Approve. Expires ${formatDate(card.expiresAt)}.</i>`)
      );
    }
    case "EXECUTED":
      return card.kind === "CREATE_APPLICATION"
        ? `✅ <b>Approved.</b> Now tracking ${name} as ${STATUS_LABEL[card.toStatus]}.`
        : `✅ <b>Approved.</b> ${name} is now ${STATUS_LABEL[card.toStatus]}.`;
    case "REJECTED":
      return choosing ? "❌ <b>Ignored.</b> Nothing was changed." : "❌ <b>Rejected.</b> Nothing was changed.";
    case "EXPIRED":
      return "⌛ <b>Expired</b> without a decision. Nothing was changed.";
    case "SUPERSEDED":
      return "↪️ <b>Replaced</b> by a newer proposal for the same application. Nothing was changed.";
    case "STALE":
      return card.application && card.kind === "UPDATE_STATUS"
        ? `⚠️ <b>Not applied:</b> the application changed since this proposal (it is now ${STATUS_LABEL[card.application.status]}).`
        : "⚠️ <b>Not applied:</b> this application is already being tracked.";
    case "FAILED":
      return `❌ <b>Couldn't apply it. Nothing was changed.</b> ${e(card.failureReason ?? "")} You can try again.`;
  }
}
