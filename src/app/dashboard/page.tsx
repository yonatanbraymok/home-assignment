import Link from "next/link";
import { Suspense } from "react";
import { Send, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOverview, type CurrentUser } from "@/lib/dashboard/data";
import { botUrl } from "@/lib/env";
import { formatDateTime, formatDay } from "@/lib/format";
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
  const { user, applications, waiting, stats } = await getOverview();
  return (
    <div className="flex flex-col gap-8">
      <GmailNotice user={user} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tracked" value={stats.total} />
        <Stat label="Open" value={stats.open} />
        <Stat label="Waiting for a reply" value={stats.no_reply_yet} />
        <Stat label="Got a reply" value={stats.response_rate_percent === null ? "–" : `${stats.response_rate_percent}%`} />
      </section>
      <Waiting waiting={waiting} />
      <Pipeline applications={applications} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums group-data-[size=sm]/card:text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function GmailNotice({ user }: { user: CurrentUser }) {
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
        <AlertDescription>Nothing new is being read. Send /connect to the bot to connect it.</AlertDescription>
      </Alert>
    );
  }
  return null;
}

function Waiting({ waiting }: { waiting: OverviewData["waiting"] }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Waiting for your decision ({waiting.length})</h2>
          <p className="text-sm text-muted-foreground">
            The agent&apos;s proposals. Only you can approve them, in Telegram: nothing changes until you do.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={botUrl()}>
            <Send data-icon="inline-start" />
            Open Telegram
          </a>
        </Button>
      </div>
      {waiting.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting for your decision.</p>
      ) : (
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
                <blockquote className="line-clamp-3 border-l-2 pl-3 italic">“{p.evidenceQuote}”</blockquote>
                <p className="text-xs text-muted-foreground">
                  From “{p.email.subject}”, {formatDay(p.email.receivedAt)}
                  {p.expiresAt && ` · expires ${formatDateTime(p.expiresAt)}`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function Pipeline({ applications }: { applications: OverviewData["applications"] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Applications ({applications.length})</h2>
      {applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No applications tracked yet. They appear here once you approve them in Telegram.</p>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Last update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="pl-4 font-medium">
                    <Link href={`/dashboard/applications/${a.id}`} className="hover:underline">
                      {a.company}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/applications/${a.id}`} className="hover:underline">
                      {a.roleTitle}
                    </Link>
                    {a.jobRef && <span className="block text-xs text-muted-foreground">Job ID {a.jobRef}</span>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="pr-4 text-right text-muted-foreground tabular-nums">{formatDay(a.lastUpdate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  );
}
