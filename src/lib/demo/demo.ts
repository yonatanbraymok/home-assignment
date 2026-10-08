import { db } from "@/lib/db";
import { DEMO_MESSAGE_PREFIX } from "@/lib/gmail/links";
import type { ParsedEmail } from "@/lib/gmail/parse";
import { prefilter } from "@/lib/gmail/prefilter";
import { LIVE_DEMO_EMAILS, LIVE_DEMO_ID_PREFIX, liveDemoEmail, pastDemoEmails } from "./samples";

// /demo: a sample inbox in the reviewer's own account, for accounts without Gmail. The emails are
// stored as if a sync had fetched them, so the real agent reads them (real AI, real cards, real
// approvals) and the dashboard and MCP tools work on the result. Their ids start with "demo:",
// which is what /demo_reset deletes and what turns off the "Open in Gmail" links.

export type StartDemoResult = { kind: "started"; fetched: number; candidates: number } | { kind: "gmail-connected" } | { kind: "already" };

/** Loads the sample inbox, unless Gmail is connected (sample and real email must never mix). */
export async function startDemo(userId: string, firstName: string, now = new Date()): Promise<StartDemoResult> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { gmailRefreshTokenEnc: true, demoAt: true } });
  if (!user || user.gmailRefreshTokenEnc) return { kind: "gmail-connected" };
  if (user.demoAt) return { kind: "already" };
  // Claim, so two taps start it once. "Connected" now: the samples are the past emails of this
  // "connection", reviewed one at a time like a real first sync.
  const { count } = await db.user.updateMany({
    where: { id: userId, demoAt: null, gmailRefreshTokenEnc: null },
    data: { demoAt: now, gmailConnectedAt: now, gmailLastSyncAt: now, backfillDoneAt: null, gmailSyncError: null },
  });
  if (count === 0) return { kind: "already" };
  const rows = pastDemoEmails(firstName, now).map((e) => toRow(userId, e));
  await db.emailMessage.createMany({ data: rows, skipDuplicates: true });
  return { kind: "started", fetched: rows.length, candidates: rows.filter((r) => r.state === "NEW").length };
}

export type LiveDemoResult = { kind: "added"; number: number; total: number } | { kind: "none-left" } | { kind: "not-demo" };

/** "A new email arrives": stores the next scripted email, received now. The caller reads it. */
export async function addLiveDemoEmail(userId: string, firstName: string, now = new Date()): Promise<LiveDemoResult> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { demoAt: true } });
  if (!user?.demoAt) return { kind: "not-demo" };
  const sent = await db.emailMessage.count({ where: { userId, gmailMessageId: { startsWith: LIVE_DEMO_ID_PREFIX } } });
  const email = liveDemoEmail(sent, firstName, now);
  if (!email) return { kind: "none-left" };
  // The (user, message id) unique key makes a double tap store it once.
  await db.emailMessage.createMany({ data: [toRow(userId, email)], skipDuplicates: true });
  return { kind: "added", number: sent + 1, total: LIVE_DEMO_EMAILS };
}

export type ResetDemoResult = { emails: number; applications: number };

/**
 * Removes the samples: their emails (cards go with them), then the applications that only they
 * created, then the demo's "connection". Cost records and the audit log stay, as for any account.
 */
export async function resetDemo(userId: string): Promise<ResetDemoResult> {
  const { count: emails } = await db.emailMessage.deleteMany({ where: { userId, gmailMessageId: { startsWith: DEMO_MESSAGE_PREFIX } } });
  // An application created from an approved card keeps its emails; one with none left came from samples.
  const { count: applications } = await db.jobApplication.deleteMany({ where: { userId, source: "EMAIL", emails: { none: {} } } });
  await db.user.updateMany({
    where: { id: userId, demoAt: { not: null } },
    data: { demoAt: null, gmailConnectedAt: null, gmailLastSyncAt: null, backfillDoneAt: null },
  });
  return { emails, applications };
}

function toRow(userId: string, email: ParsedEmail) {
  const { candidate } = prefilter(email);
  return {
    userId,
    gmailMessageId: email.gmailMessageId,
    gmailThreadId: email.gmailThreadId,
    fromAddress: email.fromAddress,
    fromName: email.fromName,
    subject: email.subject,
    receivedAt: email.receivedAt,
    // Like a real sync: for mail the prefilter drops, only the sender and subject are kept.
    snippet: candidate ? email.snippet : "",
    bodyText: candidate ? email.bodyText : null,
    state: candidate ? ("NEW" as const) : ("PREFILTERED_OUT" as const),
  };
}
