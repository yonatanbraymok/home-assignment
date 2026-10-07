import assert from "node:assert/strict";
import { test } from "node:test";
import { quoteAppearsIn } from "./verify-quote";

const body = `Hi Dana,

Thank you for your interest in the Software Engineering Intern role.
After careful consideration, we have decided to move forward with other candidates whose
experience more closely matches our needs.

We’ll keep your resume on file.`;

test("accepts an exact quote, ignoring case, line breaks and surrounding quote marks", () => {
  assert.equal(quoteAppearsIn("we have decided to move forward with other candidates", body), true);
  assert.equal(quoteAppearsIn('"We have decided to move forward with other candidates whose experience"', body), true);
  assert.equal(quoteAppearsIn("We'll keep your resume on file.", body), true); // straight vs curly apostrophe
});

test("accepts a quote from the subject", () => {
  assert.equal(quoteAppearsIn("Update on your application", "Update on your application", body), true);
});

test("rejects paraphrases, translations and stitched-together sentences", () => {
  assert.equal(quoteAppearsIn("we decided to go with other candidates", body), false);
  assert.equal(quoteAppearsIn("Thank you for your interest ... other candidates", body), false);
  assert.equal(quoteAppearsIn("Unfortunately, you were not selected", body), false);
});

test("rejects quotes too short to prove anything", () => {
  assert.equal(quoteAppearsIn("Hi", body), false);
  assert.equal(quoteAppearsIn("…", body), false);
});

test("matches Hebrew text despite bidi control marks and gershayim variants", () => {
  const hebrew = "‫שלום, לצערנו הוחלט שלא להתקדם עם מועמדותך לתפקיד בחברת בע״מ.‬";
  assert.equal(quoteAppearsIn('לצערנו הוחלט שלא להתקדם עם מועמדותך לתפקיד בחברת בע"מ', hebrew), true);
});
