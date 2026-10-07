// The model must quote the sentence that justifies its classification. We never trust that the
// quote is real: it has to appear in the email itself (subject or body), or there is no proposal.

const MIN_QUOTE_CHARS = 8;

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "") // zero-width and bidi control marks (common in Hebrew mail)
    .replace(/[‘’‚‛′׳]/g, "'") // curly apostrophes, Hebrew geresh
    .replace(/[“”„‟″״]/g, '"') // curly quotes, Hebrew gershayim
    .replace(/[‐-―−]/g, "-") // dashes
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * True if `quote` appears verbatim (ignoring case, whitespace and typographic variants) in one of
 * the sources. Quotes that join sentences with "..." or paraphrase will not match, by design.
 */
export function quoteAppearsIn(quote: string, ...sources: (string | null | undefined)[]): boolean {
  // Models often wrap the quote in quote marks or trail off with an ellipsis.
  const needle = normalizeForMatch(quote).replace(/^["'\s.…]+|["'\s.…]+$/g, "");
  if (needle.length < MIN_QUOTE_CHARS) return false;
  return sources.some((source) => source && normalizeForMatch(source).includes(needle));
}

/**
 * True if a job ID the model extracted is really in the email, as a whole token
 * ("12345" must not match inside "512345"). IDs can be short, so no minimum length beyond 3.
 */
export function jobRefAppearsIn(ref: string, ...sources: (string | null | undefined)[]): boolean {
  const needle = normalizeForMatch(ref).replace(/^#/, "");
  if (needle.length < 3) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u");
  return sources.some((source) => source && pattern.test(normalizeForMatch(source)));
}

// Text the chat answer puts in double quotes (“…”, "…", «…»): it presents these as quoted sources.
const QUOTED_SPAN = /["“”«»„]([^"“”«»„\n]{6,300})["“”«»„]/g;

/** Quoted spans in `answer` that don't appear verbatim in any string of the tool results. */
export function unverifiedQuotes(answer: string, toolResults: unknown[]): string[] {
  const haystack = normalizeForMatch(collectStrings(toolResults).join("\n"));
  return [...answer.matchAll(QUOTED_SPAN)].map((m) => m[1]).filter((q) => !haystack.includes(normalizeForMatch(q)));
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}
