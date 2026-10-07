import type { gmail_v1 } from "@googleapis/gmail";
import { convert } from "html-to-text";

export const BODY_CHAR_LIMIT = 6000;

export type ParsedEmail = {
  gmailMessageId: string;
  gmailThreadId: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  receivedAt: Date;
  snippet: string;
  bodyText: string;
  headers: Record<string, string>; // lower-cased names; used by the prefilter, not stored
  labelIds: string[];
};

export function parseMessage(msg: gmail_v1.Schema$Message): ParsedEmail {
  const headers: Record<string, string> = {};
  for (const h of msg.payload?.headers ?? []) {
    if (h.name && h.value != null) headers[h.name.toLowerCase()] = h.value;
  }
  const { address, name } = parseFrom(headers["from"] ?? "");
  const internal = Number(msg.internalDate);
  const parts = collectTextParts(msg.payload);
  const raw = parts.plain.trim() ? parts.plain : parts.html ? htmlToText(parts.html) : "";

  return {
    gmailMessageId: msg.id ?? "",
    gmailThreadId: msg.threadId ?? "",
    fromAddress: address,
    fromName: name,
    subject: headers["subject"] ?? "",
    receivedAt: Number.isFinite(internal) && internal > 0 ? new Date(internal) : new Date(headers["date"] ?? Date.now()),
    snippet: decodeEntities(msg.snippet ?? ""),
    bodyText: stripQuotedHistory(raw).slice(0, BODY_CHAR_LIMIT),
    headers,
    labelIds: msg.labelIds ?? [],
  };
}

/** `"Microsoft Careers" <careers@microsoft.com>` → { address, name }. */
export function parseFrom(value: string): { address: string; name: string | null } {
  const angled = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (angled) {
    const name = angled[1].replace(/^"(.*)"$/, "$1").trim();
    return { address: angled[2].trim().toLowerCase(), name: name || null };
  }
  return { address: value.trim().toLowerCase(), name: null };
}

export function senderDomain(address: string): string {
  return address.split("@")[1]?.toLowerCase() ?? "";
}

function collectTextParts(part: gmail_v1.Schema$MessagePart | undefined, found = { plain: "", html: "" }) {
  if (!part) return found;
  const isAttachment = Boolean(part.filename);
  const data = part.body?.data;
  if (!isAttachment && data) {
    if (part.mimeType === "text/plain" && !found.plain) found.plain = decodeBase64Url(data);
    if (part.mimeType === "text/html" && !found.html) found.html = decodeBase64Url(data);
  }
  for (const child of part.parts ?? []) collectTextParts(child, found);
  return found;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  });
}

// Gmail's snippet is HTML-escaped ("we&#39;ve").
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Lines that start the quoted part of a reply. Everything from the first match on is dropped,
// so evidence quotes can only come from the newest message in a thread.
const REPLY_HEADERS = [
  /^On .{0,300}wrote:\s*$/im, // Gmail (English); may span a wrapped line, handled below
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^-{2,}\s*Forwarded message\s*-{2,}/im,
  /^From: .+\r?\n(?:Sent|Date): /im, // Outlook
  /^‫?בתאריך .{0,300}:\s*‬?\s*$/m, // Gmail (Hebrew): "בתאריך יום ג׳, ... מאת ...:"
];

export function stripQuotedHistory(text: string): string {
  // Join Gmail's wrapped "On <date> <sender>\nwrote:" into one line before matching.
  let body = text.replace(/\r\n/g, "\n").replace(/^(On .{0,300})\n(wrote:\s*)$/gm, "$1 $2");
  for (const pattern of REPLY_HEADERS) {
    const match = pattern.exec(body);
    if (match) body = body.slice(0, match.index);
  }
  return body
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
