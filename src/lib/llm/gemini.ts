import {
  ApiError,
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";
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

/** One budget-checked, recorded call. */
async function call(opts: {
  purpose: LlmPurpose;
  userId: string | null;
  model: string;
  contents: Content[] | string;
  config: GenerateContentConfig;
}): Promise<GenerateContentResponse> {
  const promptChars = String(opts.config.systemInstruction ?? "").length + JSON.stringify(opts.contents).length;
  const maxOutput = opts.config.maxOutputTokens ?? 2048;
  await assertWithinBudget(costUsd(opts.model, Math.ceil(promptChars / CHARS_PER_TOKEN_ESTIMATE), maxOutput));

  const response = await withOneRetry(() =>
    genai().models.generateContent({
      model: opts.model,
      contents: opts.contents,
      // Temperature is left at the default: Google advises against lowering it for Gemini 3 models.
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, ...opts.config },
    }),
  );

  const usage = response.usageMetadata;
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
  await db.llmUsage.create({
    data: { userId: opts.userId, purpose: opts.purpose, model: opts.model, inputTokens, outputTokens, costUsd: costUsd(opts.model, inputTokens, outputTokens) },
  });
  return response;
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
  const responseJsonSchema: Record<string, unknown> = z.toJSONSchema(opts.schema);
  delete responseJsonSchema.$schema; // draft marker; not part of the schema itself
  const response = await call({
    purpose: opts.purpose,
    userId: opts.userId,
    model: opts.model ?? defaultModel(),
    contents: opts.prompt,
    config: { systemInstruction: opts.system, responseMimeType: "application/json", responseJsonSchema, maxOutputTokens: opts.maxOutputTokens },
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

export type ToolDeclaration = { name: string; description: string; parametersJsonSchema: Record<string, unknown> };

/**
 * A conversation turn where the model can call (read-only) tools before answering.
 * The first round must call a tool, so every answer is based on fetched data; the last round
 * can't, so the loop always ends with text.
 */
export async function answerWithTools(opts: {
  purpose: LlmPurpose;
  userId: string;
  system: string;
  history: Content[];
  message: string;
  tools: ToolDeclaration[];
  runTool: (name: string, args: unknown) => Promise<unknown>;
  maxToolRounds: number;
  maxOutputTokens: number;
  model?: string;
}): Promise<{ text: string; toolCalls: { name: string; args: unknown }[] }> {
  const model = opts.model ?? defaultModel();
  const contents: Content[] = [...opts.history, { role: "user", parts: [{ text: opts.message }] }];
  const toolCalls: { name: string; args: unknown }[] = [];

  for (let round = 0; ; round++) {
    const lastRound = round >= opts.maxToolRounds;
    const mode = round === 0 ? FunctionCallingConfigMode.ANY : lastRound ? FunctionCallingConfigMode.NONE : FunctionCallingConfigMode.AUTO;
    const response = await call({
      purpose: opts.purpose,
      userId: opts.userId,
      model,
      contents,
      config: {
        systemInstruction: opts.system,
        tools: [{ functionDeclarations: opts.tools }],
        toolConfig: { functionCallingConfig: { mode } },
        maxOutputTokens: opts.maxOutputTokens,
      },
    });

    const calls = response.functionCalls ?? [];
    if (!calls.length || lastRound) {
      return { text: response.text?.trim() ?? "", toolCalls };
    }
    // Send the model's turn back unchanged: Gemini 3 needs its thought signatures on the next call.
    const modelTurn = response.candidates?.[0]?.content;
    if (modelTurn) contents.push(modelTurn);
    const results: Part[] = [];
    for (const fc of calls) {
      toolCalls.push({ name: fc.name ?? "", args: fc.args });
      let result: unknown;
      try {
        result = await opts.runTool(fc.name ?? "", fc.args);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "Tool failed" };
      }
      results.push({ functionResponse: { id: fc.id, name: fc.name, response: { result } } });
    }
    contents.push({ role: "user", parts: results });
  }
}

// One retry for rate limits and transient server errors; anything else fails fast.
async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError && [429, 500, 503].includes(err.status)) {
      await new Promise((r) => setTimeout(r, 1500));
      return fn();
    }
    throw err;
  }
}
