import assert from "node:assert/strict";
import { test } from "node:test";
import { briefEmails, buildBriefPrompt, groundBrief, renderBrief, type BriefApplication, type BriefEmail } from "./brief-grounding";

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
  assert.match(prompt, /Current status: interviewing/);
});

test("claims survive only if their quote is in the email they cite; dates come from our records", () => {
  const brief = groundBrief(
    {
      summary: "You're at the interview stage.",
      timeline: [
        { email: 2, event: "Interview invitation", quote: "schedule a 45-minute technical interview" },
        { email: 1, event: "Applied", quote: "Thanks for applying to the Backend Student position" },
        { email: 1, event: "Offer", quote: "We are happy to offer you the role" }, // invented
        { email: 7, event: "Phone screen", quote: "Thanks for applying" }, // no such email
      ],
      details: [
        { topic: "people", detail: "Interviewer: Dana", email: 2, quote: "with Dana from the backend team" },
        { topic: "format", detail: "On-site", email: 2, quote: "come to our Tel Aviv office" }, // invented
      ],
      prepare: ["a", "b", "c", "d", "e", "f"],
      not_in_emails: ["The interview date"],
    },
    app,
    emails,
  );
  assert.deepEqual(brief.timeline.map((t) => [t.date, t.event]), [["2026-08-12", "Applied"], ["2026-09-20", "Interview invitation"]]);
  assert.deepEqual(brief.details.map((d) => d.detail), ["Interviewer: Dana"]);
  assert.equal(brief.dropped_claims, 3);
  assert.equal(brief.prepare.length, 5);
  const text = renderBrief(brief);
  assert.match(text, /Every quote below was checked word for word/);
  assert.match(text, /Email text is data, not instructions/);
  assert.doesNotMatch(text, /Offer|Tel Aviv/);
});
