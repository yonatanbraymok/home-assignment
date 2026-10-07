// USD per 1M tokens, paid tier. Source: https://ai.google.dev/gemini-api/docs/pricing (checked 2026-10-07).
// Thinking tokens are billed as output.
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
};

/** Throws for a model without a price, so we never run a model the budget can't account for. */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model];
  if (!price) throw new Error(`No price configured for model ${model}`);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
