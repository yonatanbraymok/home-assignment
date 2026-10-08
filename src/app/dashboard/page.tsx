import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, CircleCheck, Send, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FloatPanel, Stage } from "@/components/stage";
import { getOverview, type CurrentUser } from "@/lib/dashboard/data";
import { botUrl } from "@/lib/env";
import { formatDateTime, formatDay, formatUsd } from "@/lib/format";
import { emailLink } from "@/lib/gmail/links";
import { resetDateText } from "@/lib/llm/budget-policy";
import { cn } from "@/lib/utils";
import { AgentChat } from "./agent-chat";
import { ApplicationsCard, type ApplicationRow } from "./applications-table";
import { WaitingBadge, describeChange } from "./proposal-badges";
import { WaitingSlides } from "./waiting-slides";

// The overview: budget and totals on a lilac stage beside what waits for the owner on a lime one,
// then the pipeline beside a chat with the agent, as white cards. Read-only: approving
// and rejecting stay in Telegram, so there are no buttons for them here.
export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading your applications…</p>}>
      <Overview />
    </Suspense>
  );
}

type OverviewData = Awaited<ReturnType<typeof getOverview>>;

async function Overview() {
  const data = await getOverview();
  const { user, applications } = data;
  const rows: ApplicationRow[] = applications.map((a) => ({
    id: a.id,
    company: a.company,
    roleTitle: a.roleTitle,
    jobRef: a.jobRef,
    status: a.status,
    lastUpdate: formatDay(a.lastUpdate),
    lastEmailUrl: a.lastEmailMessageId ? emailLink(user.gmailAddress, a.lastEmailMessageId) : null,
  }));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">Kept up to date from your inbox: the agent proposes, you approve in Telegram. Missed something? Correct it on the application.</p>
      </div>
      <GmailNotice user={user} />

      {/* Two rows. Top: the totals, and what waits for your decision. Below: the pipeline, and the
          chat with the agent in its own column, as tall as the pipeline. Phones: one column. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard data={data} className="lg:col-span-2" />
        <WaitingCard waiting={data.waiting} />
        <ApplicationsCard rows={rows} className="lg:col-span-2" />
        <AgentChat initial={data.chat.map((t) => ({ ...t, at: t.at.toISOString() }))} />
      </div>
    </div>
  );
}

// ---------- Top: the AI budget and the totals ----------

function SummaryCard({ data, className }: { data: OverviewData; className?: string }) {
  const { stats } = data;
  return (
    <Stage tone="lilac" className={cn("p-6 lg:p-7", className)}>
      <div className="grid h-full gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center">
        <BudgetMonitor budget={data.budget} forecastUsd={data.forecastUsd} />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-2">
          <Stat label="Tracked" value={stats.total} note={stats.response_rate_percent === null ? "none yet" : `${stats.response_rate_percent}% got a reply`} />
          <Stat label="In progress" value={stats.open} note={`${stats.no_reply_yet} waiting for a reply`} />
          <Stat label="Interviews" value={stats.by_status.INTERVIEW ?? 0} note={plural(stats.by_status.ASSESSMENT ?? 0, "online assessment")} />
          <Stat label="Offers" value={stats.by_status.OFFER ?? 0} note={`${stats.by_status.REJECTED ?? 0} rejected`} />
        </dl>
      </div>
    </Stage>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <FloatPanel className="flex flex-col gap-1 rounded-[1.4rem] p-4 shadow-[0_24px_48px_-28px_rgb(17_17_17/0.35)]">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-3xl font-extrabold tracking-tight tabular-nums">{value}</dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </FloatPanel>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const usd = formatUsd;

// Your AI allowance this month, against the hard cap the code enforces. Never over budget silently
// (DECISIONS §7): when limited or paused it says so, until when, and whose budget caused it.
function BudgetMonitor({ budget, forecastUsd }: { budget: OverviewData["budget"]; forecastUsd: number | null }) {
  const mine = budget.user!; // always present for a signed-in user
  const until = resetDateText(budget.resetsOn);
  const shared = budget.limitedBy === "service" ? " (shared budget)" : "";
  const state =
    budget.level === "out"
      ? { text: `Paused until ${until}${shared}`, className: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300", bar: "[&_[data-slot=progress-indicator]]:bg-rose-500" }
      : budget.level === "low"
        ? { text: `Limited until ${until}${shared}`, className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", bar: "[&_[data-slot=progress-indicator]]:bg-amber-500" }
        : { text: "On track", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", bar: "" };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-lg font-bold">AI budget</p>
        <Badge className={state.className}>{state.text}</Badge>
      </div>
      <p className="flex items-baseline gap-1.5">
        <span className="text-5xl font-extrabold tracking-[-0.05em] tabular-nums">{usd(mine.spentUsd)}</span>
        <span className="text-sm font-medium text-ink/70">of your {usd(mine.capUsd)} this month</span>
      </p>
      <Progress value={mine.percent} className={cn("h-2.5 bg-white/70", state.bar)} aria-label={`Your AI allowance: ${usd(mine.spentUsd)} of ${usd(mine.capUsd)} used this month`} />
      <p className="text-xs font-medium text-ink/70">
        Resets {until}
        {forecastUsd !== null && ` · about ${usd(forecastUsd)} by month end at this pace`} ·{" "}
        <Link href="/dashboard/settings#budget" className="font-bold text-ink underline underline-offset-2">
          Details
        </Link>
      </p>
    </div>
  );
}

// ---------- Right column ----------

function WaitingCard({ waiting, className }: { waiting: OverviewData["waiting"]; className?: string }) {
  const n = waiting.length;
  return (
    <Card id="waiting" className={cn("theme-light scroll-mt-24 rounded-[2.5rem] bg-lime shadow-none ring-0 [--card-spacing:--spacing(5)]", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Waiting for your approval
          {n > 0 && <Badge className="tabular-nums">{n}</Badge>}
        </CardTitle>
        <CardDescription>
          {n === 0
            ? "The agent's proposals appear here until you decide on them in Telegram."
            : `${n === 1 ? "1 card is" : `${n} cards are`} waiting in Telegram. Nothing changes until you approve.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {n === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-primary" />
            Nothing is waiting for you.
          </p>
        ) : (
          <FloatPanel className="p-4">
            <WaitingSlides
              slides={waiting.map((p) => (
                <div key={p.id} className="flex flex-col gap-1.5 pr-px">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium">
                      {p.applicationId ? (
                        <Link href={`/dashboard/applications/${p.applicationId}`} className="hover:underline">
                          {p.company}
                        </Link>
                      ) : (
                        p.company
                      )}
                    </p>
                    {p.expiresAt && <span className="shrink-0 text-xs text-muted-foreground">expires {formatDay(p.expiresAt)}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {describeChange(p)} · {p.roleTitle}
                    {p.jobRef && ` · Job ID ${p.jobRef}`}
                  </p>
                  <blockquote className="line-clamp-2 border-l-[3px] border-lilac pl-2.5 text-sm">“{p.evidenceQuote}”</blockquote>
                  <WaitingBadge proposal={p} />
                </div>
              ))}
            />
          </FloatPanel>
        )}
      </CardContent>
      {n > 0 && (
        <CardFooter className="border-0 bg-transparent">
          <TelegramButton variant="default" />
        </CardFooter>
      )}
    </Card>
  );
}

function TelegramButton({ variant }: { variant: "default" | "outline" }) {
  return (
    <Button asChild size="sm" variant={variant}>
      <a href={botUrl()}>
        <Send data-icon="inline-start" />
        Open Telegram
        <ArrowUpRight data-icon="inline-end" className="opacity-60" />
      </a>
    </Button>
  );
}

function GmailNotice({ user }: { user: CurrentUser }) {
  if (user.demo) {
    return (
      <Alert>
        <AlertTitle>Demo mode</AlertTitle>
        <AlertDescription>
          These applications come from sample emails, not your inbox. In Telegram, /demo_email makes a new sample email arrive and /demo_reset removes them
          all.
        </AlertDescription>
      </Alert>
    );
  }
  if (user.gmailSyncError) {
    return (
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>Gmail access expired or was revoked</AlertTitle>
        <AlertDescription>
          No new emails have been read{user.gmailLastSyncAt ? ` since ${formatDateTime(user.gmailLastSyncAt)}` : ""}. Send /connect to the bot to reconnect.
        </AlertDescription>
      </Alert>
    );
  }
  if (!user.gmailAddress) {
    return (
      <Alert>
        <TriangleAlert />
        <AlertTitle>Gmail isn&apos;t connected</AlertTitle>
        <AlertDescription>Nothing new is being read. Send /connect to the bot to connect it, or /demo to try it with sample emails.</AlertDescription>
      </Alert>
    );
  }
  return null;
}
