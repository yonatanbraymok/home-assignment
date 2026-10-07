import { db } from "@/lib/db";
import { quietly, refreshCard } from "./cards-io";

/** Marks PENDING proposals past their expiry as EXPIRED and updates their cards. */
export async function expireOverdueProposals(limit = 100): Promise<number> {
  const overdue = await db.statusProposal.findMany({
    where: { state: "PENDING", expiresAt: { lte: new Date() } },
    select: { id: true, userId: true },
    take: limit,
  });
  if (!overdue.length) return 0;

  const ids = overdue.map((p) => p.id);
  await db.statusProposal.updateMany({ where: { id: { in: ids }, state: "PENDING" }, data: { state: "EXPIRED" } });
  await db.actionLog.createMany({
    data: overdue.map((p) => ({ userId: p.userId, actor: "SYSTEM" as const, actorRef: "cron", action: "PROPOSAL_EXPIRED" as const, proposalId: p.id })),
  });
  for (const id of ids) await quietly("refresh expired card", refreshCard(id));
  return ids.length;
}
