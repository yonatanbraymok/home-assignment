// Shown on the home page after a redirect: /?login=<status>.
export const SIGN_IN_MESSAGES = {
  expired: "That sign-in link has expired or isn't valid. Send /dashboard to the bot for a new one.",
  used: "That sign-in link was already used. Each link works once: send /dashboard to the bot for a new one.",
  required: "You're not signed in on this browser. Send /dashboard to the bot for a sign-in link.",
  "signed-out": "You're signed out.",
} as const;

export type SignInStatus = keyof typeof SIGN_IN_MESSAGES;

/** Own keys only: `in` would also accept "toString" and other built-in keys, and crash the page. */
export function isSignInStatus(value: unknown): value is SignInStatus {
  return typeof value === "string" && Object.hasOwn(SIGN_IN_MESSAGES, value);
}
