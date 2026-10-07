import { db } from "@/lib/db";
import { Prisma, type ProposalState } from "@/generated/prisma/client";
import { companyDomainFor, dedupeKey } from "@/lib/agent/match";
import { senderDomain } from "@/lib/gmail/parse";

// The only code that applies an agent proposal to an application, and only for its owner's tap.

export type Decision =
  | { kind: "executed" }
  | { kind: "rejected" }
  | { kind: "stale" }
  | { kind: "failed"; reason: string }
  | { kind: "already"; state: ProposalState }
  | { kind: "expired" }
  | { kind: "not-yours" }
  | { kind: "not-found" };

class AlreadyDecided extends Error {}
class Stale extends Error {}

const DECIDABLE: ProposalState[] = ["PENDING", "FAILED"]; // FAILED can be retried or rejected

async function loadForDecision(proposalId: string) {
  return db.statusProposal.findUnique({
    where: { id: proposalId },
    include: {
      user: { select: { telegramUserId: true } },
      email: { select: { fromAddress: true, receivedAt: true } },
    },
  });
}

/** Approve (or retry) a proposal: claim it and apply it in one transaction. */
export async function approveProposal(proposalId: string, telegramUserId: bigint): Promise<Decision> {
  const p = await loadForDecision(proposalId);
  if (!p) return { kind: "not-found" };
  if (p.user.telegramUserId !== telegramUserId) {
    await logDenied(p.userId, proposalId, telegramUserId);
    return { kind: "not-yours" };
  }
  if (DECIDABLE.includes(p.state) && p.expiresAt <= new Date()) return expire(proposalId);

  const actorRef = `tg:${telegramUserId}`;
  try {
    await db.$transaction(async (tx) => {
      const now = new Date();
      // Claim: only one tap can move it out of PENDING/FAILED (double taps, two devices).
      const claimed = await tx.statusProposal.updateMany({
        where: { id: proposalId, state: { in: DECIDABLE }, expiresAt: { gt: now } },
        data: { state: "EXECUTED", decidedByTelegramUserId: telegramUserId, decidedAt: now, executedAt: now, failureReason: null },
      });
      if (claimed.count === 0) throw new AlreadyDecided();

      let applicationId = p.applicationId;
      if (p.kind === "UPDATE_STATUS") {
        // Optimistic check: apply only if the application is still in the status the approver saw.
        const updated = await tx.jobApplication.updateMany({
          where: { id: p.applicationId!, status: p.fromStatus! },
          data: { status: p.toStatus, statusChangedAt: now, lastEmailAt: p.email.receivedAt },
        });
        if (updated.count === 0) throw new Stale();
      } else {
        try {
          const created = await tx.jobApplication.create({
            data: {
              userId: p.userId,
              company: p.company,
              companyDomain: companyDomainFor(senderDomain(p.email.fromAddress)),
              roleTitle: p.roleTitle,
              dedupeKey: dedupeKey(p.company, p.roleTitle),
              status: p.toStatus,
              source: "EMAIL",
              appliedAt: p.toStatus === "APPLIED" ? p.email.receivedAt : null,
              statusChangedAt: now,
              lastEmailAt: p.email.receivedAt,
            },
          });
          applicationId = created.id;
          await tx.statusProposal.update({ where: { id: proposalId }, data: { applicationId } });
        } catch (err) {
          // Same company + role already tracked (e.g. approved from another proposal).
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new Stale();
          throw err;
        }
      }
      await tx.emailMessage.update({ where: { id: p.emailId }, data: { applicationId } });
      await tx.actionLog.create({
        data: {
          userId: p.userId,
          actor: "USER",
          actorRef,
          action: "PROPOSAL_EXECUTED",
          proposalId,
          applicationId,
          payload: { kind: p.kind, from: p.fromStatus, to: p.toStatus },
        },
      });
    });
    return { kind: "executed" };
  } catch (err) {
    // The transaction rolled back; record the outcome outside it.
    if (err instanceof AlreadyDecided) {
      const current = await db.statusProposal.findUnique({ where: { id: proposalId }, select: { state: true } });
      return { kind: "already", state: current?.state ?? p.state };
    }
    if (err instanceof Stale) {
      await settle(proposalId, "STALE", telegramUserId, null);
      await log(p.userId, "PROPOSAL_STALE", proposalId, actorRef);
      return { kind: "stale" };
    }
    const reason = "The database didn't accept the change.";
    console.error("approve failed:", err instanceof Error ? err.message : err);
    await settle(proposalId, "FAILED", telegramUserId, reason).catch(() => undefined);
    await log(p.userId, "PROPOSAL_FAILED", proposalId, actorRef).catch(() => undefined);
    return { kind: "failed", reason };
  }
}

export async function rejectProposal(proposalId: string, telegramUserId: bigint): Promise<Decision> {
  const p = await loadForDecision(proposalId);
  if (!p) return { kind: "not-found" };
  if (p.user.telegramUserId !== telegramUserId) {
    await logDenied(p.userId, proposalId, telegramUserId);
    return { kind: "not-yours" };
  }
  const changed = await settle(proposalId, "REJECTED", telegramUserId, null);
  if (!changed) return { kind: "already", state: p.state };
  await log(p.userId, "PROPOSAL_REJECTED", proposalId, `tg:${telegramUserId}`);
  return { kind: "rejected" };
}

async function expire(proposalId: string): Promise<Decision> {
  await db.statusProposal.updateMany({ where: { id: proposalId, state: { in: DECIDABLE } }, data: { state: "EXPIRED" } });
  return { kind: "expired" };
}

/** Moves a still-open proposal to a final state; false if someone else already decided it. */
async function settle(proposalId: string, state: ProposalState, telegramUserId: bigint, failureReason: string | null) {
  const { count } = await db.statusProposal.updateMany({
    where: { id: proposalId, state: { in: DECIDABLE } },
    data: { state, decidedByTelegramUserId: telegramUserId, decidedAt: new Date(), failureReason },
  });
  return count > 0;
}

function log(userId: string, action: "PROPOSAL_STALE" | "PROPOSAL_FAILED" | "PROPOSAL_REJECTED", proposalId: string, actorRef: string) {
  return db.actionLog.create({ data: { userId, actor: "USER", actorRef, action, proposalId } });
}

function logDenied(userId: string, proposalId: string, telegramUserId: bigint) {
  return db.actionLog.create({
    data: { userId, actor: "USER", actorRef: `tg:${telegramUserId}`, action: "APPROVAL_DENIED", proposalId },
  });
}
