import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const initials = APP_NAME.split(/\s+/)
  .map((w) => w[0])
  .join("")
  .slice(0, 2)
  .toUpperCase();

/** The product's mark: its initials on the accent colour. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-md bg-primary text-[10px] font-bold tracking-tight text-primary-foreground", className)}>
      {initials}
    </span>
  );
}
