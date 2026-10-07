import assert from "node:assert/strict";
import { test } from "node:test";
import { wordingSupportsCategory } from "@/lib/agent/signals";
import { escapeHtml, gmailThreadUrl, renderCard, type CardData } from "./card";
import { capConfidence, isExpectedTransition } from "./rules";

test("transitions: forward moves are expected, reversals are flagged", () => {
  assert.equal(isExpectedTransition("APPLIED", "REJECTED"), true);
  assert.equal(isExpectedTransition("INTERVIEW", "OFFER"), true);
  assert.equal(isExpectedTransition("REJECTED", "INTERVIEW"), false);
  assert.equal(isExpectedTransition("APPLIED", "OFFER"), false);
});

test("confidence caps only ever lower confidence", () => {
  assert.equal(capConfidence("HIGH", "MEDIUM"), "MEDIUM");
  assert.equal(capConfidence("LOW", "HIGH"), "LOW");
});

test("wording cross-check", () => {
  assert.equal(wordingSupportsCategory("REJECTION", "We decided to move forward with other candidates"), true);
  assert.equal(wordingSupportsCategory("REJECTION", "Your interview is confirmed for Tuesday"), false);
  assert.equal(wordingSupportsCategory("REJECTION", "לצערנו לא נוכל להתקדם"), true);
  assert.equal(wordingSupportsCategory("OTHER_JOB_RELATED", "anything"), true);
});

const card: CardData = {
  id: "cl1",
  kind: "UPDATE_STATUS",
  state: "PENDING",
  company: "AT&T <Labs>",
  roleTitle: "SWE Intern",
  fromStatus: "APPLIED",
  toStatus: "REJECTED",
  reasoning: "Says <b>no</b>.",
  evidenceQuote: "we have decided to move forward with other candidates",
  confidence: "HIGH",
  warnings: ["Unusual change"],
  expiresAt: new Date("2026-10-14T10:00:00Z"),
  failureReason: null,
  email: { fromAddress: "jobs@att.com", fromName: "AT&T", subject: "Update", receivedAt: new Date("2026-10-07T10:00:00Z"), gmailThreadId: "18f" },
  gmailAddress: "dana@gmail.com",
};

test("card escapes every dynamic value and shows buttons only while pending", () => {
  const { text, keyboard } = renderCard(card);
  assert.match(text, /AT&amp;T &lt;Labs&gt;/);
  assert.match(text, /Says &lt;b&gt;no&lt;\/b&gt;\./);
  assert.match(text, /Applied → Rejected/);
  const buttons = keyboard.inline_keyboard.flat().map((b) => ("callback_data" in b ? b.callback_data : b.text));
  assert.deepEqual(buttons, ["🔗 Open email", "p:a:cl1", "p:r:cl1"]);

  const decided = renderCard({ ...card, state: "EXECUTED" });
  assert.match(decided.text, /Approved/);
  assert.equal(decided.keyboard.inline_keyboard.flat().length, 1); // only "Open email"

  assert.equal(escapeHtml("a<b>&c"), "a&lt;b&gt;&amp;c");
  assert.equal(gmailThreadUrl("dana@gmail.com", "18f"), "https://mail.google.com/mail/u/dana%40gmail.com/#all/18f");
});
