import { GrammyError } from "grammy";

/**
 * A Telegram send that would fail again if retried: the bot was blocked, the chat is gone, or the
 * request is invalid (4xx other than 429). Rate limits, server errors and network errors are temporary.
 */
export function isPermanentSendError(err: unknown): boolean {
  return err instanceof GrammyError && err.error_code >= 400 && err.error_code < 500 && err.error_code !== 429;
}
