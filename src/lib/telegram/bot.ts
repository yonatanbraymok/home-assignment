import { Bot } from "grammy";
import { db } from "@/lib/db";
import { FREE_TEXT_NOT_READY, NOT_REGISTERED_TEXT, helpText, welcomeText } from "./messages";

let bot: Bot | undefined;

// Lazy so that importing this module (e.g. during `next build`) doesn't require the token.
export function getBot(): Bot {
  if (bot) return bot;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  bot = new Bot(token);
  registerHandlers(bot);
  return bot;
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
    const existing = await db.user.findUnique({ where: { telegramUserId }, select: { id: true } });
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: profile });
    } else {
      await db.user.create({ data: { telegramUserId, ...profile } });
    }
    await ctx.reply(welcomeText(from.first_name, !existing));
  });

  pm.command("help", (ctx) => ctx.reply(helpText()));

  pm.on("message", async (ctx) => {
    const registered = await db.user.findUnique({
      where: { telegramUserId: BigInt(ctx.from.id) },
      select: { id: true },
    });
    await ctx.reply(registered ? FREE_TEXT_NOT_READY : NOT_REGISTERED_TEXT);
  });
}
