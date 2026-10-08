import { InlineKeyboard } from "grammy";
import { db } from "@/lib/db";
import { NOT_YET_READ } from "@/lib/agent/queue";
import { reviewDoneReply, reviewReadyText } from "@/lib/telegram/messages";
import { telegramApi } from "@/lib/telegram/notify";
import { quietly, sendCard } from "./cards-io";
import { START_REVIEW_DATA, summarize, type ReviewSummary } from "./past-emails";
import { PROPOSAL_TTL_MS, reviewQueueWhere } from "./rules";

// Delivery of the past-email review (see past-emails.ts): the summary, one card at a time, "Later".

// Grouped by company so related cards come together; cards moved with "Later" go last.
const QUEUE_ORDER = [
  { deferredAt: { sort: "asc" as const, nulls: "first" as const } },
  { company: "asc" as const },
  { email: { receivedAt: "asc" as const } },
  { createdAt: "asc" as const },
];

/**
 * Once every past email of the current connection has been read, sends the review summary
 * (once per connection). Returns the summary it sent, or null.
 */
export async function finishBackfill(userId: string): Promise<ReviewSummary | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { gmailConnectedAt: true, gmailLastSyncAt: true, backfillDoneAt: true, telegramChatId: true },
  });
  if (!user?.gmailConnectedAt || user.backfillDoneAt) return null;
  // gmailLastSyncAt moves only when everything listed was fetched, so this means "all fetched".
  if (!user.gmailLastSyncAt || user.gmailLastSyncAt < user.gmailConnectedAt) return null;
  const unread = await db.emailMessage.count({
    // NOT_YET_READ includes legacy DEFERRED_BUDGET: counting those as read sent the review early.
    where: { userId, state: { in: [...NOT_YET_READ] }, receivedAt: { lt: user.gmailConnectedAt } },
  });
  if (unread > 0) return null;

  // Claim, so a cron run and a /sync finishing together send one summary.
  const { count } = await db.user.updateMany({ where: { id: userId, backfillDoneAt: null }, data: { backfillDoneAt: new Date() } });
  if (count === 0) return null;
  const held = await db.statusProposal.findMany({ where: reviewQueueWhere(userId), select: { company: true, toStatus: true } });
  if (!held.length) return null;
  const summary = summarize(held);
  // If Telegram fails here, /pending still starts the review.
  await quietly(
    "send review summary",
    telegramApi().sendMessage(Number(user.telegramChatId), reviewReadyText(summary), {
      reply_markup: new InlineKeyboard().text("▶️ Start review", START_REVIEW_DATA),
    }),
  );
  return summary;
}

export type NextCard = { kind: "shown" | "open"; proposalId: string } | { kind: "done" } | { kind: "reading" };

/** Shows the next review card, unless one is already waiting for a decision: one at a time. */
export async function showNextReviewCard(userId: string): Promise<NextCard> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { gmailConnectedAt: true, backfillDoneAt: true } });
  if (!user) return { kind: "done" };
  // Waiting until every past email is read lets a chain (confirmation, then rejection) become one card.
  if (user.gmailConnectedAt && !user.backfillDoneAt) return { kind: "reading" };

  const now = new Date();
  const open = await db.statusProposal.findFirst({
    where: { userId, heldForReview: true, state: "PENDING", expiresAt: { gt: now } },
    select: { id: true },
  });
  if (open) return { kind: "open", proposalId: open.id };
  const next = await db.statusProposal.findFirst({ where: reviewQueueWhere(userId), orderBy: QUEUE_ORDER, select: { id: true } });
  if (!next) return { kind: "done" };

  // Its 7 days start now. Setting the expiry is also the claim: two taps at once show it once.
  const { count } = await db.statusProposal.updateMany({
    where: { id: next.id, state: "PENDING", expiresAt: null },
    data: { expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS) },
  });
  if (count === 0) return { kind: "open", proposalId: next.id };
  await quietly("send review card", sendCard(next.id)); // if Telegram fails, /pending re-sends it
  return { kind: "shown", proposalId: next.id };
}

/** After a fresh decision on a review card: show the next one, or say the review is done. */
export async function continueReview(proposalId: string): Promise<NextCard | null> {
  const p = await db.statusProposal.findUnique({
    where: { id: proposalId },
    select: { userId: true, heldForReview: true, user: { select: { telegramChatId: true, demoAt: true } } },
  });
  if (!p?.heldForReview) return null;
  const next = await showNextReviewCard(p.userId);
  if (next.kind === "done") {
    // In the demo, the last message offers the next step: a new email arriving.
    const [text, options] = reviewDoneReply(Boolean(p.user.demoAt));
    await quietly("send review done", telegramApi().sendMessage(Number(p.user.telegramChatId), text, { ...options, link_preview_options: { is_disabled: true } }));
  }
  return next;
}

export type DeferResult = "deferred" | "last" | "not-open" | "not-yours" | "not-found";

/** "Later": puts the open review card back at the end of the queue, where it doesn't expire. */
export async function deferReviewCard(proposalId: string, telegramUserId: bigint): Promise<{ result: DeferResult; userId?: string }> {
  const p = await db.statusProposal.findUnique({
    where: { id: proposalId },
    select: { userId: true, state: true, heldForReview: true, expiresAt: true, user: { select: { telegramUserId: true } } },
  });
  if (!p) return { result: "not-found" };
  if (p.user.telegramUserId !== telegramUserId) return { result: "not-yours" };
  if (!p.heldForReview || p.state !== "PENDING" || !p.expiresAt || p.expiresAt <= new Date()) return { result: "not-open" };
  if ((await db.statusProposal.count({ where: reviewQueueWhere(p.userId) })) === 0) return { result: "last" };
  const { count } = await db.statusProposal.updateMany({
    where: { id: proposalId, state: "PENDING", expiresAt: { gt: new Date() } },
    data: { expiresAt: null, deferredAt: new Date() },
  });
  return count ? { result: "deferred", userId: p.userId } : { result: "not-open" };
}
