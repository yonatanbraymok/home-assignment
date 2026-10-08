import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { APP_NAME } from "@/lib/brand";

/** Typography-focused layout for the privacy and terms pages. */
export function LegalPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center px-4 py-3">
          <Link href="/" className="font-semibold">
            {APP_NAME}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-primary prose-code:before:content-none prose-code:after:content-none">
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
