import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnalysisSummary } from "@/lib/agent/analyze";
import { analysisText, deleteConfirmText, deleteDoneText, reviewReadyText, statusText, type StatsForText } from "./messages";

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

test("the review summary lists counts per kind of update, most important first", () => {
  const text = reviewReadyText({ total: 12, companies: 9, byStatus: { APPLIED: 8, REJECTED: 3, INTERVIEW: 1 } });
  assert.match(text, /12 updates are waiting for your review, from 9 companies/);
  assert.match(text, /• 1 interview invitation\n• 3 rejections\n• 8 application confirmations/);
  assert.match(text, /Nothing changes until you approve each one/);
  assert.match(reviewReadyText({ total: 1, companies: 1, byStatus: { OFFER: 1 } }), /1 update is waiting for your review, from 1 company:/);
});

test("/sync says held proposals wait for the review instead of claiming cards were sent", () => {
  const base: AnalysisSummary = { analyzed: 10, proposals: 0, held: 4, noChange: 3, notJobRelated: 3, unverified: 0, failed: 0, deferred: 0 };
  const text = analysisText(base, 20);
  assert.match(text, /^Analysed 10: 4 kept for your review, 3 needed no change, 3 not job-related\./);
  assert.doesNotMatch(text, /sent above/);
  assert.match(text, /one card at a time/);
  assert.match(analysisText({ ...base, proposals: 1, held: 0 }, 0), /1 proposal sent above/);
});
