"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Applications" },
  { href: "/dashboard/developers", label: "Developers" },
  { href: "/dashboard/settings", label: "Settings" },
];

/**
 * The dashboard's sections; the current one is marked. An application's page belongs to
 * Applications. Reading the URL suspends on pages with an id in it, so the layout wraps this in
 * Suspense with NavLinksFallback: the same links, unmarked.
 */
export function NavLinks() {
  const path = usePathname();
  return <Links isActive={(href) => (href === "/dashboard" ? path === href || path.startsWith("/dashboard/applications") : path.startsWith(href))} />;
}

export function NavLinksFallback() {
  return <Links isActive={() => false} />;
}

function Links({ isActive }: { isActive: (href: string) => boolean }) {
  return LINKS.map(({ href, label }) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex-1 rounded-full px-4 py-2 text-center text-muted-foreground transition sm:flex-none",
          active ? "bg-card text-foreground shadow-[0_8px_20px_-12px_rgb(17_17_17/0.45)]" : "hover:text-foreground",
        )}
      >
        {label}
      </Link>
    );
  });
}
