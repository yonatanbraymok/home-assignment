// USD per 1M tokens, paid tier. Source: https://ai.google.dev/gemini-api/docs/pricing (checked 2026-10-07).
// Thinking tokens are billed as output.
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
};

/** Own keys only: a model named "constructor" must not count as priced. */
export function hasPrice(model: string): boolean {
  return Object.hasOwn(PRICES, model);
}

/** Throws for a model without a price, so we never run a model the budget can't account for. */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  if (!hasPrice(model)) throw new Error(`No price configured for model ${model}`);
  const price = PRICES[model];
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
