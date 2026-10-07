import { db } from "@/lib/db";

// Uptime check: confirms the app can reach the database. Budget status is added in Phase 5.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
