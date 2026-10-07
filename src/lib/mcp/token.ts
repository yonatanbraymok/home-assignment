import { createHash, randomBytes } from "node:crypto";

// MCP bearer tokens, like a GitHub personal access token: 256 random bits, shown to the owner
// once, stored only as a SHA-256 hash. A recognisable prefix lets secret scanners spot a leak.

const PREFIX = "jht_mcp_";
const SHAPE = /^jht_mcp_[A-Za-z0-9_-]{43}$/;

export function newMcpToken(): { token: string; hash: string } {
  const token = PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashMcpToken(token) };
}

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cheap shape check before touching the database. */
export function looksLikeMcpToken(value: string | null | undefined): value is string {
  return typeof value === "string" && SHAPE.test(value);
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? "");
  return match && looksLikeMcpToken(match[1]) ? match[1] : null;
}
