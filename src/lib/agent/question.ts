// What the dashboard chat accepts as a question (the action's input arrives from the browser).

export const MAX_QUESTION_CHARS = 500;

/** The question, trimmed, or null when it's empty, too long or not text. */
export function cleanQuestion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.trim();
  return q && q.length <= MAX_QUESTION_CHARS ? q : null;
}
