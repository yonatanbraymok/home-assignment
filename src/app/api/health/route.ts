import { db } from "@/lib/db";
import { budgetStatus } from "@/lib/llm/budget";

// Uptime check: the app can reach the database, and where the shared AI budget stands. Public,
// so only the level and percent, never amounts.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const { service } = await budgetStatus(null);
    return Response.json({ ok: true, db: "up", budget: { level: service.level, percent: Math.round(service.percent) } });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
