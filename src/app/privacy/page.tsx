import Link from "next/link";
import { botUrl } from "@/lib/env";

export const metadata = { title: "Privacy · Job Hunt Tracker" };

// Linked from Google's consent screen. Describes what the code actually does; keep it in sync.
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10 text-sm leading-relaxed [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
      <h1 className="text-2xl font-semibold">Privacy policy</h1>
      <p className="text-muted-foreground">Job Hunt Tracker · last updated 8 October 2026</p>
      <p>
        Job Hunt Tracker keeps a student&apos;s internship applications up to date from their Gmail. Every change is proposed in Telegram,
        and nothing changes until the student approves it.
      </p>

      <h2>What we access</h2>
      <ul>
        <li>Your Telegram account id and name, when you start the bot.</li>
        <li>
          Your Gmail, read-only (<code>gmail.readonly</code>), only after you connect it. We can&apos;t send, delete or change any email.
        </li>
      </ul>

      <h2>What we store</h2>
      <ul>
        <li>For emails that look job-related: sender, subject, date and the text of the latest message, plus the AI&apos;s analysis of it.</li>
        <li>For all other emails: only sender, subject and date, so they aren&apos;t read twice. Their content is never stored.</li>
        <li>Your applications, the status changes proposed to you and your decisions, and your questions to the bot with its answers.</li>
        <li>Your Gmail access token, encrypted (AES-256-GCM). The cost of each AI call, without content.</li>
      </ul>

      <h2>How it&apos;s processed</h2>
      <ul>
        <li>
          Job-related email text is sent to Google&apos;s Gemini API to classify it and to answer your questions, on a paid plan under which Google
          doesn&apos;t use the content to improve its products.
        </li>
        <li>The app runs on Vercel; data is stored in a Supabase Postgres database in the US.</li>
        <li>We don&apos;t sell, share or advertise with your data, and no one else has access to it.</li>
        <li>
          If you create an MCP token, AI tools you connect with it can read your tracker and request briefs. They can&apos;t change anything, and
          you can revoke the token at any time.
        </li>
      </ul>

      <h2>Google user data</h2>
      <p>
        Job Hunt Tracker&apos;s use and transfer of information received from Google APIs adheres to the{" "}
        <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Gmail data is used only to provide the tracker to you.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          <code>/disconnect</code> in the bot revokes Gmail access and deletes the stored token; your tracker stays.
        </li>
        <li>
          <code>/delete_my_data</code> deletes everything stored about you. Only AI cost records remain, without your name.
        </li>
        <li>
          You can also remove access at any time at{" "}
          <a className="underline" href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          .
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Message the bot at{" "}
        <a className="underline" href={botUrl()}>
          {botUrl().replace("https://", "")}
        </a>
        .
      </p>
      <p>
        <Link className="underline" href="/">
          Home
        </Link>{" "}
        ·{" "}
        <Link className="underline" href="/terms">
          Terms
        </Link>
      </p>
    </main>
  );
}
