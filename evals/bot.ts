// Eval: the Telegram bot end to end, through its real handlers, with Telegram replaced by a
// recorder: no message reaches Telegram and the production webhook is untouched. Real database,
// real AI (about $0.01). A newcomer follows the landing page's demo link and goes through
// everything a reviewer would: the demo, the one-at-a-time review with Approve and Later, a
// simulated new email whose card pops up, /status, /dashboard and /connect as buttons, /pending,
// a question, /demo_reset; plus a stranger's tap refused, groups ignored, unknown input answered.
// Run: npm run eval:bot

import assert from "node:assert/strict";
import type { Update } from "grammy/types";

// Buttons need an https link (a local http one goes in the text); set before the app reads it.
process.env.APP_URL = "https://tracker.example";

type Call = { method: string; payload: Record<string, unknown> };
const OWNER = 7_000_000_811, STRANGER = 7_000_000_812;

async function main() {
  const { db } = await import("@/lib/db");
  const { getBot } = await import("@/lib/telegram/bot");
  const { telegramApi } = await import("@/lib/telegram/notify");
  try {
    await run(db, getBot(), telegramApi());
  } finally {
    await db.user.deleteMany({ where: { telegramUserId: { in: [BigInt(OWNER), BigInt(STRANGER)] } } });
    await db.$disconnect();
    console.log("cleaned up");
  }
}

async function run(
  db: (typeof import("@/lib/db"))["db"],
  bot: ReturnType<(typeof import("@/lib/telegram/bot"))["getBot"]>,
  api: ReturnType<(typeof import("@/lib/telegram/notify"))["telegramApi"]>,
) {
  await db.user.deleteMany({ where: { telegramUserId: { in: [BigInt(OWNER), BigInt(STRANGER)] } } });

  // Telegram, faked: every call is recorded and answered locally.
  const calls: Call[] = [];
  let messageId = 1000;
  const fake = async (_prev: unknown, method: string, payload: Record<string, unknown>) => {
    calls.push({ method, payload });
    if (method === "getMe") return { ok: true, result: { id: 1, is_bot: true, first_name: "Eval bot", username: "eval_bot", can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false } };
    if (method === "sendMessage" || method === "editMessageText" || method === "editMessageReplyMarkup") {
      const id = method === "sendMessage" ? ++messageId : Number(payload.message_id);
      return { ok: true, result: { message_id: id, date: 0, chat: { id: payload.chat_id, type: "private" }, text: payload.text ?? "" } };
    }
    return { ok: true, result: true };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bot.api.config.use(fake as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api.config.use(fake as any);
  await bot.init();

  let updateId = 0;
  const person = (id: number) => ({ id, is_bot: false, first_name: id === OWNER ? "Dana" : "Eve" });
  const say = async (text: string, from = OWNER, chatType: "private" | "group" = "private") => {
    const command = text.match(/^\/\w+/)?.[0];
    const chat = chatType === "private" ? { id: from, type: "private" as const, first_name: "Dana" } : { id: -100, type: "group" as const, title: "A group" };
    await bot.handleUpdate({
      update_id: ++updateId,
      message: { message_id: ++messageId, date: Math.floor(Date.now() / 1000), chat, from: person(from), text, ...(command ? { entities: [{ type: "bot_command", offset: 0, length: command.length }] } : {}) },
    } as Update);
  };
  const tap = async (data: string, onMessage: number, from = OWNER) => {
    await bot.handleUpdate({
      update_id: ++updateId,
      callback_query: { id: String(++updateId), from: person(from), chat_instance: "eval", data, message: { message_id: onMessage, date: 0, chat: { id: from, type: "private", first_name: "Dana" }, text: "…" } },
    } as Update);
  };
  const take = () => calls.splice(0);
  type Sent = { text: string; reply_markup?: { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] } };
  const sent = (cs: Call[]) => cs.filter((c) => c.method === "sendMessage").map((c) => c.payload as unknown as Sent);
  const buttons = (m?: Sent) => m?.reply_markup?.inline_keyboard.flat() ?? [];
  const toast = (cs: Call[]) => cs.find((c) => c.method === "answerCallbackQuery")?.payload as { text?: string; show_alert?: boolean } | undefined;
  // The message id a card was sent with, from the recorder's numbering.
  const lastSentId = () => messageId;

  // 1. The landing page's demo link: /start demo registers, loads the samples, reads them, and the
  // review summary arrives with its Start button.
  await say("/start demo");
  let out = sent(take());
  assert.match(out[0].text, /^Hi Dana 👋 Let's try me out on a sample inbox: 11 fictional emails/);
  const summary = out.at(-1)!;
  assert.match(summary.text, /^I've finished reading your past emails\. 6 updates from 5 companies are waiting for your review:/, out.map((m) => m.text).join("\n---\n"));
  assert.deepEqual(buttons(summary).map((b) => b.callback_data), ["rv:start"]);
  console.log("✔ /start demo: registered, 11 sample emails read, the review summary with its Start button");

  // 2. Start review: one card, with Approve, Reject and Later, and no Gmail link (a sample email).
  await tap("rv:start", lastSentId());
  let cs = take();
  assert.ok(cs.some((c) => c.method === "editMessageReplyMarkup"), "the Start button goes after one tap");
  let card = sent(cs)[0];
  assert.match(card.text, /^🆕 <b>New application: Aurora Pay \(Rejected\)<\/b>/, card.text);
  assert.match(card.text, /<blockquote>[\s\S]+<\/blockquote>\n<i>Quoted from Aurora Pay \(aurorapay\.example\)/);
  assert.match(card.text, /🗂 <b>Past emails:<\/b> 5 more after this one\./);
  assert.deepEqual(buttons(card).map((b) => b.text), ["✅ Approve", "❌ Reject", "⏭ Later"]);

  // A stranger's tap on it changes nothing.
  const firstCard = buttons(card)[0].callback_data!;
  await tap(firstCard, lastSentId(), STRANGER);
  const refused = toast(take());
  assert.equal(refused?.text, "Only the owner of this application can decide this.");
  assert.equal(refused?.show_alert, true);

  // Later: to the end of the queue, and the next card comes.
  await tap(buttons(card)[2].callback_data!, lastSentId());
  cs = take();
  assert.equal(toast(cs)?.text, "Moved to the end of your review.");
  card = sent(cs)[0];
  assert.match(card.text, /^🆕 <b>New application: Cobalt Cloud \(Applied\)<\/b>/);
  console.log("✔ review cards one at a time, without a Gmail link; Later moves one to the end; a stranger's tap is refused");

  // 3. Approve every card; the last message offers a simulated new email.
  let approved = 0;
  for (; approved < 8; approved++) {
    await tap(buttons(card)[0].callback_data!, lastSentId());
    cs = take();
    assert.equal(toast(cs)?.text, "✅ Done. Your tracker is updated.");
    const edit = cs.find((c) => c.method === "editMessageText")?.payload as { text: string } | undefined;
    assert.match(edit?.text ?? "", /✅ <b>Approved\.<\/b>/);
    const next = sent(cs).at(-1);
    if (!next || !next.text.startsWith("🆕") && !next.text.startsWith("📩")) {
      card = next!;
      break;
    }
    card = next;
  }
  assert.equal(approved + 1, 6, "six review cards");
  assert.match(card.text, /^✅ That's everything from your sample inbox\./);
  assert.deepEqual(buttons(card).map((b) => b.callback_data), ["demo:email"]);
  console.log("✔ six cards approved one by one; the review ends by offering a simulated new email");

  // 4. The simulated email: its card pops up live (no Later), then the button for the next one.
  await tap("demo:email", lastSentId());
  cs = take();
  assert.equal(toast(cs)?.text, "📨 A new email is on its way…");
  out = sent(cs);
  assert.match(out[0].text, /^📩 <b>Northwind Robotics: Applied → Interview<\/b>/, out.map((m) => m.text).join("\n---\n"));
  assert.deepEqual(buttons(out[0]).map((b) => b.text), ["✅ Approve", "❌ Reject"]);
  assert.match(out[1].text, /^📨 That card came from sample email 1 of 5/);
  assert.deepEqual(buttons(out[1]).map((b) => b.text), ["📨 Another sample email"]);
  console.log("✔ a simulated email's card pops up live, followed by a button for the next one");

  // 5. Commands while a card is waiting.
  await say("/status");
  const status = sent(take())[0].text;
  assert.match(status, /^You're tracking 6 applications: 5 open, 1 closed\./);
  assert.match(status, /1 card waiting for your decision: \/pending/);
  assert.match(status, /These come from sample emails/);
  assert.match(status, /AI this month: \$\d/);

  await say("/dashboard");
  const dash = sent(take())[0];
  assert.deepEqual(buttons(dash).map((b) => b.text), ["🔗 Open dashboard"]);
  assert.match(buttons(dash)[0].url!, /^https:\/\/tracker\.example\/api\/auth\/login\?t=/);
  assert.doesNotMatch(dash.text, /https:/, "the single-use link is only in the button");

  await say("/connect");
  const connect = sent(take())[0];
  assert.deepEqual(buttons(connect).map((b) => b.text), ["🔗 Connect Gmail"]);
  assert.match(connect.text, /Connecting ends the demo/);

  await say("/pending");
  assert.match(sent(take())[0].text, /^📩 <b>Northwind Robotics: Applied → Interview<\/b>/);

  await say("/sync");
  assert.match(sent(take())[0].text, /^There's no real inbox in the demo/);
  console.log("✔ /status, /dashboard and /connect (buttons), /pending and /sync in the demo");

  // 6. A question, answered from the tracker.
  await say("Which companies have invited me to an interview?");
  const answer = sent(take()).at(-1)!.text;
  assert.match(answer, /Vega Games|Northwind/, answer);
  console.log("✔ a question is answered from the tracker");

  // 7. Odd input: unknown commands, non-text, groups.
  await say("/frobnicate");
  assert.equal(sent(take())[0].text, "I don't know that command. /help lists what I can do.");
  await bot.handleUpdate({
    update_id: ++updateId,
    message: { message_id: ++messageId, date: 0, chat: { id: OWNER, type: "private", first_name: "Dana" }, from: person(OWNER), sticker: { file_id: "x", file_unique_id: "x", type: "regular", width: 1, height: 1, is_animated: false, is_video: false } },
  } as Update);
  assert.equal(sent(take())[0].text, "I can only read text. Ask me about your applications, or send /help.");
  await say("/status", OWNER, "group");
  assert.equal(take().length, 0, "groups are ignored");
  console.log("✔ unknown commands and non-text get a hint; groups are ignored");

  // 8. /demo_reset leaves nothing behind; the waiting card's buttons then do nothing harmful.
  await say("/demo_reset");
  assert.match(sent(take())[0].text, /^✅ Demo removed: 12 sample emails and 6 applications, with their cards\./);
  const user = await db.user.findUniqueOrThrow({ where: { telegramUserId: BigInt(OWNER) } });
  assert.equal(await db.jobApplication.count({ where: { userId: user.id } }), 0);
  await tap(buttons(out[0])[0].callback_data!, lastSentId());
  assert.equal(toast(take())?.text, "This card no longer exists.");
  console.log("✔ /demo_reset removes the samples; an old card's button then says it no longer exists");
}

main()
  .then(() => console.log("\n8/8 passed"))
  .catch((err) => {
    console.error("SCENARIO FAILED:", err);
    process.exitCode = 1;
  });
