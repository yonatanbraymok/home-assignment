import type { gmail_v1 } from "@googleapis/gmail";
import { db } from "@/lib/db";
import type { Prisma, User } from "@/generated/prisma/client";
import { notifyOnce } from "@/lib/telegram/notify";
import { gmailForUser, isRevokedGrant } from "./oauth";
import { parseMessage } from "./parse";
import { prefilter } from "./prefilter";

const BACKFILL_DAYS = 60;
// Re-list a little before the last sync so late-delivered mail isn't missed; duplicates are skipped by ID.
const OVERLAP_MS = 10 * 60_000;
// Upper bound on IDs listed per run. A first backfill beyond this keeps only the newest ones.
const LIST_CAP = 5000;
// Full messages are fetched in chunks of 100 until the run's deadline, at most 1,000 per run; a
// larger backfill continues on the next runs. (A fixed 100 per run made a busy inbox's first sync
// take ten runs, close to an hour, though only a few percent of it is job mail.)
const FETCH_CHUNK = 100;
const FETCH_MAX_PER_RUN = 1000;
const DEFAULT_FETCH_MS = 20_000;
const FETCH_CONCURRENCY = 10;
// Gmail search: skip what can't be an application update. Sent mail is filtered in the prefilter
// instead of here: "-in:sent" would also drop mail you send to yourself.
const BASE_QUERY = "-in:drafts -in:chats -category:promotions -category:social";

export const REVOKED_MESSAGE = "Gmail access expired or was revoked. Send /connect to reconnect.";

export class GmailAccessRevoked extends Error {}

export type SyncSummary = { fetched: number; candidates: number; skipped: number; remaining: number };

type SyncableUser = Pick<User, "id" | "gmailRefreshTokenEnc" | "gmailLastSyncAt">;

/** `deadline` (epoch ms): stop starting new chunks after it; the rest is fetched next time. */
export async function syncMailbox(user: SyncableUser, opts: { deadline?: number } = {}): Promise<SyncSummary> {
  if (!user.gmailRefreshTokenEnc) throw new Error("Gmail is not connected");
  const startedAt = new Date();
  const deadline = opts.deadline ?? startedAt.getTime() + DEFAULT_FETCH_MS;
  const since = user.gmailLastSyncAt
    ? new Date(user.gmailLastSyncAt.getTime() - OVERLAP_MS)
    : new Date(startedAt.getTime() - BACKFILL_DAYS * 86_400_000);
  const gmail = gmailForUser(user.gmailRefreshTokenEnc);

  try {
    const ids = await listMessageIds(gmail, `after:${Math.floor(since.getTime() / 1000)} ${BASE_QUERY}`);
    const known = await db.emailMessage.findMany({
      where: { userId: user.id, gmailMessageId: { in: ids } },
      select: { gmailMessageId: true },
    });
    const knownIds = new Set(known.map((k) => k.gmailMessageId));
    const fresh = ids.filter((id) => !knownIds.has(id));
    const batch = fresh.slice(0, FETCH_MAX_PER_RUN);

    const trackedDomains = (
      await db.jobApplication.findMany({
        where: { userId: user.id, companyDomain: { not: null } },
        select: { companyDomain: true },
        distinct: ["companyDomain"],
      })
    ).flatMap((a) => (a.companyDomain ? [a.companyDomain] : []));

    const rows: Prisma.EmailMessageCreateManyInput[] = [];
    let done = 0;
    while (done < batch.length && (done === 0 || Date.now() < deadline)) {
      const chunk = batch.slice(done, done + FETCH_CHUNK);
      const messages = await mapLimit(chunk, FETCH_CONCURRENCY, (id) => fetchMessage(gmail, id));
      const chunkRows = messages.flatMap((msg) => {
        if (!msg) return [];
        const email = parseMessage(msg);
        const { candidate } = prefilter(email, trackedDomains);
        return [
          {
            userId: user.id,
            gmailMessageId: email.gmailMessageId,
            gmailThreadId: email.gmailThreadId,
            fromAddress: email.fromAddress,
            fromName: email.fromName,
            subject: email.subject,
            receivedAt: email.receivedAt,
            // For mail that isn't job-related we keep only sender + subject (to dedupe and to audit
            // the prefilter), never its content.
            snippet: candidate ? email.snippet : "",
            bodyText: candidate ? email.bodyText : null,
            state: candidate ? ("NEW" as const) : ("PREFILTERED_OUT" as const),
          },
        ];
      });
      // Saved chunk by chunk, so a run cut short keeps what it fetched.
      await db.emailMessage.createMany({ data: chunkRows, skipDuplicates: true });
      rows.push(...chunkRows);
      done += chunk.length;
    }

    const remaining = fresh.length - done;
    await db.user.update({
      where: { id: user.id },
      // Only move the sync window forward once everything listed has been fetched.
      data: { gmailSyncError: null, ...(remaining === 0 ? { gmailLastSyncAt: startedAt } : {}) },
    });
    const candidates = rows.filter((r) => r.state === "NEW").length;
    return { fetched: rows.length, candidates, skipped: rows.length - candidates, remaining };
  } catch (err) {
    if (isRevokedGrant(err)) {
      await db.user.update({ where: { id: user.id }, data: { gmailSyncError: REVOKED_MESSAGE } });
      throw new GmailAccessRevoked(REVOKED_MESSAGE);
    }
    throw err;
  }
}

export type MailboxRunResult = { userId: string } & ({ ok: true; summary: SyncSummary } | { ok: false; error: string });

/** Cron entry point: syncs every connected mailbox, least recently synced first, within a time budget. */
export async function syncAllMailboxes(budgetMs: number): Promise<MailboxRunResult[]> {
  const deadline = Date.now() + budgetMs;
  const users = await db.user.findMany({
    where: { gmailRefreshTokenEnc: { not: null } },
    orderBy: { gmailLastSyncAt: { sort: "asc", nulls: "first" } },
    select: { id: true, gmailRefreshTokenEnc: true, gmailLastSyncAt: true, telegramChatId: true },
  });

  const results: MailboxRunResult[] = [];
  for (const user of users) {
    if (Date.now() > deadline) break; // the rest go first on the next run
    try {
      results.push({ userId: user.id, ok: true, summary: await syncMailbox(user, { deadline }) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      // Only the known, user-facing reason goes into the response; details stay in the log.
      results.push({ userId: user.id, ok: false, error: err instanceof GmailAccessRevoked ? error : "sync failed (see server log)" });
      if (err instanceof GmailAccessRevoked) {
        await notifyOnce({
          userId: user.id,
          telegramChatId: user.telegramChatId,
          dedupeKey: `gmail-revoked:${user.id}:${new Date().toISOString().slice(0, 10)}`,
          action: "GMAIL_SYNC_FAILED",
          actor: "SYSTEM",
          text: REVOKED_MESSAGE,
        }).catch((e) => console.error("revoked notice failed:", e instanceof Error ? e.message : e));
      } else {
        console.error(`sync failed for user ${user.id}:`, error);
      }
    }
  }
  return results;
}

async function listMessageIds(gmail: gmail_v1.Gmail, q: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await gmail.users.messages.list({ userId: "me", q, maxResults: 500, pageToken });
    for (const m of data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < LIST_CAP);
  return ids.slice(0, LIST_CAP);
}

async function fetchMessage(gmail: gmail_v1.Gmail, id: string): Promise<gmail_v1.Schema$Message | null> {
  try {
    return (await gmail.users.messages.get({ userId: "me", id, format: "full" })).data;
  } catch (err) {
    // Deleted between list and get: nothing to store.
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
