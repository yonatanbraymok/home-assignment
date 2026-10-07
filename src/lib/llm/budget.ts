import { db } from "@/lib/db";

// Hard monthly cap on model spend. Hosting is at most $20, so total stays under $50 by construction.
// Phase 5 adds the 50/80% thresholds, notifications and the cheaper fallback model.
const DEFAULT_MONTHLY_BUDGET_USD = 25;

export class BudgetExceeded extends Error {}

export function monthlyBudgetUsd(): number {
  const value = Number(process.env.LLM_MONTHLY_BUDGET_USD);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MONTHLY_BUDGET_USD;
}

export async function monthToDateSpendUsd(now = new Date()): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const { _sum } = await db.llmUsage.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costUsd: true } });
  return Number(_sum.costUsd ?? 0);
}

/** Refuses a call whose worst-case cost would take this month's spend past the cap. */
export async function assertWithinBudget(worstCaseUsd: number): Promise<void> {
  const spent = await monthToDateSpendUsd();
  if (spent + worstCaseUsd > monthlyBudgetUsd()) {
    throw new BudgetExceeded(`Monthly AI budget reached ($${spent.toFixed(2)} of $${monthlyBudgetUsd()})`);
  }
}
