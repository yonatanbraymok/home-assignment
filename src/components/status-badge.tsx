import type { ApplicationStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_DESCRIPTION, STATUS_LABEL } from "@/lib/proposals/rules";

// Semantic colours: gray = waiting, amber = assessment, blue = interview, green = offer, red = rejected.
const STAGE_STYLE: Record<ApplicationStatus, string> = {
  APPLIED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ASSESSMENT: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  INTERVIEW: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  OFFER: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  REJECTED: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  WITHDRAWN: "border-border bg-transparent text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(STAGE_STYLE[status], className)} title={STATUS_DESCRIPTION[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
