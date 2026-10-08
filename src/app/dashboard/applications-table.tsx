"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronRight, ExternalLink, Inbox, Search } from "lucide-react";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_LABEL } from "@/lib/proposals/rules";
import { cn } from "@/lib/utils";

// The pipeline card: search by company and filter by status, instantly, in the browser (the server
// already sent only this user's rows). A row opens the application; its Gmail button opens the
// last email without opening the row. Dates arrive formatted, so server and browser agree.

export type ApplicationRow = {
  id: string;
  company: string;
  roleTitle: string;
  jobRef: string | null;
  status: ApplicationStatus;
  lastUpdate: string; // e.g. "6 Oct 2026"
  lastEmailUrl: string | null;
};

const ALL = "ALL";
const ORDER: ApplicationStatus[] = ["APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];

export function ApplicationsCard({ rows, className }: { rows: ApplicationRow[]; className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const present = useMemo(() => ORDER.filter((s) => rows.some((r) => r.status === s)), [rows]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (status === ALL || r.status === status) && (!q || r.company.toLowerCase().includes(q)));
  }, [rows, query, status]);
  const open = (id: string) => router.push(`/dashboard/applications/${id}`);

  return (
    <Card className={cn("gap-0 pb-0", className)}>
      <CardHeader className="gap-3 border-b sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex flex-col gap-1">
          <CardTitle>Pipeline</CardTitle>
          {/* A plain <p>: CardDescription would add an empty grid row next to the controls. */}
          <p className="text-sm text-muted-foreground">{rows.length === 1 ? "1 tracked" : `${rows.length} tracked`} · latest activity first</p>
        </div>
        {rows.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by company" className="pl-8 sm:w-52" aria-label="Search by company" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
                {/* Explicit text: Radix fills SelectValue only after hydration, which left it blank at first. */}
                <SelectValue>{status === ALL ? "All statuses" : STATUS_LABEL[status as ApplicationStatus]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {present.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>

      <CardContent className="px-0">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <Inbox className="size-8 text-muted-foreground/60" />
            <p className="font-medium">No applications yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              They appear here once you approve a card in Telegram. No Gmail at hand? Send /demo to the bot to try it with sample emails.
            </p>
          </div>
        ) : shown.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-muted-foreground">No applications match.</p>
        ) : (
          <>
            {/* Phones: a list. */}
            <ul className="divide-y md:hidden">
              {shown.map((r) => (
                <li key={r.id}>
                  <div
                    role="link"
                    tabIndex={0}
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                    onClick={() => open(r.id)}
                    onKeyDown={(e) => e.key === "Enter" && open(r.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium">{r.company}</p>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {r.roleTitle}
                        {r.jobRef && ` · #${r.jobRef}`}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Updated {r.lastUpdate}</span>
                        <LastEmailButton url={r.lastEmailUrl} />
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                </li>
              ))}
            </ul>

            {/* Wider screens: a table. */}
            <div className="hidden md:block">
              <Table>
                <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
                  <TableRow>
                    <TableHead className="pl-4">Company</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last updated</TableHead>
                    <TableHead className="pr-4 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" tabIndex={0} onClick={() => open(r.id)} onKeyDown={(e) => e.key === "Enter" && open(r.id)}>
                      <TableCell className="pl-4 font-medium">{r.company}</TableCell>
                      <TableCell className="max-w-64">
                        <span className="block truncate">{r.roleTitle}</span>
                        {r.jobRef && <span className="block text-xs text-muted-foreground">Job ID {r.jobRef}</span>}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{r.lastUpdate}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <LastEmailButton url={r.lastEmailUrl} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
      {rows.length > 0 && <PipelineBar rows={rows} />}
    </Card>
  );
}

const SEGMENT: Record<ApplicationStatus, string> = {
  APPLIED: "bg-zinc-300 dark:bg-zinc-600",
  ASSESSMENT: "bg-indigo-500",
  INTERVIEW: "bg-amber-500",
  OFFER: "bg-emerald-500",
  REJECTED: "bg-rose-500",
  WITHDRAWN: "bg-zinc-200 dark:bg-zinc-700",
};

/** Where the applications stand, as one bar; it sits at the bottom of the card. */
function PipelineBar({ rows }: { rows: ApplicationRow[] }) {
  const counts = ORDER.map((s) => ({ status: s, n: rows.filter((r) => r.status === s).length })).filter((c) => c.n > 0);
  return (
    <div className="mt-auto flex flex-col gap-2.5 border-t bg-zinc-50/60 px-4 py-3 dark:bg-zinc-900/40">
      <div className="flex h-2 overflow-hidden rounded-full" role="img" aria-label={counts.map((c) => `${STATUS_LABEL[c.status]}: ${c.n}`).join(", ")}>
        {counts.map((c) => (
          <div key={c.status} className={SEGMENT[c.status]} style={{ width: `${(c.n / rows.length) * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {counts.map((c) => (
          <li key={c.status} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", SEGMENT[c.status])} aria-hidden />
            {STATUS_LABEL[c.status]} <span className="font-medium text-foreground tabular-nums">{c.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LastEmailButton({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <Button asChild variant="ghost" size="icon-sm" title="Open the last email in Gmail">
      {/* Doesn't open the row: only the email. */}
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} aria-label="Open the last email in Gmail">
        <ExternalLink />
      </a>
    </Button>
  );
}
