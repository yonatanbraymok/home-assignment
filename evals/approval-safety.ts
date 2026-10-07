// Eval: the approval action refuses what it should refuse (stranger, double tap, stale, duplicate
// create, rejected, expired, blind approve of an ambiguous card) and proposals follow email order. Runs against the configured database
// with a throwaway user that is deleted at the end. Run: npm run eval:approval

import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { approveProposal, rejectProposal } from "@/lib/proposals/decide";
import { proposeFromEmail } from "@/lib/proposals/create";

const OWNER = BigInt(7_000_000_101), STRANGER = BigInt(7_000_000_102);
const day = 86_400_000;

async function main() {
  await db.user.deleteMany({ where: { telegramUserId: OWNER } });
  const user = await db.user.create({ data: { telegramUserId: OWNER, telegramChatId: OWNER, displayName: "Scenario" } });
  const mkEmail = (id: string, daysAgo: number) =>
    db.emailMessage.create({ data: { userId: user.id, gmailMessageId: id, gmailThreadId: id, fromAddress: "careers@microsoft.com", subject: "s", receivedAt: new Date(Date.now() - daysAgo * day), snippet: "" } });
  const app = await db.jobApplication.create({ data: { userId: user.id, company: "Microsoft", companyDomain: "microsoft.com", roleTitle: "SWE Intern", dedupeKey: "microsoft|swe intern", status: "APPLIED", source: "MANUAL" } });
  const base = { userId: user.id, company: "Microsoft", roleTitle: "SWE Intern", reasoning: "r", evidenceQuote: "q", confidence: "HIGH" as const, warnings: [], expiresAt: new Date(Date.now() + 7 * day) };

  // 1. stranger, owner, double tap
  const e1 = await mkEmail("e1", 2);
  const p1 = await db.statusProposal.create({ data: { ...base, emailId: e1.id, kind: "UPDATE_STATUS", applicationId: app.id, fromStatus: "APPLIED", toStatus: "INTERVIEW" } });
  assert.equal((await approveProposal(p1.id, STRANGER)).kind, "not-yours");
  assert.equal((await db.jobApplication.findUniqueOrThrow({ where: { id: app.id } })).status, "APPLIED");
  assert.equal((await approveProposal(p1.id, OWNER)).kind, "executed");
  assert.equal((await db.jobApplication.findUniqueOrThrow({ where: { id: app.id } })).status, "INTERVIEW");
  const again = await approveProposal(p1.id, OWNER);
  assert.deepEqual(again, { kind: "already", state: "EXECUTED" });
  console.log("✔ stranger denied, owner executed, double tap is a no-op");

  // 2. stale: proposal says APPLIED -> REJECTED but the app is INTERVIEW now
  const e2 = await mkEmail("e2", 1);
  const p2 = await db.statusProposal.create({ data: { ...base, emailId: e2.id, kind: "UPDATE_STATUS", applicationId: app.id, fromStatus: "APPLIED", toStatus: "REJECTED" } });
  assert.equal((await approveProposal(p2.id, OWNER)).kind, "stale");
  assert.equal((await db.jobApplication.findUniqueOrThrow({ where: { id: app.id } })).status, "INTERVIEW");
  assert.equal((await db.statusProposal.findUniqueOrThrow({ where: { id: p2.id } })).state, "STALE");
  console.log("✔ stale proposal not applied, application untouched");

  // 3. create twice for the same company+role: second is stale, no duplicate
  const e3 = await mkEmail("e3", 1), e4 = await mkEmail("e4", 1);
  const c = { ...base, company: "Wix", roleTitle: "Backend Student", kind: "CREATE_APPLICATION" as const, toStatus: "APPLIED" as const };
  const p3 = await db.statusProposal.create({ data: { ...c, emailId: e3.id } });
  assert.equal((await approveProposal(p3.id, OWNER)).kind, "executed");
  const p4 = await db.statusProposal.create({ data: { ...c, emailId: e4.id } });
  assert.equal((await approveProposal(p4.id, OWNER)).kind, "stale");
  assert.equal(await db.jobApplication.count({ where: { userId: user.id, dedupeKey: "wix|backend student" } }), 1);
  console.log("✔ create is idempotent: one Wix application");

  // 4. reject, and expired
  const e5 = await mkEmail("e5", 1);
  const p5 = await db.statusProposal.create({ data: { ...base, emailId: e5.id, kind: "UPDATE_STATUS", applicationId: app.id, fromStatus: "INTERVIEW", toStatus: "OFFER" } });
  assert.equal((await rejectProposal(p5.id, OWNER)).kind, "rejected");
  assert.equal((await approveProposal(p5.id, OWNER)).kind, "already");
  const e6 = await mkEmail("e6", 1);
  const p6 = await db.statusProposal.create({ data: { ...base, emailId: e6.id, kind: "UPDATE_STATUS", applicationId: app.id, fromStatus: "INTERVIEW", toStatus: "OFFER", expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await approveProposal(p6.id, OWNER)).kind, "expired");
  assert.equal((await db.jobApplication.findUniqueOrThrow({ where: { id: app.id } })).status, "INTERVIEW");
  console.log("✔ rejected stays rejected; expired can't be approved");

  // 5. supersede rules via proposeFromEmail (card sends fail quietly: fake chat)
  const appRow = await db.jobApplication.findUniqueOrThrow({ where: { id: app.id } });
  const match = { kind: "matched" as const, application: appRow, strength: "strong" as const, warnings: [] };
  const cls = (category: "REJECTION" | "OFFER") => ({ category, company: "Microsoft", roleTitle: "SWE Intern", jobRef: null, evidenceQuote: "q", reasoning: "r", confidence: "HIGH" as const });
  const newer = await mkEmail("e7", 1), older = await mkEmail("e8", 3), newest = await mkEmail("e9", 0);
  const a = await proposeFromEmail({ userId: user.id, email: newer, classification: cls("OFFER"), match, wordingSupportsCategory: true });
  const b = await proposeFromEmail({ userId: user.id, email: older, classification: cls("REJECTION"), match, wordingSupportsCategory: true });
  assert.ok(a.proposalId);
  assert.equal(b.proposalId, null);
  const c2 = await proposeFromEmail({ userId: user.id, email: newest, classification: cls("REJECTION"), match, wordingSupportsCategory: false });
  assert.ok(c2.proposalId);
  assert.equal((await db.statusProposal.findUniqueOrThrow({ where: { id: a.proposalId! } })).state, "SUPERSEDED");
  const c2row = await db.statusProposal.findUniqueOrThrow({ where: { id: c2.proposalId! } });
  assert.equal(c2row.confidence, "LOW");
  console.log("✔ newer email supersedes, older email doesn't; weak wording caps confidence at LOW:", c2row.warnings);

  // 6. "which application is this?": no blind approve, choice applies to the picked one, job ID is saved
  const az1 = await db.jobApplication.create({ data: { userId: user.id, company: "Amazon", roleTitle: "SDE Intern", dedupeKey: "amazon|sde intern a", status: "APPLIED", source: "MANUAL" } });
  const az2 = await db.jobApplication.create({ data: { userId: user.id, company: "Amazon", roleTitle: "SDE Intern", dedupeKey: "amazon|sde intern b", status: "APPLIED", source: "MANUAL" } });
  const candidates = [az1, az2].map((a) => ({ applicationId: a.id, label: a.roleTitle, status: a.status }));
  const amb = (emailId: string) =>
    db.statusProposal.create({ data: { ...base, company: "Amazon", roleTitle: "SDE Intern", emailId, kind: "UPDATE_STATUS", toStatus: "REJECTED", jobRef: "2881122", candidates } });
  const e10 = await mkEmail("e10", 1);
  const p10 = await amb(e10.id);
  assert.equal((await approveProposal(p10.id, OWNER)).kind, "needs-choice");
  assert.equal((await approveProposal(p10.id, STRANGER, 1)).kind, "not-yours");
  assert.equal((await approveProposal(p10.id, OWNER, 1)).kind, "executed");
  const [after1, after2] = await Promise.all([az1, az2].map((a) => db.jobApplication.findUniqueOrThrow({ where: { id: a.id } })));
  assert.deepEqual([after1.status, after2.status, after2.jobRef], ["APPLIED", "REJECTED", "2881122"]);
  console.log("✔ ambiguous card: approve needs a choice, the choice applies to the picked application and saves its job ID");

  const e11 = await mkEmail("e11", 1);
  const p11 = await amb(e11.id); // button says az2 is APPLIED, but it is REJECTED now
  assert.equal((await approveProposal(p11.id, OWNER, 1)).kind, "stale");
  const e12 = await mkEmail("e12", 1);
  const p12 = await db.statusProposal.create({ data: { ...base, company: "Amazon", roleTitle: "Front-End Intern", emailId: e12.id, kind: "UPDATE_STATUS", toStatus: "ASSESSMENT", jobRef: null, candidates } });
  assert.equal((await approveProposal(p12.id, OWNER, "new")).kind, "executed");
  assert.equal((await db.statusProposal.findUniqueOrThrow({ where: { id: p12.id } })).kind, "CREATE_APPLICATION");
  assert.equal(await db.jobApplication.count({ where: { userId: user.id, company: "Amazon" } }), 3);
  console.log("✔ a stale choice is refused; 'it's a new application' creates one");

  // 7. after a reply, a new confirmation is a new application (never a reopened one)
  const tn = await db.jobApplication.create({ data: { userId: user.id, company: "TechNova", roleTitle: "SWE Intern", dedupeKey: "technova|swe intern", status: "REJECTED", source: "MANUAL" } });
  const tnRows = () => db.jobApplication.findMany({ where: { userId: user.id, company: "TechNova" }, select: { id: true, company: true, companyDomain: true, roleTitle: true, jobRef: true, status: true } });
  const { matchApplication } = await import("@/lib/agent/match");
  const confirm = (category: "APPLICATION_RECEIVED" | "INTERVIEW_INVITE") => ({ category, company: "TechNova", roleTitle: "SWE Intern", jobRef: null, evidenceQuote: "q", reasoning: "r", confidence: "HIGH" as const });
  const propose = async (id: string, category: "APPLICATION_RECEIVED" | "INTERVIEW_INVITE") => {
    const e = await mkEmail(id, 0);
    return proposeFromEmail({ userId: user.id, email: e, classification: confirm(category), match: matchApplication(confirm(category), "gmail.com", await tnRows()), wordingSupportsCategory: true });
  };
  const c1 = await propose("e13", "APPLICATION_RECEIVED");
  const c1row = await db.statusProposal.findUniqueOrThrow({ where: { id: c1.proposalId! } });
  assert.equal(c1row.kind, "CREATE_APPLICATION");
  assert.equal((await approveProposal(c1row.id, OWNER)).kind, "executed");
  assert.deepEqual((await tnRows()).map((r) => r.status).sort(), ["APPLIED", "REJECTED"]);
  assert.equal((await db.jobApplication.findUniqueOrThrow({ where: { id: tn.id } })).status, "REJECTED");
  const repeat = await propose("e14", "APPLICATION_RECEIVED");
  assert.equal(repeat.proposalId, null);
  console.log("✔ confirmation after a rejection creates a second application; the rejected one stays rejected; a repeat confirmation changes nothing");

  const c3 = await propose("e15", "INTERVIEW_INVITE");
  const c3row = await db.statusProposal.findUniqueOrThrow({ where: { id: c3.proposalId! } });
  assert.equal(Array.isArray(c3row.candidates) && c3row.candidates.length, 2);
  console.log("✔ an interview invite that fits both TechNova applications asks which one");

  const audit = await db.actionLog.groupBy({ by: ["action"], where: { userId: user.id }, _count: true });
  console.log("audit:", Object.fromEntries(audit.map((x) => [x.action, x._count])));
}

main()
  .catch((e) => { console.error("SCENARIO FAILED:", e); process.exitCode = 1; })
  .finally(async () => {
    await db.actionLog.deleteMany({ where: { user: { telegramUserId: OWNER } } });
    await db.user.deleteMany({ where: { telegramUserId: OWNER } });
    console.log("cleaned up; scenario users left:", await db.user.count({ where: { telegramUserId: OWNER } }));
    await db.$disconnect();
  });
