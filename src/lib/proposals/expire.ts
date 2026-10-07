import { db } from "@/lib/db";
import type { ProposalState } from "@/generated/prisma/enums";
import { quietly, refreshCard } from "./cards-io";

// A FAILED approval can be retried until the same 7-day expiry, then it expires too.
const OPEN: ProposalState[] = ["PENDING", "FAILED"];

/** Marks open proposals past their expiry as EXPIRED and updates their cards. */
export async function expireOverdueProposals(limit = 100): Promise<number> {
  const overdue = await db.statusProposal.findMany({
    where: { state: { in: OPEN }, expiresAt: { lte: new Date() } },
    select: { id: true, userId: true },
    take: limit,
  });
  if (!overdue.length) return 0;

  const ids = overdue.map((p) => p.id);
  await db.statusProposal.updateMany({ where: { id: { in: ids }, state: { in: OPEN } }, data: { state: "EXPIRED" } });
  await db.actionLog.createMany({
    data: overdue.map((p) => ({ userId: p.userId, actor: "SYSTEM" as const, actorRef: "cron", action: "PROPOSAL_EXPIRED" as const, proposalId: p.id })),
  });
  for (const id of ids) await quietly("refresh expired card", refreshCard(id));
  return ids.length;
}
