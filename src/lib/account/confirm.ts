// Callback data for the /disconnect and /delete_my_data confirmation buttons. It names the account
// and expires; the bot also checks that whoever taps owns the account (see authorizeConfirmation),
// so a forwarded or old confirmation can't act on anyone's data.

export type AccountAction = "disconnect" | "delete";

export const CONFIRMATION_TTL_SECONDS = 600;
export const CANCEL_DATA = "acct:cancel";

export function confirmationData(action: AccountAction, userId: string, now = new Date()): string {
  return `acct:${action}:${userId}:${Math.floor(now.getTime() / 1000) + CONFIRMATION_TTL_SECONDS}`;
}

export function parseConfirmation(data: string, now = new Date()): { action: AccountAction; userId: string } | "expired" | "invalid" {
  const match = /^acct:(disconnect|delete):([a-z0-9]+):(\d+)$/.exec(data);
  if (!match) return "invalid";
  if (Number(match[3]) * 1000 < now.getTime()) return "expired";
  return { action: match[1] as AccountAction, userId: match[2] };
}
