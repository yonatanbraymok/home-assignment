import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft, ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getApplicationDetail } from "@/lib/dashboard/data";
import { formatDateTime, formatDay } from "@/lib/format";
import { gmailMessageUrl } from "@/lib/gmail/links";
import { STATUS_DESCRIPTION } from "@/lib/proposals/rules";
import { CATEGORY_LABEL, capitalize, humanReason } from "../../labels";
import { OutcomeBadge, describeChange } from "../../proposal-badges";

export default function ApplicationPage(props: PageProps<"/dashboard/applications/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/dashboard">
          <ArrowLeft data-icon="inline-start" />
          All applications
        </Link>
      </Button>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Detail params={props.params} />
      </Suspense>
    </div>
  );
}

type DetailData = NonNullable<Awaited<ReturnType<typeof getApplicationDetail>>>;

async function Detail({ params }: Pick<PageProps<"/dashboard/applications/[id]">, "params">) {
  const { id } = await params;
  const detail = await getApplicationDetail(id);
  // Same answer for "doesn't exist" and "someone else's", so ids can't be probed.
  if (!detail) return <p>This application doesn&apos;t exist, or it isn&apos;t yours.</p>;
  await connection(); // request time: outcomes compare expiry dates with now
  const now = new Date();
  const { user, application: a, timeline } = detail;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{a.company}</CardTitle>
          <CardDescription>
            {a.roleTitle}
            {a.jobRef && ` · Job ID ${a.jobRef}`}
          </CardDescription>
          <CardAction>
            <StatusBadge status={a.status} />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Fact label={`${capitalize(STATUS_DESCRIPTION[a.status])} since`} value={formatDay(a.statusSince)} />
          <Fact label="Applied" value={a.appliedAt ? formatDay(a.appliedAt) : "No confirmation email"} />
          <Fact label="Added" value={a.source === "EMAIL" ? "From an email you approved in Telegram" : "By hand"} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Timeline</h2>
        <p className="text-sm text-muted-foreground">
          Every email the agent linked to this application: why it concluded what it did, the exact sentence it relied on, and what you
          decided. A quote is checked word for word against the email before anything is proposed.
        </p>
        {timeline.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No emails are linked to this application yet.</p>
        ) : (
          <ol className="mt-4 ml-2 flex flex-col gap-8 border-l pl-6">
            {timeline.map((item) => (
              <TimelineItem key={item.email.id} item={item} gmailAddress={user.gmailAddress} now={now} />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function TimelineItem({ item: t, gmailAddress, now }: { item: DetailData["timeline"][number]; gmailAddress: string | null; now: Date }) {
  const sender = t.email.fromName ? `${t.email.fromName} <${t.email.fromAddress}>` : t.email.fromAddress;
  return (
    <li className="relative">
      <span className="absolute top-1.5 -left-[31px] size-3 rounded-full bg-primary ring-4 ring-background" aria-hidden />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <time dateTime={t.email.receivedAt.toISOString()} className="font-medium">
          {formatDateTime(t.email.receivedAt)}
        </time>
        {t.email.category && <Badge variant="secondary">{CATEGORY_LABEL[t.email.category]}</Badge>}
      </div>
      <p className="mt-1 font-medium">{t.email.subject}</p>
      <p className="text-sm text-muted-foreground">{sender}</p>

      <Card size="sm" className="mt-3">
        <CardContent className="flex flex-col gap-4">
          {t.reasoning && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">The agent&apos;s reasoning</p>
                {t.confidence && <Badge variant="outline">Confidence: {t.confidence.toLowerCase()}</Badge>}
              </div>
              <p className="mt-1">{t.reasoning}</p>
            </div>
          )}
          {t.evidenceQuote && (
            <figure className="rounded-r-md border-l-4 border-primary bg-muted p-3">
              <blockquote className="leading-relaxed font-medium">“{t.evidenceQuote}”</blockquote>
              <figcaption className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 shrink-0" />
                {t.quoteVerified ? "Verbatim from the email: checked word for word by code, not by the AI" : "Quoted by the agent"}
              </figcaption>
            </figure>
          )}
          {t.warnings.map((warning) => (
            <Alert key={warning}>
              <TriangleAlert />
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          ))}
        </CardContent>
      </Card>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {t.proposal ? (
          <>
            <OutcomeBadge proposal={t.proposal} now={now} />
            <span className="text-muted-foreground">{describeChange(t.proposal)}</span>
          </>
        ) : (
          <Badge variant="outline">No change proposed{t.noProposalReason && `: ${humanReason(t.noProposalReason)}`}</Badge>
        )}
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <a href={gmailMessageUrl(gmailAddress, t.email.gmailMessageId)} target="_blank" rel="noopener noreferrer">
            <ExternalLink data-icon="inline-start" />
            Open in Gmail
          </a>
        </Button>
      </div>
      {!gmailAddress && (
        <p className="mt-1 text-right text-xs text-muted-foreground">Gmail is disconnected, so this opens the first Google account signed in to your browser.</p>
      )}
    </li>
  );
}
