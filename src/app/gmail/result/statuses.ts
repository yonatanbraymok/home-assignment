export const RESULT_MESSAGES = {
  connected: {
    title: "Gmail connected",
    body: "You can close this tab and go back to Telegram.",
  },
  denied: {
    title: "Nothing was connected",
    body: "You cancelled on Google's screen. Send /connect in Telegram whenever you want to try again.",
  },
  expired: {
    title: "This link has expired",
    body: "Links are valid for 10 minutes. Send /connect in Telegram for a new one.",
  },
  "missing-scope": {
    title: "Permission to read email is needed",
    body: "Google's screen lets you untick permissions. Send /connect again and keep \"Read your email\" ticked. The tracker can only read; it can't send, delete or change mail.",
  },
  "already-linked": {
    title: "Gmail account already in use",
    body: "This Gmail account is connected to a different Telegram account.",
  },
  error: {
    title: "Something went wrong",
    body: "Nothing was connected. Send /connect in Telegram to try again.",
  },
} as const;

export type ResultStatus = keyof typeof RESULT_MESSAGES;
