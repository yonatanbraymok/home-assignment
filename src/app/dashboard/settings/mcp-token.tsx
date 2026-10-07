"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { tokenAction, type TokenState } from "./actions";

// Create, replace or revoke the MCP token. A new token is shown once, here; after a reload only
// "created on …" remains, because the server keeps nothing but its hash.
export function McpTokenControls({ hasToken, endpoint }: { hasToken: boolean; endpoint: string }) {
  // One action, so the state is always the latest result (create, then revoke, hides the token).
  const [state, act, pending] = useActionState<TokenState, FormData>(tokenAction, null);
  const [copied, setCopied] = useState(false);
  const created = state && "token" in state ? state : null;
  const revoked = state !== null && "revoked" in state;
  const active = created ? true : revoked ? false : hasToken;

  return (
    <div className="flex flex-col gap-3 text-sm">
      {created && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium">Copy your token now: it won&apos;t be shown again.</p>
          <code className="break-all rounded bg-background px-2 py-1 font-mono text-xs text-foreground">{created.token}</code>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(created.token).then(() => setCopied(true))}
            >
              {copied ? "Copied" : "Copy token"}
            </Button>
          </div>
          <p>Connect Claude Code:</p>
          <code className="break-all rounded bg-background px-2 py-1 font-mono text-xs text-foreground">
            claude mcp add --transport http job-hunt-tracker {endpoint} --header &quot;Authorization: Bearer {created.token}&quot;
          </code>
          <p>Any other MCP client: Streamable HTTP at {endpoint}, with the header Authorization: Bearer &lt;token&gt;.</p>
        </div>
      )}
      {revoked && <p className="text-muted-foreground">Token revoked. Agents using it can no longer connect.</p>}
      <div className="flex flex-wrap gap-2">
        <form action={act}>
          <input type="hidden" name="intent" value="create" />
          <Button type="submit" size="sm" disabled={pending}>
            {active ? "Replace token" : "Create token"}
          </Button>
        </form>
        {active && (
          <form action={act}>
            <input type="hidden" name="intent" value="revoke" />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              Revoke
            </Button>
          </form>
        )}
      </div>
      {active && !created && <p className="text-xs text-muted-foreground">Replacing it makes the current token stop working at once.</p>}
    </div>
  );
}
