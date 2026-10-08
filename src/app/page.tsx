import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { PlayfulShape } from "@/components/playful-shape";
import { SiteFooter } from "@/components/site-footer";
import { FloatPanel, Stage } from "@/components/stage";
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

// Public home page, kept short: the hero with a fan of tracked applications on a pastel stage, how
// it works in three steps, then the call to action. The hero animates with CSS, so it shows without JavaScript.
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
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-3 px-6">
          <Link href="/" className="flex items-center gap-2.5 font-heading text-base font-extrabold tracking-tight whitespace-nowrap sm:text-lg">
            <BrandMark className="size-8" />
            {APP_NAME}
          </Link>
          <nav className="flex items-center gap-2 text-sm font-medium sm:gap-6">
            <a href="#how-it-works" className="hidden text-foreground/70 transition-colors hover:text-foreground sm:block">
              How it works
            </a>
            <Link href="/dashboard" className="hidden text-foreground/70 transition-colors hover:text-foreground sm:block">
              Dashboard
            </Link>
            <CtaButton href={botUrl()}>Start now</CtaButton>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* The hero, with a few shapes bobbing around the heading. */}
        <section className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-14 text-center sm:pt-20">
          <PlayfulShape kind="burst" tone="lime" face rotate={-8} className="top-10 left-[2%] size-16 lg:top-16 lg:left-[6%] lg:size-24" />
          <PlayfulShape kind="dot" tone="sky" delay={1.2} className="top-4 left-1/2 hidden size-7 sm:block" />
          <PlayfulShape kind="wedge" tone="pink" face sleepy rotate={-40} delay={0.6} className="top-32 right-[1%] size-16 lg:right-[6%] lg:size-24" />
          <PlayfulShape kind="diamond" tone="mint" rotate={12} delay={2} className="bottom-6 left-[12%] hidden size-12 lg:block" />

          <p className={`${enter} inline-flex items-center gap-2 rounded-full bg-secondary py-1 pr-3.5 pl-1 text-xs font-semibold text-foreground/80`}>
            <span className="inline-flex items-center gap-1 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink">
              <ShieldCheck className="size-3" />
              Safe
            </span>
            Read-only Gmail · every change approved by you
          </p>
          <h1 className={`${enter} mt-7 max-w-4xl text-[clamp(2.75rem,7vw,5.5rem)] leading-[1.03] font-bold tracking-[-0.045em] text-balance motion-safe:delay-100`}>
            Your job hunt on <Squiggle>autopilot</Squiggle>
          </h1>
          <p className={`${enter} mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground motion-safe:delay-200`}>
            Track applications directly from your inbox, securely approved via Telegram.
          </p>
          <div className={`${enter} mt-9 flex flex-wrap justify-center gap-3 motion-safe:delay-300`}>
            <CtaButton href={botUrl()} size="lg">
              Start now
            </CtaButton>
            <Button asChild size="lg" variant="secondary" className="h-12 px-6 text-base">
              {/* t.me deep link: opens the bot and sends "/start demo", which loads sample emails. */}
              <a href={`${botUrl()}?start=demo`}>Try it with sample emails</a>
            </Button>
          </div>
          <p className={`${enter} mt-5 text-xs text-muted-foreground motion-safe:delay-300`}>No password: Telegram is your login. No Gmail at hand? The sample inbox needs none.</p>
          {/* Reads the cookie and the URL (request data), so it streams in behind a boundary. */}
          <div className="mt-6 w-full max-w-md text-left empty:hidden">
            <Suspense fallback={null}>
              <SignInState searchParams={props.searchParams} />
            </Suspense>
          </div>
        </section>

        {/* The tracked applications, floating on a lilac stage. */}
        <div className="mx-auto mt-12 w-full max-w-6xl px-4 sm:px-6">
          <Stage tone="lilac" aria-hidden className="py-14 sm:py-20">
            <div className="edge-fade flex items-center justify-center px-4">
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
          </Stage>
        </div>

        {/* How it works: each step on its own coloured stage. */}
        <section id="how-it-works" className="scroll-mt-20 px-6 py-24 sm:py-28">
          <div className="mx-auto flex max-w-6xl flex-col gap-12">
            <div className="flex flex-col items-center gap-5 text-center">
              <Pill icon={<Sparkles />}>How it works</Pill>
              <h2 className="max-w-2xl text-4xl leading-[1.05] font-bold text-balance sm:text-5xl">
                Set it up once. It <Squiggle>runs on its own</Squiggle>.
              </h2>
            </div>
            <HowItWorks />
          </div>
        </section>

        {/* The call to action. */}
        <section id="sign-in" className="px-4 pb-20 sm:px-6 sm:pb-24">
          <Stage tone="lime" className="mx-auto max-w-6xl px-6 py-16 sm:px-10 sm:py-20">
            <PlayfulShape kind="pill" tone="lilac" face sleepy delay={0.4} className="top-10 left-[6%] hidden size-24 lg:block" />
            <PlayfulShape kind="wedge" tone="sky" face rotate={-20} delay={1.4} className="right-[6%] bottom-10 hidden size-24 lg:block" />
            <div className="relative flex flex-col items-center text-center">
              <h2 className="max-w-2xl text-3xl leading-[1.08] font-bold text-balance sm:text-5xl">Keep your pipeline perfectly synced without manual data entry.</h2>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <CtaButton href={botUrl()} size="lg">
                  Start now
                </CtaButton>
              </div>
              <FloatPanel className="mt-10 max-w-lg px-6 py-4 text-sm text-ink/70">
                <span className="font-semibold text-ink">Open your dashboard:</span> send <code className="rounded-md bg-secondary px-1.5 py-0.5 text-ink">/dashboard</code> to{" "}
                <a className="font-semibold text-ink underline underline-offset-4" href={botUrl()}>
                  @{bot}
                </a>{" "}
                and open the link it sends you. Each link works once, within 10 minutes.
              </FloatPanel>
            </div>
          </Stage>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/** The primary call to action: a black pill with a lime arrow badge. */
function CtaButton({ href, size, children }: { href: string; size?: "lg"; children: ReactNode }) {
  return (
    <Button asChild size={size} className={cn("group/cta pl-1.5", size === "lg" ? "h-12 gap-3 pr-6 text-base" : "h-10 gap-2.5 pr-5")}>
      <a href={href}>
        <span className={cn("grid place-items-center rounded-full bg-lime text-ink transition-transform group-hover/cta:translate-x-0.5", size === "lg" ? "size-9" : "size-7")}>
          <ArrowRight className="size-4" />
        </span>
        {children}
      </a>
    </Button>
  );
}

function Pill({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full bg-secondary px-3.5 py-1.5 text-xs font-semibold tracking-wide [&>svg]:size-3.5", className)}>
      {icon}
      {children}
    </span>
  );
}

/** A hand-drawn lilac underline under a word or two. */
function Squiggle({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg viewBox="0 0 200 14" preserveAspectRatio="none" className="absolute -bottom-1.5 left-0 h-[0.18em] w-full" aria-hidden>
        <path d="M3 9q50-8 100-2t94-2" fill="none" stroke="#c084fc" strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
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
