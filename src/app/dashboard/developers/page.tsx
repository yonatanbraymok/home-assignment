import { Suspense } from "react";
import { CodeBlock } from "@/components/code-block";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APP_NAME } from "@/lib/brand";
import { getDevelopers } from "@/lib/dashboard/data";
import { appUrl } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { EXAMPLE_BRIEF } from "@/lib/mcp/example";
import { McpTokenControls } from "./mcp-token";

export const metadata = { title: `Developers · ${APP_NAME}` };

// Documentation for connecting other agents over MCP, plus the user's own token.
export default function DevelopersPage() {
  const endpoint = appUrl("/api/mcp");
  return (
    <div className="flex flex-col gap-10">
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Developers: MCP access</h1>
        <p className="text-muted-foreground">
          {APP_NAME} is an MCP server (Model Context Protocol). Your own AI assistant, or any other agent, can read your tracker and ask our
          agent for a grounded brief before an interview or assessment. Everything is read-only and scoped to your account: an agent can
          never change a status. Only you can, in Telegram.
        </p>
      </div>

      <Section title="Endpoint">
        <Table>
          <TableBody>
            <Row k="URL" v={<code className="break-all">{endpoint}</code>} />
            <Row k="Transport" v="Streamable HTTP, stateless; JSON responses" />
            <Row k="Authentication" v={<code>Authorization: Bearer &lt;your token&gt;</code>} />
            <Row k="Limits" v="120 calls an hour per token; 10 new briefs an hour" />
          </TableBody>
        </Table>
      </Section>

      <Section title="Your token" id="token">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <TokenCard endpoint={endpoint} />
        </Suspense>
      </Section>

      <Section title="Connect a client">
        <div className="flex min-w-0 flex-col gap-4">
          <CodeBlock label="Claude Code" code={`claude mcp add --transport http job-hunt-tracker ${endpoint} \\\n  --header "Authorization: Bearer <your token>"`} />
          <CodeBlock
            label="Cursor: ~/.cursor/mcp.json (global, so the token stays out of your repos)"
            code={JSON.stringify({ mcpServers: { "job-hunt-tracker": { url: endpoint, headers: { Authorization: "Bearer <your token>" } } } }, null, 2)}
          />
          <CodeBlock
            label="MCP Inspector (no AI account needed)"
            code={`npx @modelcontextprotocol/inspector\n# Transport: Streamable HTTP · URL: ${endpoint}\n# Header: Authorization = Bearer <your token>`}
          />
        </div>
      </Section>

      <Section title="Tools">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-sm">list_applications</CardTitle>
              <CardDescription>Your tracked applications, filtered. Each row has an application_id for the brief.</CardDescription>
              <CardAction>
                <Badge variant="secondary">No AI cost</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Params
                rows={[
                  ["company", "string", "Partial company name"],
                  ["statuses", "string[]", "APPLIED, ASSESSMENT, INTERVIEW, OFFER, REJECTED, WITHDRAWN"],
                  ["open_only", "boolean", "Only applications still in progress"],
                  ["no_reply_yet", "boolean", "Only applications still waiting for a first reply"],
                  ["quiet_for_days", "integer", "No email for at least this many days"],
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-sm">generate_prep_brief</CardTitle>
              <CardDescription>
                A grounded brief for one application&apos;s next step, as typed JSON (declared as the tool&apos;s output schema). briefType says
                what it prepares for: an interview, an assessment, or none (nothing to prepare for: free, with the reason). Every fact carries a
                quote checked word for word against your email.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">Uses your AI allowance</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <Params rows={[["application_id", "string", "From list_applications (required)"]]} />
              <p className="text-sm text-muted-foreground">
                Asking again is free until something changes (a new email, a new status or a new card). A card still waiting for your approval
                is reported in pendingApproval, never applied.
              </p>
              <CodeBlock label="Example output" code={JSON.stringify(EXAMPLE_BRIEF, null, 2)} />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Who can change your data through MCP?">
        <p className="max-w-3xl text-sm text-muted-foreground">
          No one. There are no write tools; the tools read through a database connection that refuses every write; every query is limited to
          the token&apos;s owner; and every call is logged. Status changes happen only when you tap Approve on a card in Telegram.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex min-w-0 scroll-mt-20 flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell className="w-40 align-top text-muted-foreground">{k}</TableCell>
      <TableCell className="whitespace-normal">{v}</TableCell>
    </TableRow>
  );
}

function Params({ rows }: { rows: [string, string, string][] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Argument</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Meaning</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([name, type, meaning]) => (
          <TableRow key={name}>
            <TableCell className="font-mono text-xs">{name}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{type}</TableCell>
            <TableCell className="whitespace-normal">{meaning}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

async function TokenCard({ endpoint }: { endpoint: string }) {
  const { mcp } = await getDevelopers();
  return (
    <Card>
      <CardHeader>
        <CardTitle>MCP token</CardTitle>
        <CardDescription>Shown once when created; only a hash is stored. Replacing or revoking it takes effect at once.</CardDescription>
        <CardAction>{mcp.createdAt ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">No token</Badge>}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mcp.createdAt && (
          <p className="text-sm">
            Created {formatDateTime(mcp.createdAt)} · {mcp.lastUsedAt ? `last used ${formatDateTime(mcp.lastUsedAt)}` : "not used yet"}
          </p>
        )}
        <McpTokenControls hasToken={Boolean(mcp.createdAt)} endpoint={endpoint} />
      </CardContent>
    </Card>
  );
}
