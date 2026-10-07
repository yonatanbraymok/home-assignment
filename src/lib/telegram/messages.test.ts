import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnalysisSummary } from "@/lib/agent/analyze";
import { budgetMode, scopeStatus, questionReserveUsd } from "@/lib/llm/budget-policy";
import { analysisText, budgetNoticeText, budgetPausedText, budgetStatusLines, chatLimitText, stillReadingText, dashboardLinkReply, dashboardLinkText, deleteConfirmText, deleteDoneText, reviewReadyText, statusText, type StatsForText } from "./messages";

const stats = (gmail: string | null, total: number): StatsForText => ({
  total,
  by_status: total ? { APPLIED: 1, REJECTED: total - 1 } : {},
  open: total ? 1 : 0,
  proposals_waiting_for_decision: 0,
  coverage: { gmail, emails_since: "2026-08-15", last_gmail_check: null },
});

test("/status after /disconnect still shows the tracker and how to resume", () => {
  const text = statusText(stats(null, 3));
  assert.match(text, /Tracking 3 applications/);
  assert.match(text, /Gmail is disconnected/);
  assert.match(text, /\/connect/);
});

test("/status before any Gmail connection asks to connect", () => {
  assert.equal(statusText(stats(null, 0)), "Gmail isn't connected yet. Send /connect to start.");
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
  assert.match(text, /12 updates are waiting for your review, from 9 companies/);
  assert.match(text, /• 1 interview invitation\n• 3 rejections\n• 8 application confirmations/);
  assert.match(text, /Nothing changes until you approve each one/);
  assert.match(reviewReadyText({ total: 1, companies: 1, byStatus: { OFFER: 1 } }), /1 update is waiting for your review, from 1 company:/);
});

test("/sync says held proposals wait for the review instead of claiming cards were sent", () => {
  const base: AnalysisSummary = { analyzed: 10, proposals: 0, held: 4, noChange: 3, notJobRelated: 3, unverified: 0, failed: 0 };
  const text = analysisText(base, 20);
  assert.match(text, /^Analysed 10: 4 kept for your review, 3 needed no change, 3 not job-related\./);
  assert.doesNotMatch(text, /sent above/);
  assert.match(text, /one card at a time/);
  assert.match(analysisText({ ...base, proposals: 1, held: 0 }, 0), /1 proposal sent above/);
});

test("the dashboard message carries the link and says it works once", () => {
  const text = dashboardLinkText("https://tracker.example.com/api/auth/login?t=abc.def");
  assert.match(text, /\nhttps:\/\/tracker\.example\.com\/api\/auth\/login\?t=abc\.def\n/);
  assert.match(text, /once, within 10 minutes/);
  assert.match(text, /Approving still happens here in Telegram/);
  // A preview would open the single-use link before the user does.
  assert.equal(dashboardLinkReply("https://x.example/l")[1].link_preview_options.is_disabled, true);
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
  assert.match(analysisText({ ...paused, budget: undefined, analyzed: 10 }, 5), /5 more queued\. Send \/sync again/);
});

test("/status shows this month's spend, and what's limited or paused and until when", () => {
  assert.deepEqual(budgetStatusLines(budget(0.42)), ["AI this month: $0.42 of your $5.00."]);
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
  assert.match(chatLimitText(budget(1)), /asked 40 questions in the last 24 hours, which is the daily limit\. \/status/);
  assert.match(stillReadingText(budget(5)), /AI is paused until 1 Nov because your monthly AI allowance is used up/);
});

test("threshold notices: amounts, month, what changes, and an admin version", () => {
  const reserve = questionReserveUsd("gemini-3.5-flash-lite");
  const resetsOn = new Date("2026-11-01T00:00:00Z");
  assert.match(
    budgetNoticeText({ scope: "user", pct: 80, audience: "user" }, scopeStatus("user", 4.1, 5, reserve), resetsOn, true),
    /^You've used 80% of your AI allowance for October \(\$4\.10 of \$5\.00\)\. To make it last, until 1 Nov: up to 20 questions a day, and emails are read with a lighter model/,
  );
  assert.match(budgetNoticeText({ scope: "service", pct: 50, audience: "admin" }, scopeStatus("service", 12.6, 25, reserve), resetsOn, true), /^Admin: the shared AI budget is at 50% for October \(\$12\.60 of \$25\.00\)/);
  assert.match(budgetNoticeText({ scope: "service", pct: 100, audience: "user" }, scopeStatus("service", 24.99, 25, reserve), resetsOn, true), /^The shared AI budget for all users is used up for October\. I won't answer questions or read new emails until 1 Nov/);
});
