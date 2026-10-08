// Emails loaded by /demo have ids like "demo:3" and don't exist in Gmail.
export const DEMO_MESSAGE_PREFIX = "demo:";

export function isDemoMessage(messageId: string): boolean {
  return messageId.startsWith(DEMO_MESSAGE_PREFIX);
}

/** Opens one email in Gmail, in the right account when several are signed in. */
export function gmailMessageUrl(gmailAddress: string | null, messageId: string): string {
  // ?authuser=<address> picks the account. (The address inside the path, percent-encoded, made
  // Gmail answer "account temporarily unavailable".)
  return gmailAddress
    ? `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(gmailAddress)}#all/${messageId}`
    : `https://mail.google.com/mail/u/0/#all/${messageId}`;
}

/** The Gmail link for an email, or null for a demo email (there's nothing to open). */
export function emailLink(gmailAddress: string | null, messageId: string): string | null {
  return isDemoMessage(messageId) ? null : gmailMessageUrl(gmailAddress, messageId);
}
