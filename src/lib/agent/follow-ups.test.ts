import assert from "node:assert/strict";
import { test } from "node:test";
import { followUpLines } from "@/lib/telegram/messages";
import { FOLLOW_UP_AFTER_DAYS, followUps } from "./follow-ups";

const now = new Date("2026-10-15T10:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const app = (company: string, lastEmail: number | null, created = 40) => ({ company, roleTitle: "SWE Intern", jobRef: null, lastEmailAt: lastEmail === null ? null : daysAgo(lastEmail), createdAt: daysAgo(created) });

test("a follow-up is suggested after two weeks without a reply, quietest first", () => {
  const f = followUps([app("Wix", 3), app("Monday", FOLLOW_UP_AFTER_DAYS), app("Fiverr", 30), app("Lemonade", null, 20)], now);
  assert.deepEqual(f.shown.map((a) => `${a.company} ${a.quietDays}`), ["Fiverr 30", "Lemonade 20", "Monday 14"]);
  assert.equal(f.total, 3);
  const text = followUpLines(f).join("\n");
  assert.match(text, /^💡 Worth a follow-up: no reply for 14\+ days\n• Fiverr · SWE Intern: 30 days since the last email/);
  assert.match(text, /\(inference, medium confidence\)/);
  assert.deepEqual(followUpLines(followUps([app("Wix", 3)], now)), []);
});
