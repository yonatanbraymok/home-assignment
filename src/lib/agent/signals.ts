import type { EmailCategory } from "@/generated/prisma/enums";

// Typical wording per category, English and Hebrew. Used only to cross-check the model:
// if the email contains none of these, the model's confidence is capped at LOW.
const CATEGORY_PHRASES: Partial<Record<EmailCategory, string[]>> = {
  APPLICATION_RECEIVED: [
    "thank you for applying", "thanks for applying", "received your application", "application has been received",
    "application was sent", "application submitted", "we have received", "קיבלנו את", "מועמדותך התקבלה", "תודה על פנייתך",
  ],
  ASSESSMENT_INVITE: [
    "assessment", "coding challenge", "online test", "coding test", "home assignment", "take-home", "hackerrank",
    "codility", "codesignal", "test link", "מבחן", "מטלה", "מבדק",
  ],
  INTERVIEW_INVITE: [
    "interview", "schedule a call", "schedule a time", "phone screen", "meet with", "availability", "calendly",
    "ראיון", "שיחה", "פגישה",
  ],
  REJECTION: [
    "unfortunately", "regret", "not be moving forward", "not moving forward", "move forward with other",
    "moving forward with other", "other candidates", "not been selected", "not selected", "decided not to",
    "position has been filled", "keep your resume on file", "keep your cv", "will not be proceeding",
    "לצערנו", "לא נוכל", "הוחלט שלא", "לא להתקדם", "מועמדים אחרים",
  ],
  OFFER: ["offer", "pleased to offer", "offer letter", "congratulations", "הצעת עבודה", "הצעה", "שמחים להציע"],
};

export function wordingSupportsCategory(category: EmailCategory, text: string): boolean {
  const phrases = CATEGORY_PHRASES[category];
  if (!phrases) return true; // nothing to cross-check (OTHER_JOB_RELATED, NOT_JOB_RELATED)
  const haystack = text.toLowerCase();
  return phrases.some((p) => haystack.includes(p));
}
