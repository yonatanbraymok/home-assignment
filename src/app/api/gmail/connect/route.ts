import { signToken, verifyToken } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { consentUrl } from "@/lib/gmail/oauth";

// Entry point of the link the bot sends on /connect: ?t=<signed userId, 10 min>.
export async function GET(req: Request) {
  const userId = verifyToken(new URL(req.url).searchParams.get("t"), "gmail-connect");
  if (!userId) return Response.redirect(appUrl("/gmail/result?s=expired"), 303);

  // The OAuth `state` carries the userId, signed, so the callback knows whose Gmail this is
  // and can't be fed a state we didn't issue.
  return Response.redirect(consentUrl(signToken("gmail-oauth-state", userId, 600)), 302);
}
