import "server-only";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";
import { SESSION_COOKIE, newSessionToken, sessionCookieOptions, sessionUserIdFrom } from "./tokens";

// Cookies can only be set or deleted in a Route Handler or a Server Action, never while a page renders.

export async function startSession(userId: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, newSessionToken(userId), sessionCookieOptions(requireEnv("APP_URL")));
}

/** The signed-in user's id, or null. It doesn't check that the user still exists; data.ts does. */
export async function sessionUserId(): Promise<string | null> {
  return sessionUserIdFrom((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function endSession(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/" });
}
