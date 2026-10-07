import type { ApplicationStatus, Confidence, EmailCategory } from "@/generated/prisma/enums";

// Counted from when the card is shown (a card waiting in the review queue doesn't expire).
export const PROPOSAL_TTL_MS = 7 * 86_400_000;

/**
 * Cards still waiting for the owner's tap, counted the same way by /status, the chat and the
 * dashboard. A card past its 7 days can't be approved any more, even before the cron marks it.
 */
export const waitingForDecisionWhere = (userId: string, now: Date) => ({
  userId,
  state: { in: ["PENDING" as const, "FAILED" as const] },
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

/** Review cards not shown yet: held from past emails, or moved back with "Later". */
export const reviewQueueWhere = (userId: string) => ({ userId, heldForReview: true, state: "PENDING" as const, expiresAt: null });

/** Which status an email category proposes; null means "no status change" (timeline only). */
export const CATEGORY_TO_STATUS: Record<EmailCategory, ApplicationStatus | null> = {
  APPLICATION_RECEIVED: "APPLIED",
  ASSESSMENT_INVITE: "ASSESSMENT",
  INTERVIEW_INVITE: "INTERVIEW",
  REJECTION: "REJECTED",
  OFFER: "OFFER",
  OTHER_JOB_RELATED: null,
  NOT_JOB_RELATED: null,
};

// Expected forward moves. Anything else is allowed (emails arrive out of order, roles reopen)
// but shown to the approver as a warning.
const EXPECTED: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  APPLIED: ["ASSESSMENT", "INTERVIEW", "REJECTED"],
  ASSESSMENT: ["INTERVIEW", "REJECTED"],
  INTERVIEW: ["OFFER", "REJECTED"],
};

export function isExpectedTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return EXPECTED[from]?.includes(to) ?? false;
}

const RANK: Record<Confidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export function capConfidence(value: Confidence, cap: Confidence): Confidence {
  return RANK[value] <= RANK[cap] ? value : cap;
}

/** How a status is described to the user in chat and /status. */
export const STATUS_DESCRIPTION: Record<ApplicationStatus, string> = {
  APPLIED: "waiting for a reply",
  ASSESSMENT: "online test / assignment",
  INTERVIEW: "interviewing",
  OFFER: "offer",
  REJECTED: "rejected",
  WITHDRAWN: "withdrawn",
};

export const OPEN_STATUSES: ApplicationStatus[] = ["APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER"];
export const CLOSED_STATUSES: ApplicationStatus[] = ["REJECTED", "WITHDRAWN"];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: "Applied",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};
