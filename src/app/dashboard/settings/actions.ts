"use server";

import { getCurrentUser } from "@/lib/dashboard/data";
import { createMcpToken, revokeMcpToken } from "@/lib/mcp/auth";

// The dashboard's only write, and it touches nothing but the signed-in user's own MCP token.
// It re-checks the session itself: a Server Action is a public endpoint.

export type TokenState = { token: string; createdAt: string } | { revoked: true } | null;

export async function tokenAction(_previous: TokenState, form: FormData): Promise<TokenState> {
  const user = await getCurrentUser();
  if (form.get("intent") === "revoke") {
    await revokeMcpToken(user.id);
    return { revoked: true };
  }
  const { token, createdAt } = await createMcpToken(user.id);
  // Returned to this browser once; only its hash is stored.
  return { token, createdAt: createdAt.toISOString() };
}
