import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, CircleCheck, Circle, Send, TriangleAlert } from "lucide-react";
import type { ApplicationStatus, EmailCategory, ProposalState } from "@/generated/prisma/enums";
import { STATUS_DOT } from "@/components/status-badge";
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
import { STATUS_LABEL } from "@/lib/proposals/rules";
import { cn } from "@/lib/utils";
import { ApplicationsCard, type ApplicationRow } from "./applications-table";
import { CATEGORY_LABEL } from "./labels";
import { WaitingBadge, describeChange } from "./proposal-badges";

// The overview, as a bento grid of cards: budget and totals across the top, the pipeline on the
// left, and on the right what waits for the owner and what happened lately. Read-only: approving
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
  const { user, applications, gettingStarted } = data;
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
      <GmailNotice user={user} demo={gettingStarted.demo} />

      {/* Phones get one column in reading order; from lg the pipeline spans two columns and the
          right column stacks what waits for you above the activity card, which takes the rest. */}
      <div className="grid gap-4 lg:grid-cols-3 lg:grid-rows-[auto_auto_1fr]">
        <SummaryCard data={data} className="lg:col-span-3" />
        <div className="flex flex-col gap-4 lg:col-start-3 lg:row-start-2">
          <GettingStarted steps={gettingStarted} />
          <WaitingCard waiting={data.waiting} />
        </div>
        <ApplicationsCard rows={rows} className="lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-2" />
        <ActivityCard activity={data.activity} className="lg:col-start-3 lg:row-start-3" />
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

function GettingStarted({ steps }: { steps: OverviewData["gettingStarted"] }) {
  const items = [
    { done: steps.gmailConnected, label: "Connect Gmail", hint: "Send /connect to the bot (or /demo to use sample emails)." },
    { done: steps.approvedSomething, label: "Approve your first card", hint: "Cards arrive in Telegram; nothing changes until you tap Approve." },
    { done: steps.askedQuestion, label: "Ask the bot a question", hint: "For example: \"Which applications are waiting for a reply?\"" },
  ];
  if (items.every((i) => i.done)) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Getting started</CardTitle>
        <CardDescription>Three steps, all in Telegram. This card goes once they&apos;re done.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item.label} className="flex gap-2.5 text-sm">
              {item.done ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <span>
                <span className={item.done ? "text-muted-foreground line-through" : "font-medium"}>{item.label}</span>
                {!item.done && <span className="block text-muted-foreground">{item.hint}</span>}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
      <CardFooter>
        <TelegramButton variant="default" />
      </CardFooter>
    </Card>
  );
}

const MAX_WAITING_SHOWN = 4;

function WaitingCard({ waiting }: { waiting: OverviewData["waiting"] }) {
  const more = waiting.length - MAX_WAITING_SHOWN;
  return (
    <Card id="waiting" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Waiting for your approval
          {waiting.length > 0 && <Badge className="tabular-nums">{waiting.length}</Badge>}
        </CardTitle>
        <CardDescription>The agent&apos;s proposals. Only you can approve them, in Telegram: nothing changes until you do.</CardDescription>
      </CardHeader>
      <CardContent>
        {waiting.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            Nothing is waiting for you.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {waiting.slice(0, MAX_WAITING_SHOWN).map((p) => (
              <li key={p.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
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
              </li>
            ))}
          </ul>
        )}
        {more > 0 && <p className="mt-3 text-xs text-muted-foreground">And {more} more: /pending in Telegram shows them all.</p>}
      </CardContent>
      {waiting.length > 0 && (
        <CardFooter>
          <TelegramButton variant="outline" />
        </CardFooter>
      )}
    </Card>
  );
}

const CATEGORY_STATUS: Partial<Record<EmailCategory, ApplicationStatus>> = {
  APPLICATION_RECEIVED: "APPLIED",
  ASSESSMENT_INVITE: "ASSESSMENT",
  INTERVIEW_INVITE: "INTERVIEW",
  OFFER: "OFFER",
  REJECTION: "REJECTED",
};

function outcome(p: OverviewData["activity"][number]["proposal"]): string {
  if (!p) return "No change needed";
  const outcomes: Record<ProposalState, string> = {
    PENDING: p.expiresAt ? "Waiting for your approval" : "In your review of past emails",
    EXECUTED: `Approved: ${STATUS_LABEL[p.toStatus]}`,
    REJECTED: "You rejected the change",
    EXPIRED: "Expired without a decision",
    SUPERSEDED: "Replaced by a newer email",
    STALE: "Not applied: the application had changed",
    FAILED: "Couldn't be applied",
  };
  return outcomes[p.state];
}

function ActivityCard({ activity, className }: { activity: OverviewData["activity"]; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>The latest job emails and what became of each one.</CardDescription>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet. Job emails show up here as soon as the agent reads them.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {activity.map((a) => {
              const status = a.category ? CATEGORY_STATUS[a.category] : undefined;
              const body = (
                <>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", status ? STATUS_DOT[status] : "bg-zinc-300 dark:bg-zinc-600")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{a.company ?? "Unknown company"}</span>
                      <time dateTime={a.receivedAt.toISOString()} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(a.receivedAt)}
                      </time>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.category ? CATEGORY_LABEL[a.category] : "Job email"} · {outcome(a.proposal)}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={a.id}>
                  {a.applicationId ? (
                    <Link href={`/dashboard/applications/${a.applicationId}`} className="-mx-2 flex gap-3 rounded-md px-2 py-1 hover:bg-muted/60">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex gap-3 py-1">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
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

function GmailNotice({ user, demo }: { user: CurrentUser; demo: boolean }) {
  if (demo) {
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
