import type { EmailState } from "@/generated/prisma/enums";

// One definition of the email queue, shared by analysis, the past-email review and /sync.
// DEFERRED_BUDGET is legacy: the budget no longer changes an email's state, but old rows may have it.

export const MAX_ATTEMPTS = 3;

/** States an analysis run may claim (plus a stale ANALYZING claim, see analyze.ts). */
export const CLAIMABLE = ["NEW", "FAILED", "DEFERRED_BUDGET"] as const satisfies readonly EmailState[];

/** Emails the agent hasn't read yet: they hold back the past-email review and count as queued. */
export const NOT_YET_READ = ["NEW", "ANALYZING", "DEFERRED_BUDGET"] as const satisfies readonly EmailState[];
