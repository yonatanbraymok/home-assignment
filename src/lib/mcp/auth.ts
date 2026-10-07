import { db } from "@/lib/db";
import { hashMcpToken, newMcpToken } from "./token";

// One MCP token per user. Creating a new one replaces the old one, which stops working at once.

export async function createMcpToken(userId: string): Promise<{ token: string; createdAt: Date }> {
  const { token, hash } = newMcpToken();
  const createdAt = new Date();
  const before = await db.user.findUnique({ where: { id: userId }, select: { mcpTokenHash: true } });
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { mcpTokenHash: hash, mcpTokenCreatedAt: createdAt } }),
    db.actionLog.create({ data: { userId, actor: "USER", actorRef: "web", action: "MCP_TOKEN_CREATED", payload: { replaced: Boolean(before?.mcpTokenHash) } } }),
  ]);
  return { token, createdAt };
}

export async function revokeMcpToken(userId: string): Promise<boolean> {
  const { count } = await db.user.updateMany({ where: { id: userId, mcpTokenHash: { not: null } }, data: { mcpTokenHash: null, mcpTokenCreatedAt: null } });
  if (count) await db.actionLog.create({ data: { userId, actor: "USER", actorRef: "web", action: "MCP_TOKEN_REVOKED" } });
  return count > 0;
}

/** The user a token belongs to, or null (unknown, revoked or replaced). */
export async function userForMcpToken(token: string) {
  return db.user.findUnique({ where: { mcpTokenHash: hashMcpToken(token) }, select: { id: true } });
}

export async function mcpTokenStatus(userId: string) {
  const [user, lastCall] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { mcpTokenCreatedAt: true } }),
    db.actionLog.findFirst({ where: { userId, action: "MCP_TOOL_CALLED" }, orderBy: { id: "desc" }, select: { createdAt: true } }),
  ]);
  return { createdAt: user?.mcpTokenCreatedAt ?? null, lastUsedAt: lastCall?.createdAt ?? null };
}
