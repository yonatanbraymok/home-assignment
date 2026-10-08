import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, CircleCheck, Send, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

// The overview, as a bento grid of cards: budget and totals across the top, the pipeline on the
// left, and on the right what waits for the owner and a chat with the agent. Read-only: approving
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
        <p className="text-sm text-muted-foreground">Kept up to date from your inbox. Every change is approved by you, in Telegram.</p>
      </div>
      <GmailNotice user={user} />

      {/* Phones get one column in reading order; from lg the pipeline spans two columns and the
          right column has what waits for you above the chat with the agent, which takes the rest. */}
      <div className="grid gap-4 lg:grid-cols-3 lg:grid-rows-[auto_auto_1fr]">
        <SummaryCard data={data} className="lg:col-span-3" />
        <WaitingCard waiting={data.waiting} className="lg:col-start-3 lg:row-start-2" />
        <ApplicationsCard rows={rows} className="lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-2" />
        <AgentChat
          initial={data.chat.map((t) => ({ ...t, at: t.at.toISOString() }))}
          className="lg:col-start-3 lg:row-start-3"
        />
      </div>
    </div>
  );
}

// ---------- Top: the AI budget and the totals ----------

function SummaryCard({ data, className }: { data: OverviewData; className?: string }) {
  const { stats } = data;
  return (
    <Card className={className}>
      <CardContent className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <BudgetMonitor budget={data.budget} forecastUsd={data.forecastUsd} />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 md:border-l md:pl-6">
          <Stat label="Tracked" value={stats.total} note={stats.response_rate_percent === null ? "none yet" : `${stats.response_rate_percent}% got a reply`} />
          <Stat label="In progress" value={stats.open} note={`${stats.no_reply_yet} waiting for a reply`} />
          <Stat label="Interviews" value={stats.by_status.INTERVIEW ?? 0} note={plural(stats.by_status.ASSESSMENT ?? 0, "online assessment")} />
          <Stat label="Offers" value={stats.by_status.OFFER ?? 0} note={`${stats.by_status.REJECTED ?? 0} rejected`} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-3xl font-semibold tracking-tight tabular-nums">{value}</dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
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
        <p className="text-sm font-medium">AI budget</p>
        <Badge className={state.className}>{state.text}</Badge>
      </div>
      <p className="flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{usd(mine.spentUsd)}</span>
        <span className="text-sm text-muted-foreground">of your {usd(mine.capUsd)} this month</span>
      </p>
      <Progress value={mine.percent} className={cn("h-1.5", state.bar)} aria-label={`Your AI allowance: ${usd(mine.spentUsd)} of ${usd(mine.capUsd)} used this month`} />
      <p className="text-xs text-muted-foreground">
        Resets {until}
        {forecastUsd !== null && ` · about ${usd(forecastUsd)} by month end at this pace`} ·{" "}
        <Link href="/dashboard/settings#budget" className="font-medium text-primary underline-offset-4 hover:underline">
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
    <Card id="waiting" className={cn("scroll-mt-20", className)}>
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
            <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            Nothing is waiting for you.
          </p>
        ) : (
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
                <blockquote className="line-clamp-2 border-l-2 border-primary/60 pl-2.5 text-sm">“{p.evidenceQuote}”</blockquote>
                <WaitingBadge proposal={p} />
              </div>
            ))}
          />
        )}
      </CardContent>
      {n > 0 && (
        <CardFooter>
          <TelegramButton variant="outline" />
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
