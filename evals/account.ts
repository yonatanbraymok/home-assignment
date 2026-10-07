// Eval: the user's data rights. /disconnect revokes and forgets Gmail but keeps the tracker;
// /delete_my_data erases every row of that user and nothing of anyone else; confirmations only
// work for their owner and expire. Runs against the configured database with throwaway users
// (deleted at the end); the revoke is a real call to Google with a fake token.
// Run: npm run eval:account

import assert from "node:assert/strict";
import { confirmationData } from "@/lib/account/confirm";
import { authorizeConfirmation, deleteAccount, disconnectGmail } from "@/lib/account/manage";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";

const A = BigInt(7_000_000_401);
const B = BigInt(7_000_000_402);

async function seed(telegramUserId: bigint, gmail: string) {
  const user = await db.user.create({
    data: { telegramUserId, telegramChatId: telegramUserId, gmailAddress: gmail, gmailRefreshTokenEnc: encrypt("1//fake-refresh-token-for-eval"), gmailLastSyncAt: new Date() },
  });
  const app = await db.jobApplication.create({ data: { userId: user.id, company: "Wix", roleTitle: "Backend Student", dedupeKey: "wix|backend student", status: "APPLIED", source: "EMAIL" } });
  const email = await db.emailMessage.create({
    data: { userId: user.id, gmailMessageId: `acct-${telegramUserId}`, gmailThreadId: "t", fromAddress: "jobs@wix.com", subject: "Thanks for applying", receivedAt: new Date(), snippet: "s", bodyText: "We received your application.", state: "CLASSIFIED", applicationId: app.id },
  });
  await db.statusProposal.create({
    data: { userId: user.id, emailId: email.id, applicationId: app.id, kind: "UPDATE_STATUS", fromStatus: "APPLIED", toStatus: "REJECTED", company: "Wix", roleTitle: "Backend Student", reasoning: "r", evidenceQuote: "q", confidence: "HIGH", warnings: [], expiresAt: new Date(Date.now() + 86_400_000) },
  });
  await db.actionLog.create({ data: { userId: user.id, actor: "AGENT", action: "CHAT_ANSWERED", payload: { question: "private question", answer: "private answer" } } });
  const usage = await db.llmUsage.create({ data: { userId: user.id, purpose: "EVAL", model: "gemini-3.5-flash-lite", inputTokens: 1, outputTokens: 1, costUsd: 0 } });
  return { user, usageId: usage.id };
}

const rowsOf = async (userId: string) => ({
  applications: await db.jobApplication.count({ where: { userId } }),
  emails: await db.emailMessage.count({ where: { userId } }),
  proposals: await db.statusProposal.count({ where: { userId } }),
  logs: await db.actionLog.count({ where: { userId } }),
  usage: await db.llmUsage.count({ where: { userId } }),
});

async function main() {
  await db.user.deleteMany({ where: { telegramUserId: { in: [A, B] } } });
  const a = await seed(A, "eval-a@example.com");
  const b = await seed(B, "eval-b@example.com");
  const bBefore = await rowsOf(b.user.id);
  const startedAt = new Date();

  // Confirmations: only the owner, only before expiry.
  const data = confirmationData("delete", a.user.id);
  assert.equal(await authorizeConfirmation(data, B), "not-owner");
  assert.equal(await authorizeConfirmation(confirmationData("delete", a.user.id, new Date(Date.now() - 3_600_000)), A), "expired");
  assert.deepEqual(await authorizeConfirmation(data, A), { action: "delete", userId: a.user.id });
  console.log("✔ a confirmation works only for its owner and only before it expires");

  // Disconnect keeps the tracker.
  const disconnected = await disconnectGmail(a.user.id, `tg:${A}`);
  assert.equal(disconnected.status, "disconnected");
  assert.notEqual(disconnected.status === "disconnected" && disconnected.revoke, "revoked"); // fake token: Google can't revoke it
  const afterDisconnect = await db.user.findUniqueOrThrow({ where: { id: a.user.id } });
  assert.deepEqual([afterDisconnect.gmailRefreshTokenEnc, afterDisconnect.gmailAddress], [null, null]);
  const kept = await rowsOf(a.user.id);
  assert.deepEqual([kept.applications, kept.emails, kept.proposals], [1, 1, 1]);
  assert.equal(await db.actionLog.count({ where: { userId: a.user.id, action: "GMAIL_DISCONNECTED" } }), 1);
  assert.deepEqual(await disconnectGmail(a.user.id, `tg:${A}`), { status: "not-connected" });
  console.log(`✔ /disconnect: token and address gone, tracker kept (revoke result: ${disconnected.status === "disconnected" ? disconnected.revoke : "-"})`);

  // Delete erases everything of A, keeps cost rows anonymously, and doesn't touch B.
  const deleted = await deleteAccount(a.user.id);
  assert.equal(deleted.status, "deleted");
  assert.deepEqual(await rowsOf(a.user.id), { applications: 0, emails: 0, proposals: 0, logs: 0, usage: 0 });
  assert.equal(await db.user.count({ where: { id: a.user.id } }), 0);
  const usageRow = await db.llmUsage.findUniqueOrThrow({ where: { id: a.usageId } });
  assert.equal(usageRow.userId, null);
  const record = await db.actionLog.findFirstOrThrow({ where: { action: "ACCOUNT_DELETED", createdAt: { gte: startedAt } }, orderBy: { id: "desc" } });
  assert.equal(record.userId, null);
  assert.doesNotMatch(JSON.stringify(record.payload), /eval-a|private|Wix/);
  assert.deepEqual(await rowsOf(b.user.id), bBefore);
  assert.deepEqual(await deleteAccount(a.user.id), { status: "not-found" });
  console.log("✔ /delete_my_data: every row of A gone, cost row kept without a user, anonymous record written, B untouched");

  await db.actionLog.delete({ where: { id: record.id } });
  await db.llmUsage.delete({ where: { id: a.usageId } });
}

main()
  .catch((e) => {
    console.error("EVAL FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.actionLog.deleteMany({ where: { user: { telegramUserId: { in: [A, B] } } } });
    await db.llmUsage.deleteMany({ where: { user: { telegramUserId: { in: [A, B] } } } });
    await db.user.deleteMany({ where: { telegramUserId: { in: [A, B] } } });
    console.log("cleaned up");
    await db.$disconnect();
  });
