import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getSettings, type CurrentUser } from "@/lib/dashboard/data";
import { formatDateTime, formatDay } from "@/lib/format";

export const metadata = { title: "Settings · Job Hunt Tracker" };

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
  const { user, counts, budget } = await getSettings();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Gmail</CardTitle>
          <CardDescription>Read-only access: the agent can never send, delete or change mail.</CardDescription>
          <CardAction>
            <GmailStatus user={user} />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Fact label="Mailbox" value={user.gmailAddress ?? "Not connected"} />
          <Fact label="Connected since" value={user.gmailConnectedAt ? formatDay(user.gmailConnectedAt) : "–"} />
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

      <Card id="budget">
        <CardHeader>
          <CardTitle>AI budget</CardTitle>
          <CardDescription>Shared by all users; resets on the 1st of each month (UTC).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex justify-between text-sm">
            <span>Used this month</span>
            <span className="font-medium tabular-nums">
              ${budget.spentUsd.toFixed(2)} of ${budget.capUsd.toFixed(2)} ({budget.percent.toFixed(1)}%)
            </span>
          </div>
          <Progress value={budget.percent} aria-label="AI budget used this month" />
          <p className="text-sm text-muted-foreground">
            The whole service must cost under $50 a month. The AI is capped at ${budget.capUsd.toFixed(2)} and hosting at $20, so the total
            stays under $50 whatever the usage. Before each AI call, the code checks that this call can&apos;t take the month past the cap.
            At the cap it stops calling the AI and says so in Telegram; your tracker, /status, this dashboard and approving existing cards
            keep working.
          </p>
        </CardContent>
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
    </div>
  );
}

function GmailStatus({ user }: { user: CurrentUser }) {
  if (user.gmailSyncError) return <Badge variant="destructive">Needs reconnecting</Badge>;
  if (!user.gmailAddress) return <Badge variant="outline">Not connected</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">Connected</Badge>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}
