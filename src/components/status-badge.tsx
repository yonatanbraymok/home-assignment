import type { ApplicationStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { STATUS_DESCRIPTION, STATUS_LABEL } from "@/lib/proposals/rules";

// One colour per stage so the pipeline reads at a glance; Rejected uses the destructive style.
const STAGE_STYLE: Partial<Record<ApplicationStatus, string>> = {
  APPLIED: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  ASSESSMENT: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  INTERVIEW: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  OFFER: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const variant = status === "REJECTED" ? "destructive" : status === "WITHDRAWN" ? "outline" : "secondary";
  return (
    <Badge variant={variant} className={STAGE_STYLE[status]} title={STATUS_DESCRIPTION[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
