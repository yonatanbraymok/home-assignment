import { db } from "@/lib/db";
import { budgetStatus, spendByUser, userCapUsd } from "@/lib/llm/budget";
import { planBudgetNotices, questionReserveUsd, scopeStatus } from "@/lib/llm/budget-policy";
import { defaultModel } from "@/lib/llm/models";
import { budgetNoticeText } from "./messages";
import { notifyOnce } from "./notify";

// Sends the budget's threshold notices (planBudgetNotices in budget-policy.ts). Runs after the
// cron, after /sync and after a chat reply, never inside the AI layer, so a notice arrives after
// the answer and evals that call the AI directly can't message anyone. Idempotent: each notice is
// an ActionLog row with a unique key, so overlapping runs send it once.

type Send = (telegramChatId: bigint, text: string) => Promise<void>;

/** The admin's private chat, from ADMIN_TELEGRAM_USER_ID (a private chat's id is the user's id). */
function adminTelegramId(): bigint | null {
  const value = process.env.ADMIN_TELEGRAM_USER_ID?.trim();
  return value && /^\d+$/.test(value) ? BigInt(value) : null;
}

/**
 * Sends the notices that are due. `recipients` limits it to those user ids (evals); otherwise
 * every user who might be owed one. Returns how many messages were sent.
 */
export async function ensureBudgetNotices(opts: { now?: Date; send?: Send; recipients?: string[] } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const [service, spent] = await Promise.all([budgetStatus(null, now), spendByUser(now)]);
  const reserve = questionReserveUsd(defaultModel());
  const cap = userCapUsd();
  const statusOf = (userId: string) => scopeStatus("user", spent.get(userId) ?? 0, cap, reserve);

  // Shared-budget notices at 80% and above go to everyone; below that only users past 80% of
  // their own allowance can be owed one (plus the admin from 50%).
  const everyone = service.service.level !== "ok";
  const owed = [...spent.keys()].filter((id) => statusOf(id).level !== "ok");
  const ids = opts.recipients ?? (everyone ? undefined : owed);
  const adminId = adminTelegramId();
  if (ids && ids.length === 0 && (!adminId || service.service.percent < 50)) return 0;

  const users = await db.user.findMany({
    where: ids ? { id: { in: ids } } : {},
    select: { id: true, telegramUserId: true, telegramChatId: true },
  });
  const adminUser = adminId === null ? null : await db.user.findUnique({ where: { telegramUserId: adminId }, select: { id: true } });
  const plan = (existingKeys: Set<string>) =>
    planBudgetNotices({
      monthKey: service.monthKey,
      service: service.service,
      users: users.map((u) => ({ userId: u.id, telegramUserId: u.telegramUserId, chatId: u.telegramChatId, status: statusOf(u.id) })),
      admin: adminId === null ? null : { userId: adminUser?.id ?? null, chatId: adminId, telegramUserId: adminId },
      existingKeys,
    });

  const candidates = plan(new Set());
  if (!candidates.length) return 0;
  const existing = await db.actionLog.findMany({ where: { dedupeKey: { in: candidates.map((n) => n.dedupeKey) } }, select: { dedupeKey: true } });
  let sent = 0;
  for (const notice of plan(new Set(existing.map((e) => e.dedupeKey!)))) {
    const status = notice.kind.scope === "user" ? statusOf(notice.userId!) : service.service;
    const text = budgetNoticeText(notice.kind, status, service.resetsOn, service.lighterEmailModel);
    try {
      if (notice.send) {
        const delivered = await notifyOnce({
          userId: notice.userId,
          telegramChatId: notice.chatId,
          dedupeKey: notice.dedupeKey,
          action: "BUDGET_THRESHOLD",
          actor: "SYSTEM",
          text,
          send: opts.send,
        });
        if (delivered) sent++;
      } else {
        // A lower threshold passed in the same jump: recorded, not sent.
        await db.actionLog.createMany({
          data: [{ userId: notice.userId, actor: "SYSTEM", action: "BUDGET_THRESHOLD", dedupeKey: notice.dedupeKey, payload: { text, sent: false } }],
          skipDuplicates: true,
        });
      }
    } catch (err) {
      // One recipient's failure doesn't stop the others.
      console.error(`budget notice ${notice.dedupeKey} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return sent;
}
