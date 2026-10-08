import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { APP_NAME } from "@/lib/brand";
import { getSignedInUser } from "@/lib/dashboard/data";
import { botUrl, requireEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { HowItWorks } from "./_landing/how-it-works";
import { MockApplication } from "./_landing/mocks";
import { SIGN_IN_MESSAGES, isSignInStatus } from "./sign-in-messages";

// Public home page, kept short: the hero with a fan of tracked applications, how it works in three
// steps, then the call to action. The hero animates with CSS, so it shows without JavaScript.
// Sign-in only starts from Telegram (/dashboard sends a single-use link).

// The demo's fictional companies, fanned out under the hero; the middle one is in focus.
const FAN: { company: string; role: string; status: ApplicationStatus; tilt: string }[] = [
  { company: "Aurora Pay", role: "Frontend Developer Intern", status: "REJECTED", tilt: "-rotate-6 translate-y-10 opacity-35" },
  { company: "Northwind Robotics", role: "Embedded Software Intern", status: "INTERVIEW", tilt: "-rotate-3 translate-y-3 opacity-75" },
  { company: "Vega Games", role: "Gameplay Programmer Intern", status: "OFFER", tilt: "-translate-y-2 z-10" },
  { company: "Lumen Health", role: "Data Science Intern", status: "ASSESSMENT", tilt: "rotate-3 translate-y-3 opacity-75" },
  { company: "Cobalt Cloud", role: "Backend Engineering Intern", status: "APPLIED", tilt: "rotate-6 translate-y-10 opacity-35" },
];

export default function Home(props: PageProps<"/">) {
  const bot = requireEnv("TELEGRAM_BOT_USERNAME");
  const enter = "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700 motion-safe:fill-mode-both";
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5 font-heading text-base font-bold tracking-tight whitespace-nowrap sm:text-lg">
          <BrandMark className="size-8" />
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-2 text-sm sm:gap-6">
          <a href="#how-it-works" className="hidden text-foreground/70 transition-colors hover:text-foreground sm:block">
            How it works
          </a>
          <Link href="/dashboard" className="hidden text-foreground/70 transition-colors hover:text-foreground sm:block">
            Dashboard
          </Link>
          <Button asChild className="h-10 px-5">
            <a href={botUrl()}>
              Start now
              <ArrowRight data-icon="inline-end" />
            </a>
          </Button>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        {/* The hero. */}
        <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-6 pt-12 text-center sm:pt-20">
          <Pill icon={<ShieldCheck />} className={enter}>
            Read-only Gmail · every change approved by you
          </Pill>
          <h1 className={`${enter} mt-7 text-[clamp(2.75rem,7.5vw,6rem)] leading-[1.06] font-bold tracking-[-0.045em] text-balance motion-safe:delay-100`}>
            Your job hunt on <Highlight>autopilot</Highlight>
          </h1>
          <p className={`${enter} mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground motion-safe:delay-200`}>
            Track applications directly from your inbox, securely approved via Telegram.
          </p>
          <div className={`${enter} mt-9 flex flex-wrap justify-center gap-3 motion-safe:delay-300`}>
            <Button asChild size="lg" className="h-13 px-7 text-base">
              <a href={botUrl()}>
                Start now
                <ArrowRight data-icon="inline-end" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-13 border-foreground/15 bg-transparent px-7 text-base">
              {/* t.me deep link: opens the bot and sends "/start demo", which loads sample emails. */}
              <a href={`${botUrl()}?start=demo`}>Try it with sample emails</a>
            </Button>
          </div>
          <p className={`${enter} mt-4 text-xs text-muted-foreground motion-safe:delay-300`}>No password: Telegram is your login. No Gmail at hand? The sample inbox needs none.</p>
          {/* Reads the cookie and the URL (request data), so it streams in behind a boundary. */}
          <div className="mt-6 w-full max-w-md text-left empty:hidden">
            <Suspense fallback={null}>
              <SignInState searchParams={props.searchParams} />
            </Suspense>
          </div>
        </section>

        <div className="edge-fade relative mt-10 pb-20" aria-hidden>
          <div className="flex items-center justify-center px-4">
            {FAN.map((card, i) => (
              <MockApplication
                key={card.company}
                {...card}
                className={cn(
                  "-mx-6 w-56 shrink-0 sm:-mx-4 sm:w-60 md:-mx-3 md:w-64",
                  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-8 motion-safe:duration-700 motion-safe:fill-mode-both",
                  card.tilt,
                )}
                style={{ animationDelay: `${350 + i * 90}ms` }}
              />
            ))}
          </div>
        </div>

        {/* How it works, on the dark grid. */}
        <section id="how-it-works" className="grid-bg scroll-mt-4 px-6 py-20 sm:py-24">
          <div className="mx-auto flex max-w-6xl flex-col gap-12">
            <div className="flex flex-col items-center gap-5 text-center">
              <Pill icon={<Sparkles />}>How it works</Pill>
              <h2 className="max-w-2xl text-4xl leading-[1.05] font-bold text-white sm:text-5xl">
                Set it up once. It <Highlight>runs on its own</Highlight>.
              </h2>
            </div>
            <HowItWorks />
          </div>
        </section>

        {/* The call to action. */}
        <section id="sign-in" className="px-6 py-20 sm:py-24">
          <div className="mx-auto flex max-w-5xl flex-col items-center rounded-[2rem] bg-ink px-6 py-16 text-center text-paper sm:px-10 sm:py-20">
            <h2 className="max-w-2xl text-3xl leading-[1.08] font-bold text-balance sm:text-5xl">
              Keep your pipeline <Highlight>perfectly synced</Highlight> without manual data entry.
            </h2>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="h-13 px-8 text-base">
                <a href={botUrl()}>
                  Start Now
                  <ArrowRight data-icon="inline-end" />
                </a>
              </Button>
            </div>
            <p className="mt-8 max-w-lg text-sm text-paper/60">
              <span className="font-medium text-paper">Open your dashboard:</span> send <code className="rounded bg-white/10 px-1.5 py-0.5">/dashboard</code> to{" "}
              <a className="font-medium text-highlight underline-offset-4 hover:underline" href={botUrl()}>
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

function Pill({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full bg-highlight px-3.5 py-1.5 text-xs font-medium tracking-wide text-ink [&>svg]:size-3.5", className)}>
      {icon}
      {children}
    </span>
  );
}

/** A light-blue marker behind a word, upright. */
function Highlight({ children }: { children: ReactNode }) {
  return <mark className="rounded-[0.18em] bg-highlight px-[0.14em] text-ink [box-decoration-break:clone]">{children}</mark>;
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
