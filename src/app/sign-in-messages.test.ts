import assert from "node:assert/strict";
import { test } from "node:test";
import { SIGN_IN_MESSAGES, isSignInStatus } from "./sign-in-messages";

test("only the four sign-in statuses are accepted from the URL", () => {
  for (const status of Object.keys(SIGN_IN_MESSAGES)) assert.equal(isSignInStatus(status), true);
  // Built-in object keys would otherwise render a function and crash the home page.
  for (const crafted of ["toString", "constructor", "__proto__", "hasOwnProperty", "", undefined, ["used"]]) assert.equal(isSignInStatus(crafted), false);
});
