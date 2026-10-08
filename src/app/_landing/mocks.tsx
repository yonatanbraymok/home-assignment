import type { CSSProperties } from "react";
import { Check, Lock, Mail, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { STATUS_STYLE } from "@/components/status-badge";
import { APP_NAME } from "@/lib/brand";
import { STATUS_LABEL } from "@/lib/proposals/rules";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

// Flat, simplified pictures of the product for the landing page: tracked applications, the Gmail
// connect step, a recruiter's email and the bot's card in Telegram. Pictures, not controls: each is
// one image for assistive technology (role="img" with a label), and nothing in them can be clicked.

// The pictures are always light, so their status pills keep the light colours in dark mode too.
const lightOnly = (classes: string) => classes.split(" ").filter((c) => !c.startsWith("dark:")).join(" ");

/** One tracked application, as the hero's fan of cards shows it. */
export function MockApplication({ company, role, status, className, style }: { company: string; role: string; status: ApplicationStatus; className?: string; style?: CSSProperties }) {
  return (
    <div style={style} role="img" aria-label={`${company}, ${role}: ${STATUS_LABEL[status]}`} className={cn("rounded-[1.75rem] bg-white shadow-[0_24px_48px_-28px_rgb(17_17_17/0.45)] p-5 text-ink", className)}>
      <div className="flex items-center justify-between">
        <span className="grid size-10 place-items-center rounded-full bg-ink font-heading text-lg font-semibold text-lime">{company[0]}</span>
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", lightOnly(STATUS_STYLE[status]))}>{STATUS_LABEL[status]}</span>
      </div>
      <p className="mt-6 font-heading text-lg leading-tight font-semibold">{role}</p>
      <p className="mt-1 text-sm text-ink/55">{company}</p>
      <div className="mt-5 space-y-2">
        <i className="block h-1.5 w-full rounded-full bg-ink/10" />
        <i className="block h-1.5 w-2/3 rounded-full bg-ink/10" />
      </div>
    </div>
  );
}

export function MockConnectCard() {
  return (
    <div role="img" aria-label="Connect Gmail: read-only access" className="w-full max-w-sm rounded-[1.75rem] bg-white shadow-[0_24px_48px_-28px_rgb(17_17_17/0.45)] p-5 text-ink">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-full bg-sky">
          <Mail className="size-5 text-ink" />
        </div>
        <div>
          <p className="font-heading font-semibold">Connect Gmail</p>
          <p className="text-xs text-ink/55">Read-only access</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-lime px-2.5 py-0.5 text-xs font-semibold">
          <Lock className="size-3" />
          Secure
        </span>
      </div>
      <ul className="mt-5 flex flex-col gap-2.5 text-sm">
        {["Reads your job emails only", "Can never send, delete or change mail", "Disconnect any time from Telegram"].map((line) => (
          <li key={line} className="flex items-center gap-2">
            <Check className="size-4 shrink-0 text-emerald-600" />
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex h-10 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">Connect Gmail</div>
    </div>
  );
}

export function MockEmail() {
  return (
    <div role="img" aria-label="A new email: Interview Invitation - Google. We'd love to chat!" className="w-full max-w-sm rounded-[1.75rem] bg-white shadow-[0_24px_48px_-28px_rgb(17_17_17/0.45)] text-ink">
      <div className="flex items-center gap-3 border-b border-ink/10 px-4 py-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-ink font-heading text-sm font-semibold text-lime">G</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Google Recruiting</p>
          <p className="text-xs text-ink/55">to me · 9:41</p>
        </div>
        <span className="ml-auto rounded-full bg-lilac/60 px-2.5 py-0.5 text-xs font-semibold text-[#5b21b6]">Inbox</span>
      </div>
      <div className="px-4 py-3.5">
        <p className="text-xs text-ink/55">Subject</p>
        <p className="font-heading font-semibold">Interview Invitation - Google</p>
        <p className="mt-2 text-sm text-ink/65">Hi Dana, we&apos;d love to chat! Are you free for a 45-minute interview with the team next week?</p>
      </div>
    </div>
  );
}

export function MockTelegramMessage() {
  return (
    <div role="img" aria-label={`${APP_NAME} in Telegram: Google requested an interview. Move status to Interview? Approve or Reject.`} className="w-full max-w-sm text-ink">
      <div className="flex items-end gap-2">
        <BrandMark className="size-8" />
        <div className="min-w-0 rounded-3xl rounded-bl-md bg-white shadow-[0_24px_48px_-28px_rgb(17_17_17/0.45)] px-4 py-3">
          <p className="text-xs font-bold text-ink">{APP_NAME}</p>
          <p className="mt-1 text-sm">
            Google requested an interview. Move status to <span className="rounded-md bg-lilac/60 px-1 font-semibold">INTERVIEW</span>?
          </p>
          <p className="mt-2 border-l-[3px] border-lilac pl-2 text-xs text-ink/55">“We&apos;d love to chat!”</p>
          <p className="mt-1 text-right text-[10px] text-ink/40">9:41</p>
        </div>
      </div>
      <div className="mt-1.5 ml-10 grid grid-cols-2 gap-1.5 text-sm font-medium">
        <div className="flex items-center justify-center gap-1.5 rounded-full bg-ink py-2 text-white">
          <Check className="size-4" />
          Approve
        </div>
        <div className="flex items-center justify-center gap-1.5 rounded-full bg-white py-2 text-rose-600">
          <X className="size-4" />
          Reject
        </div>
      </div>
    </div>
  );
}
