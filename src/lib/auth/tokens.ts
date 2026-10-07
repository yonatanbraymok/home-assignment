import { createHash, randomBytes } from "node:crypto";
import { signToken, verifyToken } from "@/lib/crypto";
import { appUrl } from "@/lib/env";

// Dashboard sign-in. Telegram is the identity: /dashboard sends a signed link that works once
// (login.ts), and opening it sets a signed session cookie (session.ts). Both carry the internal
// user id, not the Telegram id, so /delete_my_data ends every session: a later /start creates a
// new id. The link and the cookie use different purposes, so neither can stand in for the other.

export const LOGIN_LINK_TTL_SECONDS = 600;
export const SESSION_COOKIE = "jht_session";
// Fixed, not sliding: signing in again from Telegram is how a session is extended.
export const SESSION_TTL_SECONDS = 7 * 86_400;

export function loginLink(userId: string): string {
  // The nonce gives every /dashboard message its own link. Without it, two links made in the same
  // second would be identical, and using one would use up both.
  const token = signToken("dashboard-login", userId, LOGIN_LINK_TTL_SECONDS, { n: randomBytes(9).toString("base64url") });
  return appUrl(`/api/auth/login?t=${token}`);
}

/** What marks a link as used. A hash, so the database never holds a live sign-in link. */
export function loginLinkFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function newSessionToken(userId: string): string {
  return signToken("dashboard-session", userId, SESSION_TTL_SECONDS);
}

export function sessionUserIdFrom(cookieValue: string | undefined): string | null {
  return verifyToken(cookieValue, "dashboard-session");
}

export function sessionCookieOptions(baseUrl: string) {
  return {
    httpOnly: true, // page scripts can't read it
    // Lax, not Strict: sign-in starts from a link in Telegram (a cross-site navigation), and with
    // Strict the cookie would be left off the redirect to /dashboard and off later links from Telegram.
    sameSite: "lax" as const,
    // Secure only over https: some browsers (Safari) drop Secure cookies on http://localhost.
    secure: baseUrl.startsWith("https://"),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
