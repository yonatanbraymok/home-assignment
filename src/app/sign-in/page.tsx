import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { checkLoginLink } from "@/lib/auth/login";
import { APP_NAME } from "@/lib/brand";
import { SIGN_IN_MESSAGES } from "../sign-in-messages";

// "same-origin", not "no-referrer": with no-referrer, browsers post the Continue form with
// `Origin: null`, and the sign-in check needs to see that it came from this site.
export const metadata = { title: `Sign in · ${APP_NAME}`, referrer: "same-origin" };

// Where a /dashboard link lands: whose account it opens, and a button to continue. Signing in
// happens only on that button (see api/auth/login).
export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5 font-heading text-lg font-bold tracking-tight">
          <BrandMark className="size-8" />
          {APP_NAME}
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pt-12 pb-20 sm:pt-20">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col gap-5 py-4">
            {/* Reads the link in the URL (request data), so it streams in behind a boundary. */}
            <Suspense fallback={<p className="text-muted-foreground">Checking your link…</p>}>
              <Confirm searchParams={props.searchParams} />
            </Suspense>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}

async function Confirm({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const { t } = await searchParams;
  await connection(); // request time: checking the link's expiry reads the clock
  const token = typeof t === "string" ? t : null;
  const link = await checkLoginLink(token);
  if (link.status !== "valid") {
    return (
      <>
        <h1 className="text-2xl font-bold">This link can&apos;t sign you in</h1>
        <p className="text-muted-foreground">{SIGN_IN_MESSAGES[link.status]}</p>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/">Back to the home page</Link>
        </Button>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-bold">Sign in to your dashboard</h1>
      <p className="text-muted-foreground">
        This link opens the tracker of <span className="font-medium text-foreground">{link.name}</span>, the Telegram account that sent /dashboard.
      </p>
      <form method="post" action="/api/auth/login">
        <input type="hidden" name="t" value={token!} />
        <Button type="submit" size="lg" className="w-full">
          {`Continue as ${link.name}`}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">Not you, or you didn&apos;t ask for this link? Close this page: nothing happens until you continue.</p>
    </>
  );
}
