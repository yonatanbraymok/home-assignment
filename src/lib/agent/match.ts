import type { ApplicationStatus } from "@/generated/prisma/enums";
import { isAtsDomain } from "@/lib/gmail/prefilter";

// Deterministic matching of a classified email to one of the user's applications.
// The model only extracts what the email says (company, role, job ID); this code decides which
// record it is, and says "ambiguous" instead of guessing when the email can't tell them apart.

export type MatchableApplication = {
  id: string;
  company: string;
  companyDomain: string | null;
  roleTitle: string;
  jobRef: string | null;
  status: ApplicationStatus;
};

export type MatchResult<A extends MatchableApplication = MatchableApplication> =
  | { kind: "matched"; application: A; strength: "strong" | "weak"; warnings: string[] }
  | { kind: "ambiguous"; candidates: A[]; warnings: string[] }
  | { kind: "none"; warnings: string[] };

export type Extracted = { company: string | null; roleTitle: string | null; jobRef: string | null };

const SAME_ROLE_THRESHOLD = 0.5;
// A role match only wins outright if it beats the runner-up by this much.
const CLEAR_WINNER_MARGIN = 0.25;
const PERSONAL_MAIL_DOMAINS = ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "walla.co.il"];

export function matchApplication<A extends MatchableApplication>(extracted: Extracted, senderDomain: string, applications: A[]): MatchResult<A> {
  const company = extracted.company ? normalizeCompany(extracted.company) : "";
  const domain = companyDomainFor(senderDomain);
  const label = (a: A) => `${a.company} · ${a.roleTitle}${a.jobRef ? ` (#${a.jobRef})` : ""}`;

  const atCompany = applications.flatMap((app) => {
    const appCompany = normalizeCompany(app.company);
    const domainHit = Boolean(domain && app.companyDomain && domainMatches(domain, app.companyDomain));
    if (domainHit || (company && appCompany === company)) return [{ app, strong: true }];
    // "Microsoft" vs "Microsoft Azure": related, but not certain.
    if (company && Math.min(company.length, appCompany.length) >= 3 && (company.includes(appCompany) || appCompany.includes(company))) {
      return [{ app, strong: false }];
    }
    return [];
  });
  if (atCompany.length === 0) return { kind: "none", warnings: [] };

  // 1. A job ID decides on its own: same ID is the same application, a different ID is a different one.
  let pool = atCompany;
  if (extracted.jobRef) {
    const ref = normalizeJobRef(extracted.jobRef);
    const exact = atCompany.find((c) => c.app.jobRef && normalizeJobRef(c.app.jobRef) === ref);
    if (exact) return { kind: "matched", application: exact.app, strength: "strong", warnings: [] };
    pool = atCompany.filter((c) => !c.app.jobRef);
    if (pool.length === 0) {
      return { kind: "none", warnings: [`Different job ID from what you track: ${atCompany.map((c) => label(c.app)).join(", ")}`] };
    }
  }

  // 2. No usable job ID: fall back to the role title.
  if (!extracted.roleTitle) {
    if (pool.length === 1) return { kind: "matched", application: pool[0].app, strength: "weak", warnings: ["The email doesn't name the role"] };
    return { kind: "ambiguous", candidates: pool.map((c) => c.app), warnings: ["The email doesn't name the role or a job ID"] };
  }

  const ranked = pool
    .map((c) => ({ ...c, similarity: roleSimilarity(extracted.roleTitle!, c.app.roleTitle) }))
    .sort((a, b) => b.similarity - a.similarity);
  const plausible = ranked.filter((r) => r.similarity >= SAME_ROLE_THRESHOLD);
  if (plausible.length === 0) {
    // Same company, different role: a separate application.
    return { kind: "none", warnings: [`You also track ${ranked.map((r) => label(r.app)).join(", ")}`] };
  }
  const [best, runnerUp] = plausible;
  if (runnerUp && best.similarity - runnerUp.similarity < CLEAR_WINNER_MARGIN) {
    return {
      kind: "ambiguous",
      candidates: plausible.map((p) => p.app),
      warnings: [`Several ${best.app.company} applications fit this role${extracted.jobRef ? "" : " and the email has no job ID"}`],
    };
  }
  const warnings = [];
  if (!best.strong) warnings.push(`Company matched by a similar name ("${extracted.company}" ~ "${best.app.company}")`);
  if (runnerUp) warnings.push(`Also possible: ${label(runnerUp.app)}`);
  return { kind: "matched", application: best.app, strength: best.strong && !runnerUp ? "strong" : "weak", warnings };
}

export function normalizeCompany(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/בע"מ|בע״מ/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\s+(inc|ltd|llc|corp|corporation|co|gmbh|plc|limited|israel|technologies))+$/, "");
}

export function normalizeRole(title: string): string {
  return title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** "JR-12345", "jr 12345" and "#JR12345" are the same job ID. */
export function normalizeJobRef(ref: string): string {
  return ref.normalize("NFKC").toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Key that makes "create this application" idempotent. With a job ID it identifies the job;
 * without one, same company + same title is treated as the same application.
 */
export function dedupeKey(company: string, roleTitle: string, jobRef?: string | null): string {
  return jobRef ? `${normalizeCompany(company)}|#${normalizeJobRef(jobRef)}` : `${normalizeCompany(company)}|${normalizeRole(roleTitle)}`;
}

// Years and seasons differ between emails about the same role ("SWE Intern" vs "SWE Intern - Summer 2027").
const ROLE_NOISE = /^(\d{4}|summer|winter|spring|fall|autumn|the|of|and|for|in|at)$/;

function roleTokens(title: string): Set<string> {
  // Six-letter prefixes as a light stemmer: engineer/engineering, intern/internship.
  return new Set(normalizeRole(title).split(" ").filter((t) => t.length > 1 && !ROLE_NOISE.test(t)).map((t) => t.slice(0, 6)));
}

export function roleSimilarity(a: string, b: string): number {
  const x = roleTokens(a);
  const y = roleTokens(b);
  if (!x.size || !y.size) return 0;
  const shared = [...x].filter((t) => y.has(t)).length;
  return shared / new Set([...x, ...y]).size;
}

/** The company's own domain from a sender domain, or null for ATS platforms and personal mail. */
export function companyDomainFor(senderDomain: string): string | null {
  const domain = senderDomain.toLowerCase();
  if (!domain || isAtsDomain(domain) || PERSONAL_MAIL_DOMAINS.includes(domain)) return null;
  const labels = domain.split(".");
  // Keep three labels for country second-level domains like wix.co.il or bbc.co.uk.
  const countrySecondLevel = labels.length >= 3 && labels.at(-1)!.length === 2 && ["co", "ac", "org", "gov", "net", "com"].includes(labels.at(-2)!);
  return labels.slice(countrySecondLevel ? -3 : -2).join(".");
}

function domainMatches(domain: string, companyDomain: string): boolean {
  return domain === companyDomain || domain.endsWith(`.${companyDomain}`) || companyDomain.endsWith(`.${domain}`);
}
