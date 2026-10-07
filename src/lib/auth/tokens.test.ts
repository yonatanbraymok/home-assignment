import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { signToken, verifyToken } from "@/lib/crypto";
import { SESSION_TTL_SECONDS, loginLink, loginLinkFingerprint, newSessionToken, sessionCookieOptions, sessionUserIdFrom } from "./tokens";

// Read at call time, not import time.
process.env.SESSION_SECRET = randomBytes(32).toString("hex");
process.env.APP_URL = "https://tracker.example.com";

test("the sign-in link and the session cookie can't stand in for each other", () => {
  const linkToken = new URL(loginLink("user_1")).searchParams.get("t")!;
  assert.equal(verifyToken(linkToken, "dashboard-login"), "user_1");
  assert.equal(sessionUserIdFrom(linkToken), null);

  const session = newSessionToken("user_1");
  assert.equal(sessionUserIdFrom(session), "user_1");
  assert.equal(verifyToken(session, "dashboard-login"), null);

  assert.equal(sessionUserIdFrom(signToken("gmail-connect", "user_1", 60)), null);
  assert.equal(sessionUserIdFrom(signToken("dashboard-session", "user_1", -1)), null); // expired
  assert.equal(sessionUserIdFrom(undefined), null);
  assert.equal(sessionUserIdFrom("garbage.value"), null);
});

const claims = (token: string) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));

test("the link points at the sign-in route, expires in 10 minutes and is unique", () => {
  const url = new URL(loginLink("user_1"));
  assert.equal(`${url.origin}${url.pathname}`, "https://tracker.example.com/api/auth/login");
  assert.ok(Math.abs(claims(url.searchParams.get("t")!).e - (Date.now() / 1000 + 600)) < 5);
  // Two links for the same user in the same second still differ, so using one can't use up the other.
  assert.notEqual(loginLink("user_1"), loginLink("user_1"));
});

test("the session the server accepts lasts 7 days, the same as the cookie", () => {
  const { e } = claims(newSessionToken("user_1"));
  assert.ok(Math.abs(e - (Date.now() / 1000 + SESSION_TTL_SECONDS)) < 5);
  assert.equal(sessionCookieOptions("https://x.example").maxAge, SESSION_TTL_SECONDS);
  assert.equal(SESSION_TTL_SECONDS, 7 * 86_400);
});

test("a used link is recorded as a hash, never as the link itself", () => {
  const token = new URL(loginLink("user_1")).searchParams.get("t")!;
  assert.equal(loginLinkFingerprint(token), loginLinkFingerprint(token));
  assert.ok(!loginLinkFingerprint(token).includes(token.split(".")[1]));
});

test("cookie: httpOnly, Lax, 7 days, Secure only over https", () => {
  assert.deepEqual(sessionCookieOptions("https://tracker.example.com"), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 7 * 86_400,
  });
  assert.equal(sessionCookieOptions("http://localhost:3000").secure, false);
});
