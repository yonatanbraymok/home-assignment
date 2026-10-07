import assert from "node:assert/strict";
import { test } from "node:test";
import type { ParsedEmail } from "./parse";
import { prefilter } from "./prefilter";

function email(overrides: Partial<ParsedEmail>): ParsedEmail {
  return {
    gmailMessageId: "m",
    gmailThreadId: "t",
    fromAddress: "someone@example.com",
    fromName: null,
    subject: "",
    receivedAt: new Date(),
    snippet: "",
    bodyText: "",
    headers: {},
    ...overrides,
  };
}

test("ATS senders always pass, even with a vague subject", () => {
  const r = prefilter(email({ fromAddress: "no-reply@us.greenhouse-mail.io", subject: "Update from Wix" }));
  assert.deepEqual(r, { candidate: true, reason: "ats-domain:greenhouse-mail.io" });
  assert.equal(prefilter(email({ fromAddress: "jobs-noreply@linkedin.com" })).candidate, true);
});

test("a sender domain we already track passes", () => {
  const r = prefilter(email({ fromAddress: "careers@microsoft.com", subject: "Hello" }), ["microsoft.com"]);
  assert.equal(r.reason, "tracked-domain:microsoft.com");
});

test("a company's own rejection email passes on body wording", () => {
  const r = prefilter(
    email({
      fromAddress: "talent@startup.io",
      subject: "Update",
      bodyText: "Thank you for your interest. Unfortunately, we have decided to move forward with other candidates.",
    }),
  );
  assert.equal(r.candidate, true);
});

test("a Hebrew rejection passes", () => {
  const r = prefilter(email({ fromAddress: "hr@company.co.il", subject: "עדכון", bodyText: "שלום, לצערנו הוחלט שלא להתקדם עם מועמדותך למשרה." }));
  assert.equal(r.candidate, true);
});

test("job-alert bulk mail is skipped unless the subject is clearly about an application", () => {
  const alert = email({
    fromAddress: "jobalerts-noreply@linkedin.com",
    subject: "Software Engineer Intern at Wix and 12 more jobs",
    bodyText: "New internship positions matching your search. Apply now as a candidate.",
    headers: { "list-unsubscribe": "<mailto:x>" },
  });
  assert.deepEqual(prefilter(alert), { candidate: false, reason: "bulk-mail" });
});

test("unrelated mail is skipped, and 'internal' does not count as 'intern'", () => {
  assert.equal(prefilter(email({ subject: "Your bank statement", bodyText: "Your internal account summary is ready." })).candidate, false);
  assert.equal(prefilter(email({ subject: "Dinner?", bodyText: "Unfortunately I can't make it." })).reason, "body-weak:unfortunately");
});
