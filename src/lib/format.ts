// The target users are students in Israel: dates on Telegram cards and in the dashboard are local time.
export const DISPLAY_TIME_ZONE = "Asia/Jerusalem";

/** e.g. "7 Oct, 18:02" */
export function formatDateTime(date: Date): string {
  return date.toLocaleString("en-GB", { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** e.g. "7 Oct 2026" */
export function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
}
