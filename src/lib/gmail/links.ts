/** Opens one email in Gmail, in the right account when several are signed in. */
export function gmailMessageUrl(gmailAddress: string | null, messageId: string): string {
  // ?authuser=<address> picks the account. (The address inside the path, percent-encoded, made
  // Gmail answer "account temporarily unavailable".)
  return gmailAddress
    ? `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(gmailAddress)}#all/${messageId}`
    : `https://mail.google.com/mail/u/0/#all/${messageId}`;
}
