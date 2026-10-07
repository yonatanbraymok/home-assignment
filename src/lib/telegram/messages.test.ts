import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteConfirmText, deleteDoneText, statusText, type StatsForText } from "./messages";

const stats = (gmail: string | null, total: number): StatsForText => ({
  total,
  by_status: total ? { APPLIED: 1, REJECTED: total - 1 } : {},
  open: total ? 1 : 0,
  proposals_waiting_for_decision: 0,
  coverage: { gmail, emails_since: "2026-08-15", last_gmail_check: null },
});

test("/status after /disconnect still shows the tracker and how to resume", () => {
  const text = statusText(stats(null, 3));
  assert.match(text, /Tracking 3 applications/);
  assert.match(text, /Gmail is disconnected/);
  assert.match(text, /\/connect/);
});

test("/status before any Gmail connection asks to connect", () => {
  assert.equal(statusText(stats(null, 0)), "Gmail isn't connected yet. Send /connect to start.");
});

test("delete confirmation lists what will be erased; the done text handles every revoke outcome", () => {
  const text = deleteConfirmText({ applications: 1, emails: 20, proposals: 3, questions: 0 });
  assert.match(text, /1 application, 20 stored emails with their evidence, 3 cards, 0 chat questions/);
  assert.match(text, /can't be undone/);
  assert.doesNotMatch(deleteDoneText("not-connected"), /\n\n\n/);
  assert.match(deleteDoneText("failed"), /myaccount\.google\.com\/permissions/);
});
