import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { sessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { budgetStatus, spendByPurpose, spendByUser, userCapUsd } from "@/lib/llm/budget";
import { breakdownOf, forecastUsd, questionReserveUsd, scopeStatus } from "@/lib/llm/budget-policy";
import { defaultModel } from "@/lib/llm/models";
import { mcpTokenStatus } from "@/lib/mcp/auth";
import { accountCountsFor, applicationDetailFor, findSessionUser, gettingStartedFor, overviewFor } from "./queries";

// The dashboard's data access layer. Pages get data only through these functions, and each one
// takes the user from the session cookie, never from the URL or a form.

export type CurrentUser = {
  id: string;
  name: string;
  gmailAddress: string | null;
  gmailConnectedAt: Date | null;
  gmailLastSyncAt: Date | null;
  gmailSyncError: string | null; // set while Google refuses access (revoked or expired)
  isAdmin: boolean; // ADMIN_TELEGRAM_USER_ID: sees the service-wide budget
};

/**
 * The signed-in user, or null: no cookie, an invalid or expired one, or the account was deleted
 * since sign-in. Shared within one request (React cache). On purpose not 'use cache: private':
 * a deleted account must be signed out on the next request, not after a cache lifetime.
 */
export const getSignedInUser = cache(async (): Promise<CurrentUser | null> => {
  // Request time only. Checking the cookie's expiry reads the clock, which Cache Components
  // refuses while prerendering, including the per-session prefetch where cookies are available.
  await connection();
  const userId = await sessionUserId();
  const user = userId ? await findSessionUser(userId) : null;
  if (!user) return null;
  return {
    id: user.id,
    name: user.displayName || (user.telegramUsername ? `@${user.telegramUsername}` : "you"),
    gmailAddress: user.gmailAddress,
    gmailConnectedAt: user.gmailConnectedAt,
    gmailLastSyncAt: user.gmailLastSyncAt,
    gmailSyncError: user.gmailSyncError,
    isAdmin: String(user.telegramUserId) === process.env.ADMIN_TELEGRAM_USER_ID?.trim(),
  };
});

/** The signed-in user; anyone else is sent to the sign-in page. */
export async function getCurrentUser(): Promise<CurrentUser> {
  const user = await getSignedInUser();
  if (!user) redirect("/?login=required");
  return user;
}

/** The signed-in user's AI allowance this month, the shared budget, and what's limited (llm/budget.ts). */
export const getBudget = cache(async () => budgetStatus((await getCurrentUser()).id));

export async function getOverview() {
  const user = await getCurrentUser();
  const [overview, gettingStarted] = await Promise.all([overviewFor(user.id), gettingStartedFor(user.id)]);
  return { user, ...overview, gettingStarted };
}

/** null when the application doesn't exist or belongs to someone else: the page can't tell which. */
export async function getApplicationDetail(applicationId: string) {
  const user = await getCurrentUser();
  const detail = await applicationDetailFor(user.id, applicationId);
  return detail && { user, ...detail };
}

export async function getDevelopers() {
  const user = await getCurrentUser();
  return { user, mcp: await mcpTokenStatus(user.id) };
}

export async function getSettings() {
  const user = await getCurrentUser();
  const [counts, budget, mine] = await Promise.all([accountCountsFor(user.id), getBudget(), spendByPurpose(user.id)]);
  const now = new Date();
  return {
    user,
    counts,
    budget,
    breakdown: breakdownOf(mine),
    forecastUsd: forecastUsd(budget.user?.spentUsd ?? 0, now),
    admin: user.isAdmin ? await adminOverview(now, budget.service.spentUsd) : null,
  };
}

/** The whole service this month, for the admin only: totals by purpose and each user's spend. */
async function adminOverview(now: Date, serviceSpentUsd: number) {
  const [byPurpose, perUser] = await Promise.all([spendByPurpose(null, now), spendByUser(now)]);
  const users = await db.user.findMany({
    where: { id: { in: [...perUser.keys()] } },
    select: { id: true, displayName: true, telegramUsername: true },
  });
  const reserve = questionReserveUsd(defaultModel());
  const cap = userCapUsd();
  return {
    breakdown: breakdownOf(byPurpose),
    users: users
      .map((u) => ({ name: u.displayName || (u.telegramUsername ? `@${u.telegramUsername}` : u.id), status: scopeStatus("user", perUser.get(u.id) ?? 0, cap, reserve) }))
      .sort((a, b) => b.status.spentUsd - a.status.spentUsd),
    // Evals, and the cost rows of accounts deleted with /delete_my_data (kept without a user).
    unattributedUsd: Math.max(0, serviceSpentUsd - [...perUser.values()].reduce((sum, usd) => sum + usd, 0)),
  };
}
