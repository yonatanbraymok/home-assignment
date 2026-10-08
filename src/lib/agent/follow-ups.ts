// Recommendations from the data alone, no AI: applications still waiting for a first reply after
// long enough that a short follow-up is worth considering. Shared by /status (and anything else
// that wants to suggest a next step), so the threshold lives in one place.

export const FOLLOW_UP_AFTER_DAYS = 14;
const MAX_SHOWN = 5;

export type FollowUpCandidate = { company: string; roleTitle: string; jobRef: string | null; lastEmailAt: Date | null; createdAt: Date };
export type FollowUp = { company: string; roleTitle: string; jobRef: string | null; quietDays: number };

/** Applications waiting for a reply with no email for FOLLOW_UP_AFTER_DAYS or more, quietest first. */
export function followUps(waitingForReply: FollowUpCandidate[], now: Date): { shown: FollowUp[]; total: number } {
  const all = waitingForReply
    .map((a) => ({ company: a.company, roleTitle: a.roleTitle, jobRef: a.jobRef, quietDays: Math.floor((now.getTime() - (a.lastEmailAt ?? a.createdAt).getTime()) / 86_400_000) }))
    .filter((a) => a.quietDays >= FOLLOW_UP_AFTER_DAYS)
    .sort((a, b) => b.quietDays - a.quietDays);
  return { shown: all.slice(0, MAX_SHOWN), total: all.length };
}
