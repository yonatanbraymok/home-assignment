import { CircleCheck, Send } from "lucide-react";
import type { ApplicationStatus, ProposalKind, ProposalState } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { formatDay } from "@/lib/format";
import type { Candidate } from "@/lib/proposals/create";
import { STATUS_LABEL } from "@/lib/proposals/rules";

// How a proposal is described in the dashboard. Deciding always happens in Telegram, so every
// open proposal says so; the dashboard has no approve or reject buttons.

type ProposalView = {
  kind: ProposalKind;
  state: ProposalState;
  applicationId: string | null;
  candidates: Candidate[] | null;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  heldForReview: boolean;
  expiresAt: Date | null;
  decidedAt?: Date | null;
};

const asksWhichApplication = (p: ProposalView) => Boolean(p.candidates?.length) && !p.applicationId;
const isOpen = (p: ProposalView, now: Date) => (p.state === "PENDING" || p.state === "FAILED") && (!p.expiresAt || p.expiresAt > now);

export function describeChange(p: ProposalView): string {
  if (p.kind === "CREATE_APPLICATION") return `New application · ${STATUS_LABEL[p.toStatus]}`;
  if (asksWhichApplication(p)) return `Which application is this? The email says ${STATUS_LABEL[p.toStatus]}`;
  return `${p.fromStatus ? STATUS_LABEL[p.fromStatus] : "?"} → ${STATUS_LABEL[p.toStatus]}`;
}

/** For a proposal still waiting for the owner. */
export function WaitingBadge({ proposal: p }: { proposal: ProposalView }) {
  const text =
    p.state === "FAILED"
      ? "Couldn't be applied: retry in Telegram"
      : !p.expiresAt
        ? "In your review of past emails in Telegram"
        : asksWhichApplication(p)
          ? "Awaiting your choice in Telegram"
          : "Awaiting your approval in Telegram";
  return (
    <Badge variant="outline" className="border-brand/20 bg-lilac text-brand-dark dark:border-brand/40 dark:bg-brand/20 dark:text-[#cfc6ff]">
      <Send data-icon="inline-start" />
      {text}
    </Badge>
  );
}

/** What happened to a proposal: still waiting, or the owner's decision and its outcome. */
export function OutcomeBadge({ proposal: p, now }: { proposal: ProposalView; now: Date }) {
  if (isOpen(p, now)) return <WaitingBadge proposal={p} />;
  const on = p.decidedAt ? ` on ${formatDay(p.decidedAt)}` : "";
  switch (p.state) {
    case "EXECUTED":
      return (
        <Badge className="bg-lime text-ink">
          <CircleCheck data-icon="inline-start" />
          Approved by you in Telegram{on}
        </Badge>
      );
    case "REJECTED":
      return <Badge variant="outline">Rejected by you{on}: nothing changed</Badge>;
    case "SUPERSEDED":
      return <Badge variant="outline">Replaced by a newer email</Badge>;
    case "STALE":
      return <Badge variant="outline">Not applied: the application had changed</Badge>;
    default: // EXPIRED, or PENDING/FAILED past its expiry
      return <Badge variant="outline">Expired without a decision</Badge>;
  }
}
