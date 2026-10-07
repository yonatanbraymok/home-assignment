import { Bot } from "grammy";
import { signToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { appUrl, requireEnv } from "@/lib/env";
import { GmailAccessRevoked, syncMailbox } from "@/lib/gmail/sync";
import {
  FREE_TEXT_NOT_READY,
  NOT_CONNECTED_TEXT,
  NOT_REGISTERED_TEXT,
  connectText,
  helpText,
  syncText,
  welcomeText,
} from "./messages";

const CONNECT_LINK_TTL_SECONDS = 600;
const SYNC_COOLDOWN_MS = 60_000;

let bot: Bot | undefined;

// Lazy so that importing this module (e.g. during `next build`) doesn't require the token.
export function getBot(): Bot {
  if (bot) return bot;
  bot = new Bot(requireEnv("TELEGRAM_BOT_TOKEN"));
  registerHandlers(bot);
  return bot;
}

function findUser(telegramId: number) {
  return db.user.findUnique({
    where: { telegramUserId: BigInt(telegramId) },
    select: { id: true, gmailAddress: true, gmailRefreshTokenEnc: true, gmailLastSyncAt: true },
  });
}

function registerHandlers(bot: Bot) {
  // The bot only works in private chats; updates from groups and channels are ignored.
  const pm = bot.chatType("private");

  pm.command("start", async (ctx) => {
    const from = ctx.from;
    const telegramUserId = BigInt(from.id);
    const profile = {
      telegramChatId: BigInt(ctx.chat.id),
      telegramUsername: from.username ?? null,
      displayName: [from.first_name, from.last_name].filter(Boolean).join(" "),
    };
    const existing = await db.user.findUnique({ where: { telegramUserId }, select: { id: true, gmailAddress: true } });
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: profile });
    } else {
      await db.user.create({ data: { telegramUserId, ...profile } });
    }
    await ctx.reply(welcomeText(from.first_name, !existing, existing?.gmailAddress ?? null));
  });

  pm.command("help", (ctx) => ctx.reply(helpText()));

  pm.command("connect", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    const token = signToken("gmail-connect", user.id, CONNECT_LINK_TTL_SECONDS);
    const link = appUrl(`/api/gmail/connect?t=${token}`);
    // Previews off: Telegram's preview crawler would otherwise open the link.
    await ctx.reply(connectText(link, user.gmailAddress), { link_preview_options: { is_disabled: true } });
  });

  pm.command("sync", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    if (!user.gmailRefreshTokenEnc) return ctx.reply(NOT_CONNECTED_TEXT);
    if (user.gmailLastSyncAt && Date.now() - user.gmailLastSyncAt.getTime() < SYNC_COOLDOWN_MS) {
      return ctx.reply("I checked less than a minute ago. Try again shortly.");
    }
    await ctx.replyWithChatAction("typing");
    try {
      await ctx.reply(syncText(await syncMailbox(user)));
    } catch (err) {
      if (err instanceof GmailAccessRevoked) return ctx.reply(err.message);
      console.error("/sync failed:", err instanceof Error ? err.message : err);
      await ctx.reply("I couldn't reach Gmail just now. Nothing was lost; try /sync again in a minute.");
    }
  });

  pm.on("message", async (ctx) => {
    const registered = await findUser(ctx.from.id);
    await ctx.reply(registered ? FREE_TEXT_NOT_READY : NOT_REGISTERED_TEXT);
  });
}
