import type { ApplicationStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_DESCRIPTION, STATUS_LABEL } from "@/lib/proposals/rules";

// Semantic colours: zinc = applied, waiting for a reply; amber = interview; emerald = offer;
// rose = rejected. Assessment, not in the palette brief, takes a tint of the action blue.
export const STATUS_STYLE: Record<ApplicationStatus, string> = {
  APPLIED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ASSESSMENT: "bg-tint text-brand-dark dark:bg-brand/20 dark:text-[#7cc4ec]",
  INTERVIEW: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  OFFER: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTED: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  WITHDRAWN: "border-border bg-transparent text-muted-foreground",
};

/** The same hues as dots and bars (timeline, pipeline). */
export const STATUS_DOT: Record<ApplicationStatus, string> = {
  APPLIED: "bg-zinc-300 dark:bg-zinc-600",
  ASSESSMENT: "bg-brand",
  INTERVIEW: "bg-amber-500",
  OFFER: "bg-emerald-500",
  REJECTED: "bg-rose-500",
  WITHDRAWN: "bg-zinc-200 dark:bg-zinc-700",
};

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(STATUS_STYLE[status], className)} title={STATUS_DESCRIPTION[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
