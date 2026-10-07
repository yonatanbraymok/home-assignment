import Link from "next/link";
import { Suspense } from "react";
import { CircleCheck, Circle, Send, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOverview, type CurrentUser } from "@/lib/dashboard/data";
import { botUrl } from "@/lib/env";
import { formatDateTime, formatDay } from "@/lib/format";
import { emailLink } from "@/lib/gmail/links";
import { ApplicationsTable, type ApplicationRow } from "./applications-table";
import { WaitingBadge, describeChange } from "./proposal-badges";

// Read-only. Approving and rejecting stay in Telegram, so there are no buttons for them here.
export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading your applications…</p>}>
      <Overview />
    </Suspense>
  );
}

type OverviewData = Awaited<ReturnType<typeof getOverview>>;

async function Overview() {
  const { user, applications, waiting, stats, gettingStarted } = await getOverview();
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">Kept up to date from your inbox. Changes are approved by you, in Telegram.</p>
      </div>
      <GmailNotice user={user} demo={gettingStarted.demo} />
      <GettingStarted steps={gettingStarted} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        <Metric label="Tracked" value={stats.total} note={stats.response_rate_percent === null ? undefined : `${stats.response_rate_percent}% got a reply`} />
        <Metric label="In progress" value={stats.open} note={`${stats.no_reply_yet} waiting for a reply`} />
        <Metric label="Rejected" value={stats.by_status.REJECTED ?? 0} />
        <Metric label="Waiting for you" value={waiting.length} note="cards in Telegram" href={waiting.length ? "#waiting" : undefined} />
      </section>

      <Waiting waiting={waiting} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">All applications ({applications.length})</h2>
        {applications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No applications yet. They appear here once you approve them in Telegram.</p>
        ) : (
          <ApplicationsTable rows={rows} />
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, note, href }: { label: string; value: number; note?: string; href?: string }) {
  const body = (
    <Card size="sm" className={href ? "h-full transition-colors hover:bg-muted/50" : "h-full"}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums group-data-[size=sm]/card:text-2xl">{value}</CardTitle>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardHeader>
    </Card>
  );
  return href ? <a href={href}>{body}</a> : body;
}

function GmailNotice({ user, demo }: { user: CurrentUser; demo: boolean }) {
  if (demo) {
    return (
      <Alert>
        <AlertTitle>Demo mode</AlertTitle>
        <AlertDescription>
          These applications come from sample emails, not your inbox. In Telegram, /demo_email sends the next sample email and /demo_reset
          removes them all.
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
          No new emails have been read{user.gmailLastSyncAt ? ` since ${formatDateTime(user.gmailLastSyncAt)}` : ""}. Send /connect to the bot
          to reconnect.
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
        <CardDescription>Three steps, all in Telegram. This disappears once they&apos;re done.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
        <div>
          <Button asChild size="sm">
            <a href={botUrl()}>
              <Send data-icon="inline-start" />
              Open Telegram
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Waiting({ waiting }: { waiting: OverviewData["waiting"] }) {
  if (waiting.length === 0) return null;
  return (
    <section id="waiting" className="flex scroll-mt-20 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Waiting for your decision ({waiting.length})</h2>
          <p className="text-sm text-muted-foreground">The agent&apos;s proposals. Only you can approve them, in Telegram: nothing changes until you do.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={botUrl()}>
            <Send data-icon="inline-start" />
            Open Telegram
          </a>
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {waiting.map((p) => (
          <Card key={p.id} size="sm">
            <CardHeader>
              <CardTitle>
                {p.applicationId ? (
                  <Link href={`/dashboard/applications/${p.applicationId}`} className="hover:underline">
                    {p.company} · {p.roleTitle}
                  </Link>
                ) : (
                  `${p.company} · ${p.roleTitle}`
                )}
              </CardTitle>
              <CardDescription>
                {describeChange(p)}
                {p.jobRef && ` · Job ID ${p.jobRef}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <WaitingBadge proposal={p} />
              <blockquote className="line-clamp-3 border-l-2 border-primary/60 pl-3 text-sm">“{p.evidenceQuote}”</blockquote>
              <p className="text-xs text-muted-foreground">
                From “{p.email.subject}”, {formatDay(p.email.receivedAt)}
                {p.expiresAt && ` · expires ${formatDateTime(p.expiresAt)}`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
