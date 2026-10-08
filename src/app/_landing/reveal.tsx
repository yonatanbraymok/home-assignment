"use client";

import { MotionConfig, motion } from "framer-motion";
import type { ReactNode } from "react";

/** Fades and slides its content up once, as it scrolls into view. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ type: "spring", stiffness: 160, damping: 24 }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
