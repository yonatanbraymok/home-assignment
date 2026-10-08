"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { MAX_QUESTION_CHARS } from "@/lib/agent/question";
import { cn } from "@/lib/utils";
import { askAgent } from "./actions";

// The agent in the dashboard: the same one as in Telegram, and the same conversation, so a
// follow-up here continues a question asked there. It reads; it never changes the tracker.

export type ChatTurn = { id: string; question: string; answer: string; channel: "telegram" | "dashboard"; at: string; failed?: boolean };

const SUGGESTIONS = ["Which applications haven't replied yet?", "What's my next interview?", "How many rejections have I had?"];

export function AgentChat({ initial, className }: { initial: ChatTurn[]; className?: string }) {
  const [turns, setTurns] = useState(initial);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  // Keep the newest message in view inside the card (not the page).
  useEffect(() => {
    const box = end.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns, asking]);

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setDraft("");
    setAsking(q);
    startTransition(async () => {
      let turn: ChatTurn;
      try {
        const result = await askAgent(q);
        turn = { id: crypto.randomUUID(), question: q, answer: result.text, channel: "dashboard", at: new Date().toISOString(), failed: result.kind !== "answer" };
      } catch {
        turn = { id: crypto.randomUUID(), question: q, answer: "I couldn't reach the server. Check your connection and try again.", channel: "dashboard", at: new Date().toISOString(), failed: true };
      }
      setTurns((t) => [...t, turn]);
      setAsking(null);
    });
  }

  return (
    <Card className={cn("gap-0 pb-0", className)}>
      <CardHeader className="border-b">
        <CardTitle>Ask the agent</CardTitle>
        <CardDescription>Answers come from your tracker and say where they came from. The same conversation as in Telegram.</CardDescription>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col px-0">
        <div className="h-80 flex-1 overflow-y-auto px-4 py-4 lg:h-auto lg:max-h-[34rem] lg:min-h-80" aria-live="polite">
          {turns.length === 0 && !asking ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Ask about your applications in plain words, in English or Hebrew. For example:</p>
              <div className="flex flex-col items-start gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-full border px-3 py-1 text-left text-sm transition-colors hover:border-primary hover:text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="flex flex-col gap-4">
              {turns.map((t) => (
                <li key={t.id} className="flex flex-col gap-2">
                  <Question text={t.question} note={t.channel === "telegram" ? "in Telegram" : undefined} />
                  <Answer text={t.answer} failed={t.failed} />
                </li>
              ))}
              {asking && (
                <li className="flex flex-col gap-2">
                  <Question text={asking} />
                  <p className="w-fit rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <span className="motion-safe:animate-pulse">Checking your tracker…</span>
                  </p>
                </li>
              )}
            </ol>
          )}
          <div ref={end} />
        </div>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-2">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <label htmlFor="agent-question" className="sr-only">
            Your question
          </label>
          <textarea
            id="agent-question"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter makes a new line.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                ask(draft);
              }
            }}
            rows={1}
            maxLength={MAX_QUESTION_CHARS}
            placeholder="Ask about your applications"
            className="max-h-32 min-h-9 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <Button type="submit" size="icon" disabled={pending || !draft.trim()} aria-label="Send">
            {pending ? <Send className="motion-safe:animate-pulse" /> : <ArrowUp />}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">The agent reads only. Changes come from the cards you approve in Telegram.</p>
      </CardFooter>
    </Card>
  );
}

function Question({ text, note }: { text: string; note?: string }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">{text}</p>
      {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
    </div>
  );
}

function Answer({ text, failed }: { text: string; failed?: boolean }) {
  return (
    <p
      className={cn(
        "max-w-[92%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]",
        failed ? "border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-muted",
      )}
    >
      {text}
    </p>
  );
}
