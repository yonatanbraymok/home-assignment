import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { decrypt, encrypt, safeEqual, signToken, verifyToken } from "./crypto";

// crypto.ts reads these at call time, not import time.
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.SESSION_SECRET = randomBytes(32).toString("hex");

test("encrypt/decrypt round-trips and uses a fresh IV each time", () => {
  const a = encrypt("1//refresh-token");
  const b = encrypt("1//refresh-token");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), "1//refresh-token");
});

test("decrypt rejects tampered ciphertext", () => {
  const parts = encrypt("secret").split(".");
  parts[3] = Buffer.from("other").toString("base64url");
  assert.throws(() => decrypt(parts.join(".")));
});

test("signed tokens verify only for their purpose, unexpired and untampered", () => {
  const token = signToken("gmail-connect", "user_1", 60);
  assert.equal(verifyToken(token, "gmail-connect"), "user_1");
  assert.equal(verifyToken(token, "dashboard-login"), null);
  assert.equal(verifyToken(signToken("gmail-connect", "user_1", -1), "gmail-connect"), null);

  const [body, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ p: "gmail-connect", u: "user_2", e: 9e9 })).toString("base64url");
  assert.equal(verifyToken(`${forged}.${mac}`, "gmail-connect"), null);
  assert.equal(verifyToken(`${body}.`, "gmail-connect"), null);
  assert.equal(verifyToken(null, "gmail-connect"), null);
});

test("safeEqual", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abd", "abc"), false);
  assert.equal(safeEqual("ab", "abc"), false);
  assert.equal(safeEqual(null, "abc"), false);
});
