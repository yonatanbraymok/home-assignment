import assert from "node:assert/strict";
import { test } from "node:test";
import {
  breakdownOf,
  budgetMode,
  forecastUsd,
  estimateCallWorstCaseUsd,
  levelOf,
  monthName,
  monthWindow,
  planBudgetNotices,
  questionReserveUsd,
  resetDateText,
  scopeStatus,
  type ScopeStatus,
} from "./budget-policy";

const DEFAULT = "gemini-3.5-flash-lite";
const LITE = "gemini-3.1-flash-lite";
const reserve = questionReserveUsd(DEFAULT);

test("the month is the UTC calendar month, and its reset reads the same in any time zone", () => {
  assert.deepEqual(monthWindow(new Date("2026-10-31T23:59:59.999Z")), {
    start: new Date("2026-10-01T00:00:00Z"),
    end: new Date("2026-11-01T00:00:00Z"),
    key: "2026-10",
  });
  assert.equal(monthWindow(new Date("2026-11-01T00:00:00Z")).key, "2026-11");
  assert.deepEqual(monthWindow(new Date("2026-12-15T12:00:00Z")).end, new Date("2027-01-01T00:00:00Z"));
  assert.equal(resetDateText(new Date("2026-11-01T00:00:00Z")), "1 Nov");
  assert.equal(monthName(new Date("2026-11-01T00:00:00Z")), "October");
});

test("one whole question is reserved: about $0.045, more than any single classification", () => {
  assert.ok(reserve > 0.04 && reserve < 0.05, String(reserve));
  assert.ok(reserve > estimateCallWorstCaseUsd(DEFAULT, 9_000, 2_048));
  // Sending tool declarations makes a call cost more, so they count.
  assert.ok(estimateCallWorstCaseUsd(DEFAULT, 9_000, 2_048) < estimateCallWorstCaseUsd(DEFAULT, 15_000, 2_048));
  assert.equal(questionReserveUsd("no-such-model"), Infinity);
});

test("levels: ok below 80%, low from 80%, out once a whole question might not fit", () => {
  assert.equal(levelOf(0, 5, reserve), "ok");
  assert.equal(levelOf(3.99, 5, reserve), "ok");
  assert.equal(levelOf(4, 5, reserve), "low");
  assert.equal(levelOf(5 - reserve, 5, reserve), "low");
  assert.equal(levelOf(5 - reserve + 0.001, 5, reserve), "out");
  assert.equal(levelOf(5, 5, reserve), "out");
  assert.equal(levelOf(Number.NaN, 5, reserve), "out");
  assert.equal(levelOf(0, 0.01, reserve), "out"); // a cap smaller than one question
});

const mode = (userSpent: number | null, serviceSpent: number, fallback: { classify: string | null; chat: string | null } = { classify: LITE, chat: null }) =>
  budgetMode({
    userSpentUsd: userSpent,
    userCapUsd: 5,
    serviceSpentUsd: serviceSpent,
    serviceCapUsd: 25,
    now: new Date("2026-10-15T10:00:00Z"),
    defaultModel: DEFAULT,
    fallback,
  });

test("the worse of the two budgets decides; on a tie the person's own allowance is named", () => {
  const ok = mode(1, 5);
  assert.deepEqual([ok.level, ok.limitedBy, ok.aiOn, ok.chatDailyLimit, ok.models.classify, ok.models.chat], ["ok", null, true, 40, DEFAULT, DEFAULT]);
  assert.equal(ok.resetsOn.toISOString(), "2026-11-01T00:00:00.000Z");

  const userLow = mode(4.2, 5);
  assert.deepEqual([userLow.level, userLow.limitedBy, userLow.chatDailyLimit, userLow.models.classify, userLow.models.chat], ["low", "user", 20, LITE, DEFAULT]);
  assert.equal(userLow.lighterEmailModel, true);

  const serviceLow = mode(1, 21);
  assert.deepEqual([serviceLow.level, serviceLow.limitedBy], ["low", "service"]);
  assert.deepEqual([mode(4.2, 21).limitedBy, mode(5, 5).limitedBy, mode(1, 25).limitedBy], ["user", "user", "service"]);
  assert.deepEqual([mode(5, 21).level, mode(5, 21).aiOn], ["out", false]);

  // No usable lighter model: "low" still limits questions but keeps the model.
  const noFallback = mode(4.2, 5, { classify: null, chat: null });
  assert.deepEqual([noFallback.models.classify, noFallback.lighterEmailModel, noFallback.chatDailyLimit], [DEFAULT, false, 20]);

  // The service as a whole (no user): only the shared budget counts.
  assert.deepEqual([mode(null, 21).user, mode(null, 21).level], [null, "low"]);
});

const status = (scope: "user" | "service", spent: number, cap: number): ScopeStatus => scopeStatus(scope, spent, cap, reserve);
const userA = { userId: "a", telegramUserId: BigInt(1), chatId: BigInt(1) };
const userB = { userId: "b", telegramUserId: BigInt(2), chatId: BigInt(2) };
const plan = (opts: { service: ScopeStatus; a?: ScopeStatus; b?: ScopeStatus; admin?: boolean; adminIsB?: boolean; existing?: string[] }) =>
  planBudgetNotices({
    monthKey: "2026-10",
    service: opts.service,
    users: [{ ...userA, status: opts.a ?? status("user", 0, 5) }, { ...userB, status: opts.b ?? status("user", 0, 5) }],
    admin: opts.admin ? (opts.adminIsB ? { userId: "b", chatId: BigInt(2), telegramUserId: BigInt(2) } : { userId: null, chatId: BigInt(9), telegramUserId: BigInt(9) }) : null,
    existingKeys: new Set(opts.existing ?? []),
  }).map((n) => `${n.dedupeKey}${n.send ? "" : " (silent)"}`);

test("notices: a person past 80% is told once, and a jump sends only the highest", () => {
  assert.deepEqual(plan({ service: status("service", 1, 25), a: status("user", 4.1, 5) }), ["budget:user:2026-10:80:a"]);
  assert.deepEqual(plan({ service: status("service", 1, 25), a: status("user", 4.1, 5), existing: ["budget:user:2026-10:80:a"] }), []);
  assert.deepEqual(plan({ service: status("service", 1, 25), a: status("user", 4.99, 5) }), ["budget:user:2026-10:80:a (silent)", "budget:user:2026-10:100:a"]);
});

test("notices: the shared budget tells the admin at 50%, and the admin and everyone from 80%", () => {
  assert.deepEqual(plan({ service: status("service", 13, 25) }), []); // no admin configured
  assert.deepEqual(plan({ service: status("service", 13, 25), admin: true }), ["budget:service:2026-10:50:admin"]);
  assert.deepEqual(plan({ service: status("service", 20.5, 25), admin: true, existing: ["budget:service:2026-10:50:admin"] }), [
    "budget:service:2026-10:80:admin",
    "budget:service:2026-10:80:a",
    "budget:service:2026-10:80:b",
  ]);
  // An admin who is also a user gets the admin version of a shared notice only.
  assert.deepEqual(plan({ service: status("service", 20.5, 25), admin: true, adminIsB: true }), [
    "budget:service:2026-10:50:admin (silent)",
    "budget:service:2026-10:80:admin",
    "budget:service:2026-10:80:a",
  ]);
});

test("spend is grouped by what it paid for, and forecast only once a few days have passed", () => {
  assert.deepEqual(breakdownOf({ CLASSIFY_EMAIL: 0.3, CHAT: 0.1, MCP_BRIEF: 0.02 }), { emails: 0.3, chat: 0.1, briefs: 0.02, other: 0 });
  assert.equal(forecastUsd(0.5, new Date("2026-10-02T12:00:00Z")), null); // 1.5 days in: too early
  // 10 days into a 31-day month at $1 → about $3.10 by the end.
  assert.ok(Math.abs(forecastUsd(1, new Date("2026-10-11T00:00:00Z"))! - 3.1) < 0.001);
  assert.equal(forecastUsd(0, new Date("2026-10-20T00:00:00Z")), 0);
});
