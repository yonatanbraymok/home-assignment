import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, ChevronDown, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { getSignedInUser } from "@/lib/dashboard/data";
import { botUrl, requireEnv } from "@/lib/env";
import { ProductTour } from "./_landing/product-tour";
import { Reveal } from "./_landing/reveal";
import { SIGN_IN_MESSAGES, isSignInStatus } from "./sign-in-messages";

// Public home page, as a scroll-driven product tour: the hero, three steps that animate as they
// scroll past (connect Gmail, an email arrives, approve it in Telegram), then the call to action.
// The hero animates with CSS, so it shows without waiting for JavaScript. Sign-in only starts from
// Telegram (/dashboard sends a single-use link).
export default function Home(props: PageProps<"/">) {
  const bot = requireEnv("TELEGRAM_BOT_USERNAME");
  const enter = "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700 motion-safe:fill-mode-both";
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <BrandMark />
            {APP_NAME}
          </Link>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <a href="#how-it-works">How it works</a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button asChild size="sm">
              <a href={botUrl()}>Start now</a>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Scene 1: the hero. */}
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 pt-20 pb-16 text-center sm:pt-28 sm:pb-24">
          <p className={`${enter} inline-flex items-center gap-2 rounded-full border bg-zinc-50 px-3 py-1 text-xs text-muted-foreground dark:bg-zinc-900`}>
            <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            Read-only Gmail access · every change approved by you
          </p>
          <h1 className={`${enter} mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance motion-safe:delay-100 sm:text-6xl`}>
            <span className="mb-3 block text-lg font-medium tracking-normal text-primary sm:text-xl">
              {APP_NAME}
              <span className="sr-only">:</span>
            </span>
            Your Job Hunt on Autopilot
          </h1>
          <p className={`${enter} mt-5 max-w-xl text-lg text-muted-foreground motion-safe:delay-200 sm:text-xl`}>
            Track applications directly from your inbox, securely approved via Telegram.
          </p>
          <div className={`${enter} mt-8 flex flex-wrap justify-center gap-3 motion-safe:delay-300`}>
            <Button asChild size="lg">
              <a href={botUrl()}>
                Start now
                <ArrowRight data-icon="inline-end" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              {/* t.me deep link: opens the bot and sends "/start demo", which loads sample emails. */}
              <a href={`${botUrl()}?start=demo`}>Try it with sample emails</a>
            </Button>
          </div>
          {/* Reads the cookie and the URL (request data), so it streams in behind a boundary. */}
          <div className="mt-6 w-full max-w-md text-left empty:hidden">
            <Suspense fallback={null}>
              <SignInState searchParams={props.searchParams} />
            </Suspense>
          </div>
          <a href="#how-it-works" className={`${enter} mt-14 flex flex-col items-center gap-1 text-xs text-muted-foreground motion-safe:delay-500 hover:text-foreground`}>
            See how it works
            <ChevronDown className="size-4 motion-safe:animate-bounce" />
          </a>
        </section>

        {/* Scenes 2 to 4: the tour. */}
        <section id="how-it-works" className="scroll-mt-14 border-t">
          <h2 className="sr-only">How it works</h2>
          <ProductTour />
        </section>

        {/* Scene 5: the result, and the call to action. */}
        <section id="scene-5" className="border-t bg-zinc-50 dark:bg-zinc-900/30">
          <Reveal className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:py-32">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Keep your pipeline perfectly synced without manual data entry.</h2>
            <p className="mt-5 max-w-xl text-muted-foreground sm:text-lg">
              Every confirmation, assessment, interview, rejection and offer, tracked from your inbox, with the evidence one tap away.
            </p>
            <Button asChild size="lg" className="mt-10 h-12 px-8 text-base">
              <a href={botUrl()}>
                Start Now
                <ArrowRight data-icon="inline-end" />
              </a>
            </Button>
            <p className="mt-5 text-sm text-muted-foreground">
              No Gmail at hand?{" "}
              <a className="font-medium text-primary underline-offset-4 hover:underline" href={`${botUrl()}?start=demo`}>
                Try it with sample emails
              </a>
            </p>
          </Reveal>
        </section>

        <section id="sign-in" className="border-t">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-10 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium">Open your dashboard</p>
            <p className="text-muted-foreground">
              Telegram is your login: send <code className="rounded bg-muted px-1 py-0.5">/dashboard</code> to{" "}
              <a className="font-medium text-primary underline-offset-4 hover:underline" href={botUrl()}>
                @{bot}
              </a>{" "}
              and open the link it sends you. Each link works once, within 10 minutes.
            </p>
          </div>
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
