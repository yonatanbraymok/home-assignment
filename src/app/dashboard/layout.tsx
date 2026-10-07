import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { APP_NAME } from "@/lib/brand";
import { getBudget, getCurrentUser } from "@/lib/dashboard/data";
import { resetDateText } from "@/lib/llm/budget-policy";
import { logout } from "./actions";

export const metadata = { title: `Dashboard · ${APP_NAME}` };

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="font-semibold">
            {APP_NAME}
          </Link>
          <nav className="order-last flex w-full gap-5 text-sm text-muted-foreground sm:order-none sm:w-auto">
            <Link href="/dashboard" className="hover:text-foreground">
              Applications
            </Link>
            <Link href="/dashboard/developers" className="hover:text-foreground">
              Developers
            </Link>
            <Link href="/dashboard/settings" className="hover:text-foreground">
              Settings
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-x-5">
            {/* Both read the session, so each streams in behind its own boundary. */}
            <div className="hidden sm:block">
              <Suspense fallback={<div className="h-7 w-52" />}>
                <BudgetMeter />
              </Suspense>
            </div>
            <Suspense fallback={null}>
              <Account />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        {/* On phones the budget gets its own row under the header. */}
        <div className="mb-6 sm:hidden">
          <Suspense fallback={null}>
            <BudgetMeter />
          </Suspense>
        </div>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

// Your AI allowance this month, against the hard cap the code enforces. Never over budget silently
// (DECISIONS §7): when limited or paused it says so, and whose budget caused it.
async function BudgetMeter() {
  const mode = await getBudget();
  const mine = mode.user!; // always present for a signed-in user
  const note =
    mode.level === "ok"
      ? null
      : `${mode.level === "out" ? "Paused" : "Limited"} until ${resetDateText(mode.resetsOn)}${mode.limitedBy === "service" ? " (shared budget)" : ""}`;
  return (
    <Link href="/dashboard/settings#budget" className="block w-full sm:w-52" title="Your AI allowance this month. See Settings for the shared budget.">
      <div className="mb-1 flex justify-between gap-2 text-xs">
        <span className="text-muted-foreground">AI budget</span>
        <span className={note ? "font-medium text-destructive tabular-nums" : "tabular-nums"}>
          ${mine.spentUsd.toFixed(2)} / ${mine.capUsd.toFixed(2)}
        </span>
      </div>
      <Progress value={mine.percent} aria-label={`Your AI allowance: $${mine.spentUsd.toFixed(2)} of $${mine.capUsd.toFixed(2)} used this month`} />
      {note && <p className="mt-1 text-xs text-destructive">{note}</p>}
    </Link>
  );
}

async function Account() {
  const user = await getCurrentUser();
  return (
    <form action={logout} className="flex items-center gap-2 text-sm">
      <span className="hidden max-w-32 truncate text-muted-foreground sm:inline">{user.name}</span>
      <Button type="submit" variant="outline" size="sm">
        Log out
      </Button>
    </form>
  );
}
