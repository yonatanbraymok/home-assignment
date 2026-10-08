"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Its children everywhere except on `path`: the overview shows the budget in its own card.
 * Reading the URL suspends on pages with an id in it, so callers wrap this in Suspense.
 */
export function HiddenOn({ path, children }: { path: string; children: ReactNode }) {
  return usePathname() === path ? null : children;
}
