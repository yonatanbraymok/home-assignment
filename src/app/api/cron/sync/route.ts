import { analyzePendingEmails, type AnalysisSummary } from "@/lib/agent/analyze";
import { safeEqual } from "@/lib/crypto";
import { requireEnv } from "@/lib/env";
import { syncAllMailboxes } from "@/lib/gmail/sync";
import { expireOverdueProposals } from "@/lib/proposals/expire";

export const maxDuration = 60;

const ANALYZE_PER_USER = 10;
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

  const analyzed: ({ userId: string } & (AnalysisSummary | { error: string }))[] = [];
  for (const { userId } of synced) {
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;
    try {
      analyzed.push({ userId, ...(await analyzePendingEmails(userId, ANALYZE_PER_USER)) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`analysis failed for user ${userId}:`, error);
      analyzed.push({ userId, error });
    }
  }
  return Response.json({ ok: true, expired, synced, analyzed });
}
