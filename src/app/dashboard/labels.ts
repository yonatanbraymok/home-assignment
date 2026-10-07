import type { ApplicationStatus, EmailCategory } from "@/generated/prisma/enums";
import { STATUS_LABEL } from "@/lib/proposals/rules";

export const CATEGORY_LABEL: Record<EmailCategory, string> = {
  APPLICATION_RECEIVED: "Application received",
  ASSESSMENT_INVITE: "Online assessment",
  INTERVIEW_INVITE: "Interview invitation",
  REJECTION: "Rejection",
  OFFER: "Offer",
  OTHER_JOB_RELATED: "Other job email",
  NOT_JOB_RELATED: "Not job-related",
};

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const STATUS_NAME = /\b(APPLIED|ASSESSMENT|INTERVIEW|OFFER|REJECTED|WITHDRAWN)\b/g;

/** The analysis records why no change was proposed in internal terms (e.g. "already INTERVIEW"). */
export function humanReason(reason: string): string {
  if (reason === "no status change implied") return "the email doesn't change the status";
  return reason
    .replace(/^every candidate is already/, "every matching application is already at")
    .replace(/^already\b/, "already at")
    .replace(STATUS_NAME, (s) => STATUS_LABEL[s as ApplicationStatus]);
}
