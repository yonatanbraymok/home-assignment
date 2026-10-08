import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_QUESTION_CHARS, cleanQuestion } from "./question";

test("the dashboard chat takes trimmed text questions of a sensible length", () => {
  assert.equal(cleanQuestion("  Which companies replied?  "), "Which companies replied?");
  assert.equal(cleanQuestion("   "), null);
  assert.equal(cleanQuestion("x".repeat(MAX_QUESTION_CHARS + 1)), null);
  assert.equal(cleanQuestion(42), null);
  assert.equal(cleanQuestion(undefined), null);
});
