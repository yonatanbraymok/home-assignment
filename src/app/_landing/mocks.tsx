import { Check, Lock, Mail, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { APP_NAME } from "@/lib/brand";

// Flat, simplified pictures of the product for the landing page's tour: the Gmail connect step, a
// recruiter's email and the bot's card in Telegram. Pictures, not controls: each is one image for
// assistive technology (role="img" with a label), and nothing in them can be clicked.

export function MockConnectCard() {
  return (
    <div role="img" aria-label="Connect Gmail: read-only access" className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <Mail className="size-5 text-zinc-700 dark:text-zinc-300" />
        </div>
        <div>
          <p className="font-medium">Connect Gmail</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Read-only access</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <Lock className="size-3" />
          Secure
        </span>
      </div>
      <ul className="mt-5 flex flex-col gap-2.5 text-sm">
        {["Reads your job emails only", "Can never send, delete or change mail", "Disconnect any time from Telegram"].map((line) => (
          <li key={line} className="flex items-center gap-2">
            <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex h-10 items-center justify-center rounded-md bg-indigo-600 text-sm font-medium text-white">Connect Gmail</div>
    </div>
  );
}

export function MockEmail() {
  return (
    <div role="img" aria-label="A new email: Interview Invitation - Google. We'd love to chat!" className="w-full max-w-md rounded-xl border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50">
      <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">G</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Google Recruiting</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">to me · 9:41</p>
        </div>
        <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">Inbox</span>
      </div>
      <div className="px-4 py-3.5">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Subject</p>
        <p className="font-semibold">Interview Invitation - Google</p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Hi Dana, we&apos;d love to chat! Are you free for a 45-minute interview with the team next week?
        </p>
      </div>
    </div>
  );
}

export function MockTelegramMessage() {
  return (
    <div role="img" aria-label={`${APP_NAME} in Telegram: Google requested an interview. Move status to Interview? Approve or Reject.`} className="w-full max-w-sm text-zinc-900 dark:text-zinc-50">
      <div className="flex items-end gap-2">
        <BrandMark className="size-8 rounded-full text-[11px]" />
        <div className="min-w-0 rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{APP_NAME}</p>
          <p className="mt-1 text-sm">
            Google requested an interview. Move status to <span className="font-semibold">INTERVIEW</span>?
          </p>
          <p className="mt-2 border-l-2 border-indigo-500/60 pl-2 text-xs text-zinc-500 dark:text-zinc-400">“We&apos;d love to chat!”</p>
          <p className="mt-1 text-right text-[10px] text-zinc-400">9:41</p>
        </div>
      </div>
      <div className="mt-1.5 ml-10 grid grid-cols-2 gap-1.5 text-sm font-medium">
        <div className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 py-2 text-emerald-700 dark:bg-zinc-800 dark:text-emerald-400">
          <Check className="size-4" />
          Approve
        </div>
        <div className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 py-2 text-rose-700 dark:bg-zinc-800 dark:text-rose-400">
          <X className="size-4" />
          Reject
        </div>
      </div>
    </div>
  );
}
