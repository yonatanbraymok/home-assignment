import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getBudget, getCurrentUser } from "@/lib/dashboard/data";
import { logout } from "./actions";

export const metadata = { title: "Dashboard · Job Hunt Tracker" };

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/dashboard" className="font-semibold">
            Job Hunt Tracker
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              Applications
            </Link>
            <Link href="/dashboard/settings" className="hover:text-foreground">
              Settings
            </Link>
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-2">
            {/* Both read the session, so each streams in behind its own boundary. */}
            <Suspense fallback={<div className="h-7 w-48" />}>
              <BudgetMeter />
            </Suspense>
            <Suspense fallback={null}>
              <Account />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

// Model spend against the hard cap the code enforces. Never over budget silently (DECISIONS §7).
async function BudgetMeter() {
  const { spentUsd, capUsd, percent } = await getBudget();
  return (
    <Link href="/dashboard/settings#budget" className="block w-48" title="AI spend for all users this month, against the hard cap. See Settings.">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">AI budget</span>
        <span className={percent >= 80 ? "font-medium text-destructive" : "tabular-nums"}>
          ${spentUsd.toFixed(2)} / ${capUsd.toFixed(2)}
        </span>
      </div>
      <Progress value={percent} aria-label={`AI budget: $${spentUsd.toFixed(2)} of $${capUsd.toFixed(2)} used this month`} />
    </Link>
  );
}

async function Account() {
  const user = await getCurrentUser();
  return (
    <form action={logout} className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{user.name}</span>
      <Button type="submit" variant="outline" size="sm">
        Log out
      </Button>
    </form>
  );
}
