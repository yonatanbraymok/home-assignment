import { costUsd, hasPrice } from "./pricing";

// The budget rules, without the database (budget.ts adds it), so they can be unit-tested.
//
// Two caps, both checked before every AI call: each person's monthly allowance, and the shared
// budget for the whole service (which also pays for evals). Each is "ok" below 80%, "low" from
// 80%, and "out" once one more whole question might not fit. Spend never reaches 100%, because a
// call only runs if its worst case fits, so "out" can't wait for 100%; the reserve makes chat and
// email reading stop at the same moment, and a question is never cut off halfway.

export type BudgetScope = "user" | "service";
export type BudgetLevel = "ok" | "low" | "out";

export const LOW_AT = 0.8;
export const CHAT_DAILY_LIMIT = 40; // twice the brief's 20 uses/day
export const CHAT_DAILY_LIMIT_LOW = 20; // still the brief's 20 uses/day

// English is about 4 characters per token and Hebrew tokenizes denser; 2 keeps the estimate safe.
const CHARS_PER_TOKEN_ESTIMATE = 2;

/** The UTC calendar month containing `now`: [start, end). `key` is e.g. "2026-10". */
export function monthWindow(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, key: start.toISOString().slice(0, 7) };
}

/** When a budget resets, e.g. "1 Nov" (the 1st, UTC, whatever the server's time zone). */
export function resetDateText(resetsOn: Date): string {
  return resetsOn.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
}

/** e.g. "October", for the month a budget belongs to. */
export function monthName(resetsOn: Date): string {
  return new Date(resetsOn.getTime() - 1).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long" });
}

/** Worst case of one call: the whole prompt (tool declarations included) plus the full output allowance. */
export function estimateCallWorstCaseUsd(model: string, promptChars: number, maxOutputTokens: number): number {
  return costUsd(model, Math.ceil(promptChars / CHARS_PER_TOKEN_ESTIMATE), maxOutputTokens);
}

// One whole chat question at worst: 4 tool rounds + the final round + 1 grounding retry, each with
// up to ~8k tokens in and 2,048 out (thinking included). About $0.045 on gemini-3.5-flash-lite.
const QUESTION_CALLS = 6;
const QUESTION_INPUT_TOKENS = 8_000;
const QUESTION_OUTPUT_TOKENS = 2_048;

/** Infinity for a model without a price: then nothing fits, and AI pauses instead of failing every call. */
export function questionReserveUsd(model: string): number {
  return hasPrice(model) ? QUESTION_CALLS * costUsd(model, QUESTION_INPUT_TOKENS, QUESTION_OUTPUT_TOKENS) : Infinity;
}

export function levelOf(spentUsd: number, capUsd: number, reserveUsd: number): BudgetLevel {
  if (!(spentUsd + reserveUsd <= capUsd)) return "out"; // written so that NaN counts as out
  return spentUsd >= LOW_AT * capUsd ? "low" : "ok";
}

export type ScopeStatus = { scope: BudgetScope; spentUsd: number; capUsd: number; percent: number; level: BudgetLevel };

export function scopeStatus(scope: BudgetScope, spentUsd: number, capUsd: number, reserveUsd: number): ScopeStatus {
  const percent = capUsd > 0 && Number.isFinite(spentUsd) ? Math.min(100, (spentUsd / capUsd) * 100) : 100;
  return { scope, spentUsd, capUsd, percent, level: levelOf(spentUsd, capUsd, reserveUsd) };
}

export type BudgetMode = {
  level: BudgetLevel;
  limitedBy: BudgetScope | null; // which cap set the level; null when ok
  aiOn: boolean;
  models: { classify: string; chat: string }; // for a whole analysis run or question
  lighterEmailModel: boolean;
  chatDailyLimit: number;
  monthKey: string;
  resetsOn: Date;
  user: ScopeStatus | null; // null for the service as a whole
  service: ScopeStatus;
};

const RANK: Record<BudgetLevel, number> = { ok: 0, low: 1, out: 2 };

export function budgetMode(opts: {
  userSpentUsd: number | null;
  userCapUsd: number;
  serviceSpentUsd: number;
  serviceCapUsd: number;
  now: Date;
  defaultModel: string;
  fallback: { classify: string | null; chat: string | null };
}): BudgetMode {
  const reserve = questionReserveUsd(opts.defaultModel);
  const { key, end } = monthWindow(opts.now);
  const user = opts.userSpentUsd === null ? null : scopeStatus("user", opts.userSpentUsd, opts.userCapUsd, reserve);
  const service = scopeStatus("service", opts.serviceSpentUsd, opts.serviceCapUsd, reserve);
  // The worse of the two; on a tie the person's own allowance is named.
  const limiting = user && RANK[user.level] >= RANK[service.level] ? user : service;
  const low = limiting.level === "low";
  const classify = low && opts.fallback.classify ? opts.fallback.classify : opts.defaultModel;
  return {
    level: limiting.level,
    limitedBy: limiting.level === "ok" ? null : limiting.scope,
    aiOn: limiting.level !== "out",
    models: { classify, chat: low && opts.fallback.chat ? opts.fallback.chat : opts.defaultModel },
    lighterEmailModel: classify !== opts.defaultModel,
    chatDailyLimit: low ? CHAT_DAILY_LIMIT_LOW : CHAT_DAILY_LIMIT,
    monthKey: key,
    resetsOn: end,
    user,
    service,
  };
}

// ---------- Where the money goes, and where it's heading ----------

export type SpendBreakdown = { emails: number; chat: number; briefs: number; other: number };

/** Groups spend by what it paid for (LlmUsage purposes). Evals count as "other". */
export function breakdownOf(byPurpose: Partial<Record<string, number>>): SpendBreakdown {
  return {
    emails: byPurpose.CLASSIFY_EMAIL ?? 0,
    chat: byPurpose.CHAT ?? 0,
    briefs: byPurpose.MCP_BRIEF ?? 0,
    other: byPurpose.EVAL ?? 0,
  };
}

const MIN_DAYS_FOR_FORECAST = 3;

/**
 * Month-end spend at the current pace, or null in the first days of a month, when a straight-line
 * projection from a day or two of usage would mostly be noise.
 */
export function forecastUsd(spentUsd: number, now: Date): number | null {
  const { start, end } = monthWindow(now);
  const elapsedDays = (now.getTime() - start.getTime()) / 86_400_000;
  if (elapsedDays < MIN_DAYS_FOR_FORECAST) return null;
  return spentUsd * ((end.getTime() - start.getTime()) / (now.getTime() - start.getTime()));
}

// ---------- Threshold notices ----------

export type NoticePct = 50 | 80 | 100;
export type NoticeKind = { scope: BudgetScope; pct: NoticePct; audience: "user" | "admin" };
export type NoticeRecipient = { userId: string | null; chatId: bigint };
export type PlannedNotice = NoticeRecipient & { dedupeKey: string; kind: NoticeKind; send: boolean };

/** 100 means "used up" (out), which can come before 80% when a cap is smaller than the reserve. */
function reached(status: ScopeStatus, pct: NoticePct): boolean {
  if (status.level === "out") return true;
  return pct === 100 ? false : status.percent >= pct;
}

/**
 * Which notices are due, once a month per recipient. The shared budget: 50% → the admin; 80% and
 * used up → the admin and every user. A person's allowance: 80% and used up → that person. When
 * spend jumped past several thresholds, only the highest is sent; the lower ones are recorded
 * without sending. An admin who is also a user gets the admin version of shared notices only.
 */
export function planBudgetNotices(opts: {
  monthKey: string;
  service: ScopeStatus;
  users: (NoticeRecipient & { userId: string; telegramUserId: bigint; status: ScopeStatus })[];
  admin: (NoticeRecipient & { telegramUserId: bigint }) | null;
  existingKeys: Set<string>;
}): PlannedNotice[] {
  const plan: PlannedNotice[] = [];
  const add = (recipient: NoticeRecipient, keyFor: string, status: ScopeStatus, audience: "user" | "admin", pcts: NoticePct[]) => {
    const due = pcts.filter((pct) => reached(status, pct));
    const highest = due[due.length - 1];
    for (const pct of due) {
      const dedupeKey = `budget:${status.scope}:${opts.monthKey}:${pct}:${keyFor}`;
      if (opts.existingKeys.has(dedupeKey)) continue;
      plan.push({ ...recipient, dedupeKey, kind: { scope: status.scope, pct, audience }, send: pct === highest });
    }
  };
  if (opts.admin) add(opts.admin, "admin", opts.service, "admin", [50, 80, 100]);
  for (const u of opts.users) {
    if (u.telegramUserId !== opts.admin?.telegramUserId) add(u, u.userId, opts.service, "user", [80, 100]);
    add(u, u.userId, u.status, "user", [80, 100]);
  }
  return plan;
}
