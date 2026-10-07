import { gmail, type gmail_v1 } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";
import { decrypt } from "@/lib/crypto";
import { appUrl, requireEnv } from "@/lib/env";

// Least privilege: read-only. The agent can never send, delete or change mail.
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function createOAuthClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: appUrl("/api/gmail/callback"),
  });
}

export function consentUrl(state: string): string {
  return createOAuthClient().generateAuthUrl({
    access_type: "offline", // background sync needs a refresh token
    prompt: "consent", // makes Google return a refresh token on reconnects too
    scope: [GMAIL_SCOPE],
    state,
  });
}

/** Gmail API client acting as the user, from their stored (encrypted) refresh token. */
export function gmailForUser(refreshTokenEnc: string): gmail_v1.Gmail {
  const auth = createOAuthClient();
  auth.setCredentials({ refresh_token: decrypt(refreshTokenEnc) });
  return gmail({ version: "v1", auth });
}

/** Google answers `invalid_grant` when a refresh token was revoked or has expired. */
export function isRevokedGrant(err: unknown): boolean {
  const data = (err as { response?: { data?: { error?: string } } })?.response?.data;
  return data?.error === "invalid_grant" || (err instanceof Error && err.message.includes("invalid_grant"));
}
