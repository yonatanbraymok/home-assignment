import { gmail } from "@googleapis/gmail";
import { encrypt, verifyToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { GMAIL_SCOPE, createOAuthClient } from "@/lib/gmail/oauth";
import { gmailConnectedText } from "@/lib/telegram/messages";
import { sendToUser } from "@/lib/telegram/notify";
import type { ResultStatus } from "@/app/gmail/result/statuses";

function result(status: ResultStatus) {
  return Response.redirect(appUrl(`/gmail/result?s=${status}`), 303);
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  if (params.get("error")) return result("denied"); // user pressed Cancel on Google's screen

  const userId = verifyToken(params.get("state"), "gmail-oauth-state");
  const code = params.get("code");
  if (!userId || !code) return result("expired");

  const client = createOAuthClient();
  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch (err) {
    console.error("gmail token exchange failed:", err instanceof Error ? err.message : err);
    return result("error");
  }
  // Google's consent screen lets users untick individual permissions.
  if (!tokens.scope?.split(" ").includes(GMAIL_SCOPE)) return result("missing-scope");
  if (!tokens.refresh_token) return result("error");

  client.setCredentials(tokens);
  let address: string | undefined;
  try {
    const profile = await gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" });
    address = profile.data.emailAddress?.toLowerCase();
  } catch (err) {
    console.error("gmail profile lookup failed:", err instanceof Error ? err.message : err);
  }
  if (!address) return result("error");

  const [user, owner] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { gmailAddress: true, telegramChatId: true } }),
    db.user.findUnique({ where: { gmailAddress: address }, select: { id: true } }),
  ]);
  if (!user) return result("expired");
  if (owner && owner.id !== userId) return result("already-linked");

  const switchedAccount = user.gmailAddress !== address;
  await db.user.update({
    where: { id: userId },
    data: {
      gmailAddress: address,
      gmailRefreshTokenEnc: encrypt(tokens.refresh_token),
      gmailConnectedAt: new Date(),
      gmailSyncError: null,
      backfillDoneAt: null, // emails from before now are read first and reviewed one at a time
      // A different mailbox starts with a fresh 60-day backfill.
      ...(switchedAccount ? { gmailLastSyncAt: null } : {}),
    },
  });

  await sendToUser(user.telegramChatId, gmailConnectedText(address)).catch((e) => console.error("connected notice failed:", e instanceof Error ? e.message : e));

  return result("connected");
}
