import { redeemLoginLink } from "@/lib/auth/login";
import { sessionUserId, startSession } from "@/lib/auth/session";
import { appUrl } from "@/lib/env";

// Entry point of the link the bot sends on /dashboard: ?t=<signed user id, 10 min, works once>.
export async function GET(req: Request) {
  const result = await redeemLoginLink(new URL(req.url).searchParams.get("t"));
  if (result.status === "ok") {
    await startSession(result.userId);
    return redirectTo("/dashboard");
  }
  // The same link loaded twice by one browser: the first load already signed it in, so carry on
  // instead of showing "already used".
  if (result.status === "used" && (await sessionUserId()) === result.userId) return redirectTo("/dashboard");
  return redirectTo(`/?login=${result.status}`);
}

// Next answers HEAD by running GET, which would use the link up. Link checkers and some preview
// services send HEAD first; they get an empty answer and the link stays unused.
export function HEAD() {
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: appUrl(path),
      "Cache-Control": "no-store", // it sets a session cookie
      "Referrer-Policy": "no-referrer", // keeps the link out of the next request's Referer
    },
  });
}
