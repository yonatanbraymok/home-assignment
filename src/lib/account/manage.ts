import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { revokeGmailAccess, type RevokeResult } from "@/lib/gmail/oauth";
import { parseConfirmation } from "./confirm";

// The user's data rights: stop Gmail access but keep the tracker (/disconnect), or erase
// everything (/delete_my_data). Both run only after a confirmation tapped by the account owner.

export type AccountSummary = { applications: number; emails: number; proposals: number; questions: number };

export async function accountSummary(userId: string): Promise<AccountSummary> {
  const [applications, emails, proposals, questions] = await Promise.all([
    db.jobApplication.count({ where: { userId } }),
    db.emailMessage.count({ where: { userId } }),
    db.statusProposal.count({ where: { userId } }),
    db.actionLog.count({ where: { userId, action: "CHAT_ANSWERED" } }),
  ]);
  return { applications, emails, proposals, questions };
}

/** Checks a tapped confirmation: well-formed, not expired, and tapped by the account's owner. */
export async function authorizeConfirmation(data: string, telegramUserId: bigint, now = new Date()) {
  const parsed = parseConfirmation(data, now);
  if (typeof parsed === "string") return parsed;
  const owner = await db.user.findUnique({ where: { id: parsed.userId }, select: { telegramUserId: true } });
  if (!owner) return "not-found" as const;
  if (owner.telegramUserId !== telegramUserId) return "not-owner" as const;
  return parsed;
}

/** Stops reading Gmail: revokes Google's grant and forgets the token. The tracker stays. */
export async function disconnectGmail(
  userId: string,
  actorRef: string,
): Promise<{ status: "not-connected" } | { status: "disconnected"; revoke: RevokeResult }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { gmailRefreshTokenEnc: true } });
  if (!user?.gmailRefreshTokenEnc) return { status: "not-connected" };
  const revoke = await revokeGmailAccess(user.gmailRefreshTokenEnc);
  await db.user.update({
    where: { id: userId },
    data: { gmailRefreshTokenEnc: null, gmailAddress: null, gmailConnectedAt: null, gmailSyncError: null, gmailLastSyncAt: null },
  });
  await db.actionLog.create({ data: { userId, actor: "USER", actorRef, action: "GMAIL_DISCONNECTED", payload: { revoke } } });
  return { status: "disconnected", revoke };
}

/**
 * Erases everything stored about the user: applications, emails, proposals, chat history, the
 * audit trail and the registration. Cost rows stay without the user (they hold no content).
 */
export async function deleteAccount(
  userId: string,
): Promise<{ status: "not-found" } | { status: "deleted"; revoke: RevokeResult | "not-connected"; deleted: AccountSummary }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { gmailRefreshTokenEnc: true } });
  if (!user) return { status: "not-found" };
  const revoke = user.gmailRefreshTokenEnc ? await revokeGmailAccess(user.gmailRefreshTokenEnc) : "not-connected";
  const deleted = await accountSummary(userId);
  try {
    await db.$transaction([
      // ActionLog only loses the link on user delete (SetNull), so its rows go explicitly:
      // they include the user's chat questions and answers.
      db.actionLog.deleteMany({ where: { userId } }),
      // Cascades to applications, emails and proposals; LlmUsage.userId becomes null.
      db.user.delete({ where: { id: userId } }),
    ]);
  } catch (err) {
    // A second tap racing the first: the user is already gone.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return { status: "not-found" };
    throw err;
  }
  // Records that a deletion happened, with nothing that identifies who.
  await db.actionLog.create({ data: { actor: "USER", action: "ACCOUNT_DELETED", payload: { ...deleted, revoke } } });
  return { status: "deleted", revoke, deleted };
}
