import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireEnv } from "./env";

// ---------- Encryption at rest (Gmail refresh tokens), AES-256-GCM ----------

function encryptionKey(): Buffer {
  const key = Buffer.from(requireEnv("TOKEN_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return key;
}

/** Returns `v1.<iv>.<authTag>.<ciphertext>`, each part base64url. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognized ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

// ---------- Signed, expiring tokens (links sent in Telegram, OAuth state) ----------

// The purpose is part of the signed payload, so a token minted for one use can't be replayed for another.
export type TokenPurpose = "gmail-connect" | "gmail-oauth-state" | "dashboard-login";

function mac(data: string): string {
  return createHmac("sha256", requireEnv("SESSION_SECRET")).update(data).digest("base64url");
}

export function signToken(purpose: TokenPurpose, userId: string, ttlSeconds: number): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = Buffer.from(JSON.stringify({ p: purpose, u: userId, e: expiresAt })).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** Returns the userId if the token is authentic, unexpired and minted for `purpose`; otherwise null. */
export function verifyToken(token: string | null | undefined, purpose: TokenPurpose): string | null {
  const [body, signature] = (token ?? "").split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { p, u, e } = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (p !== purpose || typeof u !== "string" || typeof e !== "number") return null;
    return e > Date.now() / 1000 ? u : null;
  } catch {
    return null;
  }
}

// ---------- Constant-time comparison for shared secrets (webhook header, cron bearer) ----------

export function safeEqual(given: string | null | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
