import assert from "node:assert/strict";
import { test } from "node:test";
import { emailLink, isDemoMessage } from "@/lib/gmail/links";
import { prefilter } from "@/lib/gmail/prefilter";
import { LIVE_DEMO_EMAILS, liveDemoEmail, pastDemoEmails } from "./samples";

const now = new Date("2026-10-08T09:00:00Z");
const past = pastDemoEmails("Dana", now);
const live = Array.from({ length: LIVE_DEMO_EMAILS }, (_, i) => liveDemoEmail(i, "Dana", now)!);

test("the sample inbox is fictional, marked as demo, and dated before the demo starts", () => {
  const all = [...past, ...live];
  // .example is reserved: no sample address can belong to anyone.
  assert.ok(all.every((e) => e.fromAddress.endsWith(".example")));
  assert.ok(all.every((e) => isDemoMessage(e.gmailMessageId) && emailLink("dana@gmail.com", e.gmailMessageId) === null));
  assert.equal(new Set(all.map((e) => e.gmailMessageId)).size, all.length);
  assert.ok(past.every((e) => e.receivedAt < now));
  const times = past.map((e) => e.receivedAt.getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(live.every((e) => e.receivedAt.getTime() === now.getTime()));
  assert.equal(liveDemoEmail(LIVE_DEMO_EMAILS, "Dana", now), null);
  assert.match(past[0].bodyText, /^Hi Dana,/);
});

test("the free prefilter drops only the job alert; every live email gets through", () => {
  assert.deepEqual(past.filter((e) => !prefilter(e).candidate).map((e) => e.subject), ["12 new jobs match your search"]);
  assert.ok(live.every((e) => prefilter(e).candidate));
});
