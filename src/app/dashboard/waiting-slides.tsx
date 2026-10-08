"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One waiting card at a time, so a first sync's dozens of cards don't push the rest of the page
 * down. Swipe on a phone (CSS scroll snapping) or use the arrows. The slides are rendered on the
 * server; this only moves between them.
 */
export function WaitingSlides({ slides }: { slides: ReactNode[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const go = (to: number) => {
    const el = track.current;
    if (!el) return;
    const i = Math.max(0, Math.min(slides.length - 1, to));
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setIndex(i);
  };
  return (
    <div className="flex flex-col gap-3">
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        aria-roledescription="carousel"
      >
        {slides.map((slide, i) => (
          <div key={i} className="w-full shrink-0 snap-start" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`} aria-hidden={i !== index}>
            {slide}
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="icon-sm" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous card">
            <ChevronLeft />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {index + 1} of {slides.length}
          </span>
          <Button type="button" variant="outline" size="icon-sm" onClick={() => go(index + 1)} disabled={index === slides.length - 1} aria-label="Next card">
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
