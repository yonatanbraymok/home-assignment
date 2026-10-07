import { db } from "@/lib/db";
import type { ApplicationStatus, Confidence } from "@/generated/prisma/enums";
import type { Classification } from "@/lib/agent/classify";
import { dedupeKey, type MatchResult, type MatchableApplication } from "@/lib/agent/match";
import { quietly, refreshCard, sendCard } from "./cards-io";
import { CATEGORY_TO_STATUS, PROPOSAL_TTL_MS, STATUS_LABEL, capConfidence, isExpectedTransition } from "./rules";

export type ProposeOutcome = { proposalId: string } | { proposalId: null; reason: string };

/**
 * Turns a verified classification into a PENDING proposal and sends its card.
 * Writes only proposals: the application itself changes only when the owner approves.
 */
export async function proposeFromEmail(input: {
  userId: string;
  email: { id: string; receivedAt: Date };
  classification: Classification;
  match: MatchResult<MatchableApplication>;
  wordingSupportsCategory: boolean;
}): Promise<ProposeOutcome> {
  const { userId, email, classification: c, match } = input;
  const toStatus = CATEGORY_TO_STATUS[c.category];
  if (!toStatus) return { proposalId: null, reason: "no status change implied" };

  const warnings = [...match.warnings];
  let cap: Confidence = "HIGH";
  if (match.kind === "matched" && match.strength === "weak") cap = "MEDIUM";
  if (!input.wordingSupportsCategory) {
    cap = "LOW";
    warnings.push(`The email doesn't use typical "${STATUS_LABEL[toStatus]}" wording; check it yourself`);
  }
  const confidence = capConfidence(c.confidence, cap);
  const base = {
    userId,
    emailId: email.id,
    toStatus,
    reasoning: c.reasoning,
    evidenceQuote: c.evidenceQuote,
    confidence,
    expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
  };

  if (match.kind === "matched") {
    const app = match.application;
    if (app.status === toStatus) return { proposalId: null, reason: `already ${toStatus}` };
    if (!isExpectedTransition(app.status, toStatus)) {
      warnings.push(`Unusual change: ${STATUS_LABEL[app.status]} → ${STATUS_LABEL[toStatus]}`);
    }
    return createReplacingOlder(
      { applicationId: app.id },
      email.receivedAt,
      { ...base, kind: "UPDATE_STATUS", applicationId: app.id, fromStatus: app.status, company: app.company, roleTitle: app.roleTitle, warnings },
    );
  }

  if (!c.company) return { proposalId: null, reason: "no company named in the email" };
  const roleTitle = c.roleTitle ?? "Role not stated";
  if (!c.roleTitle) warnings.push("The email doesn't name the role");
  return createReplacingOlder(
    { kind: "CREATE_APPLICATION", dedupeKey: dedupeKey(c.company, roleTitle) },
    email.receivedAt,
    { ...base, kind: "CREATE_APPLICATION", applicationId: null, fromStatus: null, company: c.company, roleTitle, warnings },
  );
}

type NewProposal = {
  userId: string;
  emailId: string;
  kind: "UPDATE_STATUS" | "CREATE_APPLICATION";
  applicationId: string | null;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  company: string;
  roleTitle: string;
  reasoning: string;
  evidenceQuote: string;
  confidence: Confidence;
  warnings: string[];
  expiresAt: Date;
};

/**
 * At most one PENDING proposal per application (also enforced by a partial unique index).
 * A newer email replaces an older pending proposal; an older email never replaces a newer one.
 */
async function createReplacingOlder(
  target: { applicationId: string } | { kind: "CREATE_APPLICATION"; dedupeKey: string },
  emailReceivedAt: Date,
  data: NewProposal,
): Promise<ProposeOutcome> {
  const outcome = await db.$transaction(async (tx) => {
    const pending = await tx.statusProposal.findMany({
      where: {
        userId: data.userId,
        state: "PENDING",
        ...("applicationId" in target ? { applicationId: target.applicationId } : { kind: "CREATE_APPLICATION" }),
      },
      select: { id: true, company: true, roleTitle: true, email: { select: { receivedAt: true } } },
    });
    const sameTarget = "applicationId" in target ? pending : pending.filter((p) => dedupeKey(p.company, p.roleTitle) === target.dedupeKey);

    if (sameTarget.some((p) => p.email.receivedAt > emailReceivedAt)) {
      return { proposalId: null, reason: "a newer email already has a pending proposal", superseded: [] as string[] };
    }
    const superseded = sameTarget.map((p) => p.id);
    if (superseded.length) {
      await tx.statusProposal.updateMany({ where: { id: { in: superseded }, state: "PENDING" }, data: { state: "SUPERSEDED" } });
    }
    const created = await tx.statusProposal.create({ data, select: { id: true } });
    await tx.actionLog.createMany({
      data: [
        ...superseded.map((id) => ({ userId: data.userId, actor: "AGENT" as const, action: "PROPOSAL_SUPERSEDED" as const, proposalId: id, payload: { by: created.id } })),
        {
          userId: data.userId,
          actor: "AGENT" as const,
          action: "PROPOSAL_CREATED" as const,
          proposalId: created.id,
          applicationId: data.applicationId,
          payload: { kind: data.kind, from: data.fromStatus, to: data.toStatus, confidence: data.confidence },
        },
      ],
    });
    return { proposalId: created.id, superseded };
  });

  if (outcome.proposalId === null) return { proposalId: null, reason: outcome.reason };
  for (const id of outcome.superseded) await quietly("refresh superseded card", refreshCard(id));
  // If Telegram is down the proposal still exists; /pending re-sends it.
  await quietly("send proposal card", sendCard(outcome.proposalId));
  return { proposalId: outcome.proposalId };
}
