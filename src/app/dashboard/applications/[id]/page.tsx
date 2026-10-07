import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft, ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getApplicationDetail } from "@/lib/dashboard/data";
import { formatDateTime, formatDay } from "@/lib/format";
import { emailLink } from "@/lib/gmail/links";
import { STATUS_DESCRIPTION } from "@/lib/proposals/rules";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL, capitalize, humanReason } from "../../labels";
import { OutcomeBadge, describeChange } from "../../proposal-badges";

export default function ApplicationPage(props: PageProps<"/dashboard/applications/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
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
  const newestFirst = [...timeline].reverse();
  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{a.company}</h1>
          <StatusBadge status={a.status} />
        </div>
        <p className="text-lg text-muted-foreground">
          {a.roleTitle}
          {a.jobRef && ` · Job ID ${a.jobRef}`}
        </p>
        <p className="text-sm text-muted-foreground">
          {capitalize(STATUS_DESCRIPTION[a.status])} since {formatDay(a.statusSince)}
          {a.appliedAt && ` · applied ${formatDay(a.appliedAt)}`} · {a.source === "EMAIL" ? "added from an email you approved" : "added by hand"}
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Timeline</h2>
        <p className="text-sm text-muted-foreground">
          Newest first. Each step is an email, what the agent concluded, the exact sentence it relied on, and your decision. A quote is checked
          word for word against the email before anything is proposed.
        </p>
        {newestFirst.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No emails are linked to this application yet.</p>
        ) : (
          <ol className="mt-6 ml-2 border-l border-border">
            {newestFirst.map((item, i) => (
              <TimelineItem key={item.email.id} item={item} latest={i === 0} gmailAddress={user.gmailAddress} now={now} />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

const DOT: Partial<Record<ApplicationStatus, string>> = {
  ASSESSMENT: "bg-amber-500",
  INTERVIEW: "bg-blue-500",
  OFFER: "bg-emerald-500",
  REJECTED: "bg-red-500",
};

function TimelineItem({ item: t, latest, gmailAddress, now }: { item: DetailData["timeline"][number]; latest: boolean; gmailAddress: string | null; now: Date }) {
  const sender = t.email.fromName ? `${t.email.fromName} <${t.email.fromAddress}>` : t.email.fromAddress;
  const link = emailLink(gmailAddress, t.email.gmailMessageId);
  const newStatus = t.proposal?.toStatus;
  return (
    <li className="relative pb-10 pl-6 last:pb-0">
      <span
        className={cn("absolute top-1 -left-[7px] size-3.5 rounded-full ring-4 ring-background", (newStatus && DOT[newStatus]) || "bg-zinc-400 dark:bg-zinc-500")}
        aria-hidden
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <time dateTime={t.email.receivedAt.toISOString()} className="font-medium tabular-nums">
          {formatDateTime(t.email.receivedAt)}
        </time>
        {latest && <Badge variant="outline">Latest</Badge>}
        {t.email.category && <Badge variant="secondary">{CATEGORY_LABEL[t.email.category]}</Badge>}
        {newStatus && t.proposal?.state === "EXECUTED" && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            → <StatusBadge status={newStatus} />
          </span>
        )}
      </div>

      <p className="mt-2 font-medium">{t.email.subject}</p>
      <p className="truncate text-sm text-muted-foreground">{sender}</p>

      {t.evidenceQuote && (
        <figure className="mt-3 rounded-lg border bg-muted/40 p-4">
          <blockquote className="border-l-2 border-primary pl-3 leading-relaxed">“{t.evidenceQuote}”</blockquote>
          <figcaption className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" />
            {t.quoteVerified ? "Verbatim from the email, checked word for word by code" : "Quoted by the agent"}
          </figcaption>
        </figure>
      )}

      {t.reasoning && (
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Why: </span>
          {t.reasoning}
          {t.confidence && <span> (confidence: {t.confidence.toLowerCase()})</span>}
        </p>
      )}
      {t.warnings.map((warning) => (
        <Alert key={warning} className="mt-3">
          <TriangleAlert />
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {t.proposal ? (
          <>
            <OutcomeBadge proposal={t.proposal} now={now} />
            <span className="text-muted-foreground">{describeChange(t.proposal)}</span>
          </>
        ) : (
          <Badge variant="outline">No change proposed{t.noProposalReason && `: ${humanReason(t.noProposalReason)}`}</Badge>
        )}
      </div>

      <div className="mt-3">
        {!link ? (
          <span className="text-xs text-muted-foreground">Sample email (demo): there&apos;s nothing to open in Gmail.</span>
        ) : latest ? (
          <Button asChild variant="outline" size="sm">
            <a href={link} target="_blank" rel="noopener noreferrer">
              <ExternalLink data-icon="inline-start" />
              Read full email in Gmail
            </a>
          </Button>
        ) : (
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline-offset-4 hover:underline">
            Open in Gmail
          </a>
        )}
        {link && !gmailAddress && <p className="mt-1 text-xs text-muted-foreground">Gmail is disconnected, so this opens the first Google account signed in to your browser.</p>}
      </div>
    </li>
  );
}
