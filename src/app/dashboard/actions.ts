"use server";

import { redirect } from "next/navigation";
import { answerQuestion, type ChatResult } from "@/lib/agent/chat";
import { cleanQuestion, MAX_QUESTION_CHARS } from "@/lib/agent/question";
import { endSession, sessionUserId } from "@/lib/auth/session";
import { findSessionUser } from "@/lib/dashboard/queries";
import { quietly } from "@/lib/proposals/cards-io";
import { ensureBudgetNotices } from "@/lib/telegram/budget-notices";

export async function logout() {
  await endSession();
  redirect("/?login=signed-out");
}

/**
 * The dashboard chat: the same agent as the Telegram bot (read-only tools, checked quotes, the
 * budget and daily limit). A Server Action is a public endpoint, so it checks the session itself.
 */
export async function askAgent(raw: unknown): Promise<ChatResult> {
  const userId = await sessionUserId();
  // A deleted account's cookie still verifies, so the account must exist too.
  if (!userId || !(await findSessionUser(userId))) return { kind: "error", text: "Your session ended. Send /dashboard to the bot for a new sign-in link." };
  const question = cleanQuestion(raw);
  if (!question) return { kind: "error", text: `Ask a question of up to ${MAX_QUESTION_CHARS} characters.` };
  const result = await answerQuestion(userId, question, { channel: "dashboard" });
  // After the answer, as in Telegram: a "you've used 80%" notice never arrives before it.
  await quietly("budget notices", ensureBudgetNotices({ recipients: [userId] }));
  return result;
}
