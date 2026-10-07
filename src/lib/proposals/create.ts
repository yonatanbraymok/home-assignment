import { db } from "@/lib/db";
import type { ApplicationStatus, Confidence } from "@/generated/prisma/enums";
import type { Classification } from "@/lib/agent/classify";
import { dedupeKey, type MatchResult, type MatchableApplication } from "@/lib/agent/match";
import { quietly, refreshCard, sendCard } from "./cards-io";
import { CATEGORY_TO_STATUS, PROPOSAL_TTL_MS, STATUS_LABEL, capConfidence, isExpectedTransition } from "./rules";

export type ProposeOutcome = { proposalId: string } | { proposalId: null; reason: string };

/** One choice on a "which application is this?" card. */
export type Candidate = { applicationId: string; label: string; status: ApplicationStatus };

const MAX_CANDIDATES = 5;

/**
 * Turns a verified classification into a PENDING proposal and sends its card.
 * Writes only proposals: the application itself changes only when the owner approves.
 */
export async function proposeFromEmail(input: {
  userId: string;
  email: { id: string; receivedAt: Date };
  classification: Classification; // jobRef already verified (null if it wasn't in the email)
  match: MatchResult<MatchableApplication>;
  wordingSupportsCategory: boolean;
  extraWarnings?: string[];
}): Promise<ProposeOutcome> {
  const { userId, email, classification: c, match } = input;
  const toStatus = CATEGORY_TO_STATUS[c.category];
  if (!toStatus) return { proposalId: null, reason: "no status change implied" };

  const warnings = [...(input.extraWarnings ?? []), ...match.warnings];
  let cap: Confidence = "HIGH";
  if (match.kind !== "matched" || match.strength === "weak") cap = "MEDIUM";
  if (!input.wordingSupportsCategory) {
    cap = "LOW";
    warnings.push(`The email doesn't use typical "${STATUS_LABEL[toStatus]}" wording; check it yourself`);
  }
  const base = {
    userId,
    emailId: email.id,
    toStatus,
    jobRef: c.jobRef,
    reasoning: c.reasoning,
    evidenceQuote: c.evidenceQuote,
    confidence: capConfidence(c.confidence, cap),
    expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
  };

  if (match.kind === "matched") {
    const app = match.application;
    if (app.status === toStatus) return { proposalId: null, reason: `already ${toStatus}` };
    if (!isExpectedTransition(app.status, toStatus)) {
      warnings.push(`Unusual change: ${STATUS_LABEL[app.status]} → ${STATUS_LABEL[toStatus]}`);
    }
    return createReplacingOlder({ applicationId: app.id }, email.receivedAt, {
      ...base,
      kind: "UPDATE_STATUS",
      applicationId: app.id,
      fromStatus: app.status,
      company: app.company,
      roleTitle: app.roleTitle,
      warnings,
    });
  }

  if (match.kind === "ambiguous") {
    // Only applications this email would actually change; whichever it is, the user decides.
    const options = match.candidates.filter((a) => a.status !== toStatus).slice(0, MAX_CANDIDATES);
    if (!options.length) return { proposalId: null, reason: `every candidate is already ${toStatus}` };
    const candidates: Candidate[] = options.map((a) => ({
      applicationId: a.id,
      label: `${a.roleTitle}${a.jobRef ? ` #${a.jobRef}` : ""} (${STATUS_LABEL[a.status]})`,
      status: a.status,
    }));
    return createProposal({
      ...base,
      kind: "UPDATE_STATUS",
      applicationId: null,
      fromStatus: null,
      company: options[0].company,
      roleTitle: c.roleTitle ?? "Role not stated",
      candidates,
      warnings,
    });
  }

  if (!c.company) return { proposalId: null, reason: "no company named in the email" };
  const roleTitle = c.roleTitle ?? "Role not stated";
  if (!c.roleTitle) warnings.push("The email doesn't name the role");
  return createReplacingOlder(
    { kind: "CREATE_APPLICATION", dedupeKey: dedupeKey(c.company, roleTitle, c.jobRef) },
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
  jobRef: string | null;
  candidates?: Candidate[];
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
      select: { id: true, company: true, roleTitle: true, jobRef: true, email: { select: { receivedAt: true } } },
    });
    const sameTarget =
      "applicationId" in target ? pending : pending.filter((p) => dedupeKey(p.company, p.roleTitle, p.jobRef) === target.dedupeKey);

    if (sameTarget.some((p) => p.email.receivedAt > emailReceivedAt)) {
      return { proposalId: null, reason: "a newer email already has a pending proposal", superseded: [] as string[] };
    }
    const superseded = sameTarget.map((p) => p.id);
    if (superseded.length) {
      await tx.statusProposal.updateMany({ where: { id: { in: superseded }, state: "PENDING" }, data: { state: "SUPERSEDED" } });
      await tx.actionLog.createMany({
        data: superseded.map((id) => ({ userId: data.userId, actor: "AGENT" as const, action: "PROPOSAL_SUPERSEDED" as const, proposalId: id })),
      });
    }
    return { proposalId: await insertProposal(tx, data), superseded };
  });

  if (outcome.proposalId === null) return { proposalId: null, reason: outcome.reason };
  for (const id of outcome.superseded) await quietly("refresh superseded card", refreshCard(id));
  await quietly("send proposal card", sendCard(outcome.proposalId));
  return { proposalId: outcome.proposalId };
}

/** For "which application is this?" proposals: no single target, so nothing to supersede. */
async function createProposal(data: NewProposal): Promise<ProposeOutcome> {
  const proposalId = await db.$transaction((tx) => insertProposal(tx, data));
  await quietly("send proposal card", sendCard(proposalId));
  return { proposalId };
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function insertProposal(tx: Tx, data: NewProposal): Promise<string> {
  const { candidates, ...rest } = data;
  const created = await tx.statusProposal.create({ data: { ...rest, candidates: candidates ?? undefined }, select: { id: true } });
  await tx.actionLog.create({
    data: {
      userId: data.userId,
      actor: "AGENT",
      action: "PROPOSAL_CREATED",
      proposalId: created.id,
      applicationId: data.applicationId,
      payload: { kind: data.kind, from: data.fromStatus, to: data.toStatus, confidence: data.confidence, ambiguous: Boolean(candidates) },
    },
  });
  // If Telegram is down the proposal still exists; /pending re-sends it.
  return created.id;
}
