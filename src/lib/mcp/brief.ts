import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { readOnlyDb } from "@/lib/db-readonly";
import { BudgetExceeded, budgetStatus } from "@/lib/llm/budget";
import { LlmOutputError, generateJson } from "@/lib/llm/gemini";
import { STATUS_LABEL } from "@/lib/proposals/rules";
import { budgetPausedText } from "@/lib/telegram/messages";
import {
  BRIEF_SYSTEM_PROMPT,
  BRIEF_VERSION,
  BriefSchema,
  briefEmails,
  buildBriefPrompt,
  groundBrief,
  renderBrief,
  type GroundedBrief,
} from "./brief-grounding";

// generate_interview_brief: our agent's reasoning, offered to other agents. Reads one application
// and its emails (read-only client), asks Gemini for a brief, keeps only claims whose quote is in
// the cited email, and returns it. Paid from the token owner's AI allowance, and cached until the
// application gets a new email or a new status, so an agent asking every hour pays once.

const CACHE_DAYS = 7;
const BRIEFS_PER_HOUR = 10; // new briefs (cached ones are free)

export type BriefResult = { ok: true; brief: GroundedBrief; text: string; cached: boolean } | { ok: false; error: string };

export async function generateInterviewBrief(userId: string, applicationId: string): Promise<BriefResult> {
  const app = await readOnlyDb.jobApplication.findFirst({
    where: { id: applicationId, userId },
    select: { id: true, company: true, roleTitle: true, jobRef: true, status: true },
  });
  // Same answer for "doesn't exist" and "someone else's".
  if (!app) return { ok: false, error: "No application with this id for this token. Use list_applications to find the id." };

  const [emails, decisions] = await Promise.all([
    readOnlyDb.emailMessage.findMany({
      where: { userId, applicationId: app.id, category: { not: "NOT_JOB_RELATED" } },
      select: { id: true, subject: true, fromAddress: true, fromName: true, receivedAt: true, category: true, bodyText: true },
    }),
    readOnlyDb.statusProposal.findMany({
      where: { userId, applicationId: app.id, state: "EXECUTED" },
      orderBy: { executedAt: "asc" },
      select: { fromStatus: true, toStatus: true, email: { select: { receivedAt: true } } },
    }),
  ]);
  const used = briefEmails(emails);
  if (!used.length) return { ok: false, error: `No emails are linked to ${app.company} · ${app.roleTitle} yet, so there's nothing to brief from.` };

  // A new email or a new status makes a new brief; otherwise the last one is reused for free.
  const cacheKey = createHash("sha256")
    .update(JSON.stringify([BRIEF_VERSION, app.id, app.status, used.map((e) => e.id)]))
    .digest("hex")
    .slice(0, 32);
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000);
  const cached = await readOnlyDb.actionLog.findFirst({
    where: { userId, action: "MCP_TOOL_CALLED", createdAt: { gte: since }, payload: { path: ["cacheKey"], equals: cacheKey } },
    orderBy: { id: "desc" },
    select: { payload: true },
  });
  const cachedBrief = (cached?.payload as { brief?: GroundedBrief } | null)?.brief;
  if (cachedBrief) return { ok: true, brief: cachedBrief, text: renderBrief(cachedBrief), cached: true };

  const recent = await readOnlyDb.actionLog.count({
    where: { userId, action: "MCP_TOOL_CALLED", createdAt: { gte: new Date(Date.now() - 3600_000) }, payload: { path: ["generated"], equals: true } },
  });
  if (recent >= BRIEFS_PER_HOUR) return { ok: false, error: `Limit reached: ${BRIEFS_PER_HOUR} new briefs an hour per token. Try again later.` };

  const mode = await budgetStatus(userId);
  if (!mode.aiOn) return { ok: false, error: budgetPausedText(mode.limitedBy ?? "service", mode.resetsOn) };

  const history = decisions.map((d) => `${d.fromStatus ? STATUS_LABEL[d.fromStatus] : "new"} → ${STATUS_LABEL[d.toStatus]} (email of ${d.email.receivedAt.toISOString().slice(0, 10)})`);
  try {
    const raw = await generateJson({
      purpose: "MCP_BRIEF",
      userId, // charged to the token owner's allowance
      model: mode.models.chat,
      system: BRIEF_SYSTEM_PROMPT,
      prompt: buildBriefPrompt(app, used, history),
      schema: BriefSchema,
      maxOutputTokens: 2048,
    });
    const brief = groundBrief(raw, app, used);
    await recordBrief(userId, app.id, cacheKey, brief);
    return { ok: true, brief, text: renderBrief(brief), cached: false };
  } catch (err) {
    if (err instanceof BudgetExceeded) return { ok: false, error: budgetPausedText(err.scope, err.resetsOn) };
    if (err instanceof LlmOutputError) return { ok: false, error: "The brief couldn't be generated just now. Try again in a minute." };
    throw err;
  }
}

/** The audit row doubles as the cache: written by us, never by the tool's read-only client. */
function recordBrief(userId: string, applicationId: string, cacheKey: string, brief: GroundedBrief) {
  return db.actionLog.create({
    data: {
      userId,
      actor: "MCP_CLIENT",
      actorRef: `mcp:${userId}`,
      action: "MCP_TOOL_CALLED",
      applicationId,
      payload: { tool: "generate_interview_brief", generated: true, cacheKey, brief },
    },
  });
}
