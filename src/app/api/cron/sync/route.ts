import { analyzePendingEmails, type AnalysisSummary } from "@/lib/agent/analyze";
import { CLAIMABLE } from "@/lib/agent/queue";
import { safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { syncAllMailboxes } from "@/lib/gmail/sync";
import { quietly } from "@/lib/proposals/cards-io";
import { expireOverdueProposals } from "@/lib/proposals/expire";
import { announceBackfill, finishBackfill } from "@/lib/proposals/review";
import { ensureBudgetNotices } from "@/lib/telegram/budget-notices";

export const maxDuration = 60;

// Runs every 5 minutes (Supabase pg_cron). 25 emails is about 25–50 s of model calls, so a large
// first sync finishes in about an hour; the deadline below stops a run before the 60 s limit.
const ANALYZE_PER_USER = 25;
// Leave headroom under maxDuration; users not reached go first next time.
const SYNC_BUDGET_MS = 25_000;
const TOTAL_BUDGET_MS = 45_000;

// Called every few minutes by Supabase pg_cron (via pg_net) with `Authorization: Bearer <CRON_SECRET>`.
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!safeEqual(token, requireEnv("CRON_SECRET"))) return new Response("unauthorized", { status: 401 });

  const startedAt = Date.now();
  const expired = await expireOverdueProposals();
  const synced = await syncAllMailboxes(SYNC_BUDGET_MS);

  // Demo accounts have no mailbox to sync, but their sample emails are read like real ones.
  const demo = await db.user.findMany({
    where: { demoAt: { not: null }, gmailRefreshTokenEnc: null, emails: { some: { state: { in: [...CLAIMABLE] } } } },
    select: { id: true },
  });

  const analyzed: ({ userId: string } & (AnalysisSummary | { error: string }))[] = [];
  for (const userId of [...synced.map((s) => s.userId), ...demo.map((u) => u.id)]) {
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;
    try {
      analyzed.push({ userId, ...(await analyzePendingEmails(userId, ANALYZE_PER_USER, { deadline: startedAt + TOTAL_BUDGET_MS })) });
      await quietly("review summary", finishBackfill(userId));
      // Still reading past emails: say so once, so the first sync isn't silent until the summary.
      await quietly("backfill notice", announceBackfill(userId));
    } catch (err) {
      // Details go to the server log only; the response must not carry internals.
      console.error(`analysis failed for user ${userId}:`, err instanceof Error ? err.message : err);
      analyzed.push({ userId, error: "analysis failed (see server log)" });
    }
  }
  // Every user's budget notices, including the shared ones (evals spend without a user).
  await quietly("budget notices", ensureBudgetNotices());
  return Response.json({ ok: true, expired, synced, analyzed });
}
