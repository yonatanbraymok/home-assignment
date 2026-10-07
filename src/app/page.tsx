import Link from "next/link";
import { Suspense } from "react";
import { Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getSignedInUser } from "@/lib/dashboard/data";
import { botUrl, requireEnv } from "@/lib/env";
import { SIGN_IN_MESSAGES, isSignInStatus } from "./sign-in-messages";

// Public home page: what the app is and how to sign in. Sign-in only starts from Telegram.
export default function Home(props: PageProps<"/">) {
  const bot = requireEnv("TELEGRAM_BOT_USERNAME");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Job Hunt Tracker</h1>
        <p className="text-muted-foreground">
          Keeps your internship applications up to date from your Gmail. Every change is proposed in Telegram, with the sentence from the
          email that justifies it, and nothing changes until you approve it there.
        </p>
      </div>
      {/* Reads the cookie and the URL (request data), so it streams in behind a boundary. */}
      <Suspense fallback={null}>
        <SignInState searchParams={props.searchParams} />
      </Suspense>
      <Card>
        <CardHeader>
          <CardTitle>Open your dashboard</CardTitle>
          <CardDescription>Telegram is your login: there&apos;s no password.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              Send <code>/dashboard</code> to @{bot}.
            </li>
            <li>Open the link it sends you. Each link works once, within 10 minutes.</li>
          </ol>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <a href={botUrl()}>
              <Send data-icon="inline-start" />
              Open @{bot} in Telegram
            </a>
          </Button>
        </CardFooter>
      </Card>
      <p className="text-xs text-muted-foreground">
        <Link className="underline" href="/privacy">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link className="underline" href="/terms">
          Terms
        </Link>
      </p>
    </main>
  );
}

async function SignInState({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const [{ login }, user] = await Promise.all([searchParams, getSignedInUser()]);
  if (user) {
    return (
      <Alert>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>Signed in as {user.name}.</span>
          <Button asChild size="sm">
            <Link href="/dashboard">Open your dashboard</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return isSignInStatus(login) ? (
    <Alert role="status">
      <AlertDescription>{SIGN_IN_MESSAGES[login]}</AlertDescription>
    </Alert>
  ) : null;
}
