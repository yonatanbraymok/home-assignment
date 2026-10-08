// Eval: /demo end to end, with the real AI (about $0.01). The sample inbox is read like a real first
// sync: six review cards from five companies (two-email threads collapse, the newsletter is read and
// dropped, the job alert never reaches the AI); each simulated new email gets a live card that
// updates the right application, including "which application?" when the email can't tell; and
// /demo_reset leaves nothing behind. An account with Gmail connected can't load the samples.
// Runs against the configured database with throwaway users (Telegram sends to their fake chats
// fail and are logged). Run: npm run eval:demo

import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { analyzePendingEmails } from "@/lib/agent/analyze";
import { addLiveDemoEmail, resetDemo, startDemo } from "@/lib/demo/demo";
import { LIVE_DEMO_EMAILS } from "@/lib/demo/samples";
import { approveProposal } from "@/lib/proposals/decide";
import { continueReview, finishBackfill, showNextReviewCard } from "@/lib/proposals/review";
import type { Candidate } from "@/lib/proposals/create";

const OWNER = BigInt(7_000_000_801), CONNECTED = BigInt(7_000_000_802);

async function main() {
  await db.user.deleteMany({ where: { telegramUserId: { in: [OWNER, CONNECTED] } } });
  const user = await db.user.create({ data: { telegramUserId: OWNER, telegramChatId: OWNER, displayName: "Demo eval" } });
  const other = await db.user.create({
    data: { telegramUserId: CONNECTED, telegramChatId: CONNECTED, displayName: "Demo eval (Gmail)", gmailAddress: "demo-eval@example.com", gmailRefreshTokenEnc: "x" },
  });
  const tracker = async () =>
    (await db.jobApplication.findMany({ where: { userId: user.id }, orderBy: [{ company: "asc" }, { jobRef: "asc" }] })).map(
      (a) => `${a.company}${a.jobRef ? ` #${a.jobRef}` : ""}: ${a.status}`,
    );

  // 1. Only without Gmail, and only once.
  assert.deepEqual(await startDemo(other.id, "Eve"), { kind: "gmail-connected" });
  assert.equal(await db.emailMessage.count({ where: { userId: other.id } }), 0);
  assert.deepEqual(await startDemo(user.id, "Dana"), { kind: "started", fetched: 11, candidates: 10 });
  assert.deepEqual(await startDemo(user.id, "Dana"), { kind: "already" });
  console.log("✔ the samples load once, and never into an account with Gmail connected");

  // 2. Reading the sample inbox: the review summary waits for all of it, then six cards, five companies.
  const read = await analyzePendingEmails(user.id, 20);
  assert.equal(read.analyzed, 10, `analysis: ${JSON.stringify(read)}`);
  const summary = await finishBackfill(user.id);
  const held = await db.statusProposal.findMany({ where: { userId: user.id, state: "PENDING" }, select: { company: true, toStatus: true, jobRef: true } });
  assert.deepEqual(summary, { total: 6, companies: 5, byStatus: { APPLIED: 3, ASSESSMENT: 1, REJECTED: 1, INTERVIEW: 1 } }, JSON.stringify(held));
  const newsletter = await db.emailMessage.findFirstOrThrow({ where: { userId: user.id, gmailMessageId: "demo:p10" } });
  assert.equal(newsletter.category, "NOT_JOB_RELATED");
  console.log(`✔ read like a first sync: ${JSON.stringify(summary.byStatus)} from 5 companies; the newsletter dropped by the AI, the alert by the prefilter`);

  // 3. The review, one card at a time; approving each brings the next.
  for (let shown = 0; ; shown++) {
    assert.ok(shown <= 6, "more review cards than expected");
    const next = await showNextReviewCard(user.id);
    if (next.kind === "done") break;
    assert.ok(next.kind === "shown" || next.kind === "open");
    assert.equal((await approveProposal(next.proposalId, OWNER)).kind, "executed");
    await continueReview(next.proposalId);
  }
  assert.deepEqual(await tracker(), [
    "Aurora Pay: REJECTED",
    "Cobalt Cloud #4471: APPLIED",
    "Cobalt Cloud #4490: APPLIED",
    "Lumen Health: ASSESSMENT",
    "Northwind Robotics: APPLIED",
    "Vega Games: INTERVIEW",
  ]);
  console.log("✔ review approved card by card: six applications tracked");

  // 4. Each simulated email arrives now and gets a live card for the right application.
  const expected = [
    "Northwind Robotics: APPLIED → INTERVIEW",
    "Cobalt Cloud: APPLIED → INTERVIEW", // the job ID picks #4471 over #4490
    "Lumen Health: ASSESSMENT → REJECTED",
    "Cobalt Cloud: which application? → INTERVIEW", // no role, no job ID: the owner chooses
    "Vega Games: INTERVIEW → OFFER",
  ];
  for (let i = 0; i < LIVE_DEMO_EMAILS; i++) {
    assert.deepEqual(await addLiveDemoEmail(user.id, "Dana"), { kind: "added", number: i + 1, total: LIVE_DEMO_EMAILS });
    const s = await analyzePendingEmails(user.id, 20);
    assert.equal(s.proposals, 1, `email ${i + 1}: ${JSON.stringify(s)}`);
    const p = await db.statusProposal.findFirstOrThrow({ where: { userId: user.id, state: "PENDING" } });
    assert.equal(p.heldForReview, false);
    assert.ok(p.expiresAt);
    const candidates = (p.candidates as Candidate[] | null) ?? [];
    const from = candidates.length && !p.applicationId ? "which application?" : p.fromStatus;
    assert.equal(`${p.company}: ${from} → ${p.toStatus}`, expected[i]);
    if (i === 1) assert.equal(p.jobRef, "4471");
    // For "which application?", pick #4490, the one still waiting for a reply.
    const choice = candidates.length ? candidates.findIndex((c) => c.label.includes("4490")) : undefined;
    assert.equal((await approveProposal(p.id, OWNER, choice)).kind, "executed");
  }
  assert.deepEqual(await addLiveDemoEmail(user.id, "Dana"), { kind: "none-left" });
  assert.deepEqual(await tracker(), [
    "Aurora Pay: REJECTED",
    "Cobalt Cloud #4471: INTERVIEW",
    "Cobalt Cloud #4490: INTERVIEW",
    "Lumen Health: REJECTED",
    "Northwind Robotics: INTERVIEW",
    "Vega Games: OFFER",
  ]);
  console.log("✔ five simulated emails, five live cards, each applied to the right application");

  // 5. /demo_reset leaves nothing of the samples, and the account can start over.
  assert.deepEqual(await resetDemo(user.id), { emails: 16, applications: 6 });
  assert.equal(await db.emailMessage.count({ where: { userId: user.id } }), 0);
  assert.equal(await db.statusProposal.count({ where: { userId: user.id } }), 0);
  const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.deepEqual([after.demoAt, after.gmailConnectedAt, after.gmailLastSyncAt, after.backfillDoneAt], [null, null, null, null]);
  assert.deepEqual(await addLiveDemoEmail(user.id, "Dana"), { kind: "not-demo" });
  console.log("✔ /demo_reset removes every sample email, card and application");
}

main()
  .then(() => console.log("\n5/5 passed"))
  .catch((err) => {
    console.error("SCENARIO FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.user.deleteMany({ where: { telegramUserId: { in: [OWNER, CONNECTED] } } });
    await db.$disconnect();
    console.log("cleaned up");
  });
