import { db } from "@/lib/db";
import { budgetMode, monthWindow, type BudgetMode, type BudgetScope } from "./budget-policy";
import { defaultModel, fallbackModel } from "./models";

// Monthly AI spend against two hard caps (rules in budget-policy.ts). Each person's allowance
// keeps one account from using everyone's budget; the shared cap bounds the total whatever the
// number of users. With hosting at most $20, the service stays under $50 a month by construction.

const DEFAULT_SERVICE_CAP_USD = 25;
const DEFAULT_USER_CAP_USD = 5; // + a hosting share of at most $4 = under the $10 per person

export class BudgetExceeded extends Error {
  constructor(
    readonly scope: BudgetScope,
    readonly resetsOn: Date,
    message: string,
  ) {
    super(message);
  }
}

function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function serviceCapUsd(): number {
  return positiveEnv("LLM_MONTHLY_BUDGET_USD", DEFAULT_SERVICE_CAP_USD);
}

export function userCapUsd(): number {
  return Math.min(positiveEnv("LLM_USER_MONTHLY_BUDGET_USD", DEFAULT_USER_CAP_USD), serviceCapUsd());
}

/** This month's spend: one user's, or the whole service's (null). */
export async function spendUsd(userId: string | null, now = new Date()): Promise<number> {
  const { start, end } = monthWindow(now);
  const { _sum } = await db.llmUsage.aggregate({
    where: { createdAt: { gte: start, lt: end }, ...(userId ? { userId } : {}) },
    _sum: { costUsd: true },
  });
  return Number(_sum.costUsd ?? 0);
}

/** This month's spend of every user who spent anything. */
export async function spendByUser(now = new Date()): Promise<Map<string, number>> {
  const { start, end } = monthWindow(now);
  const rows = await db.llmUsage.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: start, lt: end }, userId: { not: null } },
    _sum: { costUsd: true },
  });
  return new Map(rows.map((r) => [r.userId!, Number(r._sum.costUsd ?? 0)]));
}

/** Where a user (or, with null, the service) stands this month, and what the agent may do. */
export async function budgetStatus(userId: string | null, now = new Date()): Promise<BudgetMode> {
  const [userSpent, serviceSpent] = await Promise.all([userId ? spendUsd(userId, now) : null, spendUsd(null, now)]);
  return budgetMode({
    userSpentUsd: userSpent,
    userCapUsd: userCapUsd(),
    serviceSpentUsd: serviceSpent,
    serviceCapUsd: serviceCapUsd(),
    now,
    defaultModel: defaultModel(),
    fallback: { classify: fallbackModel("classify"), chat: fallbackModel("chat") },
  });
}

/**
 * The hard guarantee, before every model call: refuses a call whose worst case would take the
 * user's or the shared spend past its cap.
 */
export async function assertAffordable(opts: { userId: string | null; worstCaseUsd: number; now?: Date }): Promise<void> {
  const now = opts.now ?? new Date();
  const { end } = monthWindow(now);
  const [userSpent, serviceSpent] = await Promise.all([opts.userId ? spendUsd(opts.userId, now) : null, spendUsd(null, now)]);
  // Written so that NaN fails too.
  if (userSpent !== null && !(userSpent + opts.worstCaseUsd <= userCapUsd())) {
    throw new BudgetExceeded("user", end, `Monthly AI allowance reached ($${userSpent.toFixed(4)} of $${userCapUsd()})`);
  }
  if (!(serviceSpent + opts.worstCaseUsd <= serviceCapUsd())) {
    throw new BudgetExceeded("service", end, `Shared monthly AI budget reached ($${serviceSpent.toFixed(4)} of $${serviceCapUsd()})`);
  }
}
