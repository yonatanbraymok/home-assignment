import assert from "node:assert/strict";
import { test } from "node:test";
import type { gmail_v1 } from "@googleapis/gmail";
import { BODY_CHAR_LIMIT, parseFrom, parseMessage, stripQuotedHistory } from "./parse";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

function message(parts: gmail_v1.Schema$MessagePart[], headers: Record<string, string>): gmail_v1.Schema$Message {
  return {
    id: "m1",
    threadId: "t1",
    internalDate: String(Date.UTC(2026, 9, 6, 14, 2)),
    snippet: "we&#39;ve decided",
    payload: {
      mimeType: "multipart/alternative",
      headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
      parts,
    },
  };
}

test("parseFrom handles display names, quotes and bare addresses", () => {
  assert.deepEqual(parseFrom('"Microsoft Careers" <Careers@Microsoft.com>'), { address: "careers@microsoft.com", name: "Microsoft Careers" });
  assert.deepEqual(parseFrom("Wix <jobs@wix.com>"), { address: "jobs@wix.com", name: "Wix" });
  assert.deepEqual(parseFrom("no-reply@greenhouse.io"), { address: "no-reply@greenhouse.io", name: null });
});

test("prefers text/plain, decodes snippet entities, uses internalDate", () => {
  const msg = message(
    [
      { mimeType: "text/plain", body: { data: b64("Thank you for applying.\nUnfortunately we have decided to move forward with other candidates.") } },
      { mimeType: "text/html", body: { data: b64("<p>HTML version</p>") } },
    ],
    { From: "Microsoft Careers <careers@microsoft.com>", Subject: "Your application", "List-Unsubscribe": "<x>" },
  );
  const email = parseMessage(msg);
  assert.equal(email.fromAddress, "careers@microsoft.com");
  assert.equal(email.subject, "Your application");
  assert.match(email.bodyText, /move forward with other candidates/);
  assert.equal(email.snippet, "we've decided");
  assert.equal(email.receivedAt.toISOString(), "2026-10-06T14:02:00.000Z");
  assert.equal(email.headers["list-unsubscribe"], "<x>");
});

test("falls back to HTML converted to text, skipping attachments and link URLs", () => {
  const msg = message(
    [
      { mimeType: "text/plain", filename: "resume.txt", body: { data: b64("attachment text") } },
      { mimeType: "text/html", body: { data: b64('<p>Hi Dana,</p><p>Please complete the <a href="https://hackerrank.com/x">HackerRank assessment</a>.</p>') } },
    ],
    { From: "noreply@hackerrank.com", Subject: "Wix invited you to a test" },
  );
  const { bodyText } = parseMessage(msg);
  assert.match(bodyText, /Please complete the HackerRank assessment\./);
  assert.doesNotMatch(bodyText, /attachment text|https:\/\//);
});

test("caps the body length", () => {
  const msg = message([{ mimeType: "text/plain", body: { data: b64("x".repeat(BODY_CHAR_LIMIT * 2)) } }], { From: "a@b.c" });
  assert.equal(parseMessage(msg).bodyText.length, BODY_CHAR_LIMIT);
});

test("stripQuotedHistory keeps only the newest message", () => {
  const english = "Thanks, see you Tuesday!\n\nOn Mon, Oct 5, 2026 at 9:00 AM Recruiter <r@wix.com>\nwrote:\n> Unfortunately we must reschedule.\n> Best";
  assert.equal(stripQuotedHistory(english), "Thanks, see you Tuesday!");

  const hebrew = "תודה רבה!\n\nבתאריך יום ב׳, 5 באוק׳ 2026 ב-9:00 מאת Recruiter <r@wix.com>:\nלצערנו לא נוכל להתקדם";
  assert.equal(stripQuotedHistory(hebrew), "תודה רבה!");

  const outlook = "Great.\n\nFrom: HR <hr@corp.com>\nSent: Monday\nSubject: Re: Interview\n\nWe regret to inform you";
  assert.equal(stripQuotedHistory(outlook), "Great.");

  assert.equal(stripQuotedHistory("Line one\n> quoted\nLine two"), "Line one\nLine two");
});
