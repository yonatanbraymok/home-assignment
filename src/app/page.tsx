import Link from "next/link";
import { Suspense } from "react";
import { LayoutDashboard, Mail, MailCheck, Send } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME, TAGLINE } from "@/lib/brand";
import { getSignedInUser } from "@/lib/dashboard/data";
import { botUrl, requireEnv } from "@/lib/env";
import { SIGN_IN_MESSAGES, isSignInStatus } from "./sign-in-messages";

const STEPS = [
  {
    icon: Mail,
    title: "Connect your Gmail",
    body: "Send /connect to the bot. Access is read-only: it can never send, delete or change an email.",
  },
  {
    icon: MailCheck,
    title: "Approve changes in Telegram",
    body: "When a reply arrives, the bot sends a card with the exact sentence from the email and why it matters. Nothing changes until you tap Approve.",
  },
  {
    icon: LayoutDashboard,
    title: "See your pipeline",
    body: "Send /dashboard for a one-time sign-in link: every application, its emails and the evidence behind each status.",
  },
];

// Public home page. Sign-in only starts from Telegram (/dashboard sends a single-use link).
export default function Home(props: PageProps<"/">) {
  const bot = requireEnv("TELEGRAM_BOT_USERNAME");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <span className="font-semibold">{APP_NAME}</span>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-14 px-4 py-14 sm:py-20">
        <section className="flex max-w-2xl flex-col gap-5">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{TAGLINE}</h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            {APP_NAME} reads your job emails, spots confirmations, assessments, interviews, rejections and offers, and asks you in Telegram
            before changing anything.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href={botUrl()}>
                <Send data-icon="inline-start" />
                Open the Telegram bot
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              {/* t.me deep link: opens the bot and sends "/start demo", which loads sample emails. */}
              <a href={`${botUrl()}?start=demo`}>Try it with sample emails</a>
            </Button>
          </div>
          {/* Reads the cookie and the URL (request data), so it streams in behind a boundary. */}
          <Suspense fallback={null}>
            <SignInState searchParams={props.searchParams} />
          </Suspense>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">How it works</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <step.icon className="size-4" />
                      <span className="text-xs tabular-nums">Step {i + 1}</span>
                    </div>
                    <CardTitle>{step.title}</CardTitle>
                    <CardDescription>{step.body}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section id="sign-in">
          <Card>
            <CardHeader>
              <CardTitle>Open your dashboard</CardTitle>
              <CardDescription>Telegram is your login: there&apos;s no password.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              Send <code className="rounded bg-muted px-1 py-0.5">/dashboard</code> to{" "}
              <a className="font-medium text-primary underline-offset-4 hover:underline" href={botUrl()}>
                @{bot}
              </a>{" "}
              and open the link it sends you. Each link works once, within 10 minutes.
            </CardContent>
          </Card>
        </section>
      </main>

      <SiteFooter />
    </div>
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
