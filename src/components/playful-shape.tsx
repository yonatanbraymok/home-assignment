import { cn } from "@/lib/utils";

// Decorative gradient shapes, some with a little face, that bob around the landing page's
// headings. Purely ornamental: hidden from assistive technology, never in the way of a click.

export type ShapeKind = "burst" | "wedge" | "diamond" | "pill" | "dot";
export type ShapeTone = "lime" | "pink" | "sky" | "lilac" | "mint";

const GRADIENT: Record<ShapeTone, [string, string]> = {
  lime: ["#e8ff8a", "#a6e22e"],
  pink: ["#ffd1ea", "#e7a6ff"],
  sky: ["#9fd4ff", "#c99bff"],
  lilac: ["#d9a8ff", "#a855f7"],
  mint: ["#9ff5c5", "#34d399"],
};

// A 48-point starburst around the centre of the 100×100 box.
const BURST = `M${Array.from({ length: 48 }, (_, i) => {
  const a = (i / 48) * Math.PI * 2;
  const r = i % 2 ? 46 : 50;
  return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
}).join("L")}Z`;

const PATH: Record<ShapeKind, string> = {
  burst: BURST,
  wedge: "M50 4a46 46 0 0 1 0 92Z M50 4a46 46 0 0 0-30 81L50 50Z",
  diamond: "M50 8Q54 8 58 12L88 42Q92 50 88 58L58 88Q50 94 42 88L12 58Q8 50 12 42L42 12Q46 8 50 8Z",
  pill: "M30 12a20 20 0 0 1 40 0v76H30Z",
  dot: "M50 50m-40 0a40 40 0 1 0 80 0a40 40 0 1 0-80 0",
};

export function PlayfulShape({
  kind,
  tone,
  face,
  sleepy,
  rotate = 0,
  delay = 0,
  className,
}: {
  kind: ShapeKind;
  tone: ShapeTone;
  face?: boolean;
  sleepy?: boolean;
  rotate?: number;
  delay?: number;
  className?: string;
}) {
  const id = `shape-${kind}-${tone}-${rotate}`;
  const [from, to] = GRADIENT[tone];
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      style={{ ["--r" as string]: `${rotate}deg`, transform: `rotate(${rotate}deg)`, animationDelay: `${delay}s` }}
      className={cn("float pointer-events-none absolute drop-shadow-[0_18px_24px_rgba(124,58,237,0.18)]", className)}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <path d={PATH[kind]} fill={`url(#${id})`} />
      {face && (
        <g fill="none" stroke="#3b0764" strokeOpacity={0.7} strokeWidth={2.6} strokeLinecap="round">
          {sleepy ? <path d="M37 44q4 4 8 0M55 44q4 4 8 0" /> : <path d="M37 45q4-5 8 0M55 45q4-5 8 0" />}
          <path d="M42 56q8 7 16 0" />
        </g>
      )}
    </svg>
  );
}
