// Eval: the monthly AI budget, per person and shared, without spending anything. The API key is
// replaced by a fake one, so a call that slipped past the budget would fail this eval instead of
// costing money. Spend is seeded in May 2001, so real spend can't mix in, and Telegram messages go
// to a recorder. Throwaway users, deleted at the end. Run: npm run eval:budget

import assert from "node:assert/strict";
import { GrammyError } from "grammy";
import { db } from "@/lib/db";
import { analyzePendingEmails } from "@/lib/agent/analyze";
import { answerQuestion } from "@/lib/agent/chat";
import { BudgetExceeded, assertAffordable, budgetStatus, spendUsd } from "@/lib/llm/budget";
import { budgetMode } from "@/lib/llm/budget-policy";
import { finishBackfill } from "@/lib/proposals/review";
import { ensureBudgetNotices } from "@/lib/telegram/budget-notices";

const A_TG = BigInt(7_000_000_601), B_TG = BigInt(7_000_000_602);
const MAY = new Date("2001-05-15T12:00:00Z");
const DAY = 86_400_000;

process.env.GEMINI_API_KEY = "eval-budget-no-model-calls";
process.env.LLM_USER_MONTHLY_BUDGET_USD = "5";
process.env.LLM_MONTHLY_BUDGET_USD = "25";
process.env.ADMIN_TELEGRAM_USER_ID = String(B_TG); // B is both the admin and a user

const sent: { chatId: bigint; text: string }[] = [];
let failNext: { chatId: bigint; code: number } | null = null;
async function recorder(chatId: bigint, text: string) {
  if (failNext?.chatId === chatId) {
    const code = failNext.code;
    failNext = null;
    throw new GrammyError("eval", { ok: false, error_code: code, description: "eval" }, "sendMessage", {});
  }
  sent.push({ chatId, text });
}
const notices = (ids: string[]) => ensureBudgetNotices({ now: MAY, send: recorder, recipients: ids });
const take = () => sent.splice(0).map((m) => `${m.chatId === A_TG ? "A" : "B"}: ${m.text.split(" ").slice(0, 7).join(" ")}`);

async function main() {
  await cleanup();
  const a = await db.user.create({ data: { telegramUserId: A_TG, telegramChatId: A_TG, displayName: "Budget A", gmailConnectedAt: new Date(Date.now() - 3600_000), gmailLastSyncAt: new Date() } });
  const b = await db.user.create({ data: { telegramUserId: B_TG, telegramChatId: B_TG, displayName: "Budget B" } });
  const spend = (userId: string | null, usd: number, at = MAY) =>
    db.llmUsage.create({ data: { userId, purpose: "CHAT", model: "gemini-3.5-flash-lite", inputTokens: 0, outputTokens: 0, costUsd: usd, createdAt: at } });

  // 1. The month window: April's spend doesn't count in May; each person's spend is their own.
  await spend(a.id, 1, new Date("2001-04-30T23:59:59.999Z"));
  await spend(a.id, 2, new Date("2001-05-01T00:00:00Z"));
  await spend(b.id, 3);
  assert.equal(await spendUsd(a.id, MAY), 2);
  assert.equal(await spendUsd(null, MAY), 5);
  console.log("✔ spend is counted per person and in total, within the UTC month only");

  // 2. Levels from the database, and the 80% notice (sent once, even by two runs at the same time).
  assert.deepEqual(pick(await budgetStatus(a.id, MAY)), ["ok", null, 40, "gemini-3.5-flash-lite"]);
  await spend(a.id, 2.1); // A: $4.10 of $5
  assert.deepEqual(pick(await budgetStatus(a.id, MAY)), ["low", "user", 20, "gemini-3.1-flash-lite"]);
  await Promise.all([notices([a.id, b.id]), notices([a.id, b.id])]);
  assert.deepEqual(take(), ["A: Heads up: you've used 80% of your"]);
  await spend(a.id, 0.88); // A: $4.98, not enough left for a whole question
  const aOut = await budgetStatus(a.id, MAY);
  assert.deepEqual(pick(aOut), ["out", "user", 40, "gemini-3.5-flash-lite"]);
  assert.equal(aOut.aiOn, false);
  await notices([a.id, b.id]);
  assert.deepEqual(take(), ["A: ⏸ Your AI allowance for May is"]);
  await notices([a.id, b.id]);
  assert.deepEqual(take(), []);
  console.log("✔ ok → low (lighter email model, 20 questions) → out; each notice sent once");

  // 3. The hard check before every call: A has $0.02 left, so a call that might cost $0.03 is refused
  // (a $0.01 one would still run: "out" stops new work earlier, this is the last line of defence).
  await assert.rejects(assertAffordable({ userId: a.id, worstCaseUsd: 0.03, now: MAY }), (e) => e instanceof BudgetExceeded && e.scope === "user");
  await assertAffordable({ userId: a.id, worstCaseUsd: 0.01, now: MAY });
  await assertAffordable({ userId: b.id, worstCaseUsd: 0.01, now: MAY });
  await assertAffordable({ userId: null, worstCaseUsd: 0.01, now: MAY });
  console.log("✔ a call is refused when the person can't afford it; others are unaffected");

  // 4. At "out", analysis claims nothing and changes nothing; the emails wait.
  const email = (n: number, state: "NEW" | "DEFERRED_BUDGET") =>
    db.emailMessage.create({
      data: { userId: a.id, gmailMessageId: `eval-budget-${n}`, gmailThreadId: "t", fromAddress: "jobs@example.com", subject: "s", receivedAt: new Date(Date.now() - n * DAY), snippet: "", bodyText: "b", state },
    });
  const emails = [await email(3, "NEW"), await email(4, "NEW"), await email(5, "DEFERRED_BUDGET")];
  const summary = await analyzePendingEmails(a.id, 10, { budget: aOut });
  assert.equal(summary.analyzed, 0);
  assert.deepEqual(summary.budget, { scope: "user", resetsOn: new Date("2001-06-01T00:00:00Z"), waiting: 3 });
  const after = await db.emailMessage.findMany({ where: { userId: a.id }, orderBy: { receivedAt: "desc" }, select: { state: true, claimedAt: true } });
  assert.deepEqual(after, [{ state: "NEW", claimedAt: null }, { state: "NEW", claimedAt: null }, { state: "DEFERRED_BUDGET", claimedAt: null }]);
  console.log("✔ at 'out' no email is claimed or changed; 3 wait, with the reset date");

  // 5. The past-email review waits for every unread email, including ones the old budget code deferred.
  assert.equal(await finishBackfill(a.id), null);
  await db.emailMessage.updateMany({ where: { id: { in: [emails[0].id, emails[1].id] } }, data: { state: "CLASSIFIED" } });
  assert.equal(await finishBackfill(a.id), null);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: a.id } })).backfillDoneAt, null, "a deferred past email still holds the review back");
  await db.emailMessage.update({ where: { id: emails[2].id }, data: { state: "CLASSIFIED" } });
  await finishBackfill(a.id);
  assert.notEqual((await db.user.findUniqueOrThrow({ where: { id: a.id } })).backfillDoneAt, null);
  console.log("✔ the review isn't sent while emails deferred by the budget are unread");

  // 6. Chat: refused up front at "out" (whose budget, until when), limited to 20 a day at "low".
  const paused = await answerQuestion(a.id, "How many applications do I have?", { budget: aOut });
  assert.equal(paused.kind, "budget");
  assert.match(paused.text, /^Your monthly AI allowance is used up, .* until 1 Jun/);
  const sharedOut = budgetMode({ userSpentUsd: 0, userCapUsd: 5, serviceSpentUsd: 24.99, serviceCapUsd: 25, now: MAY, defaultModel: "gemini-3.5-flash-lite", fallback: { classify: null, chat: null } });
  assert.match((await answerQuestion(b.id, "Any offers?", { budget: sharedOut })).text, /^The shared monthly AI budget is used up/);
  await db.actionLog.createMany({ data: Array.from({ length: 20 }, () => ({ userId: b.id, actor: "AGENT" as const, action: "CHAT_ANSWERED" as const })) });
  const low = budgetMode({ userSpentUsd: 4.2, userCapUsd: 5, serviceSpentUsd: 5, serviceCapUsd: 25, now: MAY, defaultModel: "gemini-3.5-flash-lite", fallback: { classify: null, chat: null } });
  const limited = await answerQuestion(b.id, "Any offers?", { budget: low });
  assert.equal(limited.kind, "limit");
  assert.match(limited.text, /asked 20 questions/);
  assert.equal(await db.actionLog.count({ where: { userId: { in: [a.id, b.id] }, action: "CHAT_ANSWERED" } }), 20, "no answer was recorded");
  console.log("✔ chat: refused before spending at 'out' (yours or shared), 20 questions a day at 'low'");

  // 7. Shared-budget notices: the admin at 50%; the admin and every user from 80%, admin version for the admin.
  await spend(null, 6); // shared: $13.98 of $25
  await notices([a.id, b.id]);
  assert.deepEqual(take(), ["B: Admin: the shared AI budget is at"]);
  await spend(null, 6.5); // shared: $20.48
  await notices([a.id, b.id]);
  assert.deepEqual(take().sort(), ["A: Heads up: the shared AI budget for", "B: Admin: the shared AI budget is past"]);
  await spend(b.id, 1.99); // B jumps from ok to out on their own allowance: only "used up" is sent
  await notices([a.id, b.id]);
  assert.deepEqual(take(), ["B: ⏸ Your AI allowance for May is"]);
  assert.equal(await db.actionLog.count({ where: { dedupeKey: `budget:user:2001-05:80:${b.id}` } }), 1, "80% recorded, not sent");
  console.log("✔ shared notices: admin at 50%, everyone from 80%; a jump sends only the highest");

  // 8. Telegram failures: a temporary one is retried on the next run, a permanent one isn't.
  await spend(null, 2.5); // shared: $24.97 of $25, too little for a whole question
  await assert.rejects(assertAffordable({ userId: null, worstCaseUsd: 0.05, now: MAY }), (e) => e instanceof BudgetExceeded && e.scope === "service");
  failNext = { chatId: A_TG, code: 502 };
  await notices([a.id, b.id]);
  assert.deepEqual(take(), ["B: Admin: the shared AI budget for May"]);
  await notices([a.id, b.id]);
  assert.deepEqual(take(), ["A: ⏸ The shared AI budget for all"]);
  await db.actionLog.deleteMany({ where: { dedupeKey: { startsWith: "budget:service:2001-05:100:" } } });
  failNext = { chatId: B_TG, code: 403 }; // B blocked the bot
  await notices([a.id, b.id]);
  take();
  await notices([a.id, b.id]);
  assert.deepEqual(take(), [], "a blocked chat isn't retried");
  console.log("✔ notices: a temporary Telegram error is retried, a blocked chat isn't");

  // Nothing reached the model: no spend for these users in the real month.
  const realMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  assert.equal(await db.llmUsage.count({ where: { userId: { in: [a.id, b.id] }, createdAt: { gte: realMonth } } }), 0);
  console.log("\n8/8 passed, $0 spent");
}

const pick = (m: Awaited<ReturnType<typeof budgetStatus>>) => [m.level, m.limitedBy, m.chatDailyLimit, m.models.classify];

async function cleanup() {
  await db.actionLog.deleteMany({ where: { OR: [{ user: { telegramUserId: { in: [A_TG, B_TG] } } }, { dedupeKey: { contains: ":2001-" } }] } });
  await db.llmUsage.deleteMany({ where: { createdAt: { gte: new Date("2001-01-01T00:00:00Z"), lt: new Date("2002-01-01T00:00:00Z") } } });
  await db.user.deleteMany({ where: { telegramUserId: { in: [A_TG, B_TG] } } });
}

main()
  .catch((e) => {
    console.error("EVAL FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
  });
