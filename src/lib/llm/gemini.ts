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
import { assertAffordable } from "./budget";
import { estimateCallWorstCaseUsd } from "./budget-policy";
import { defaultModel } from "./models";
import { costUsd } from "./pricing";

// The only module that calls Gemini: every call is budget-checked first and recorded in LlmUsage after.

export { defaultModel };

/** The model answered, but not with valid JSON for the schema. The call was still paid for and recorded. */
export class LlmOutputError extends Error {}

let client: GoogleGenAI | undefined;
const genai = () => (client ??= new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") }));

export function llmConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** One budget-checked, recorded call. */
async function call(opts: {
  purpose: LlmPurpose;
  userId: string | null;
  model: string;
  contents: Content[] | string;
  config: GenerateContentConfig;
}): Promise<GenerateContentResponse> {
  // The tool declarations are sent with every chat round, so they count too.
  const promptChars =
    String(opts.config.systemInstruction ?? "").length + JSON.stringify(opts.contents).length + JSON.stringify(opts.config.tools ?? []).length;
  const worstCaseUsd = estimateCallWorstCaseUsd(opts.model, promptChars, opts.config.maxOutputTokens ?? 2048);
  // Both the user's allowance and the shared budget (budget.ts).
  await assertAffordable({ userId: opts.userId, worstCaseUsd });

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

const FINAL_ROUND_INSTRUCTION = "Answer the question now, in text, using only the tool results above.";

/**
 * A conversation turn where the model can call (read-only) tools before answering.
 * The first round must call a tool, so every answer is based on fetched data. The last round gets
 * no tools at all (mode NONE alone wasn't enough: Gemini sometimes still returned a tool call and
 * no text), so the loop always ends with text.
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
  /** Checks the final text against the tool results; returns feedback for one retry, or null if fine. */
  checkAnswer?: (text: string, toolResults: unknown[]) => string | null;
}): Promise<{ text: string; toolCalls: { name: string; args: unknown }[]; toolResults: unknown[] }> {
  const model = opts.model ?? defaultModel();
  const contents: Content[] = [...opts.history, { role: "user", parts: [{ text: opts.message }] }];
  const toolCalls: { name: string; args: unknown }[] = [];
  const toolResults: unknown[] = [];
  let retriedAnswer = false;

  for (let round = 0; ; round++) {
    const lastRound = round >= opts.maxToolRounds;
    if (lastRound) contents.at(-1)!.parts!.push({ text: FINAL_ROUND_INSTRUCTION });
    const response = await call({
      purpose: opts.purpose,
      userId: opts.userId,
      model,
      contents,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxOutputTokens,
        ...(lastRound
          ? {}
          : {
              tools: [{ functionDeclarations: opts.tools }],
              toolConfig: { functionCallingConfig: { mode: round === 0 ? FunctionCallingConfigMode.ANY : FunctionCallingConfigMode.AUTO } },
            }),
      },
    });

    const calls = response.functionCalls ?? [];
    if (process.env.LLM_DEBUG) {
      console.log(`[llm] round ${round}${lastRound ? " (final)" : ""}: finish=${response.candidates?.[0]?.finishReason} calls=${calls.map((c) => c.name).join(",") || "-"}`);
    }
    if (!calls.length || lastRound) {
      // Read only text parts (response.text warns and concatenates when tool calls are present).
      const text = (response.candidates?.[0]?.content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
      const feedback = !retriedAnswer && opts.checkAnswer?.(text, toolResults);
      if (!feedback) return { text, toolCalls, toolResults };
      // One retry, text only, with the reason the answer was refused.
      retriedAnswer = true;
      contents.push({ role: "model", parts: [{ text }] }, { role: "user", parts: [{ text: feedback }] });
      round = opts.maxToolRounds - 1; // the next round is the final, tool-free one
      continue;
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
      toolResults.push(result);
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
