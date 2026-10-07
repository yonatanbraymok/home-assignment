import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { userForMcpToken } from "@/lib/mcp/auth";
import { createMcpServer } from "@/lib/mcp/server";
import { bearerToken } from "@/lib/mcp/token";

// MCP over Streamable HTTP, stateless: each POST builds a server for the token's user and answers
// with JSON (no SSE stream to keep open), which suits serverless hosting.
export const maxDuration = 60;

export async function POST(req: Request) {
  const token = bearerToken(req.headers.get("authorization"));
  const user = token ? await userForMcpToken(token) : null;
  if (!user) {
    return Response.json(
      { error: "Missing or invalid token. Create one in the dashboard: Settings → MCP access." },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="job-hunt-tracker"' } },
    );
  }
  const server = createMcpServer(user.id);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

// Stateless: there's no session to stream to (GET) or to end (DELETE).
const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export { notAllowed as GET, notAllowed as DELETE };
