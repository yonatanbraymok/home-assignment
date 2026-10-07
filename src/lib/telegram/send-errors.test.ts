import assert from "node:assert/strict";
import { test } from "node:test";
import { GrammyError, HttpError } from "grammy";
import { isPermanentSendError } from "./send-errors";

const telegramError = (code: number) => new GrammyError("x", { ok: false, error_code: code, description: "x" }, "sendMessage", {});

test("blocked bots and missing chats aren't retried; rate limits, server and network errors are", () => {
  assert.equal(isPermanentSendError(telegramError(403)), true); // bot blocked by the user
  assert.equal(isPermanentSendError(telegramError(400)), true); // chat not found
  assert.equal(isPermanentSendError(telegramError(429)), false);
  assert.equal(isPermanentSendError(telegramError(502)), false);
  assert.equal(isPermanentSendError(new HttpError("network", new Error("ECONNRESET"))), false);
  assert.equal(isPermanentSendError(new Error("anything else")), false);
});
