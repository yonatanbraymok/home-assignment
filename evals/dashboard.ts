// Eval: dashboard sign-in and data scoping. A /dashboard link signs in once (no respelling of it
// gets past that); expired, wrong-purpose and garbled links are refused; one user can never read
// another's data; the status date is the email's, not the day of the tap. Then the same over HTTP
// against the running app: opening a link only asks "continue as …?", a cross-site post is refused,
// the real cookie flags, "already used", HEAD not using a link, only the
// signed-in user's data on every page, the evidence on the timeline, a crafted ?login= value,
// signed-out redirects, log out, and a deleted account's cookie.
// Throwaway users, deleted at the end. Needs the app running at APP_URL (EVAL_SKIP_HTTP=1 to skip
// that part on purpose). Run: npm run eval:dashboard

import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { signToken } from "@/lib/crypto";
import { redeemLoginLink } from "@/lib/auth/login";
import { SESSION_COOKIE, loginLink, loginLinkFingerprint, newSessionToken } from "@/lib/auth/tokens";
import { editApplicationStatus } from "@/lib/dashboard/edit";
import { applicationDetailFor, findSessionUser, overviewFor } from "@/lib/dashboard/queries";
import { approveProposal } from "@/lib/proposals/decide";

const A_TG = BigInt(7_000_000_501), B_TG = BigInt(7_000_000_502);
const TELEGRAM_IDS = [A_TG, B_TG];
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/** A user with one application: an approved confirmation 20 days ago and a pending interview card. */
async function seed(tg: bigint, name: string, company: string) {
  const user = await db.user.create({ data: { telegramUserId: tg, telegramChatId: tg, displayName: name } });
  const now = new Date();
  const app = await db.jobApplication.create({
    data: {
      userId: user.id, company, roleTitle: "SWE Intern", dedupeKey: `${company.toLowerCase()}|swe intern`, status: "APPLIED", source: "EMAIL",
      appliedAt: daysAgo(20), lastEmailAt: daysAgo(2), statusChangedAt: now, // approved today, from a 20-day-old email
    },
  });
  const email = (n: number, subject: string, receivedAt: Date, category: "APPLICATION_RECEIVED" | "INTERVIEW_INVITE", quote: string) =>
    db.emailMessage.create({
      data: {
        userId: user.id, applicationId: app.id, gmailMessageId: `eval-dash-${tg}-${n}`, gmailThreadId: "t", fromAddress: `jobs@${company.toLowerCase()}.com`,
        subject, receivedAt, snippet: "", state: "CLASSIFIED", category, analysis: { evidenceQuote: quote, reasoning: "r", confidence: "HIGH", quoteVerified: true },
      },
    });
  const proposal = { userId: user.id, applicationId: app.id, company, roleTitle: "SWE Intern", confidence: "HIGH" as const, warnings: [] };
  const confirmation = await email(1, `${company} received your application`, daysAgo(20), "APPLICATION_RECEIVED", `Thank you for applying to ${company}`);
  await db.statusProposal.create({
    data: {
      ...proposal, emailId: confirmation.id, kind: "CREATE_APPLICATION", toStatus: "APPLIED", state: "EXECUTED", executedAt: now, decidedAt: now,
      reasoning: "The email confirms the application.", evidenceQuote: `Thank you for applying to ${company}`, expiresAt: daysAgo(13),
    },
  });
  const invite = await email(2, `${company} interview`, daysAgo(2), "INTERVIEW_INVITE", "We would like to invite you to an interview");
  await db.statusProposal.create({
    data: {
      ...proposal, emailId: invite.id, kind: "UPDATE_STATUS", fromStatus: "APPLIED", toStatus: "INTERVIEW",
      reasoning: "The email invites the student to an interview.", evidenceQuote: "We would like to invite you to an interview", expiresAt: new Date(Date.now() + 5 * DAY),
    },
  });
  return { user, app, confirmation };
}

const tokenOf = (link: string) => new URL(link).searchParams.get("t")!;

async function main() {
  await cleanup();
  const a = await seed(A_TG, "Eval Alice", "Wix");
  const b = await seed(B_TG, "Eval Bob", "Monday");
  let passed = 0;

  // 1. A link signs in once, under any spelling, and the sign-in is recorded as a hash of the link.
  const link = loginLink(a.user.id);
  assert.notEqual(tokenOf(loginLink(a.user.id)), tokenOf(link), "every link is distinct, even within one second");
  assert.deepEqual(await redeemLoginLink(tokenOf(link)), { status: "ok", userId: a.user.id });
  assert.deepEqual(await redeemLoginLink(tokenOf(link)), { status: "used", userId: a.user.id });
  for (const respelled of [`${tokenOf(link)}.`, `${tokenOf(link)}.x`, `${tokenOf(link)}.a.b`]) {
    assert.deepEqual(await redeemLoginLink(respelled), { status: "expired" }, respelled.slice(-4));
  }
  const logins = await db.actionLog.findMany({ where: { userId: a.user.id, action: "DASHBOARD_LOGIN" } });
  assert.equal(logins.length, 1);
  assert.equal(logins[0].dedupeKey, `login:${loginLinkFingerprint(tokenOf(link))}`);
  console.log("✔ a link signs in once; adding '.x' to it doesn't make a new link; the sign-in is recorded as a hash");
  passed++;

  // 2. Anything else is refused.
  const refused: [string, string | null][] = [
    ["expired", signToken("dashboard-login", a.user.id, -1)],
    ["a /connect link", signToken("gmail-connect", a.user.id, 600)],
    ["a session cookie", newSessionToken(a.user.id)],
    ["garbled", "abc.def"],
    ["missing", null],
  ];
  for (const [what, token] of refused) assert.deepEqual(await redeemLoginLink(token), { status: "expired" }, what);
  console.log("✔ expired, wrong-purpose, garbled and missing links are refused");
  passed++;

  // 3. Every read is scoped to the user; the status date is the email's.
  const overview = await overviewFor(a.user.id);
  assert.deepEqual(overview.applications.map((x) => x.company), ["Wix"]);
  assert.deepEqual(overview.waiting.map((p) => p.company), ["Wix"]);
  assert.equal(overview.stats.total, 1);
  assert.equal(overview.stats.proposals_waiting_for_decision, overview.waiting.length, "the dashboard and /status count the same cards");
  assert.equal(overview.applications[0].statusSince.getTime(), a.confirmation.receivedAt.getTime(), "since = the email's date, not the tap's");
  assert.equal(await applicationDetailFor(a.user.id, b.app.id), null);
  const detail = await applicationDetailFor(b.user.id, b.app.id);
  assert.deepEqual(detail?.timeline.map((t) => [t.evidenceQuote, t.proposal?.state, t.quoteVerified]), [
    ["Thank you for applying to Monday", "EXECUTED", true],
    ["We would like to invite you to an interview", "PENDING", true],
  ]);
  // Approvals made in the same instant: "since" is the email behind the current status, not the first one found.
  const c = await db.jobApplication.create({
    data: { userId: a.user.id, company: "Nvidia", roleTitle: "DL Intern", dedupeKey: "nvidia|dl intern", status: "OFFER", source: "EMAIL", statusChangedAt: new Date() },
  });
  const sameInstant = new Date();
  for (const [n, status, days] of [[1, "APPLIED", 30], [2, "OFFER", 3]] as const) {
    const e = await db.emailMessage.create({
      data: { userId: a.user.id, applicationId: c.id, gmailMessageId: `eval-dash-c-${n}`, gmailThreadId: "t", fromAddress: "jobs@nvidia.com", subject: "s", receivedAt: daysAgo(days), snippet: "" },
    });
    await db.statusProposal.create({
      data: {
        userId: a.user.id, applicationId: c.id, emailId: e.id, kind: n === 1 ? "CREATE_APPLICATION" : "UPDATE_STATUS", fromStatus: n === 1 ? null : "APPLIED",
        toStatus: status, company: "Nvidia", roleTitle: "DL Intern", reasoning: "r", evidenceQuote: "q", confidence: "HIGH", warnings: [], state: "EXECUTED",
        executedAt: sameInstant, decidedAt: sameInstant, expiresAt: sameInstant,
      },
    });
  }
  const offer = (await overviewFor(a.user.id)).applications.find((x) => x.id === c.id)!;
  assert.equal(Math.round((Date.now() - offer.statusSince.getTime()) / DAY), 3, "Offer since the offer email, 3 days ago");
  await db.jobApplication.delete({ where: { id: c.id } });
  console.log("✔ A sees only A's data and can't open B's application; B's timeline has both emails with their quotes; dates are the emails'");
  passed++;

  // 4. The same over HTTP, against the running app.
  const base = process.env.APP_URL!;
  const up = await fetch(new URL("/api/health", base)).then((r) => r.ok).catch(() => false);
  let httpSkipped = false;
  if (up) {
    await httpChecks(base, a, b);
    passed++;
  } else if (process.env.EVAL_SKIP_HTTP === "1") {
    httpSkipped = true;
    console.log(`○ HTTP checks skipped (EVAL_SKIP_HTTP=1)`);
  } else {
    throw new Error(`Nothing answers at ${base}: start the app (npm run dev), or set EVAL_SKIP_HTTP=1 to skip the HTTP checks`);
  }

  // 5. Correcting a status by hand: only from the status the page showed, only your own application,
  // recorded, on the timeline, and a card still waiting for that application no longer applies.
  const card = await db.statusProposal.findFirstOrThrow({ where: { userId: a.user.id, state: "PENDING" } }); // Applied → Interview
  assert.deepEqual(await editApplicationStatus(b.user.id, a.app.id, "APPLIED", "REJECTED"), { kind: "not-found" }, "someone else's application");
  assert.deepEqual(await editApplicationStatus(a.user.id, a.app.id, "INTERVIEW", "OFFER"), { kind: "changed-meanwhile" }, "a stale page");
  assert.deepEqual(await editApplicationStatus(a.user.id, a.app.id, "APPLIED", "APPLIED"), { kind: "unchanged" });
  assert.deepEqual(await editApplicationStatus(a.user.id, a.app.id, "APPLIED", "ASSESSMENT"), { kind: "saved" });
  const edited = await applicationDetailFor(a.user.id, a.app.id);
  assert.equal(edited?.application.status, "ASSESSMENT");
  assert.deepEqual(edited?.edits.map((e) => `${e.from} → ${e.to}`), ["APPLIED → ASSESSMENT"]);
  assert.ok(Date.now() - edited!.application.statusSince.getTime() < 60_000, "since: the moment of the change");
  assert.equal((await approveProposal(card.id, A_TG)).kind, "stale", "the waiting card no longer applies");
  // A second same-title application waiting for a reply is refused (A13), not a crash.
  const twin = await db.jobApplication.create({
    data: { userId: a.user.id, company: "Wix", roleTitle: "SWE Intern", dedupeKey: "wix|swe intern", status: "REJECTED", source: "MANUAL" },
  });
  await editApplicationStatus(a.user.id, a.app.id, "ASSESSMENT", "APPLIED");
  assert.deepEqual(await editApplicationStatus(a.user.id, twin.id, "REJECTED", "APPLIED"), { kind: "duplicate" });
  await db.jobApplication.delete({ where: { id: twin.id } });
  console.log("✔ a status corrected by hand: own applications only, from the shown status, recorded on the timeline; a waiting card then doesn't apply");
  passed++;

  // 6. Deleting the account ends its links (a later /start gets a new user id).
  const linkB = loginLink(b.user.id);
  await db.user.delete({ where: { id: b.user.id } });
  assert.deepEqual(await redeemLoginLink(tokenOf(linkB)), { status: "expired" });
  assert.equal(await findSessionUser(b.user.id), null);
  console.log("✔ after the account is deleted, its links are refused");
  passed++;

  console.log(`\n${passed}/6 passed${httpSkipped ? ", 1 skipped" : ""}`);
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function httpChecks(base: string, a: Seeded, b: Seeded) {
  const get = (path: string, cookie?: string) => fetch(new URL(path, base), { redirect: "manual", headers: cookie ? { cookie } : {} });
  const page = async (path: string, cookie?: string) => (await get(path, cookie)).text();
  const location = (r: Response) => new URL(r.headers.get("location")!, base);

  // Opening the link signs nobody in: it leads to a page that names the account and asks to continue.
  const link = loginLink(a.user.id);
  assert.equal((await fetch(link, { method: "HEAD", redirect: "manual" })).status, 200);
  const opened = await fetch(link, { redirect: "manual" });
  assert.equal(opened.status, 303);
  assert.equal(location(opened).pathname, "/sign-in");
  assert.equal(opened.headers.getSetCookie().length, 0, "opening the link sets no cookie");
  assert.ok((await page(`/sign-in${location(opened).search}`)).includes("Continue as Eval Alice"));

  // Continuing posts the link back. From another site that's refused, and the link stays unused.
  const post = (token: string, headers: Record<string, string> = {}) => {
    const form = new FormData();
    form.append("t", token);
    return fetch(new URL("/api/auth/login", base), { method: "POST", body: form, redirect: "manual", headers: { origin: new URL(base).origin, ...headers } });
  };
  assert.equal((await post(tokenOf(link), { origin: "https://elsewhere.example" })).status, 403, "a cross-site post is refused");
  const first = await post(tokenOf(link));
  assert.equal(first.status, 303);
  assert.equal(location(first).pathname, "/dashboard");
  const setCookie = first.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  assert.ok(setCookie, "continuing sets the session cookie");
  for (const flag of [/HttpOnly/i, /SameSite=lax/i, /Max-Age=604800/, /Path=\//]) assert.match(setCookie, flag);
  assert.equal(/;\s*Secure/i.test(setCookie), base.startsWith("https://"));
  const alice = setCookie.split(";")[0];
  const bob = `${SESSION_COOKIE}=${newSessionToken(b.user.id)}`;

  // The same link again: refused, unless this browser is the one it already signed in.
  assert.equal(location(await post(tokenOf(link))).search, "?login=used");
  assert.equal(location(await post(tokenOf(link), { cookie: alice })).pathname, "/dashboard");
  assert.equal(location(await post(tokenOf(link), { cookie: bob })).search, "?login=used", "someone else's session doesn't count");
  assert.equal(location(await post(`${tokenOf(link)}.`)).search, "?login=expired");
  assert.equal(location(await fetch(link, { redirect: "manual" })).search, "?login=used", "opening a used link says so");
  assert.equal(location(await fetch(link, { redirect: "manual", headers: { cookie: alice } })).pathname, "/dashboard");

  // Signed in: Alice's data only, with the budget in the header.
  const overview = await page("/dashboard", alice);
  for (const text of ["Eval Alice", "Wix", "AI budget", "Awaiting your approval in Telegram"]) assert.ok(overview.includes(text), text);
  assert.doesNotMatch(overview, /Monday|Eval Bob/);
  const timeline = await page(`/dashboard/applications/${a.app.id}`, alice);
  for (const text of ["Wix received your application", "Thank you for applying to Wix", "checked word for word", "Approved by you in Telegram", "Awaiting your approval in Telegram"]) {
    assert.ok(timeline.includes(text), text);
  }
  const bobsApp = await page(`/dashboard/applications/${b.app.id}`, alice);
  assert.match(bobsApp, /doesn(&#x27;|')t exist, or it isn(&#x27;|')t yours/);
  assert.doesNotMatch(bobsApp, /Monday/);
  assert.ok((await page("/dashboard/settings", alice)).includes("AI budget"));

  // A crafted ?login= value can't break the public page.
  const crafted = await page("/?login=toString");
  assert.ok(crafted.includes("Open your dashboard"));
  assert.doesNotMatch(crafted, /Functions are not valid/);

  // Signed out: sent to sign in, and nothing of Alice's in the response.
  const anonymous = await page("/dashboard");
  assert.ok(anonymous.includes("login=required"), "a signed-out visit is redirected to sign in");
  assert.doesNotMatch(anonymous, /Wix|Eval Alice/);

  // Log out (the form's Server Action, posted the way a browser without JavaScript would).
  const actionId = overview.match(/name="\$ACTION_ID_([0-9a-f]+)"/)?.[1];
  assert.ok(actionId, "the Log out form is on the page");
  const form = new FormData();
  form.append(`$ACTION_ID_${actionId}`, "");
  const out = await fetch(new URL("/dashboard", base), { method: "POST", body: form, redirect: "manual", headers: { cookie: alice, origin: new URL(base).origin } });
  const cleared = out.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  assert.ok(cleared && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(cleared), "logging out clears the cookie");
  assert.match(out.headers.get("location") ?? "", /login=signed-out/);

  // A deleted account's cookie stops working on the next request.
  assert.ok((await page("/dashboard", bob)).includes("Eval Bob"));
  await db.actionLog.deleteMany({ where: { userId: b.user.id } });
  await db.user.delete({ where: { id: b.user.id } });
  const afterDelete = await page("/dashboard", bob);
  assert.ok(afterDelete.includes("login=required"));
  assert.doesNotMatch(afterDelete, /Eval Bob|Monday/);
  // Recreate Bob for step 5, which checks his links.
  Object.assign(b, await seed(B_TG, "Eval Bob", "Monday"));

  console.log("✔ HTTP: opening a link signs nobody in (it asks to continue, as whom); a cross-site post is refused; cookie flags; HEAD keeps the link; used once (same browser continues, others don't); only Alice's data; timeline shows the quotes and decisions; ?login=toString is safe; signed-out redirect; log out; a deleted account's cookie is refused");
}

async function cleanup() {
  await db.actionLog.deleteMany({ where: { user: { telegramUserId: { in: TELEGRAM_IDS } } } });
  await db.user.deleteMany({ where: { telegramUserId: { in: TELEGRAM_IDS } } });
}

main()
  .catch((e) => {
    console.error("EVAL FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
  });
