import { Api } from "grammy";
import { db } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import type { ActionType, Actor } from "@/generated/prisma/client";
import { isPermanentSendError } from "./send-errors";

// A bare API client (no update handlers), so background jobs can message users without
// importing the bot module.
let api: Api | undefined;
export const telegramApi = () => (api ??= new Api(requireEnv("TELEGRAM_BOT_TOKEN")));

/** Sends a plain-text message to a user's private chat. */
export async function sendToUser(telegramChatId: bigint, text: string): Promise<void> {
  // Private-chat IDs fit in 52 bits, so the Number conversion is exact.
  await telegramApi().sendMessage(Number(telegramChatId), text, { link_preview_options: { is_disabled: true } });
}

/**
 * Records a one-time event in ActionLog and sends the message only if this is the first time
 * `dedupeKey` was seen, e.g. one "Gmail access expired" notice per user per day. A temporary
 * Telegram failure frees the key so the next run retries; a permanent one (bot blocked, chat gone)
 * keeps it, so the same failure isn't retried every few minutes.
 */
export async function notifyOnce(opts: {
  userId: string | null; // null: not a registered user (e.g. the admin)
  telegramChatId: bigint;
  dedupeKey: string;
  action: ActionType;
  actor: Actor;
  text: string;
  send?: (telegramChatId: bigint, text: string) => Promise<void>; // injectable for evals
}): Promise<boolean> {
  const { count } = await db.actionLog.createMany({
    data: [{ userId: opts.userId, actor: opts.actor, action: opts.action, dedupeKey: opts.dedupeKey, payload: { text: opts.text } }],
    skipDuplicates: true,
  });
  if (count === 0) return false;
  try {
    await (opts.send ?? sendToUser)(opts.telegramChatId, opts.text);
  } catch (err) {
    if (!isPermanentSendError(err)) await db.actionLog.deleteMany({ where: { dedupeKey: opts.dedupeKey } });
    throw err;
  }
  return true;
}
