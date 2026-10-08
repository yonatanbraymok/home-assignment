"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABEL } from "@/lib/proposals/rules";
import { changeStatus } from "../../actions";

// Correct a status by hand, for when the agent missed an email. It changes the tracker at once;
// cards still waiting in Telegram for this application won't apply after it.

const ORDER: ApplicationStatus[] = ["APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];

const RESULT: Record<string, string> = {
  "changed-meanwhile": "The status changed meanwhile, maybe from a card in Telegram. The page now shows the current one.",
  duplicate: "You already track a same-title application at this company that's waiting for a reply. Change that one instead.",
  "not-found": "This application no longer exists.",
  "signed-out": "Your session ended. Send /dashboard to the bot for a new sign-in link.",
};

export function StatusEditor({ applicationId, status, waitingCards }: { applicationId: string; status: ApplicationStatus; waitingCards: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<ApplicationStatus>(status);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => {
            setOpen(true);
            setNext(status);
            setMessage(null);
          }}
        >
          <Pencil data-icon="inline-start" />
          Change status
        </Button>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </div>
    );
  }

  const save = () =>
    startTransition(async () => {
      const result = await changeStatus(applicationId, status, next);
      if (result.kind === "saved" || result.kind === "unchanged") {
        setOpen(false);
        setMessage(result.kind === "saved" ? `Saved: ${STATUS_LABEL[next]}.` : null);
      } else {
        setMessage(RESULT[result.kind]);
      }
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border bg-background p-3">
      <p className="text-sm">Missed an email? Set the status yourself. It changes your tracker right away.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={next} onValueChange={(v) => setNext(v as ApplicationStatus)}>
          <SelectTrigger className="w-44" aria-label="New status">
            <SelectValue>{STATUS_LABEL[next]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" onClick={save} disabled={pending || next === status}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      {waitingCards > 0 && (
        <p className="text-xs text-muted-foreground">
          {waitingCards === 1 ? "A card for this application is waiting in Telegram; it won't apply after this change." : `${waitingCards} cards for this application are waiting in Telegram; they won't apply after this change.`}
        </p>
      )}
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  );
}
