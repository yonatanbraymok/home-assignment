"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_LABEL } from "@/lib/proposals/rules";

// The applications list: search by company and filter by status, instantly, in the browser (the
// server already sent only this user's rows). A row opens the application; its Gmail button opens
// the last email without opening the row. Dates arrive formatted, so server and browser agree.

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

export function ApplicationsTable({ rows }: { rows: ApplicationRow[] }) {
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by company" className="pl-8" aria-label="Search by company" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
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

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No applications match.</p>
      ) : (
        <>
          {/* Phones: one card per application. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {shown.map((r) => (
              <li key={r.id}>
                <Card size="sm" className="cursor-pointer px-3 transition-colors hover:bg-muted/50" onClick={() => open(r.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.company}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {r.roleTitle}
                        {r.jobRef && ` · #${r.jobRef}`}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Updated {r.lastUpdate}</span>
                    <LastEmailButton url={r.lastEmailUrl} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {/* Wider screens: a table. */}
          <Card className="hidden py-0 md:flex">
            <Table>
              <TableHeader>
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
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => open(r.id)}
                    onKeyDown={(e) => e.key === "Enter" && open(r.id)}
                  >
                    <TableCell className="pl-4 font-medium">{r.company}</TableCell>
                    <TableCell className="max-w-72">
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
          </Card>
        </>
      )}
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
