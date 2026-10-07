import { db } from "@/lib/db";
import { Prisma, type ApplicationStatus, type ProposalState } from "@/generated/prisma/client";
import { companyDomainFor, dedupeKey } from "@/lib/agent/match";
import { senderDomain } from "@/lib/gmail/parse";
import type { Candidate } from "./create";

// The only code that applies an agent proposal to an application, and only for its owner's tap.

export type Decision =
  | { kind: "executed" }
  | { kind: "rejected" }
  | { kind: "stale" }
  | { kind: "failed"; reason: string }
  | { kind: "already"; state: ProposalState }
  | { kind: "expired" }
  | { kind: "not-yours" }
  | { kind: "not-found" }
  | { kind: "needs-choice" };

/** On a "which application is this?" card: a candidate's index, or "new" for a new application. */
export type Choice = number | "new";

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

/**
 * Approve (or retry) a proposal: claim it and apply it in one transaction.
 * For a "which application is this?" proposal the owner's choice says what to apply it to.
 */
export async function approveProposal(proposalId: string, telegramUserId: bigint, choice?: Choice): Promise<Decision> {
  const p = await loadForDecision(proposalId);
  if (!p) return { kind: "not-found" };
  if (p.user.telegramUserId !== telegramUserId) {
    await logDenied(p.userId, proposalId, telegramUserId);
    return { kind: "not-yours" };
  }
  if (DECIDABLE.includes(p.state) && p.expiresAt && p.expiresAt <= new Date()) return expire(proposalId);

  // Resolve what this approval applies to.
  const candidates = (p.candidates as Candidate[] | null) ?? null;
  let kind = p.kind;
  let applicationId = p.applicationId;
  let fromStatus = p.fromStatus;
  if (candidates?.length && !p.applicationId) {
    if (choice === undefined) return { kind: "needs-choice" };
    if (choice === "new") {
      kind = "CREATE_APPLICATION";
    } else {
      const picked = candidates[choice];
      if (!picked) return { kind: "needs-choice" };
      // The status printed on the button is what the owner approved a change from.
      applicationId = picked.applicationId;
      fromStatus = picked.status;
    }
  }

  const actorRef = `tg:${telegramUserId}`;
  try {
    await db.$transaction(async (tx) => {
      const now = new Date();
      // Claim: only one tap can move it out of PENDING/FAILED (double taps, two devices).
      const claimed = await tx.statusProposal.updateMany({
        // No expiry yet: a review card back in the queue, tapped on an older copy of it.
        where: { id: proposalId, state: { in: DECIDABLE }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        data: {
          state: "EXECUTED",
          decidedByTelegramUserId: telegramUserId,
          decidedAt: now,
          executedAt: now,
          failureReason: null,
          kind, // "It's a new application" on a which-application card executes as a create
          ...(kind === "UPDATE_STATUS" ? { applicationId, fromStatus } : {}),
        },
      });
      if (claimed.count === 0) throw new AlreadyDecided();

      if (kind === "UPDATE_STATUS") {
        // Optimistic check: apply only if the application is still in the status the approver saw.
        const updated = await tx.jobApplication.updateMany({
          where: { id: applicationId!, status: fromStatus! },
          data: { status: p.toStatus, statusChangedAt: now, lastEmailAt: p.email.receivedAt },
        });
        if (updated.count === 0) throw new Stale();
        if (p.jobRef) await saveJobRef(tx, applicationId!, p.userId, p.company, p.jobRef);
      } else {
        try {
          const created = await tx.jobApplication.create({
            data: {
              userId: p.userId,
              company: p.company,
              companyDomain: companyDomainFor(senderDomain(p.email.fromAddress)),
              roleTitle: p.roleTitle,
              jobRef: p.jobRef,
              dedupeKey: dedupeKey(p.company, p.roleTitle, p.jobRef),
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
          payload: { kind, from: fromStatus, to: p.toStatus, ...(choice !== undefined ? { choice } : {}) },
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
      // Keep the chosen application on the proposal so the card can show what it is now.
      await settle(proposalId, "STALE", telegramUserId, null, kind === "UPDATE_STATUS" ? { applicationId, fromStatus } : {});
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

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Records a job ID learned from an email on an application that didn't have one, unless another
 * application already uses that ID (then the email's ID stays only on the proposal).
 */
async function saveJobRef(tx: Tx, applicationId: string, userId: string, company: string, jobRef: string) {
  const key = dedupeKey(company, "", jobRef);
  const taken = await tx.jobApplication.findFirst({ where: { userId, dedupeKey: key, NOT: { id: applicationId } }, select: { id: true } });
  if (taken) return;
  await tx.jobApplication.updateMany({ where: { id: applicationId, jobRef: null }, data: { jobRef, dedupeKey: key } });
}

async function expire(proposalId: string): Promise<Decision> {
  await db.statusProposal.updateMany({ where: { id: proposalId, state: { in: DECIDABLE } }, data: { state: "EXPIRED" } });
  return { kind: "expired" };
}

/** Moves a still-open proposal to a final state; false if someone else already decided it. */
async function settle(
  proposalId: string,
  state: ProposalState,
  telegramUserId: bigint,
  failureReason: string | null,
  extra: { applicationId?: string | null; fromStatus?: ApplicationStatus | null } = {},
) {
  const { count } = await db.statusProposal.updateMany({
    where: { id: proposalId, state: { in: DECIDABLE } },
    data: { state, decidedByTelegramUserId: telegramUserId, decidedAt: new Date(), failureReason, ...extra },
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
