import { InlineKeyboard } from "grammy";
import type { ApplicationStatus, Confidence, ProposalKind, ProposalState } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/format";
import { emailLink } from "@/lib/gmail/links";
import type { Candidate } from "./create";
import { STATUS_LABEL } from "./rules";

// Proposal cards, in Telegram's HTML parse mode; every dynamic value is escaped. Short on purpose:
// the change, the reason, the verbatim quote and where it came from, then what happens next.

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

/** A "which application is this?" card the owner hasn't answered yet. */
export function needsChoice(card: Pick<CardData, "candidates" | "applicationId">): boolean {
  return Boolean(card.candidates?.length) && !card.applicationId;
}

export function renderCard(card: CardData): { text: string; keyboard: InlineKeyboard } {
  const e = escapeHtml;
  const choosing = needsChoice(card);
  const roleTitle = card.application?.roleTitle ?? card.roleTitle;
  const jobRef = card.application?.jobRef ?? card.jobRef;
  const to = STATUS_LABEL[card.toStatus];
  // The first line is what a notification shows, so it carries the news.
  const headline =
    card.kind === "CREATE_APPLICATION"
      ? `🆕 <b>New application: ${e(card.company)} (${to})</b>`
      : choosing
        ? `❓ <b>Which ${e(card.company)} application?</b>`
        : `📩 <b>${e(card.company)}: ${STATUS_LABEL[card.fromStatus!]} → ${to}</b>`;
  const quote = card.evidenceQuote.length > MAX_QUOTE_CHARS ? `${card.evidenceQuote.slice(0, MAX_QUOTE_CHARS)}…` : card.evidenceQuote;
  const { fromName, fromAddress } = card.email;
  const sender = fromName ? `${fromName} (${fromAddress.split("@")[1] ?? fromAddress})` : fromAddress;
  const savesJobRef = card.state === "PENDING" && !choosing && card.jobRef && card.application && !card.application.jobRef;

  const lines = [
    headline,
    e(roleTitle) + (jobRef ? ` · Job ID ${e(jobRef)}` : ""),
    ...(choosing ? [`The email says: <b>${to}</b>`] : []),
    "",
    e(card.reasoning),
    `<blockquote>${e(quote)}</blockquote>`,
    `<i>Quoted from ${e(sender)} · ${formatDateTime(card.email.receivedAt)} · ${card.confidence.toLowerCase()} confidence</i>`,
    ...card.warnings.map((w) => `⚠️ ${e(w)}`),
    ...(savesJobRef ? [`Approving also saves job ID ${e(card.jobRef!)} to this application.`] : []),
    "",
    statusLine(card, choosing),
  ];

  const keyboard = new InlineKeyboard();
  // Sample emails (the demo) have nothing to open in Gmail.
  const link = emailLink(card.gmailAddress, card.email.gmailMessageId);
  if (link) keyboard.url("🔗 Open email", link).row();
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
          ? `<i>Tap the application this email is about. Nothing changes until you do. Expires ${formatDateTime(card.expiresAt)}.</i>`
          : `<i>Nothing changes until you tap Approve. Expires ${formatDateTime(card.expiresAt)}.</i>`)
      );
    }
    case "EXECUTED":
      return card.kind === "CREATE_APPLICATION"
        ? `✅ <b>Approved.</b> Now tracking ${name} (${STATUS_LABEL[card.toStatus]}).`
        : `✅ <b>Approved.</b> ${name} is now ${STATUS_LABEL[card.toStatus]}.`;
    case "REJECTED":
      return choosing ? "❌ <b>Ignored.</b> Nothing changed." : "❌ <b>Rejected.</b> Nothing changed.";
    case "EXPIRED":
      return "⌛ <b>Expired</b> without a decision. Nothing changed.";
    case "SUPERSEDED":
      return "↪️ <b>Replaced</b> by a newer card for the same application. Nothing changed.";
    case "STALE":
      return card.application && card.kind === "UPDATE_STATUS"
        ? `⚠️ <b>Not applied:</b> the application changed after this card was made (it's now ${STATUS_LABEL[card.application.status]}).`
        : "⚠️ <b>Not applied:</b> this application is already tracked.";
    case "FAILED":
      return `❌ <b>Couldn't apply it.</b> Nothing changed. ${card.failureReason ? `${e(card.failureReason)} ` : ""}Tap Retry to try again.`;
  }
}
