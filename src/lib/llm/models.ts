import { hasPrice } from "./pricing";

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export type ModelUse = "classify" | "chat";

// The lighter model used once a budget is past 80%, per use. Each one must pass the same evals as
// the default (DECISIONS §11). On 2026-10-07 gemini-3.1-flash-lite passed the classifier eval
// (24/24) but not the chat eval (11/12: it once gave a count without naming its source), so only
// email reading switches.
const DEFAULT_FALLBACK: Record<ModelUse, string | null> = {
  classify: "gemini-3.1-flash-lite",
  chat: null,
};

export function defaultModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

let warned = false;

/**
 * The lighter model for one use, or null to keep the default. GEMINI_FALLBACK_MODEL overrides it
 * for every use ("none" turns switching off). A model without a price is never used: every call
 * would fail the budget check, so "low" would become an outage.
 */
export function fallbackModel(use: ModelUse): string | null {
  const configured = process.env.GEMINI_FALLBACK_MODEL;
  const model = configured === "none" ? null : configured || DEFAULT_FALLBACK[use];
  if (!model || model === defaultModel()) return null;
  if (!hasPrice(model)) {
    if (!warned) console.warn(`Fallback model ${model} has no price in pricing.ts; not switching models`);
    warned = true;
    return null;
  }
  return model;
}
