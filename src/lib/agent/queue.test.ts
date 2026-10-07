import assert from "node:assert/strict";
import { test } from "node:test";
import { CLAIMABLE, NOT_YET_READ } from "./queue";

test("emails deferred by the old budget code still count as unread and can still be claimed", () => {
  // Counting them as read sent the past-email review before they were read.
  assert.ok(NOT_YET_READ.includes("DEFERRED_BUDGET"));
  assert.ok(CLAIMABLE.includes("DEFERRED_BUDGET"));
  assert.ok(!NOT_YET_READ.includes("CLASSIFIED" as never));
});
