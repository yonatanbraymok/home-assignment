import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { DEFAULT_MODEL, defaultModel, fallbackModel } from "./models";
import { hasPrice } from "./pricing";

afterEach(() => {
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_FALLBACK_MODEL;
});

test("the lighter model is used only where it passed the evals: email reading, not chat", () => {
  assert.equal(defaultModel(), DEFAULT_MODEL);
  assert.equal(fallbackModel("classify"), "gemini-3.1-flash-lite");
  assert.equal(fallbackModel("chat"), null);
});

test("GEMINI_FALLBACK_MODEL overrides it, 'none' turns it off, and an unpriced model is never used", () => {
  process.env.GEMINI_FALLBACK_MODEL = "none";
  assert.equal(fallbackModel("classify"), null);
  process.env.GEMINI_FALLBACK_MODEL = "gemini-9-ultra"; // no price: would fail every call
  assert.equal(fallbackModel("classify"), null);
  process.env.GEMINI_FALLBACK_MODEL = DEFAULT_MODEL; // the same as the default: no switch
  assert.equal(fallbackModel("chat"), null);
});

test("prices: own keys only", () => {
  assert.equal(hasPrice("gemini-3.5-flash-lite"), true);
  assert.equal(hasPrice("constructor"), false);
  assert.equal(hasPrice("toString"), false);
});
