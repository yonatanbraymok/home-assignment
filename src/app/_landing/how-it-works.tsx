"use client";

import { MotionConfig, motion } from "framer-motion";
import type { ReactNode } from "react";
import { MockConnectCard, MockEmail, MockTelegramMessage } from "./mocks";

// The landing page's three steps on the dark grid: each panel rises in as it scrolls into view,
// one after the other. Reduced motion is respected.

const STEPS: { title: string; body: string; picture: ReactNode }[] = [
  {
    title: "Connect your inbox securely",
    body: "Send /connect to the bot and sign in with Google. Read-only: the agent can never send, delete or change an email.",
    picture: <MockConnectCard />,
  },
  {
    title: "A recruiter writes back",
    body: "Within minutes the agent reads it: a confirmation, an assessment, an interview, a rejection or an offer.",
    picture: <MockEmail />,
  },
  {
    title: "You approve it in Telegram",
    body: "The bot proposes the change with the exact sentence that justifies it. Nothing changes until you tap Approve.",
    picture: <MockTelegramMessage />,
  },
];

export function HowItWorks() {
  return (
    <MotionConfig reducedMotion="user">
      <ol className="grid gap-5 lg:grid-cols-3">
        {STEPS.map((step, i) => (
          <motion.li
            key={step.title}
            className="flex flex-col gap-6 rounded-3xl border border-white/12 bg-night-card p-6"
            initial={{ opacity: 0, y: 36 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ type: "spring", stiffness: 170, damping: 22, delay: i * 0.12 }}
          >
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-highlight font-heading text-sm font-bold text-ink">{i + 1}</span>
              <div>
                <h3 className="text-xl font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{step.body}</p>
              </div>
            </div>
            <div className="mt-auto flex min-h-56 items-center justify-center rounded-2xl bg-white/[0.04] p-4" aria-hidden>
              {step.picture}
            </div>
          </motion.li>
        ))}
      </ol>
    </MotionConfig>
  );
}
