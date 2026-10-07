import { Bot, GrammyError } from "grammy";
import { analyzePendingEmails } from "@/lib/agent/analyze";
import { signToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { appUrl, requireEnv } from "@/lib/env";
import { GmailAccessRevoked, syncMailbox } from "@/lib/gmail/sync";
import { quietly, refreshCard, renderCardById, sendCard } from "@/lib/proposals/cards-io";
import { approveProposal, rejectProposal } from "@/lib/proposals/decide";
import {
  DECISION_TOAST,
  FREE_TEXT_NOT_READY,
  NOT_CONNECTED_TEXT,
  NOT_REGISTERED_TEXT,
  analysisText,
  connectText,
  helpText,
  syncText,
  welcomeText,
} from "./messages";

const CONNECT_LINK_TTL_SECONDS = 600;
const SYNC_COOLDOWN_MS = 60_000;
const ANALYZE_PER_SYNC = 10;
const MAX_PENDING_RESENT = 10;

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
  // Buttons on proposal cards: a(pprove), r(eject), x (retry), c(hoose) which application.
  // Ownership is checked in decide.ts.
  bot.callbackQuery(/^p:([arxc]):([a-z0-9]+)(?::(\d+|n))?$/, async (ctx) => {
    const [, action, proposalId, choiceRaw] = ctx.match;
    const telegramUserId = BigInt(ctx.from.id);
    const choice = action === "c" && choiceRaw ? (choiceRaw === "n" ? "new" : Number(choiceRaw)) : undefined;
    const decision =
      action === "r" ? await rejectProposal(proposalId, telegramUserId) : await approveProposal(proposalId, telegramUserId, choice);
    await ctx.answerCallbackQuery({ text: DECISION_TOAST[decision.kind], show_alert: decision.kind === "not-yours" });
    if (decision.kind === "not-yours" || decision.kind === "not-found") return;

    // Redraw the message that was tapped (it may be a /pending re-send), then the original card.
    const view = await renderCardById(proposalId);
    if (!view) return;
    await ctx
      .editMessageText(view.text, { parse_mode: "HTML", reply_markup: view.keyboard, link_preview_options: { is_disabled: true } })
      .catch((err) => {
        if (!(err instanceof GrammyError && err.description.includes("message is not modified"))) throw err;
      });
    if (view.messageId && view.messageId !== ctx.callbackQuery.message?.message_id) {
      await quietly("refresh original card", refreshCard(proposalId));
    }
  });

  // Everything else only works in private chats; updates from groups and channels are ignored.
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
    let fetched: string;
    try {
      fetched = syncText(await syncMailbox(user));
    } catch (err) {
      if (err instanceof GmailAccessRevoked) return ctx.reply(err.message);
      console.error("/sync failed:", err instanceof Error ? err.message : err);
      return ctx.reply("I couldn't reach Gmail just now. Nothing was lost; try /sync again in a minute.");
    }
    await ctx.replyWithChatAction("typing");
    const analysis = await analyzePendingEmails(user.id, ANALYZE_PER_SYNC);
    const stillQueued = await db.emailMessage.count({ where: { userId: user.id, state: "NEW" } });
    await ctx.reply([fetched, analysisText(analysis, stillQueued)].filter(Boolean).join("\n\n"));
  });

  pm.command("pending", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    const pending = await db.statusProposal.findMany({
      where: { userId: user.id, state: { in: ["PENDING", "FAILED"] } },
      orderBy: { createdAt: "asc" },
      take: MAX_PENDING_RESENT,
      select: { id: true },
    });
    if (!pending.length) return ctx.reply("Nothing is waiting for your decision.");
    for (const p of pending) await sendCard(p.id);
  });

  pm.on("message", async (ctx) => {
    const registered = await findUser(ctx.from.id);
    await ctx.reply(registered ? FREE_TEXT_NOT_READY : NOT_REGISTERED_TEXT);
  });
}
