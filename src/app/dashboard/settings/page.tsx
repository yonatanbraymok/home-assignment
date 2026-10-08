import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { APP_NAME } from "@/lib/brand";
import { getSettings, type CurrentUser } from "@/lib/dashboard/data";
import { formatDateTime, formatDay, formatUsd } from "@/lib/format";
import { resetDateText, type ScopeStatus, type SpendBreakdown } from "@/lib/llm/budget-policy";

export const metadata = { title: `Settings · ${APP_NAME}` };

// Read-only, like the rest of the dashboard: connecting, disconnecting and deleting data happen in
// Telegram, where each one asks the owner to confirm.
export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const { user, counts, budget, breakdown, forecastUsd, admin } = await getSettings();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {/* Bento: Gmail beside sign-in and MCP; the budget, and the admin view, full width. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:row-span-2">
          <CardHeader>
            <CardTitle>Gmail</CardTitle>
            <CardDescription>Read-only access: the agent can never send, delete or change mail.</CardDescription>
            <CardAction>
              <GmailStatus user={user} />
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Fact label="Mailbox" value={user.gmailAddress ?? (user.demo ? "Sample emails (/demo)" : "Not connected")} />
            <Fact label={user.demo ? "Demo since" : "Connected since"} value={user.gmailConnectedAt ? formatDay(user.gmailConnectedAt) : "–"} />
            <Fact label="Last checked" value={user.gmailLastSyncAt ? formatDateTime(user.gmailLastSyncAt) : "Not yet"} />
            <Fact label="Stored" value={`${counts.jobEmails} job emails · ${counts.applications} applications`} />
          </CardContent>
          <CardFooter className="flex-col items-start gap-1 text-sm text-muted-foreground">
            {user.gmailSyncError && <p className="text-destructive">{user.gmailSyncError}</p>}
            <p>
              Manage it in Telegram: /connect to connect or switch accounts, /disconnect to stop reading your email (your tracker stays),
              /delete_my_data to erase everything. Each asks you to confirm there.
            </p>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>MCP access for other agents</CardTitle>
            <CardDescription>Let your own AI assistant read your tracker and ask for interview or assessment briefs. Read-only.</CardDescription>
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/developers">Open Developers</Link>
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sign-in</CardTitle>
            <CardDescription>Telegram is your login: there&apos;s no password.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You signed in as {user.name} with a link from the bot. A session lasts 7 days; Log out ends it in this browser, and /delete_my_data
            ends it everywhere. Send /dashboard to the bot for a new link.
          </CardContent>
        </Card>
        <Card id="budget" className="scroll-mt-20 lg:col-span-2">
          <CardHeader>
            <CardTitle>AI budget</CardTitle>
            <CardDescription>Resets on {resetDateText(budget.resetsOn)} (the 1st of each month, UTC).</CardDescription>
            {budget.level !== "ok" && (
              <CardAction>
                <Badge variant="destructive">{budget.level === "out" ? "Paused" : "Limited"}</Badge>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <BudgetRow label="Your allowance" status={budget.user!} />
            <Breakdown breakdown={breakdown} />
            <p className="text-sm text-muted-foreground">
              {forecastUsd === null
                ? "A forecast appears after the first few days of the month."
                : `At this pace: about ${formatUsd(forecastUsd)} by the end of the month, of your ${formatUsd(budget.user!.capUsd)}.`}
            </p>
            <BudgetRow label="Shared by all users" status={budget.service} />
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                The service must cost under $50 a month for 5 people, about $10 each. Your AI allowance is {formatUsd(budget.user!.capUsd)}; with
                at most $4 each for hosting, that stays under $10. A typical month uses about $1.
              </li>
              <li>From 80% of either budget: up to 20 questions a day{budget.lighterEmailModel ? " and a lighter model for reading emails" : ""}.</li>
              <li>
                Used up: no questions and no new emails read until the 1st; emails wait and are read then. Your tracker, /status, approving cards
                and this dashboard keep working.
              </li>
              <li>Every AI call is checked against both budgets before it runs, and you get a message in Telegram at 80% and when it&apos;s used up.</li>
            </ul>
          </CardContent>
        </Card>
        {admin && (
          <Card id="admin" className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Admin: AI spend this month</CardTitle>
              <CardDescription>Visible only to you (ADMIN_TELEGRAM_USER_ID). The whole service, by purpose and by person.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Breakdown breakdown={admin.breakdown} />
              {admin.users.length === 0 ? (
                <p className="text-sm text-muted-foreground">No one has used AI this month.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {admin.users.map((u) => (
                    <li key={u.name}>
                      <BudgetRow label={u.name} status={u.status} />
                    </li>
                  ))}
                </ul>
              )}
              {admin.unattributedUsd > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatUsd(admin.unattributedUsd)} isn&apos;t tied to a user: evals, and accounts deleted with /delete_my_data.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Breakdown({ breakdown }: { breakdown: SpendBreakdown }) {
  const parts = [
    ["Reading emails", breakdown.emails],
    ["Questions in Telegram", breakdown.chat],
    ["Briefs for other agents", breakdown.briefs],
    ...(breakdown.other ? ([["Evals", breakdown.other]] as const) : []),
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
      {parts.map(([label, usd]) => (
        <div key={label} className="flex flex-col">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">{formatUsd(usd)}</dd>
        </div>
      ))}
    </dl>
  );
}

function BudgetRow({ label, status }: { label: string; status: ScopeStatus }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className={status.level === "ok" ? "font-medium tabular-nums" : "font-medium text-destructive tabular-nums"}>
          {formatUsd(status.spentUsd)} of {formatUsd(status.capUsd)} ({status.percent.toFixed(1)}%)
        </span>
      </div>
      <Progress value={status.percent} aria-label={`${label}: ${status.percent.toFixed(1)}% used this month`} />
    </div>
  );
}

function GmailStatus({ user }: { user: CurrentUser }) {
  if (user.gmailSyncError) return <Badge variant="destructive">Needs reconnecting</Badge>;
  if (user.demo) return <Badge className="bg-tint text-brand-dark dark:bg-brand/25 dark:text-[#7cc4ec]">Demo</Badge>;
  if (!user.gmailAddress) return <Badge variant="outline">Not connected</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Connected</Badge>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}
