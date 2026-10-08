import assert from "node:assert/strict";
import { test } from "node:test";
import { BriefOutputSchema, briefEmails, buildBriefPrompt, groundBrief, noBrief, planBrief, type BriefApplication, type BriefEmail } from "./brief-grounding";

const app: BriefApplication = { id: "app1", company: "Wix", roleTitle: "Backend Student", jobRef: null, status: "INTERVIEW" };
const email = (id: string, date: string, subject: string, body: string): BriefEmail => ({
  id, subject, fromAddress: "jobs@wix.com", fromName: "Wix", receivedAt: new Date(date), category: "INTERVIEW_INVITE", bodyText: body,
});
const emails = briefEmails([
  email("e2", "2026-09-20T10:00:00Z", "Interview with Wix", "We'd love to schedule a 45-minute technical interview with Dana from the backend team."),
  email("e1", "2026-08-12T10:00:00Z", "We got your application", "Thanks for applying to the Backend Student position at Wix."),
]);

test("emails are numbered oldest first, and the prompt marks them as data", () => {
  assert.deepEqual(emails.map((e) => e.id), ["e1", "e2"]);
  const prompt = buildBriefPrompt(app, emails, ["new → Applied (email of 2026-08-12)"]);
  assert.match(prompt, /<email number="1" date="2026-08-12">[\s\S]*<email number="2" date="2026-09-20">/);
  assert.match(prompt, /Role title: Backend Student\. Current status: interviewing/);
});

test("facts survive only if their quote is in the email they cite; records and dates come from our side", () => {
  const brief = groundBrief(
    {
      actionRequired: [{ value: "Pick a time slot", email: 2, quote: "Please choose a slot that works for you" }], // not in the email
      agenda: [
        { field: "duration", value: "45 minutes", email: 2, quote: "schedule a 45-minute technical interview" },
        { field: "people", value: "Dana, backend team", email: 2, quote: "with Dana from the backend team" },
        { field: "location", value: "Tel Aviv office", email: 2, quote: "come to our Tel Aviv office" }, // invented
      ],
      timeline: [
        { value: "Interview invitation", email: 2, quote: "schedule a 45-minute technical interview" },
        { value: "Applied", email: 1, quote: "Thanks for applying to the Backend Student position" },
        { value: "Offer", email: 1, quote: "We are happy to offer you the role" }, // invented
        { value: "Phone screen", email: 7, quote: "Thanks for applying" }, // no such email
      ],
      prepFromEmails: ["a", "b", "c", "d", "e", "f"],
      roleSpecificPrep: ["Revise REST API design", "Wix always asks about their monolith", "Practise SQL joins", "Know HTTP caching"],
      notInEmails: ["The interview date"],
    },
    app,
    emails,
    planBrief("INTERVIEW", []),
  );
  assert.deepEqual([brief.briefType, brief.pendingApproval], ["interview", null]);
  assert.deepEqual(brief.context, { applicationId: "app1", company: "Wix", roleTitle: "Backend Student", jobId: null, currentStatus: "interviewing" });
  assert.equal(brief.actionRequired, null);
  assert.deepEqual(
    brief.timeline.map((t) => [t.date, t.eventSummary]),
    [["2026-08-12", "Applied"], ["2026-09-20", "Interview invitation"]],
  );
  assert.equal(brief.agenda.duration?.value, "45 minutes");
  assert.equal(brief.agenda.duration?.emailDate, "2026-09-20");
  assert.deepEqual(brief.agenda.people.map((p) => p.value), ["Dana, backend team"]);
  assert.equal(brief.agenda.location, null);
  assert.equal(brief.prepFromEmails.length, 5);
  // A tip naming the company is a claim about its process, not general knowledge.
  assert.deepEqual(brief.roleSpecificPrep, ["Revise REST API design", "Practise SQL joins", "Know HTTP caching"]);
  assert.equal(brief.meta.droppedClaims, 5);
  assert.equal(brief.meta.quotesVerified, true);
  assert.equal(BriefOutputSchema.safeParse(brief).success, true);
});

test("what to prepare for is decided in code: the status, or a card still waiting in Telegram", () => {
  assert.deepEqual(planBrief("INTERVIEW", []), { briefType: "interview", reason: null, pendingApproval: null });
  assert.deepEqual(planBrief("ASSESSMENT", []), { briefType: "assessment", reason: null, pendingApproval: null });
  // The invite arrived but its card isn't approved yet: brief for the interview, and say so.
  assert.deepEqual(planBrief("APPLIED", ["INTERVIEW"]), { briefType: "interview", reason: null, pendingApproval: "INTERVIEW" });
  assert.deepEqual(planBrief("ASSESSMENT", ["INTERVIEW"]), { briefType: "interview", reason: null, pendingApproval: "INTERVIEW" });
  assert.deepEqual(planBrief("APPLIED", ["ASSESSMENT"]), { briefType: "assessment", reason: null, pendingApproval: "ASSESSMENT" });
  // A pending rejection isn't something to prepare for.
  assert.deepEqual(planBrief("INTERVIEW", ["REJECTED"]).briefType, "interview");
  for (const [status, reason] of [
    ["APPLIED", /waiting for a reply/],
    ["REJECTED", /rejected/],
    ["WITHDRAWN", /withdrawn/],
    ["OFFER", /offer stage/],
  ] as const) {
    const plan = planBrief(status, []);
    assert.equal(plan.briefType, "none", status);
    assert.match(plan.reason!, reason);
  }
});

test("'nothing to prepare for' has the same shape, empty, and states the reason", () => {
  const none = noBrief({ ...app, status: "REJECTED" }, planBrief("REJECTED", []), 2);
  assert.equal(BriefOutputSchema.safeParse(none).success, true);
  assert.deepEqual([none.briefType, none.timeline, none.roleSpecificPrep, none.agenda.people], ["none", [], [], []]);
  assert.match(none.reason!, /rejected/);
  const pending = groundBrief(
    { actionRequired: [], agenda: [], timeline: [], prepFromEmails: [], roleSpecificPrep: [], notInEmails: [] },
    app,
    emails,
    planBrief("APPLIED", ["INTERVIEW"]),
  );
  assert.match(pending.pendingApproval!.note, /hasn't approved the change in Telegram yet/);
});

test("the Developers page's sample brief matches the real output schema", async () => {
  const { EXAMPLE_BRIEF } = await import("./example");
  assert.equal(BriefOutputSchema.safeParse(EXAMPLE_BRIEF).success, true);
});
