import { timingSafeEqual } from "node:crypto";
import { webhookCallback } from "grammy";
import { getBot } from "@/lib/telegram/bot";

let handleUpdate: ((req: Request) => Promise<Response>) | undefined;

function secretMatches(header: string | null, secret: string) {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  // We check the secret ourselves instead of relying on grammY: grammY skips the check
  // when no secret is configured, and calls Telegram's getMe before checking it.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook secret not configured", { status: 500 });
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return new Response("unauthorized", { status: 401 });
  }

  handleUpdate ??= webhookCallback(getBot(), "std/http");
  try {
    return await handleUpdate(req);
  } catch (err) {
    // A non-2xx response makes Telegram re-send the same update again and again.
    // Log (without the update body, which holds user text) and acknowledge it.
    console.error("telegram update failed:", err instanceof Error ? err.message : err);
    return new Response(null, { status: 200 });
  }
}
