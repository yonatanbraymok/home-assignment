"use client";

import { MotionConfig, motion, useInView, type Transition } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MockConnectCard, MockEmail, MockTelegramMessage } from "./mocks";

// The landing page's scroll-driven tour. On wide screens the text steps scroll past a sticky stage
// whose picture follows the step crossing the middle of the screen: the Gmail connect card, then an
// email sliding in, then the bot's card popping in below it. On phones each step shows its own
// picture, animated as it scrolls into view. Springs throughout; reduced motion is respected.

const SPRING: Transition = { type: "spring", stiffness: 210, damping: 26 };
const POP: Transition = { type: "spring", stiffness: 320, damping: 22 };

const STEPS = [
  {
    label: "Connect",
    title: "1. Connect your inbox securely.",
    body: "Send /connect to the bot and sign in with Google. Access is read-only: the agent can never send, delete or change an email, and /disconnect stops it at any time.",
  },
  {
    label: "Email",
    title: "2. A recruiter writes back.",
    body: "Within minutes of a job email landing, the agent reads it: confirmations, online assessments, interviews, rejections and offers. Newsletters and job alerts are left alone.",
  },
  {
    label: "Approve",
    title: "3. You approve it in Telegram.",
    body: "The bot proposes the change with the exact sentence from the email that justifies it. Nothing changes until you tap Approve, and the dashboard keeps the whole history.",
  },
];

export function ProductTour() {
  const [active, setActive] = useState(0);
  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto grid w-full max-w-6xl gap-x-16 px-4 lg:grid-cols-2">
        <div>
          {STEPS.map((step, i) => (
            <Step key={step.label} index={i} active={active === i} onActive={setActive} title={step.title} body={step.body} />
          ))}
        </div>
        <div className="hidden lg:block" aria-hidden>
          <div className="sticky top-[calc(50vh-17rem)] py-6">
            <Stage active={active} />
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

function Step({ index, active, onActive, title, body }: { index: number; active: boolean; onActive: (i: number) => void; title: string; body: string }) {
  const ref = useRef<HTMLElement>(null);
  // "Active" while the step crosses the middle band of the screen.
  const inMiddle = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => {
    if (inMiddle) onActive(index);
  }, [inMiddle, index, onActive]);
  return (
    <section ref={ref} id={`scene-${index + 2}`} className="flex scroll-mt-16 flex-col justify-center py-14 lg:min-h-[80vh] lg:py-0">
      <motion.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.6 }} transition={SPRING}>
        <h3 className={cn("text-2xl font-semibold tracking-tight text-balance transition-colors duration-300 sm:text-3xl", !active && "lg:text-muted-foreground/70")}>
          {title}
        </h3>
        <p className="mt-3 max-w-md text-base text-muted-foreground sm:text-lg">{body}</p>
      </motion.div>
      <div className="mt-8 lg:hidden">
        <PhonePicture index={index} />
      </div>
    </section>
  );
}

/** The sticky picture on wide screens: one stage, three layers, driven by the active step. */
function Stage({ active }: { active: number }) {
  return (
    <div className="relative h-[34rem] overflow-hidden rounded-2xl border bg-zinc-50 dark:bg-zinc-900/40">
      <Layer animate={active === 0 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.94, y: -28 }} transition={SPRING}>
        <MockConnectCard />
      </Layer>
      {/* The email slides in from the side, then moves up to make room for the bot's card. */}
      <Layer animate={active === 0 ? { opacity: 0, x: 110, y: 0 } : active === 1 ? { opacity: 1, x: 0, y: 0 } : { opacity: 1, x: 0, y: -88 }} transition={SPRING}>
        <MockEmail />
      </Layer>
      <Layer animate={active === 2 ? { opacity: 1, y: 92, scale: 1 } : { opacity: 0, y: 170, scale: 0.9 }} transition={POP}>
        <MockTelegramMessage />
      </Layer>
      <ol className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5 text-xs">
        {STEPS.map((step, i) => (
          <li
            key={step.label}
            className={cn(
              "rounded-full border px-2.5 py-1 transition-colors duration-300",
              i === active ? "border-zinc-200 bg-white text-foreground dark:border-zinc-700 dark:bg-zinc-900" : "border-transparent text-muted-foreground",
            )}
          >
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Layer({ animate, transition, children }: { animate: Record<string, number>; transition: Transition; children: ReactNode }) {
  return (
    <motion.div className="absolute inset-0 grid place-items-center px-10 pb-10" initial={false} animate={animate} transition={transition}>
      {children}
    </motion.div>
  );
}

/** Phones: each step's own picture, animated once as it scrolls into view. */
function PhonePicture({ index }: { index: number }) {
  return (
    <div className="flex flex-col items-center overflow-hidden rounded-2xl border bg-zinc-50 px-4 py-8 dark:bg-zinc-900/40" aria-hidden>
      {index === 0 && (
        <motion.div className="flex w-full justify-center" initial={{ opacity: 0, y: 24, scale: 0.97 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: 0.6 }} transition={SPRING}>
          <MockConnectCard />
        </motion.div>
      )}
      {index === 1 && (
        <motion.div className="flex w-full justify-center" initial={{ opacity: 0, x: 90 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.6 }} transition={SPRING}>
          <MockEmail />
        </motion.div>
      )}
      {index === 2 && (
        <>
          <MockEmail />
          <motion.div className="relative -mt-3 flex w-full justify-center" initial={{ opacity: 0, y: 48, scale: 0.92 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: 0.8 }} transition={POP}>
            <MockTelegramMessage />
          </motion.div>
        </>
      )}
    </div>
  );
}
