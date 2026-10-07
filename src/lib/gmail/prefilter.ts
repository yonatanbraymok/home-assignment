import { senderDomain, type ParsedEmail } from "./parse";

// Free, deterministic first pass: decides which emails are worth an LLM call.
// It is tuned for recall (a missed rejection is worse than an extra model call);
// the classifier makes the real decision.

// Applicant-tracking systems and assessment platforms that email on behalf of companies.
const ATS_DOMAINS = [
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "myworkday.com", "myworkdayjobs.com", "workday.com",
  "ashbyhq.com", "smartrecruiters.com", "icims.com", "successfactors.com", "successfactors.eu", "taleo.net",
  "jobvite.com", "eightfold.ai", "workable.com", "recruitee.com", "teamtailor.com", "bamboohr.com",
  "breezy.hr", "comeet.co", "comeet.com", "hackerrank.com", "hackerrankforwork.com", "codility.com",
  "codesignal.com", "hirevue.com", "mettl.com",
];

// Exact senders on general-purpose domains (LinkedIn/Indeed also send lots of job-alert noise).
const ATS_ADDRESSES = ["jobs-noreply@linkedin.com", "indeedapply@indeed.com"];

// A subject containing one of these is enough on its own.
const SUBJECT_TERMS = [
  "application", "applying", "applied", "candidacy", "interview", "assessment", "coding challenge",
  "online test", "offer", "next steps", "internship",
  "מועמדות", "ראיון", "משרה", "משרת", "התמחות", "מבחן", "הצעת עבודה",
];

// In the body we require two different terms, to keep newsletters and alerts out.
const BODY_TERMS = [
  "your application", "application for", "thank you for applying", "thanks for applying", "candidacy",
  "candidate", "interview", "assessment", "coding challenge", "hackerrank", "codility", "codesignal",
  "position", "internship", "intern", "offer letter", "regret to inform", "unfortunately",
  "move forward", "moving forward", "other candidates", "next steps", "recruiter", "recruiting",
  "talent acquisition", "hiring team",
  "מועמדות", "מועמד", "משרה", "משרת", "ראיון", "התמחות", "מבחן", "הצעת עבודה", "לצערנו",
  "קורות החיים", "קורות חיים", "גיוס", "תודה על פנייתך",
];

export type PrefilterResult = { candidate: boolean; reason: string };

export function prefilter(email: ParsedEmail, trackedDomains: string[] = []): PrefilterResult {
  const domain = senderDomain(email.fromAddress);
  const fromDomain = (d: string) => domain === d || domain.endsWith(`.${d}`);

  if (ATS_ADDRESSES.includes(email.fromAddress)) return { candidate: true, reason: `ats-address:${email.fromAddress}` };
  const ats = ATS_DOMAINS.find(fromDomain);
  if (ats) return { candidate: true, reason: `ats-domain:${ats}` };
  const tracked = trackedDomains.find(fromDomain);
  if (tracked) return { candidate: true, reason: `tracked-domain:${tracked}` };

  const subject = email.subject.toLowerCase();
  const subjectTerm = SUBJECT_TERMS.find((t) => subject.includes(t));
  if (subjectTerm) return { candidate: true, reason: `subject:${subjectTerm}` };

  // Bulk mail (newsletters, job alerts) only passes on the strong signals above.
  if (email.headers["list-unsubscribe"] || /^(bulk|list)$/i.test(email.headers["precedence"] ?? "")) {
    return { candidate: false, reason: "bulk-mail" };
  }

  const text = `${email.snippet}\n${email.bodyText}`.toLowerCase();
  const hits = BODY_TERMS.filter((t) => matchesTerm(text, t));
  if (hits.length >= 2) return { candidate: true, reason: `body:${hits.slice(0, 3).join("|")}` };
  return { candidate: false, reason: hits.length ? `body-weak:${hits[0]}` : "no-signal" };
}

// Latin terms match whole words ("intern" must not match "internal"); Hebrew terms match as
// substrings because Hebrew attaches prefixes like ה/ל/ב to words.
function matchesTerm(text: string, term: string): boolean {
  if (/[֐-׿]/.test(term)) return text.includes(term);
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
}
