import { DEMO_MESSAGE_PREFIX } from "@/lib/gmail/links";
import type { ParsedEmail } from "@/lib/gmail/parse";

// The demo's sample inbox (/demo): fictional companies on .example domains, which are reserved,
// so no address here can belong to anyone. Past emails are dated weeks before the demo starts and
// go through the past-email review; live ones arrive one at a time (/demo_email). After they are
// stored, everything is the real pipeline: prefilter, AI, quote check, matching and cards.
//
// What the past emails should become (evals/demo.ts checks it): six review cards from five
// companies. Lumen, Aurora and Vega each send two emails that collapse into one card, Cobalt has
// two roles told apart by job ID, the newsletter is read and dropped, and the job alert never
// reaches the AI.

type Sample = {
  key: string; // unique within the demo; the Gmail message id is "demo:<key>"
  thread: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  body: (firstName: string) => string;
  daysAgo?: number; // past emails only
  bulk?: boolean; // newsletters and alerts carry List-Unsubscribe
};

const NORTHWIND = { fromAddress: "careers@northwind-robotics.example", fromName: "Northwind Robotics Careers" };
const LUMEN = { fromAddress: "jobs@lumenhealth.example", fromName: "Lumen Health Recruiting" };
const AURORA = { fromAddress: "no-reply@aurorapay.example", fromName: "Aurora Pay" };
const COBALT = { fromAddress: "careers@cobaltcloud.example", fromName: "Cobalt Cloud Careers" };
const VEGA = { fromAddress: "talent@vegagames.example", fromName: "Vega Games Talent" };

const PAST: Sample[] = [
  {
    key: "p1",
    thread: "northwind",
    ...NORTHWIND,
    daysAgo: 34,
    subject: "We received your application",
    body: (name) =>
      `Hi ${name},\n\nThank you for applying to the Embedded Software Intern role at Northwind Robotics. Our team reviews every application carefully, and we'll get back to you within two to three weeks.\n\nBest,\nNorthwind Robotics Talent Team`,
  },
  {
    key: "p2",
    thread: "lumen",
    ...LUMEN,
    daysAgo: 30,
    subject: "Your application for Data Science Intern",
    body: (name) =>
      `Hi ${name},\n\nThanks for applying for the Data Science Intern position at Lumen Health. We've received your application, and our recruiting team will review it shortly.\n\nKind regards,\nLumen Health Recruiting`,
  },
  {
    key: "p3",
    thread: "aurora",
    ...AURORA,
    daysAgo: 27,
    subject: "Application received: Frontend Developer Intern",
    body: (name) =>
      `Hello ${name},\n\nWe've received your application for the Frontend Developer Intern position at Aurora Pay. If your profile matches what we're looking for, a recruiter will contact you.\n\nThe Aurora Pay Hiring Team`,
  },
  {
    key: "p4",
    thread: "cobalt-4471",
    ...COBALT,
    daysAgo: 24,
    subject: "Thanks for applying: Backend Engineering Intern (Job ID 4471)",
    body: (name) =>
      `Hi ${name},\n\nThank you for your application for Backend Engineering Intern (Job ID 4471) at Cobalt Cloud. We'll review it and be in touch about next steps.\n\nCobalt Cloud Talent Acquisition`,
  },
  {
    key: "p5",
    thread: "cobalt-4490",
    ...COBALT,
    daysAgo: 24,
    subject: "Thanks for applying: Cloud Infrastructure Intern (Job ID 4490)",
    body: (name) =>
      `Hi ${name},\n\nThank you for your application for Cloud Infrastructure Intern (Job ID 4490) at Cobalt Cloud. We'll review it and be in touch about next steps.\n\nCobalt Cloud Talent Acquisition`,
  },
  {
    key: "p6",
    thread: "vega",
    ...VEGA,
    daysAgo: 21,
    subject: "Application received: Gameplay Programmer Intern",
    body: (name) =>
      `Hi ${name},\n\nThanks for your interest in Vega Games! We've received your application for the Gameplay Programmer Intern role and will review it soon.\n\nVega Games Talent`,
  },
  {
    key: "p7",
    thread: "lumen",
    ...LUMEN,
    daysAgo: 17,
    subject: "Next step: online assessment for Data Science Intern",
    body: (name) =>
      `Hi ${name},\n\nThank you for your interest in the Data Science Intern position at Lumen Health. As the next step, we'd like to invite you to complete an online assessment on HackerRank. It takes about 90 minutes and must be completed within 5 days of receiving this email.\n\nGood luck!\nLumen Health Recruiting`,
  },
  {
    key: "p8",
    thread: "aurora",
    ...AURORA,
    daysAgo: 13,
    subject: "Update on your application",
    body: (name) =>
      `Hello ${name},\n\nThank you for your interest in the Frontend Developer Intern position at Aurora Pay. After careful consideration, we have decided to move forward with other candidates whose experience more closely matches our needs.\n\nWe wish you the best in your search.\nThe Aurora Pay Hiring Team`,
  },
  {
    key: "p9",
    thread: "vega",
    ...VEGA,
    daysAgo: 9,
    subject: "Interview invitation: Gameplay Programmer Intern",
    body: (name) =>
      `Hi ${name},\n\nGreat news: we'd like to invite you to an interview for the Gameplay Programmer Intern role at Vega Games. It will be a 45-minute video call with our lead gameplay engineer, Noa Peretz, covering your game projects and a short C# exercise. Please reply with a few times that suit you this week.\n\nVega Games Talent`,
  },
  {
    key: "p10",
    thread: "digest",
    fromAddress: "digest@interndigest.example",
    fromName: "The Intern Digest",
    daysAgo: 6,
    bulk: true,
    // Its subject passes the free prefilter, so the AI reads it and finds it isn't about an application.
    subject: "7 habits that help in every tech interview",
    body: () =>
      "This week in The Intern Digest: seven habits that help in every tech interview, a salary guide for summer internships, and our favourite free courses.\n\nRead it online. You're receiving this because you subscribed to The Intern Digest. Unsubscribe at any time.",
  },
  {
    key: "p11",
    thread: "alerts",
    fromAddress: "alerts@jobboard.example",
    fromName: "JobBoard Alerts",
    daysAgo: 3,
    bulk: true,
    // Bulk mail without a strong signal: the prefilter drops it, at no AI cost.
    subject: "12 new jobs match your search",
    body: () =>
      "12 new jobs match your saved search \"software student\": Backend Student at Nimbus Labs, QA Student at Tidal Systems and 10 more.\n\nManage your alerts or unsubscribe.",
  },
];

const LIVE: Sample[] = [
  {
    key: "l1",
    thread: "northwind",
    ...NORTHWIND,
    // The same facts as the example brief on the Developers page, so the MCP tool can be tried on it.
    subject: "Next step: technical interview",
    body: (name) =>
      `Hi ${name},\n\nThanks again for applying to the Embedded Software Intern role. We enjoyed your profile and would like to invite you to a technical interview.\n\nThe interview will be a 60-minute technical session on Zoom. You'll meet Maya Cohen, our firmware team lead. We'll focus on C and RTOS fundamentals.\n\nPlease reply with two time slots that work for you next week.\n\nBest,\nNorthwind Robotics Talent Team`,
  },
  {
    key: "l2",
    thread: "cobalt-4471",
    ...COBALT,
    subject: "Interview invitation: Backend Engineering Intern (Job ID 4471)",
    body: (name) =>
      `Hi ${name},\n\nWe enjoyed reading your application for Backend Engineering Intern (Job ID 4471) and would like to invite you to a 45-minute technical interview with our platform team. You'll get a calendar invite once you confirm your availability.\n\nCobalt Cloud Talent Acquisition`,
  },
  {
    key: "l3",
    thread: "lumen",
    ...LUMEN,
    subject: "Your application for Data Science Intern",
    body: (name) =>
      `Hi ${name},\n\nThank you for completing our online assessment for the Data Science Intern position. Unfortunately, we won't be moving forward with your application at this time. We appreciated your effort and encourage you to apply again in the future.\n\nKind regards,\nLumen Health Recruiting`,
  },
  {
    key: "l4",
    thread: "cobalt",
    ...COBALT,
    // Names neither role nor job ID, and both Cobalt applications fit: the agent asks which one.
    subject: "Scheduling your next conversation",
    body: (name) =>
      `Hi ${name},\n\nThank you for your patience. We'd like to schedule a 30-minute interview with you and our hiring team next week. Please share your availability by replying to this email.\n\nCobalt Cloud Talent Acquisition`,
  },
  {
    key: "l5",
    thread: "vega",
    ...VEGA,
    subject: "Your offer from Vega Games",
    body: (name) =>
      `Hi ${name},\n\nThank you for interviewing with us. We're delighted to offer you the Gameplay Programmer Intern position at Vega Games! Your offer letter is attached; please let us know your decision within a week.\n\nWelcome aboard,\nVega Games Talent`,
  },
];

export const LIVE_DEMO_EMAILS = LIVE.length;

const DAY_MS = 86_400_000;

function toEmail(s: Sample, firstName: string, receivedAt: Date): ParsedEmail {
  const bodyText = s.body(firstName);
  return {
    gmailMessageId: `${DEMO_MESSAGE_PREFIX}${s.key}`,
    gmailThreadId: `${DEMO_MESSAGE_PREFIX}${s.thread}`,
    fromAddress: s.fromAddress,
    fromName: s.fromName,
    subject: s.subject,
    receivedAt,
    snippet: bodyText.replace(/\s+/g, " ").slice(0, 160),
    bodyText,
    headers: s.bulk ? { "list-unsubscribe": `<mailto:unsubscribe@${s.fromAddress.split("@")[1]}>` } : {},
    labelIds: ["INBOX"],
  };
}

/** The sample inbox as it looks when the demo starts: oldest first, each a few days apart. */
export function pastDemoEmails(firstName: string, now: Date): ParsedEmail[] {
  // Morning hours, so the dates read like real mail.
  return PAST.map((s) => toEmail(s, firstName, new Date(now.getTime() - s.daysAgo! * DAY_MS - 3 * 3600_000)));
}

/** The `index`-th live email (0-based), received now; null after the last one. */
export function liveDemoEmail(index: number, firstName: string, now: Date): ParsedEmail | null {
  const sample = LIVE[index];
  return sample ? toEmail(sample, firstName, now) : null;
}

/** Live emails already sent are counted by their ids. */
export const LIVE_DEMO_ID_PREFIX = `${DEMO_MESSAGE_PREFIX}l`;
