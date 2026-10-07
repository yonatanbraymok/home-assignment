import { safeEqual } from "@/lib/crypto";
import { requireEnv } from "@/lib/env";
import { syncAllMailboxes } from "@/lib/gmail/sync";

export const maxDuration = 60;

// Called every few minutes by Supabase pg_cron (via pg_net) with `Authorization: Bearer <CRON_SECRET>`.
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!safeEqual(token, requireEnv("CRON_SECRET"))) return new Response("unauthorized", { status: 401 });

  // Leave headroom under maxDuration; users not reached go first next time.
  const results = await syncAllMailboxes(40_000);
  return Response.json({ ok: true, results });
}
