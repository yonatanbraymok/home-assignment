import { checkLoginLink, redeemLoginLink } from "@/lib/auth/login";
import { sessionUserId, startSession } from "@/lib/auth/session";
import { appUrl } from "@/lib/env";

// The link the bot sends on /dashboard: ?t=<signed user id, 10 min, works once>.
//
// Opening it (GET) signs nobody in: it leads to /sign-in, which shows whose account the link opens
// and asks to continue. Only that page's button (POST, same site only) uses the link. So someone
// can't send you a link to *their* account and have your dashboard edits land in their tracker,
// and a preview crawler that opens the link can't use it up.

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t");
  const link = await checkLoginLink(token);
  // Already signed in with this account in this browser: carry on.
  if (link.status !== "expired" && (await sessionUserId()) === link.userId) return redirectTo("/dashboard");
  if (link.status === "valid") return redirectTo(`/sign-in?t=${encodeURIComponent(token!)}`);
  return redirectTo(`/?login=${link.status}`);
}

export async function POST(req: Request) {
  if (!fromThisSite(req)) return new Response("Sign in from the link the bot sent you.", { status: 403 });
  const token = (await req.formData()).get("t");
  const result = await redeemLoginLink(typeof token === "string" ? token : null);
  if (result.status === "ok") {
    await startSession(result.userId);
    return redirectTo("/dashboard");
  }
  // The same link confirmed twice by one browser: the first already signed it in.
  if (result.status === "used" && (await sessionUserId()) === result.userId) return redirectTo("/dashboard");
  return redirectTo(`/?login=${result.status}`);
}

/**
 * The Continue button on our own /sign-in page, not a form on another site. The Origin header says
 * so; some in-app browsers send `Origin: null` instead, and then the browser's own Sec-Fetch-Site
 * header (which pages can't set) must say same-origin. A post from another site fails both.
 */
function fromThisSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") return origin === new URL(req.url).origin || origin === new URL(appUrl()).origin;
  return req.headers.get("sec-fetch-site") === "same-origin";
}

// Next answers HEAD by running GET. GET no longer uses a link, but link checkers still get an
// empty answer, with nothing looked up.
export function HEAD() {
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: appUrl(path),
      "Cache-Control": "no-store", // it may set a session cookie
      "Referrer-Policy": "no-referrer", // keeps the link out of the next request's Referer
    },
  });
}
