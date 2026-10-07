import assert from "node:assert/strict";
import { test } from "node:test";
import { CONFIRMATION_TTL_SECONDS, confirmationData, parseConfirmation } from "./confirm";

const userId = "cmuy8wkxa000037niyclk34qp"; // a real-length cuid
const now = new Date("2026-10-07T18:00:00Z");

test("a fresh confirmation parses back to its action and account, and fits Telegram's 64-byte limit", () => {
  for (const action of ["disconnect", "delete"] as const) {
    const data = confirmationData(action, userId, now);
    assert.ok(Buffer.byteLength(data) <= 64, data);
    assert.deepEqual(parseConfirmation(data, now), { action, userId });
  }
});

test("a confirmation expires after the TTL", () => {
  const data = confirmationData("delete", userId, now);
  assert.deepEqual(parseConfirmation(data, new Date(now.getTime() + (CONFIRMATION_TTL_SECONDS - 1) * 1000)), { action: "delete", userId });
  assert.equal(parseConfirmation(data, new Date(now.getTime() + (CONFIRMATION_TTL_SECONDS + 1) * 1000)), "expired");
});

test("anything else is invalid", () => {
  assert.equal(parseConfirmation("acct:cancel", now), "invalid");
  assert.equal(parseConfirmation(`acct:wipe:${userId}:9999999999`, now), "invalid");
  assert.equal(parseConfirmation(`acct:delete:${userId}`, now), "invalid");
  assert.equal(parseConfirmation(`p:a:${userId}`, now), "invalid");
});
