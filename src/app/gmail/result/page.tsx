import { Suspense } from "react";
import { RESULT_MESSAGES, type ResultStatus } from "./statuses";

export const metadata = { title: "Gmail connection · Job Hunt Tracker" };

// With cacheComponents on, reading searchParams (request data) must sit inside a Suspense
// boundary so the shell can still be prerendered.
export default function GmailResultPage(props: PageProps<"/gmail/result">) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-4">
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Loading…</p>}>
        <ResultMessage searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function ResultMessage({ searchParams }: Pick<PageProps<"/gmail/result">, "searchParams">) {
  const { s } = await searchParams;
  // Own keys only: `in` would also accept "toString" and other built-in keys.
  const status = (typeof s === "string" && Object.hasOwn(RESULT_MESSAGES, s) ? s : "error") as ResultStatus;
  const message = RESULT_MESSAGES[status];
  return (
    <>
      <h1 className="text-2xl font-semibold">{message.title}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{message.body}</p>
    </>
  );
}
