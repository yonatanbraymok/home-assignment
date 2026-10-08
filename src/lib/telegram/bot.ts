import { Bot, GrammyError, InlineKeyboard, type Context } from "grammy";
import { CANCEL_DATA, confirmationData, type AccountAction } from "@/lib/account/confirm";
import { accountSummary, authorizeConfirmation, deleteAccount, disconnectGmail } from "@/lib/account/manage";
import { loginLink } from "@/lib/auth/tokens";
import { analyzePendingEmails } from "@/lib/agent/analyze";
import { answerQuestion } from "@/lib/agent/chat";
import { followUps } from "@/lib/agent/follow-ups";
import { NOT_YET_READ } from "@/lib/agent/queue";
import { signToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { addLiveDemoEmail, resetDemo, startDemo } from "@/lib/demo/demo";
import { appUrl, requireEnv } from "@/lib/env";
import { GmailAccessRevoked, syncMailbox } from "@/lib/gmail/sync";
import { budgetStatus, spendByPurpose } from "@/lib/llm/budget";
import { breakdownOf, forecastUsd } from "@/lib/llm/budget-policy";
import { quietly, refreshCard, renderCardById, sendCard } from "@/lib/proposals/cards-io";
import { approveProposal, rejectProposal } from "@/lib/proposals/decide";
import { START_REVIEW_DATA } from "@/lib/proposals/past-emails";
import { continueReview, deferReviewCard, finishBackfill, showNextReviewCard } from "@/lib/proposals/review";
import { READ_TOOLS } from "@/lib/tools/read";
import { ensureBudgetNotices } from "./budget-notices";
import {
  ALREADY_DELETED_TEXT,
  ALREADY_DISCONNECTED_TEXT,
  CANCELLED_TEXT,
  CONFIRM_EXPIRED_TEXT,
  CONFIRM_NOT_OWNER_TEXT,
  DECISION_TOAST,
  DEMO_ALREADY_TEXT,
  DEMO_EMAIL_DATA,
  DEMO_GMAIL_CONNECTED_TEXT,
  DEMO_NO_MORE_TEXT,
  DEMO_ONLY_TEXT,
  DEMO_SYNC_TEXT,
  GMAIL_UNREACHABLE_TEXT,
  LATER_TOAST,
  NOTHING_STORED_TEXT,
  NOTHING_TO_REVIEW_TOAST,
  NOTHING_WAITING_TEXT,
  NOT_CONNECTED_FOR_DISCONNECT_TEXT,
  NOT_CONNECTED_TEXT,
  NOT_REGISTERED_TEXT,
  STILL_READING_TEXT,
  SYNC_COOLDOWN_TEXT,
  TEXT_ONLY_TEXT,
  UNKNOWN_COMMAND_TEXT,
  analysisText,
  connectReply,
  dashboardLinkReply,
  deleteConfirmText,
  deleteDoneText,
  demoEmailReply,
  demoIntroText,
  demoReadText,
  demoResetText,
  disconnectConfirmText,
  disconnectDoneText,
  helpText,
  statusText,
  stillReadingText,
  syncReplyText,
  welcomeText,
  type StatsForText,
} from "./messages";

const CONNECT_LINK_TTL_SECONDS = 600;
const SYNC_COOLDOWN_MS = 60_000;
const ANALYZE_PER_SYNC = 10;
const MAX_PENDING_RESENT = 10;
// The demo reads its sample inbox inside the update; the webhook allows 55 s.
const DEMO_READ_LIMIT = 20;
const DEMO_READ_MS = 40_000;

let bot: Bot | undefined;

// Lazy so that importing this module (e.g. during `next build`) doesn't require the token.
export function getBot(): Bot {
  if (bot) return bot;
  bot = new Bot(requireEnv("TELEGRAM_BOT_TOKEN"));
  registerHandlers(bot);
  return bot;
}

function confirmKeyboard(action: AccountAction, userId: string) {
  return new InlineKeyboard()
    .text(action === "disconnect" ? "🔌 Disconnect Gmail" : "🗑 Delete everything", confirmationData(action, userId))
    .text("Cancel", CANCEL_DATA);
}

// Telegram accepts an answer to a tap only for about 15 seconds. A tap that waited longer (behind
// a long /sync, or while the bot restarted) has still been handled, so carry on and redraw the card.
function answer(ctx: Context, other?: Parameters<Context["answerCallbackQuery"]>[0]) {
  return ctx.answerCallbackQuery(other).catch((err) => {
    if (!(err instanceof GrammyError && /query is too old|query ID is invalid/.test(err.description))) throw err;
  });
}

// Editing a message to the same text is a no-op for us, not an error.
function ignoreNotModified(err: unknown) {
  if (!(err instanceof GrammyError && err.description.includes("message is not modified"))) throw err;
}

function findUser(telegramId: number) {
  return db.user.findUnique({
    where: { telegramUserId: BigInt(telegramId) },
    select: { id: true, gmailAddress: true, gmailRefreshTokenEnc: true, gmailLastSyncAt: true, demoAt: true },
  });
}

const notYetRead = (userId: string) => db.emailMessage.count({ where: { userId, state: { in: [...NOT_YET_READ] } } });

/** /demo and /start demo: load the sample inbox and read it, then the review summary follows. */
async function runDemo(ctx: Context, userId: string, firstName: string) {
  const started = await startDemo(userId, firstName);
  if (started.kind === "gmail-connected") return ctx.reply(DEMO_GMAIL_CONNECTED_TEXT);
  if (started.kind === "already") return ctx.reply(DEMO_ALREADY_TEXT);
  await ctx.reply(demoIntroText(firstName, started));
  await ctx.replyWithChatAction("typing");
  const analysis = await analyzePendingEmails(userId, DEMO_READ_LIMIT, { deadline: Date.now() + DEMO_READ_MS });
  // Every sample read: the summary with its Start button is the next message.
  if (await finishBackfill(userId)) return;
  await ctx.reply(demoReadText(analysis, await notYetRead(userId)));
}

/** /demo_email and its button: the next scripted email arrives now, and its card pops up. */
async function sendDemoEmail(ctx: Context, userId: string, firstName: string) {
  const added = await addLiveDemoEmail(userId, firstName);
  if (added.kind === "not-demo") return ctx.reply(DEMO_ONLY_TEXT);
  if (added.kind === "none-left") return ctx.reply(DEMO_NO_MORE_TEXT);
  await ctx.replyWithChatAction("typing");
  const analysis = await analyzePendingEmails(userId, DEMO_READ_LIMIT, { deadline: Date.now() + DEMO_READ_MS });
  await ctx.reply(...demoEmailReply(added, analysis));
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
    await answer(ctx, { text: DECISION_TOAST[decision.kind], show_alert: decision.kind === "not-yours" });
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
    // A fresh decision on a review card brings the next one (a double tap mustn't).
    if (decision.kind !== "needs-choice" && decision.kind !== "already") await quietly("next review card", continueReview(proposalId));
  });

  // "Later" on a review card: back to the end of the queue, then the next card.
  bot.callbackQuery(/^p:l:([a-z0-9]+)$/, async (ctx) => {
    const proposalId = ctx.match[1];
    const { result, userId } = await deferReviewCard(proposalId, BigInt(ctx.from.id));
    await answer(ctx, { text: LATER_TOAST[result], show_alert: result === "not-yours" });
    if (result === "not-yours" || result === "not-found") return;
    const view = await renderCardById(proposalId);
    if (view) {
      await ctx
        .editMessageText(view.text, { parse_mode: "HTML", reply_markup: view.keyboard, link_preview_options: { is_disabled: true } })
        .catch(ignoreNotModified);
    }
    if (userId) await quietly("next review card", showNextReviewCard(userId));
  });

  // The button on the "I've finished reading your past emails" summary.
  bot.callbackQuery(START_REVIEW_DATA, async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return answer(ctx, { text: NOT_REGISTERED_TEXT });
    const next = await showNextReviewCard(user.id);
    await answer(ctx, next.kind === "done" ? { text: NOTHING_TO_REVIEW_TOAST } : next.kind === "reading" ? { text: STILL_READING_TEXT } : undefined);
    // One tap is enough; /pending continues the review later.
    await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
    // Already started: bring the current card back to the bottom of the chat.
    if (next.kind === "open") await sendCard(next.proposalId);
  });

  // "Simulate a new email" in the demo. The tapped button goes, so old ones don't pile up.
  bot.callbackQuery(DEMO_EMAIL_DATA, async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return answer(ctx, { text: NOT_REGISTERED_TEXT });
    await answer(ctx, { text: "📨 A new email is on its way…" });
    await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
    await sendDemoEmail(ctx, user.id, ctx.from.first_name);
  });

  // Confirmation buttons for /disconnect and /delete_my_data. Editing the message without a
  // keyboard removes the buttons, so a confirmation can be used once.
  bot.callbackQuery(/^acct:/, async (ctx) => {
    if (ctx.callbackQuery.data === CANCEL_DATA) {
      await answer(ctx, { text: CANCELLED_TEXT });
      return ctx.editMessageText(CANCELLED_TEXT).catch(ignoreNotModified);
    }
    const auth = await authorizeConfirmation(ctx.callbackQuery.data, BigInt(ctx.from.id));
    if (auth === "invalid") return answer(ctx);
    if (auth === "not-owner") return answer(ctx, { text: CONFIRM_NOT_OWNER_TEXT, show_alert: true });
    if (auth === "expired" || auth === "not-found") {
      const text = auth === "expired" ? CONFIRM_EXPIRED_TEXT : ALREADY_DELETED_TEXT;
      await answer(ctx, { text });
      return ctx.editMessageText(text).catch(ignoreNotModified);
    }
    await answer(ctx);
    if (auth.action === "disconnect") {
      const result = await disconnectGmail(auth.userId, `tg:${ctx.from.id}`);
      return ctx.editMessageText(result.status === "disconnected" ? disconnectDoneText(result.revoke) : ALREADY_DISCONNECTED_TEXT).catch(ignoreNotModified);
    }
    const result = await deleteAccount(auth.userId);
    return ctx.editMessageText(result.status === "deleted" ? deleteDoneText(result.revoke) : ALREADY_DELETED_TEXT).catch(ignoreNotModified);
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
    const existing = await db.user.findUnique({ where: { telegramUserId }, select: { id: true, gmailAddress: true, demoAt: true } });
    const { id } = existing
      ? await db.user.update({ where: { id: existing.id }, data: profile, select: { id: true } })
      : await db.user.create({ data: { telegramUserId, ...profile }, select: { id: true } });
    // t.me/<bot>?start=demo (the landing page's "Try it with sample emails") goes straight to the demo.
    if (ctx.match === "demo" && !existing?.gmailAddress && !existing?.demoAt) return runDemo(ctx, id, from.first_name);
    await ctx.reply(welcomeText({ firstName: from.first_name, isNew: !existing, gmailAddress: existing?.gmailAddress ?? null, demo: Boolean(existing?.demoAt) }));
  });

  pm.command("demo", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    await runDemo(ctx, user.id, ctx.from.first_name);
  });

  pm.command("demo_email", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    await sendDemoEmail(ctx, user.id, ctx.from.first_name);
  });

  pm.command("demo_reset", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    if (!user.demoAt) return ctx.reply(DEMO_ONLY_TEXT);
    await ctx.reply(demoResetText(await resetDemo(user.id)));
  });

  pm.command("help", (ctx) => ctx.reply(helpText()));

  pm.command("connect", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    const token = signToken("gmail-connect", user.id, CONNECT_LINK_TTL_SECONDS);
    const link = appUrl(`/api/gmail/connect?t=${token}`);
    await ctx.reply(...connectReply(link, user.gmailAddress, Boolean(user.demoAt)));
  });

  pm.command("sync", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    if (!user.gmailRefreshTokenEnc && user.demoAt) {
      // No inbox to fetch in the demo; sample emails still waiting are read like real ones.
      await ctx.replyWithChatAction("typing");
      const analysis = await analyzePendingEmails(user.id, ANALYZE_PER_SYNC);
      await ctx.reply(analysis.analyzed || analysis.budget ? analysisText(analysis, await notYetRead(user.id)) : DEMO_SYNC_TEXT);
      return quietly("review summary", finishBackfill(user.id));
    }
    if (!user.gmailRefreshTokenEnc) return ctx.reply(NOT_CONNECTED_TEXT);
    if (user.gmailLastSyncAt && Date.now() - user.gmailLastSyncAt.getTime() < SYNC_COOLDOWN_MS) {
      return ctx.reply(SYNC_COOLDOWN_TEXT);
    }
    await ctx.replyWithChatAction("typing");
    let synced: Awaited<ReturnType<typeof syncMailbox>>;
    try {
      synced = await syncMailbox(user);
    } catch (err) {
      if (err instanceof GmailAccessRevoked) return ctx.reply(err.message);
      console.error("/sync failed:", err instanceof Error ? err.message : err);
      return ctx.reply(GMAIL_UNREACHABLE_TEXT);
    }
    await ctx.replyWithChatAction("typing");
    const analysis = await analyzePendingEmails(user.id, ANALYZE_PER_SYNC);
    await ctx.reply(syncReplyText(synced, analysis, await notYetRead(user.id)));
    await quietly("review summary", finishBackfill(user.id));
    await quietly("budget notices", ensureBudgetNotices({ recipients: [user.id] }));
  });

  pm.command("pending", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    // Cards already shown and still open. Cards in the review queue come one at a time below.
    const shown = await db.statusProposal.findMany({
      where: { userId: user.id, OR: [{ state: "FAILED" }, { state: "PENDING", expiresAt: { not: null } }] },
      orderBy: { createdAt: "asc" },
      take: MAX_PENDING_RESENT,
      select: { id: true },
    });
    for (const p of shown) await sendCard(p.id);
    const review = await showNextReviewCard(user.id);
    if (review.kind === "open" && !shown.some((p) => p.id === review.proposalId)) await sendCard(review.proposalId);
    if (review.kind === "reading") return ctx.reply(stillReadingText(await budgetStatus(user.id)));
    if (!shown.length && review.kind === "done") return ctx.reply(NOTHING_WAITING_TEXT);
  });

  pm.command("disconnect", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    if (!user.gmailRefreshTokenEnc || !user.gmailAddress) return ctx.reply(NOT_CONNECTED_FOR_DISCONNECT_TEXT);
    await ctx.reply(disconnectConfirmText(user.gmailAddress), { reply_markup: confirmKeyboard("disconnect", user.id) });
  });

  pm.command("delete_my_data", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOTHING_STORED_TEXT);
    await ctx.reply(deleteConfirmText(await accountSummary(user.id)), { reply_markup: confirmKeyboard("delete", user.id) });
  });

  pm.command("dashboard", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    await ctx.reply(...dashboardLinkReply(loginLink(user.id)));
  });

  pm.command("status", async (ctx) => {
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    const now = new Date();
    const [stats, budget, byPurpose, waitingForReply] = await Promise.all([
      READ_TOOLS.get_stats.run(db, user.id, {}) as Promise<StatsForText>,
      budgetStatus(user.id, now),
      spendByPurpose(user.id, now),
      db.jobApplication.findMany({ where: { userId: user.id, status: "APPLIED" }, select: { company: true, roleTitle: true, jobRef: true, lastEmailAt: true, createdAt: true } }),
    ]);
    const spend = { breakdown: breakdownOf(byPurpose), forecastUsd: forecastUsd(budget.user?.spentUsd ?? 0, now) };
    await ctx.reply(statusText(stats, { budget, spend, demo: Boolean(user.demoAt), followUps: followUps(waitingForReply, now) }));
  });

  // Any other text is a question about the user's applications.
  pm.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return ctx.reply(UNKNOWN_COMMAND_TEXT);
    const user = await findUser(ctx.from.id);
    if (!user) return ctx.reply(NOT_REGISTERED_TEXT);
    // After /disconnect the tracker is still there, so questions about it keep working.
    if (!user.gmailAddress && !user.demoAt && (await db.jobApplication.count({ where: { userId: user.id } })) === 0) return ctx.reply(NOT_CONNECTED_TEXT);
    await ctx.replyWithChatAction("typing");
    const result = await answerQuestion(user.id, ctx.message.text);
    await ctx.reply(result.text, { link_preview_options: { is_disabled: true } });
    // After the answer, so a "you've used 80%" notice never arrives before it.
    await quietly("budget notices", ensureBudgetNotices({ recipients: [user.id] }));
  });

  pm.on("message", (ctx) => ctx.reply(TEXT_ONLY_TEXT));
}
