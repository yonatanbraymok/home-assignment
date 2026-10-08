import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { APP_NAME } from "@/lib/brand";

export const metadata = { title: `Terms · ${APP_NAME}` };

export default function TermsPage() {
  return (
    <LegalPage>
      <h1>Terms of use</h1>
      <p className="lead">Job Hunt Tracker · last updated 8 October 2026</p>
      <ul>
        <li>Job Hunt Tracker is a free demonstration project, provided as is, without any warranty or guaranteed availability.</li>
        <li>
          It reads your Gmail read-only and proposes changes to your tracker; you decide every change. Check important details in the original
          email: the AI can be wrong, which is why it quotes the email and asks you first.
        </li>
        <li>AI use is limited by a monthly allowance; when it&apos;s used up, AI features pause until the next month.</li>
        <li>
          You can stop at any time with <code>/disconnect</code> or <code>/delete_my_data</code>. How your data is handled is described in the{" "}
          <Link href="/privacy">
            privacy policy
          </Link>
          .
        </li>
      </ul>
      <p>
        <Link href="/">
          Home
        </Link>
      </p>
    </LegalPage>
  );
}
