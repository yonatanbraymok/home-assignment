import { BriefcaseBusiness } from "lucide-react";
import { cn } from "@/lib/utils";

/** The product's mark: a lime briefcase in an ink circle. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-ink text-lime dark:bg-lime dark:text-ink [&>svg]:size-[55%]", className)}>
      <BriefcaseBusiness />
    </span>
  );
}
