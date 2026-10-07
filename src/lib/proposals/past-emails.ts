import type { ApplicationStatus } from "@/generated/prisma/enums";

// The first sync reads up to 60 days of past email at once, and a card per email floods the chat.
// So proposals from emails received before Gmail was connected are held: one summary once all of
// them are read, then one card at a time (review.ts). Approval doesn't change: every card still
// needs its own tap (there is no "approve all").

export const START_REVIEW_DATA = "rv:start";

type BackfillState = { gmailConnectedAt: Date | null; backfillDoneAt: Date | null };

/** An email from before Gmail was connected, read while that backfill is still running. */
export function isPastEmail(user: BackfillState, receivedAt: Date): boolean {
  return !user.backfillDoneAt && user.gmailConnectedAt !== null && receivedAt < user.gmailConnectedAt;
}

export type ReviewSummary = { total: number; companies: number; byStatus: Partial<Record<ApplicationStatus, number>> };

export function summarize(held: { company: string; toStatus: ApplicationStatus }[]): ReviewSummary {
  const byStatus: ReviewSummary["byStatus"] = {};
  for (const h of held) byStatus[h.toStatus] = (byStatus[h.toStatus] ?? 0) + 1;
  return { total: held.length, companies: new Set(held.map((h) => h.company.trim().toLowerCase())).size, byStatus };
}
