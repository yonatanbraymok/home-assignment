import type { ApplicationStatus } from "@/generated/prisma/enums";
import { isAtsDomain } from "@/lib/gmail/prefilter";

// Deterministic matching of a classified email to one of the user's applications.
// The model only extracts the company and role as written; this code decides which record it is.

export type MatchableApplication = {
  id: string;
  company: string;
  companyDomain: string | null;
  roleTitle: string;
  status: ApplicationStatus;
};

export type MatchResult<A extends MatchableApplication = MatchableApplication> =
  | { kind: "matched"; application: A; strength: "strong" | "weak"; warnings: string[] }
  | { kind: "none"; warnings: string[] };

const SAME_ROLE_THRESHOLD = 0.5;
const PERSONAL_MAIL_DOMAINS = ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "walla.co.il"];

export function matchApplication<A extends MatchableApplication>(
  extracted: { company: string | null; roleTitle: string | null },
  senderDomain: string,
  applications: A[],
): MatchResult<A> {
  const company = extracted.company ? normalizeCompany(extracted.company) : "";
  const domain = companyDomainFor(senderDomain);

  const scored = applications.flatMap((app) => {
    const appCompany = normalizeCompany(app.company);
    const domainHit = Boolean(domain && app.companyDomain && domainMatches(domain, app.companyDomain));
    if (domainHit || (company && appCompany === company)) return [{ app, strong: true }];
    // "Microsoft" vs "Microsoft Azure": related, but not certain.
    if (company && Math.min(company.length, appCompany.length) >= 3 && (company.includes(appCompany) || appCompany.includes(company))) {
      return [{ app, strong: false }];
    }
    return [];
  });
  if (scored.length === 0) return { kind: "none", warnings: [] };

  const label = (a: A) => `${a.company} · ${a.roleTitle}`;
  if (!extracted.roleTitle) {
    const [first, ...others] = scored;
    const warnings = ["The email doesn't name the role"];
    if (others.length) warnings.push(`Also possible: ${others.map((s) => label(s.app)).join(", ")}`);
    return { kind: "matched", application: first.app, strength: "weak", warnings };
  }

  const ranked = scored
    .map((s) => ({ ...s, similarity: roleSimilarity(extracted.roleTitle!, s.app.roleTitle) }))
    .sort((a, b) => b.similarity - a.similarity);
  const best = ranked[0];
  if (best.similarity < SAME_ROLE_THRESHOLD) {
    // Same company, different role: a separate application.
    return { kind: "none", warnings: [`You also track ${ranked.map((r) => label(r.app)).join(", ")}`] };
  }
  const runnersUp = ranked.slice(1).filter((r) => r.similarity >= SAME_ROLE_THRESHOLD);
  const warnings = [];
  if (!best.strong) warnings.push(`Company matched by a similar name ("${extracted.company}" ~ "${best.app.company}")`);
  if (runnersUp.length) warnings.push(`Also possible: ${runnersUp.map((r) => label(r.app)).join(", ")}`);
  return { kind: "matched", application: best.app, strength: best.strong && !runnersUp.length ? "strong" : "weak", warnings };
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

/** Key that makes "create this application" idempotent: one record per company + role. */
export function dedupeKey(company: string, roleTitle: string): string {
  return `${normalizeCompany(company)}|${normalizeRole(roleTitle)}`;
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
