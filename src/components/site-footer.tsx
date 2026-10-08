import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export function SiteFooter() {
  return (
    <footer className="px-6 pb-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 border-t text-center border-foreground/10 pt-8 text-sm text-muted-foreground sm:flex-row">
        <span className="font-heading text-base font-bold text-foreground">{APP_NAME}</span>
        <span>Read-only Gmail access · every change approved by you</span>
        <nav className="flex gap-5">
          <Link className="hover:text-foreground" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-foreground" href="/terms">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
