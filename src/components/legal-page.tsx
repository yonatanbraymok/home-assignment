import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";
import { APP_NAME } from "@/lib/brand";

/** Typography-focused layout for the privacy and terms pages. */
export function LegalPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5 font-heading text-lg font-bold tracking-tight">
          <BrandMark className="size-8" />
          {APP_NAME}
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-6 pb-16">
        <article className="prose max-w-none rounded-3xl border border-border bg-card p-6 text-foreground shadow-[0_1px_2px_rgb(23_21_59/0.04)] sm:p-10 dark:prose-invert prose-headings:font-heading prose-headings:font-bold prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-code:before:content-none prose-code:after:content-none">
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
