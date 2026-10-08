import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnalysisSummary } from "@/lib/agent/analyze";
import { budgetMode, scopeStatus, questionReserveUsd } from "@/lib/llm/budget-policy";
import { NOT_CONNECTED_TEXT, gmailConnectedText, analysisText, budgetNoticeText, budgetPausedText, budgetStatusLines, chatLimitText, connectReply, dashboardLinkReply, deleteConfirmText, deleteDoneText, reviewReadyText, statusText, stillReadingText, syncReplyText, welcomeText, type StatsForText } from "./messages";

const stats = (gmail: string | null, total: number): StatsForText => ({
  total,
  by_status: total ? { APPLIED: 1, REJECTED: total - 1 } : {},
  open: total ? 1 : 0,
  proposals_waiting_for_decision: 0,
  coverage: { gmail, emails_since: "2026-08-15", last_gmail_check: null },
});

test("/status after /disconnect still shows the tracker and how to resume", () => {
  const text = statusText(stats(null, 3));
  assert.match(text, /^You're tracking 3 applications: 1 open, 2 closed\./);
  assert.match(text, /Gmail is disconnected/);
  assert.match(text, /\/connect/);
});

test("/status before any Gmail connection asks to connect", () => {
  assert.equal(statusText(stats(null, 0)), NOT_CONNECTED_TEXT);
  assert.match(NOT_CONNECTED_TEXT, /\/connect.*\/demo/);
});

test("delete confirmation lists what will be erased; the done text handles every revoke outcome", () => {
  const text = deleteConfirmText({ applications: 1, emails: 20, proposals: 3, questions: 0 });
  assert.match(text, /1 application, 20 stored emails with their evidence, 3 cards, 0 chat questions/);
  assert.match(text, /can't be undone/);
  assert.doesNotMatch(deleteDoneText("not-connected"), /\n\n\n/);
  assert.match(deleteDoneText("failed"), /myaccount\.google\.com\/permissions/);
});

test("the review summary lists counts per kind of update, most important first", () => {
  const text = reviewReadyText({ total: 12, companies: 9, byStatus: { APPLIED: 8, REJECTED: 3, INTERVIEW: 1 } });
  assert.match(text, /12 updates from 9 companies are waiting for your review/);
  assert.match(text, /• 1 interview invitation\n• 3 rejections\n• 8 application confirmations/);
  assert.match(text, /Nothing changes until you approve each one/);
  assert.match(reviewReadyText({ total: 1, companies: 1, byStatus: { OFFER: 1 } }), /1 update from 1 company is waiting for your review:/);
});

test("/sync says held proposals wait for the review instead of claiming cards were sent", () => {
  const base: AnalysisSummary = { analyzed: 10, proposals: 0, held: 4, noChange: 3, notJobRelated: 3, unverified: 0, failed: 0 };
  const text = analysisText(base, 20);
  assert.match(text, /^Read 10 emails: 4 kept for your review, 3 needed no change, 3 not job-related\./);
  assert.doesNotMatch(text, /sent above/);
  assert.match(text, /one card at a time/);
  assert.match(analysisText({ ...base, proposals: 1, held: 0 }, 0), /^Read 10 emails: 1 card sent above, 3 needed/);
  // Zero counts are left out rather than listed.
  assert.equal(analysisText({ ...base, held: 0, noChange: 0, notJobRelated: 0, failed: 10 }, 0), "Read 10 emails.\n10 couldn't be read right now. I'll try again.");
});

test("dashboard and connect links come as a button, like Open email; a local http link stays in the text", () => {
  const [text, options] = dashboardLinkReply("https://tracker.example.com/api/auth/login?t=abc.def");
  assert.deepEqual(options.reply_markup?.inline_keyboard, [[{ text: "🔗 Open dashboard", url: "https://tracker.example.com/api/auth/login?t=abc.def" }]]);
  assert.match(text, /^Tap the button below to open your dashboard/);
  assert.doesNotMatch(text, /https:/);
  assert.match(text, /once, within 10 minutes/);
  assert.match(text, /Approving still happens here in Telegram/);
  // A preview would open the single-use link before the user does.
  assert.equal(options.link_preview_options.is_disabled, true);

  // Telegram refuses buttons to http://localhost, so local development gets the link in the text.
  const [localText, localOptions] = dashboardLinkReply("http://localhost:3000/api/auth/login?t=abc.def");
  assert.equal(localOptions.reply_markup, undefined);
  assert.match(localText, /^Open the link below to open your dashboard/);
  assert.match(localText, /\n\nhttp:\/\/localhost:3000\/api\/auth\/login\?t=abc\.def$/);

  const [connect, connectOptions] = connectReply("https://tracker.example.com/api/gmail/connect?t=x", null);
  assert.equal(connectOptions.reply_markup?.inline_keyboard[0][0].text, "🔗 Connect Gmail");
  assert.match(connect, /^Tap the button below to connect your Gmail\. It works for 10 minutes\./);
  assert.match(connectReply("https://x.example/c", "dana@gmail.com")[0], /^You're connected as dana@gmail\.com\. To reconnect or switch accounts: tap the button below/);
});

test("the welcome has three steps for newcomers and a short menu for returning users", () => {
  const fresh = welcomeText({ firstName: "Dana", isNew: true, gmailAddress: null, demo: false });
  assert.match(fresh, /^Hi Dana 👋/);
  assert.match(fresh, /1\. \/connect[^\n]*\n2\. From then on, I read each new job email[^\n]*\/sync[^\n]*\n3\. Review/);
  assert.match(fresh, /\/demo/);
  const back = welcomeText({ firstName: "Dana", isNew: false, gmailAddress: "dana@gmail.com", demo: false });
  assert.match(back, /^Welcome back, Dana 👋\n\nI'm reading dana@gmail\.com/);
  assert.doesNotMatch(back, /Three steps/);
  assert.match(welcomeText({ firstName: "Dana", isNew: false, gmailAddress: null, demo: true }), /\/demo_email/);
});

test("/sync says when more is coming on its own, and not while the budget is paused", () => {
  const sync = { fetched: 40, candidates: 12, skipped: 28, remaining: 0 };
  const read: AnalysisSummary = { analyzed: 10, proposals: 2, held: 0, noChange: 6, notJobRelated: 2, unverified: 0, failed: 0 };
  const text = syncReplyText(sync, read, 2);
  assert.match(text, /^Found 40 new emails; 12 look job-related\.\n\nRead 10 emails: 2 cards sent above/);
  assert.match(text, /2 more to read\.\n\nI'll keep going on my own every few minutes; \/sync speeds it up\.$/);
  assert.equal(syncReplyText({ fetched: 0, candidates: 0, skipped: 0, remaining: 0 }, { ...read, analyzed: 0, proposals: 0, noChange: 0, notJobRelated: 0 }, 0), "All caught up: no new emails since my last check.");
  const paused = syncReplyText(sync, { ...read, analyzed: 0, budget: { scope: "service", resetsOn: new Date("2026-11-01T00:00:00Z"), waiting: 12 } }, 12);
  assert.doesNotMatch(paused, /keep going/);
});

const budget = (userSpent: number, serviceSpent = 1) =>
  budgetMode({
    userSpentUsd: userSpent,
    userCapUsd: 5,
    serviceSpentUsd: serviceSpent,
    serviceCapUsd: 25,
    now: new Date("2026-10-15T10:00:00Z"),
    defaultModel: "gemini-3.5-flash-lite",
    fallback: { classify: "gemini-3.1-flash-lite", chat: null },
  });

test("/sync while the budget is used up says until when, and doesn't suggest /sync again", () => {
  const paused: AnalysisSummary = { analyzed: 0, proposals: 0, held: 0, noChange: 0, notJobRelated: 0, unverified: 0, failed: 0, budget: { scope: "user", resetsOn: new Date("2026-11-01T00:00:00Z"), waiting: 12 } };
  const text = analysisText(paused, 12);
  assert.match(text, /paused until 1 Nov because your monthly AI allowance is used up: 12 emails wait unread/);
  assert.doesNotMatch(text, /Send \/sync again/);
  assert.match(analysisText({ ...paused, budget: undefined, analyzed: 10 }, 5), /5 more to read\.$/);
});

test("/status shows this month's spend, and what's limited or paused and until when", () => {
  assert.deepEqual(budgetStatusLines(budget(0.42)), ["AI this month: $0.42 of your $5.00."]);
  // Where it went and where it's heading; a spend under a cent doesn't read as $0.00.
  const spend = { breakdown: { emails: 0.3, chat: 0.12, briefs: 0, other: 0 }, forecastUsd: 0.9 };
  assert.deepEqual(budgetStatusLines(budget(0.42), spend), [
    "AI this month: $0.42 of your $5.00.",
    "That's $0.30 on reading emails, $0.12 on questions.",
    "At this pace, about $0.90 by the end of October.",
  ]);
  assert.deepEqual(budgetStatusLines(budget(0.004), { breakdown: { emails: 0.004, chat: 0, briefs: 0, other: 0 }, forecastUsd: null }), [
    "AI this month: $0.0040 of your $5.00.",
    "That's $0.0040 on reading emails.",
  ]);
  assert.match(budgetStatusLines(budget(3), { ...spend, forecastUsd: 6.2 }).join("\n"), /you'd use it all before the end of October/);
  const low = budgetStatusLines(budget(4.2)).join("\n");
  assert.match(low, /Your monthly AI allowance is past 80%, so until 1 Nov: up to 20 questions a day, and emails are read with a lighter model/);
  const sharedOut = budgetStatusLines(budget(0.42, 24.99)).join("\n");
  assert.match(sharedOut, /Shared AI budget: \$24\.99 of \$25\.00/);
  assert.match(sharedOut, /Paused until 1 Nov because the shared monthly AI budget is used up/);
  assert.match(sharedOut, /approving cards and the dashboard still work/);
});

test("chat replies name whose budget, until when, and what still works", () => {
  assert.match(budgetPausedText("user", new Date("2026-11-01T00:00:00Z")), /^Your monthly AI allowance is used up, so I can't answer questions or read new emails until 1 Nov\./);
  assert.match(budgetPausedText("service", new Date("2026-11-01T00:00:00Z")), /^The shared monthly AI budget is used up/);
  assert.match(chatLimitText(budget(4.2)), /asked 20 questions .* while your monthly AI allowance is past 80% \(until 1 Nov\)/);
  assert.match(chatLimitText(budget(1)), /asked 40 questions in the last 24 hours, which is the daily limit\. Try again later; \/status still works/);
  assert.match(stillReadingText(budget(5)), /AI is paused until 1 Nov because your monthly AI allowance is used up/);
});

test("threshold notices: amounts, month, what changes, and an admin version", () => {
  const reserve = questionReserveUsd("gemini-3.5-flash-lite");
  const resetsOn = new Date("2026-11-01T00:00:00Z");
  assert.match(
    budgetNoticeText({ scope: "user", pct: 80, audience: "user" }, scopeStatus("user", 4.1, 5, reserve), resetsOn, true),
    /^Heads up: you've used 80% of your AI allowance for October \(\$4\.10 of \$5\.00\)\. To make it last, until 1 Nov: up to 20 questions a day, and emails are read with a lighter model/,
  );
  assert.match(budgetNoticeText({ scope: "service", pct: 50, audience: "admin" }, scopeStatus("service", 12.6, 25, reserve), resetsOn, true), /^Admin: the shared AI budget is at 50% for October \(\$12\.60 of \$25\.00\)/);
  assert.match(budgetNoticeText({ scope: "service", pct: 100, audience: "user" }, scopeStatus("service", 24.99, 25, reserve), resetsOn, true), /^⏸ The shared AI budget for all users is used up for October\. I won't answer questions or read new emails until 1 Nov/);
});

test("after connecting, the bot says tracking starts now and past emails aren't read", () => {
  const text = gmailConnectedText("dana@gmail.com");
  assert.match(text, /Tracking starts now: I don't read emails from before this moment/);
  assert.match(text, /\/sync checks right away/);
});
