import { BriefcaseBusiness } from "lucide-react";
import { cn } from "@/lib/utils";

/** The product's mark: a briefcase in an ink circle. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-ink text-paper dark:bg-primary dark:text-white [&>svg]:size-[55%]", className)}>
      <BriefcaseBusiness />
    </span>
  );
}
