import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type StageTone = "lilac" | "lime" | "sky" | "blush";

const TONE: Record<StageTone, string> = {
  lilac: "bg-lilac",
  lime: "bg-lime",
  sky: "bg-sky",
  blush: "bg-blush",
};

/**
 * A large pastel container that holds white UI cards, so they float on colour instead of sitting
 * flat on the page. Two soft white circles give it some depth. It keeps the light theme in dark
 * mode too (.theme-light): pastel with white cards only reads light.
 */
export function Stage({ tone, className, children, ...props }: ComponentProps<"div"> & { tone: StageTone }) {
  return (
    <div className={cn("theme-light relative isolate overflow-hidden rounded-[2.5rem] text-ink", TONE[tone], className)} {...props}>
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 -z-10 size-72 rounded-full bg-white/25" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 -z-10 size-80 rounded-full bg-white/20" />
      {children}
    </div>
  );
}

/** A white panel floating inside a Stage. */
export function FloatPanel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[1.75rem] bg-white shadow-[0_30px_60px_-24px_rgb(17_17_17/0.35)]", className)} {...props} />;
}
