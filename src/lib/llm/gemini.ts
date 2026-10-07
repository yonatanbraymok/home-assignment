import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import type { LlmPurpose } from "@/generated/prisma/client";
import { assertWithinBudget } from "./budget";
import { costUsd } from "./pricing";

// The only module that calls Gemini: every call is budget-checked first and recorded in LlmUsage after.

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
// Conservative chars-per-token for the pre-call budget estimate (Hebrew tokenizes denser than English).
const CHARS_PER_TOKEN_ESTIMATE = 2;

/** The model answered, but not with valid JSON for the schema. The call was still paid for and recorded. */
export class LlmOutputError extends Error {}

let client: GoogleGenAI | undefined;
const genai = () => (client ??= new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") }));

export function llmConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function defaultModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export async function generateJson<T>(opts: {
  purpose: LlmPurpose;
  userId: string | null;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  model?: string;
}): Promise<T> {
  const model = opts.model ?? defaultModel();
  const estimatedInput = Math.ceil((opts.system.length + opts.prompt.length) / CHARS_PER_TOKEN_ESTIMATE);
  await assertWithinBudget(costUsd(model, estimatedInput, opts.maxOutputTokens));

  const responseJsonSchema: Record<string, unknown> = z.toJSONSchema(opts.schema);
  delete responseJsonSchema.$schema; // draft marker; not part of the schema itself
  const response = await withOneRetry(() =>
    genai().models.generateContent({
      model,
      contents: opts.prompt,
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        responseJsonSchema,
        maxOutputTokens: opts.maxOutputTokens,
        // Temperature is left at the default: Google advises against lowering it for Gemini 3 models.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    }),
  );

  const usage = response.usageMetadata;
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
  await db.llmUsage.create({
    data: {
      userId: opts.userId,
      purpose: opts.purpose,
      model,
      inputTokens,
      outputTokens,
      costUsd: costUsd(model, inputTokens, outputTokens),
    },
  });

  const text = response.text;
  if (!text) throw new LlmOutputError(`Empty response (finish reason: ${response.candidates?.[0]?.finishReason ?? "unknown"})`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LlmOutputError("Response was not valid JSON");
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) throw new LlmOutputError(`Response did not match the schema: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

// One retry for rate limits and transient server errors; anything else fails fast.
async function withOneRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof ApiError && [429, 500, 503].includes(err.status)) {
      await new Promise((r) => setTimeout(r, 1500));
      return call();
    }
    throw err;
  }
}
