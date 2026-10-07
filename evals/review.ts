// Eval: the first sync doesn't flood the chat. Proposals from past emails are held (no card sent),
// a confirmation followed by a rejection becomes one card, the summary waits until every past email
// is read and is sent once, cards come one at a time grouped by company, "Later" moves a card to
// the end, a decision brings the next card, and live email still gets its card at once.
// Runs against the configured database with a throwaway user (Telegram sends to its fake chat
// fail and are logged). Run: npm run eval:review

import assert from "node:assert/strict";
import { db } from "@/lib/db";
import type { Classification } from "@/lib/agent/classify";
import { approveProposal } from "@/lib/proposals/decide";
import { proposeFromEmail } from "@/lib/proposals/create";
import { isPastEmail } from "@/lib/proposals/past-emails";
import { continueReview, deferReviewCard, finishBackfill, showNextReviewCard } from "@/lib/proposals/review";

const OWNER = BigInt(7_000_000_301), STRANGER = BigInt(7_000_000_302);
const DAY = 86_400_000;

async function main() {
  await db.user.deleteMany({ where: { telegramUserId: OWNER } });
  const connectedAt = new Date(Date.now() - 60_000);
  const user = await db.user.create({
    data: { telegramUserId: OWNER, telegramChatId: OWNER, displayName: "Review eval", gmailConnectedAt: connectedAt, gmailLastSyncAt: new Date() },
  });
  const mkEmail = (id: string, receivedAt: Date, state: "NEW" | "CLASSIFIED" = "CLASSIFIED") =>
    db.emailMessage.create({
      data: { userId: user.id, gmailMessageId: id, gmailThreadId: id, fromAddress: "jobs@example.com", subject: "s", receivedAt, snippet: "", state },
    });
  const cls = (category: Classification["category"], company: string, roleTitle: string): Classification => ({
    category, company, roleTitle, jobRef: null, evidenceQuote: "q", reasoning: "r", confidence: "HIGH",
  });
  const propose = async (email: { id: string; receivedAt: Date }, c: Classification) =>
    proposeFromEmail({
      userId: user.id, email, classification: c, match: { kind: "none", warnings: [] }, wordingSupportsCategory: true,
      holdForReview: isPastEmail(await db.user.findUniqueOrThrow({ where: { id: user.id } }), email.receivedAt),
    });
  const proposal = (id: string) => db.statusProposal.findUniqueOrThrow({ where: { id } });

  // 1. Past emails are held; a confirmation then a rejection for the same role is one card; live mail is sent.
  const wixConf = await propose(await mkEmail("wix-conf", new Date(Date.now() - 10 * DAY)), cls("APPLICATION_RECEIVED", "Wix", "Backend Student"));
  const amazon = await propose(await mkEmail("amazon", new Date(Date.now() - 8 * DAY)), cls("APPLICATION_RECEIVED", "Amazon", "SDE Intern"));
  const wixRej = await propose(await mkEmail("wix-rej", new Date(Date.now() - 5 * DAY)), cls("REJECTION", "Wix", "Backend Student"));
  const live = await propose(await mkEmail("monday", new Date()), cls("INTERVIEW_INVITE", "Monday.com", "Full Stack Intern"));
  assert.ok(wixConf.proposalId && amazon.proposalId && wixRej.proposalId && live.proposalId);
  assert.deepEqual([wixConf.held, amazon.held, wixRej.held, live.held], [true, true, true, false]);
  assert.equal((await proposal(wixConf.proposalId)).state, "SUPERSEDED");
  for (const id of [amazon.proposalId, wixRej.proposalId]) {
    const p = await proposal(id);
    assert.equal(p.expiresAt, null);
    assert.equal(p.telegramMessageId, null); // no card was sent
  }
  assert.ok((await proposal(live.proposalId)).expiresAt);
  console.log("✔ past emails held without cards, Wix confirmation + rejection collapsed into one, live email not held");

  // 2. No summary and no review while a past email is still unread; then exactly one summary.
  const unread = await mkEmail("still-unread", new Date(Date.now() - 3 * DAY), "NEW");
  assert.equal(await finishBackfill(user.id), null);
  assert.equal((await showNextReviewCard(user.id)).kind, "reading");
  await db.emailMessage.update({ where: { id: unread.id }, data: { state: "CLASSIFIED" } });
  assert.deepEqual(await finishBackfill(user.id), { total: 2, companies: 2, byStatus: { APPLIED: 1, REJECTED: 1 } });
  assert.equal(await finishBackfill(user.id), null);
  assert.equal(isPastEmail(await db.user.findUniqueOrThrow({ where: { id: user.id } }), new Date(Date.now() - DAY)), false);
  console.log("✔ summary waits for the last past email, is sent once, and later stragglers aren't held");

  // 3. One card at a time, grouped by company; its 7 days start when shown.
  const first = await showNextReviewCard(user.id);
  assert.deepEqual(first, { kind: "shown", proposalId: amazon.proposalId });
  const expires = (await proposal(amazon.proposalId)).expiresAt!;
  assert.ok(Math.abs(expires.getTime() - (Date.now() + 7 * DAY)) < 60_000);
  assert.deepEqual(await showNextReviewCard(user.id), { kind: "open", proposalId: amazon.proposalId });
  console.log("✔ Amazon shown first, a second request doesn't show another card, expiry counted from now");

  // 4. Later: only the owner; the card goes back to the queue (no expiry) and the next one is shown.
  assert.equal((await deferReviewCard(amazon.proposalId, STRANGER)).result, "not-yours");
  assert.equal((await deferReviewCard(live.proposalId, OWNER)).result, "not-open");
  assert.equal((await deferReviewCard(amazon.proposalId, OWNER)).result, "deferred");
  assert.equal((await proposal(amazon.proposalId)).expiresAt, null);
  assert.deepEqual(await showNextReviewCard(user.id), { kind: "shown", proposalId: wixRej.proposalId });
  console.log("✔ Later: stranger refused, live card refused, Amazon back in the queue, Wix shown");

  // 5. An older copy of a queued card can still be approved by its owner.
  assert.equal((await approveProposal(amazon.proposalId, OWNER)).kind, "executed");
  assert.equal((await deferReviewCard(wixRej.proposalId, OWNER)).result, "last");
  console.log("✔ approving a queued card works; Later on the last card is refused");

  // 6. Deciding the last card ends the review; the decisions wrote exactly what was approved.
  assert.equal((await approveProposal(wixRej.proposalId, OWNER)).kind, "executed");
  assert.deepEqual(await continueReview(wixRej.proposalId), { kind: "done" });
  assert.equal(await continueReview(live.proposalId), null); // a live card's decision doesn't touch the review
  const apps = await db.jobApplication.findMany({ where: { userId: user.id }, select: { company: true, status: true }, orderBy: { company: "asc" } });
  assert.deepEqual(apps, [{ company: "Amazon", status: "APPLIED" }, { company: "Wix", status: "REJECTED" }]);
  console.log("✔ review done; tracker has Amazon (Applied) and Wix (Rejected), the live Monday.com card is still waiting");

  console.log("\n6/6 passed");
}

main()
  .catch((e) => {
    console.error("EVAL FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.actionLog.deleteMany({ where: { user: { telegramUserId: OWNER } } });
    await db.user.deleteMany({ where: { telegramUserId: OWNER } });
    await db.$disconnect();
  });
