import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { ApplicationStatus, EmailCategory } from "@/generated/prisma/enums";
import { normalizeCompany } from "@/lib/agent/match";
import { OPEN_STATUSES, STATUS_DESCRIPTION } from "@/lib/proposals/rules";

// Read-only queries over one user's data. The only data access the chat agent has, and the same
// functions the MCP server exposes. Every query is scoped to `userId`; nothing here can write.

export type Reader = Pick<PrismaClient, "jobApplication" | "emailMessage" | "statusProposal" | "user">;

const DAY_MS = 86_400_000;
const MAX_ROWS = 50;

const STATUS_HELP =
  "Statuses: APPLIED (applied, no reply yet), ASSESSMENT (got an online test or assignment), INTERVIEW, OFFER, REJECTED, WITHDRAWN.";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const daysSince = (d: Date | null, now: Date) => (d ? Math.floor((now.getTime() - d.getTime()) / DAY_MS) : null);
const companyMatches = (name: string, query: string) => normalizeCompany(name).includes(normalizeCompany(query));

type Tool<A extends z.ZodType> = {
  description: string;
  args: A;
  run: (client: Reader, userId: string, args: z.infer<A>) => Promise<unknown>;
};
const tool = <A extends z.ZodType>(t: Tool<A>) => t;

export const READ_TOOLS = {
  list_applications: tool({
    description: `List the user's tracked applications, optionally filtered. Returns "count" and one row per application. ${STATUS_HELP}`,
    args: z.object({
      company: z.string().optional().describe("Company name; partial names match"),
      statuses: z.array(z.enum(ApplicationStatus)).optional().describe("Only these statuses"),
      open_only: z.boolean().optional().describe("Only applications still in progress: APPLIED, ASSESSMENT, INTERVIEW or OFFER"),
      no_reply_yet: z.boolean().optional().describe("Only applications still at APPLIED (no test, interview, offer or rejection yet)"),
      quiet_for_days: z.number().int().min(1).optional().describe("Only applications with no email for at least this many days"),
    }),
    async run(client, userId, args) {
      const now = new Date();
      const statuses = args.no_reply_yet ? ["APPLIED" as const] : args.statuses ?? (args.open_only ? OPEN_STATUSES : undefined);
      const rows = await client.jobApplication.findMany({
        where: { userId, ...(statuses ? { status: { in: statuses } } : {}) },
        orderBy: [{ statusChangedAt: "desc" }],
      });
      const filtered = rows.filter(
        (a) =>
          (!args.company || companyMatches(a.company, args.company)) &&
          (!args.quiet_for_days || (daysSince(a.lastEmailAt ?? a.createdAt, now) ?? 0) >= args.quiet_for_days),
      );
      return {
        count: filtered.length,
        applications: filtered.slice(0, MAX_ROWS).map((a) => ({
          application_id: a.id,
          company: a.company,
          role: a.roleTitle,
          job_id: a.jobRef,
          status: a.status,
          status_label: STATUS_DESCRIPTION[a.status],
          applied_on: day(a.appliedAt),
          status_changed_on: day(a.statusChangedAt),
          last_email_on: day(a.lastEmailAt),
          days_since_last_email: daysSince(a.lastEmailAt, now),
        })),
        ...(filtered.length > MAX_ROWS ? { note: `Showing ${MAX_ROWS} of ${filtered.length}` } : {}),
      };
    },
  }),

  get_application: tool({
    description: "One application in detail: its emails (with the quoted evidence) and every status change the user approved.",
    args: z.object({ application_id: z.string().describe("application_id from list_applications") }),
    async run(client, userId, { application_id }) {
      const a = await client.jobApplication.findFirst({ where: { id: application_id, userId } });
      if (!a) return { error: "No such application for this user" };
      const [emails, decisions] = await Promise.all([
        client.emailMessage.findMany({
          where: { userId, applicationId: a.id },
          orderBy: { receivedAt: "asc" },
          select: { receivedAt: true, fromAddress: true, subject: true, category: true, analysis: true },
        }),
        client.statusProposal.findMany({
          where: { userId, applicationId: a.id },
          orderBy: { createdAt: "asc" },
          select: { state: true, fromStatus: true, toStatus: true, decidedAt: true, createdAt: true },
        }),
      ]);
      return {
        application: { company: a.company, role: a.roleTitle, job_id: a.jobRef, status: a.status, status_label: STATUS_DESCRIPTION[a.status], applied_on: day(a.appliedAt), source: a.source },
        emails: emails.map((e) => ({
          date: day(e.receivedAt),
          from: e.fromAddress,
          subject: e.subject,
          category: e.category,
          evidence_quote: (e.analysis as { evidenceQuote?: string } | null)?.evidenceQuote ?? null,
        })),
        proposals: decisions.map((d) => ({ proposed_on: day(d.createdAt), from: d.fromStatus, to: d.toStatus, outcome: d.state, decided_on: day(d.decidedAt) })),
      };
    },
  }),

  get_stats: tool({
    description: `Totals for the user's tracker: counts per status, open applications, response rate, decisions waiting, and what data is covered. ${STATUS_HELP}`,
    args: z.object({}),
    async run(client, userId) {
      const [byStatus, pending, user, oldest] = await Promise.all([
        client.jobApplication.groupBy({ by: ["status"], where: { userId }, _count: true }),
        client.statusProposal.count({ where: { userId, state: "PENDING" } }),
        client.user.findUnique({ where: { id: userId }, select: { gmailAddress: true, gmailLastSyncAt: true } }),
        client.emailMessage.findFirst({ where: { userId }, orderBy: { receivedAt: "asc" }, select: { receivedAt: true } }),
      ]);
      const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count])) as Partial<Record<ApplicationStatus, number>>;
      const total = byStatus.reduce((n, s) => n + s._count, 0);
      const replied = total - (counts.APPLIED ?? 0) - (counts.WITHDRAWN ?? 0);
      return {
        total,
        by_status: counts,
        open: OPEN_STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0),
        no_reply_yet: counts.APPLIED ?? 0,
        response_rate_percent: total ? Math.round((replied / total) * 100) : null,
        proposals_waiting_for_decision: pending,
        coverage: { gmail: user?.gmailAddress ?? null, emails_since: day(oldest?.receivedAt ?? null), last_gmail_check: user?.gmailLastSyncAt?.toISOString() ?? null },
      };
    },
  }),

  search_emails: tool({
    description: "Search the job-related emails the tracker has read (not the whole inbox). Newest first, at most 20.",
    args: z.object({
      text: z.string().optional().describe("Words to look for in the subject or body"),
      company: z.string().optional(),
      category: z.enum(EmailCategory).optional(),
      since_days: z.number().int().min(1).optional(),
    }),
    async run(client, userId, args) {
      const emails = await client.emailMessage.findMany({
        where: {
          userId,
          state: "CLASSIFIED",
          category: args.category ? args.category : { not: "NOT_JOB_RELATED" },
          ...(args.since_days ? { receivedAt: { gte: new Date(Date.now() - args.since_days * DAY_MS) } } : {}),
          ...(args.text
            ? { OR: [{ subject: { contains: args.text, mode: "insensitive" as const } }, { bodyText: { contains: args.text, mode: "insensitive" as const } }] }
            : {}),
        },
        orderBy: { receivedAt: "desc" },
        take: 200,
        select: { receivedAt: true, fromAddress: true, fromName: true, subject: true, category: true, analysis: true, application: { select: { company: true, roleTitle: true } } },
      });
      const rows = emails.filter((e) => {
        if (!args.company) return true;
        const company = e.application?.company ?? (e.analysis as { company?: string } | null)?.company ?? e.fromName ?? "";
        return companyMatches(company, args.company);
      });
      return {
        count: rows.length,
        emails: rows.slice(0, 20).map((e) => ({
          date: day(e.receivedAt),
          from: e.fromAddress,
          subject: e.subject,
          category: e.category,
          evidence_quote: (e.analysis as { evidenceQuote?: string } | null)?.evidenceQuote ?? null,
          application: e.application ? { company: e.application.company, role: e.application.roleTitle } : null,
        })),
      };
    },
  }),
};

export type ReadToolName = keyof typeof READ_TOOLS;

/** Validates model-supplied arguments, then runs the tool for this user. Bad arguments come back as an error the model can fix. */
export async function runReadTool(client: Reader, userId: string, name: string, rawArgs: unknown): Promise<unknown> {
  const t = READ_TOOLS[name as ReadToolName] as Tool<z.ZodType> | undefined;
  if (!t) return { error: `Unknown tool ${name}` };
  const parsed = t.args.safeParse(rawArgs ?? {});
  if (!parsed.success) return { error: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  return t.run(client, userId, parsed.data);
}

/** JSON-schema declarations of the read tools, for the model (and later MCP). */
export function readToolDeclarations() {
  return Object.entries(READ_TOOLS).map(([name, t]) => {
    const schema: Record<string, unknown> = z.toJSONSchema(t.args);
    delete schema.$schema;
    return { name, description: t.description, parametersJsonSchema: schema };
  });
}
