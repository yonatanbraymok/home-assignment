import type { ApplicationStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_DESCRIPTION, STATUS_LABEL } from "@/lib/proposals/rules";

// Semantic colours: zinc = applied, waiting for a reply; amber = interview; emerald = offer;
// rose = rejected. Assessment, not in the palette brief, takes the accent's indigo.
export const STATUS_STYLE: Record<ApplicationStatus, string> = {
  APPLIED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ASSESSMENT: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  INTERVIEW: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  OFFER: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTED: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  WITHDRAWN: "border-border bg-transparent text-muted-foreground",
};

/** The same hues as dots (timeline, activity). */
export const STATUS_DOT: Record<ApplicationStatus, string> = {
  APPLIED: "bg-zinc-400 dark:bg-zinc-500",
  ASSESSMENT: "bg-indigo-500",
  INTERVIEW: "bg-amber-500",
  OFFER: "bg-emerald-500",
  REJECTED: "bg-rose-500",
  WITHDRAWN: "bg-zinc-300 dark:bg-zinc-600",
};

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(STATUS_STYLE[status], className)} title={STATUS_DESCRIPTION[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
