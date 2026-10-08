import { Prisma } from "@/generated/prisma/client";
import { ApplicationStatus } from "@/generated/prisma/enums";
import { TX_OPTIONS, db } from "@/lib/db";

// The owner corrects a status by hand, from the dashboard: for when the agent missed an email, or
// the email never came. The owner is the human in the loop here, so no card is needed; the change is
// still checked and recorded. Cards waiting in Telegram for this application no longer apply after
// it: approving one finds the status changed and says so.

export type EditResult =
  | { kind: "saved" }
  | { kind: "unchanged" }
  | { kind: "changed-meanwhile" } // the status isn't what the page showed any more
  | { kind: "duplicate" } // another same-title application is already waiting for a reply
  | { kind: "not-found" };

const STATUSES = Object.values(ApplicationStatus) as ApplicationStatus[];

export function isStatus(value: unknown): value is ApplicationStatus {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}

export async function editApplicationStatus(userId: string, applicationId: string, expected: ApplicationStatus, next: ApplicationStatus): Promise<EditResult> {
  if (expected === next) return { kind: "unchanged" };
  try {
    return await db.$transaction(async (tx) => {
      // Only from the status the owner saw: two tabs, or a card approved meanwhile, can't be overwritten.
      const { count } = await tx.jobApplication.updateMany({
        where: { id: applicationId, userId, status: expected },
        data: { status: next, statusChangedAt: new Date() },
      });
      if (count === 0) {
        const exists = await tx.jobApplication.count({ where: { id: applicationId, userId } });
        return { kind: exists ? "changed-meanwhile" : "not-found" } as const;
      }
      await tx.actionLog.create({
        data: { userId, actor: "USER", actorRef: "dashboard", action: "APPLICATION_EDITED", applicationId, payload: { field: "status", from: expected, to: next } },
      });
      return { kind: "saved" } as const;
    }, TX_OPTIONS);
  } catch (err) {
    // Only one same-title application may wait for a first reply (A13).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { kind: "duplicate" };
    throw err;
  }
}

/** The owner's own status changes, for the application's timeline. */
export async function statusEditsFor(userId: string, applicationId: string) {
  const rows = await db.actionLog.findMany({
    where: { userId, applicationId, action: "APPLICATION_EDITED" },
    orderBy: { id: "asc" },
    select: { id: true, createdAt: true, payload: true },
  });
  return rows.flatMap((r) => {
    const p = r.payload as { from?: unknown; to?: unknown } | null;
    return isStatus(p?.from) && isStatus(p?.to) ? [{ id: String(r.id), at: r.createdAt, from: p.from, to: p.to }] : [];
  });
}
