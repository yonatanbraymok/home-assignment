import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { verifyToken } from "@/lib/crypto";
import { loginLinkFingerprint } from "./tokens";

export type Redeemed = { status: "ok"; userId: string } | { status: "used"; userId: string } | { status: "expired" };

export type Checked = { status: "valid"; userId: string; name: string } | { status: "used"; userId: string } | { status: "expired" };

/**
 * What a /dashboard link would do, without using it: the sign-in page shows whose account it
 * opens and signs in only when that person confirms.
 */
export async function checkLoginLink(token: string | null): Promise<Checked> {
  const userId = verifyToken(token, "dashboard-login");
  if (!token || !userId) return { status: "expired" };
  const user = await db.user.findUnique({ where: { id: userId }, select: { displayName: true, telegramUsername: true } });
  if (!user) return { status: "expired" };
  const used = await db.actionLog.findUnique({ where: { dedupeKey: `login:${loginLinkFingerprint(token)}` }, select: { id: true } });
  if (used) return { status: "used", userId };
  return { status: "valid", userId, name: user.displayName || (user.telegramUsername ? `@${user.telegramUsername}` : "your account") };
}

/**
 * Checks a /dashboard link and marks it used, so it signs in once. A forged, garbled or
 * wrong-purpose token counts as expired: the user's next step is the same (send /dashboard again).
 */
export async function redeemLoginLink(token: string | null): Promise<Redeemed> {
  const userId = verifyToken(token, "dashboard-login");
  if (!token || !userId) return { status: "expired" };
  // Deleted since the link was sent (/delete_my_data).
  if (!(await db.user.findUnique({ where: { id: userId }, select: { id: true } }))) return { status: "expired" };

  try {
    // The unique dedupeKey makes a second use fail; the row is also the sign-in's audit record.
    const { count } = await db.actionLog.createMany({
      data: [{ userId, actor: "USER", actorRef: "web", action: "DASHBOARD_LOGIN", dedupeKey: `login:${loginLinkFingerprint(token)}` }],
      skipDuplicates: true,
    });
    return count ? { status: "ok", userId } : { status: "used", userId };
  } catch (err) {
    // The account was deleted between the check above and the insert.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") return { status: "expired" };
    throw err;
  }
}
