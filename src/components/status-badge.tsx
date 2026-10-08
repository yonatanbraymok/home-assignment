import type { ApplicationStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_DESCRIPTION, STATUS_LABEL } from "@/lib/proposals/rules";

// Semantic colours in the product's palette: soft ink = applied, waiting for a reply; lilac =
// assessment; lime = interview; violet = offer; rose = rejected (a "no" should read as one).
export const STATUS_STYLE: Record<ApplicationStatus, string> = {
  APPLIED: "bg-ink/[0.07] text-ink/70 dark:bg-white/10 dark:text-white/70",
  ASSESSMENT: "bg-lilac text-brand-dark dark:bg-brand/25 dark:text-[#cfc6ff]",
  INTERVIEW: "bg-lime text-ink",
  OFFER: "bg-brand text-white",
  REJECTED: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  WITHDRAWN: "border-border bg-transparent text-muted-foreground",
};

/** The same hues as dots and bars (timeline, pipeline). */
export const STATUS_DOT: Record<ApplicationStatus, string> = {
  APPLIED: "bg-ink/25 dark:bg-white/30",
  ASSESSMENT: "bg-[#9d8cfa]",
  INTERVIEW: "bg-[#c2dc45]",
  OFFER: "bg-brand",
  REJECTED: "bg-rose-500",
  WITHDRAWN: "bg-ink/10 dark:bg-white/15",
};

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(STATUS_STYLE[status], className)} title={STATUS_DESCRIPTION[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
