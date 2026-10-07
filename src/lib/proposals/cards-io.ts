import { GrammyError } from "grammy";
import { db } from "@/lib/db";
import { telegramApi } from "@/lib/telegram/notify";
import { renderCard, type CardData } from "./card";
import type { Candidate } from "./create";

// Sending and re-rendering proposal cards. The database is the source of truth; a card is only
// a view of it, so every edit re-reads the proposal and renders its current state.

async function loadCard(proposalId: string) {
  const p = await db.statusProposal.findUnique({
    where: { id: proposalId },
    include: {
      email: { select: { fromAddress: true, fromName: true, subject: true, receivedAt: true, gmailMessageId: true } },
      user: { select: { gmailAddress: true, telegramChatId: true } },
      application: { select: { status: true, roleTitle: true, jobRef: true } },
    },
  });
  if (!p) return null;
  const card: CardData = { ...p, candidates: (p.candidates as Candidate[] | null) ?? null, gmailAddress: p.user.gmailAddress };
  return { card, userChatId: p.user.telegramChatId, chatId: p.telegramChatId, messageId: p.telegramMessageId };
}

/** The current view of a proposal's card, e.g. to redraw the exact message a user tapped. */
export async function renderCardById(proposalId: string) {
  const loaded = await loadCard(proposalId);
  return loaded ? { ...renderCard(loaded.card), messageId: loaded.messageId } : null;
}

/** Sends a new card for a proposal and remembers the message so it can be edited later. */
export async function sendCard(proposalId: string): Promise<void> {
  const loaded = await loadCard(proposalId);
  if (!loaded) return;
  const { text, keyboard } = renderCard(loaded.card);
  const msg = await telegramApi().sendMessage(Number(loaded.userChatId), text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true },
  });
  await db.statusProposal.update({
    where: { id: proposalId },
    data: { telegramChatId: loaded.userChatId, telegramMessageId: msg.message_id },
  });
}

/** Re-renders an existing card from the proposal's current state (buttons disappear once decided). */
export async function refreshCard(proposalId: string): Promise<void> {
  const loaded = await loadCard(proposalId);
  if (!loaded?.chatId || !loaded.messageId) return;
  const { text, keyboard } = renderCard(loaded.card);
  try {
    await telegramApi().editMessageText(Number(loaded.chatId), loaded.messageId, text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    // Re-rendering an unchanged card is a no-op, not an error.
    if (err instanceof GrammyError && err.description.includes("message is not modified")) return;
    throw err;
  }
}

/** Best-effort wrapper for card I/O after the database is already correct. */
export async function quietly(what: string, task: Promise<void>): Promise<void> {
  try {
    await task;
  } catch (err) {
    console.error(`${what} failed:`, err instanceof Error ? err.message : err);
  }
}
