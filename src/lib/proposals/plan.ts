import type { ApplicationStatus } from "@/generated/prisma/enums";
import type { MatchResult, MatchableApplication } from "@/lib/agent/match";
import { CLOSED_STATUSES, STATUS_LABEL, isExpectedTransition } from "./rules";

// What a classified email should turn into, given what it matched. Pure, so every rule is unit-tested.

export type ProposalPlan<A extends MatchableApplication = MatchableApplication> =
  | { action: "none"; reason: string }
  | { action: "update"; application: A; warnings: string[] }
  | { action: "ask"; candidates: A[]; warnings: string[] } // "Which application is this?" (+ "new")
  | { action: "create"; warnings: string[] };

const label = (a: MatchableApplication) => `${a.company} · ${a.roleTitle}${a.jobRef ? ` #${a.jobRef}` : ""} (${STATUS_LABEL[a.status]})`;

export function planProposal<A extends MatchableApplication>(toStatus: ApplicationStatus, match: MatchResult<A>): ProposalPlan<A> {
  const warnings = [...match.warnings];

  // Rule 1: a confirmation never moves an existing application. It is either about one we track
  // (same job ID, or a same-title application that hasn't had a reply yet) or about a new one.
  if (toStatus === "APPLIED") {
    if (match.kind === "matched") {
      const app = match.application;
      if (app.status === "APPLIED" || match.byJobRef) return { action: "none", reason: "confirms an application already tracked" };
      warnings.push(`You already track ${label(app)}. A confirmation after a reply counts as a new application.`);
      return { action: "create", warnings };
    }
    if (match.kind === "ambiguous") {
      if (match.candidates.some((c) => c.status === "APPLIED")) return { action: "none", reason: "confirms one of the applications already tracked" };
      warnings.push(`You already track ${match.candidates.map(label).join(", ")}. A confirmation after a reply counts as a new application.`);
      return { action: "create", warnings };
    }
    return { action: "create", warnings };
  }

  if (match.kind === "matched") {
    const app = match.application;
    if (app.status === toStatus) return { action: "none", reason: `already ${toStatus}` };
    // Rule 2: a closed application doesn't silently reopen. Unless a job ID proves it's the same
    // job, ask whether the email is about it or about a new application.
    if (CLOSED_STATUSES.includes(app.status) && !match.byJobRef) {
      warnings.push(`Your ${app.company} · ${app.roleTitle} application is ${STATUS_LABEL[app.status]}; this email may be about a new application.`);
      return { action: "ask", candidates: [app], warnings };
    }
    if (!isExpectedTransition(app.status, toStatus)) warnings.push(`Unusual change: ${STATUS_LABEL[app.status]} → ${STATUS_LABEL[toStatus]}`);
    return { action: "update", application: app, warnings };
  }

  if (match.kind === "ambiguous") {
    const candidates = match.candidates.filter((c) => c.status !== toStatus);
    if (!candidates.length) return { action: "none", reason: `every candidate is already ${toStatus}` };
    return { action: "ask", candidates, warnings };
  }

  return { action: "create", warnings };
}
