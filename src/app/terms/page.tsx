import Link from "next/link";

export const metadata = { title: "Terms · Job Hunt Tracker" };

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10 text-sm leading-relaxed [&_li]:ml-5 [&_li]:list-disc">
      <h1 className="text-2xl font-semibold">Terms of use</h1>
      <p className="text-muted-foreground">Job Hunt Tracker · last updated 8 October 2026</p>
      <ul>
        <li>Job Hunt Tracker is a free demonstration project, provided as is, without any warranty or guaranteed availability.</li>
        <li>
          It reads your Gmail read-only and proposes changes to your tracker; you decide every change. Check important details in the original
          email: the AI can be wrong, which is why it quotes the email and asks you first.
        </li>
        <li>AI use is limited by a monthly allowance; when it&apos;s used up, AI features pause until the next month.</li>
        <li>
          You can stop at any time with <code>/disconnect</code> or <code>/delete_my_data</code>. How your data is handled is described in the{" "}
          <Link className="underline" href="/privacy">
            privacy policy
          </Link>
          .
        </li>
      </ul>
      <p>
        <Link className="underline" href="/">
          Home
        </Link>
      </p>
    </main>
  );
}
