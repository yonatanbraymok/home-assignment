import assert from "node:assert/strict";
import { test } from "node:test";
import { isPastEmail, summarize } from "./past-emails";

const connectedAt = new Date("2026-10-07T12:00:00Z");
const before = new Date("2026-10-01T09:00:00Z");
const after = new Date("2026-10-07T13:00:00Z");

test("only emails from before the connection are held, and only until the backfill is done", () => {
  assert.equal(isPastEmail({ gmailConnectedAt: connectedAt, backfillDoneAt: null }, before), true);
  assert.equal(isPastEmail({ gmailConnectedAt: connectedAt, backfillDoneAt: null }, after), false); // live mail is never held
  assert.equal(isPastEmail({ gmailConnectedAt: connectedAt, backfillDoneAt: after }, before), false); // straggler after the summary
  assert.equal(isPastEmail({ gmailConnectedAt: null, backfillDoneAt: null }, before), false);
});

test("the summary counts updates per status and companies case-insensitively", () => {
  const s = summarize([
    { company: "Amazon", toStatus: "APPLIED" },
    { company: "amazon ", toStatus: "APPLIED" },
    { company: "Wix", toStatus: "REJECTED" },
  ]);
  assert.deepEqual(s, { total: 3, companies: 2, byStatus: { APPLIED: 2, REJECTED: 1 } });
});
