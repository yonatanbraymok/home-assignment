import { gmail } from "@googleapis/gmail";
import { encrypt, verifyToken } from "@/lib/crypto";
import { resetDemo } from "@/lib/demo/demo";
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
    db.user.findUnique({ where: { id: userId }, select: { gmailAddress: true, telegramChatId: true, demoAt: true } }),
    db.user.findUnique({ where: { gmailAddress: address }, select: { id: true } }),
  ]);
  if (!user) return result("expired");
  if (owner && owner.id !== userId) return result("already-linked");

  // Real email ends the demo: sample and real emails never mix.
  if (user.demoAt) await resetDemo(userId);
  // Tracking starts now: past emails aren't read (60 days of a real inbox was too slow for one
  // run), so there's no review of past emails; new job emails get a card as they arrive.
  const now = new Date();
  await db.user.update({
    where: { id: userId },
    data: {
      gmailAddress: address,
      gmailRefreshTokenEnc: encrypt(tokens.refresh_token),
      gmailConnectedAt: now,
      gmailLastSyncAt: now,
      backfillDoneAt: now,
      gmailSyncError: null,
    },
  });

  await sendToUser(user.telegramChatId, gmailConnectedText(address, Boolean(user.demoAt))).catch((e) => console.error("connected notice failed:", e instanceof Error ? e.message : e));

  return result("connected");
}
