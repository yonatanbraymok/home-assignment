import assert from "node:assert/strict";
import { test } from "node:test";
import { bearerToken, hashMcpToken, looksLikeMcpToken, newMcpToken } from "./token";

test("tokens are random, recognisable, and stored only as a hash", () => {
  const a = newMcpToken(), b = newMcpToken();
  assert.notEqual(a.token, b.token);
  assert.match(a.token, /^jht_mcp_[A-Za-z0-9_-]{43}$/);
  assert.equal(a.hash, hashMcpToken(a.token));
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.ok(!a.hash.includes(a.token.slice(8, 20)));
});

test("only a well-formed Bearer header yields a token", () => {
  const { token } = newMcpToken();
  assert.equal(bearerToken(`Bearer ${token}`), token);
  assert.equal(bearerToken(`bearer  ${token} `), token);
  for (const bad of [null, "", token, `Basic ${token}`, `Bearer ${token}x`, "Bearer jht_mcp_short", `Bearer ${token} extra`]) assert.equal(bearerToken(bad), null, String(bad));
  assert.equal(looksLikeMcpToken("jht_session=abc"), false);
});
