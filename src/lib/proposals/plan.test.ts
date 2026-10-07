import assert from "node:assert/strict";
import { test } from "node:test";
import { matchApplication, type Extracted, type MatchableApplication } from "@/lib/agent/match";
import { planProposal } from "./plan";

const app = (a: Partial<MatchableApplication> & Pick<MatchableApplication, "id" | "status">): MatchableApplication => ({
  company: "TechNova Solutions",
  companyDomain: null,
  roleTitle: "Software Engineering Intern",
  jobRef: null,
  ...a,
});
const email: Extracted = { company: "TechNova Solutions", roleTitle: "Software Engineering Intern", jobRef: null };
const plan = (toStatus: Parameters<typeof planProposal>[0], apps: MatchableApplication[], extracted = email) =>
  planProposal(toStatus, matchApplication(extracted, "gmail.com", apps));

test("rule 1: a confirmation after a rejection is a new application, not a reopened one", () => {
  const p = plan("APPLIED", [app({ id: "old", status: "REJECTED" })]);
  assert.equal(p.action, "create");
  assert.match(p.action === "create" ? p.warnings.join() : "", /already track TechNova Solutions · Software Engineering Intern \(Rejected\)/);
});

test("rule 1: a confirmation after an interview invite is also a new application", () => {
  assert.equal(plan("APPLIED", [app({ id: "old", status: "INTERVIEW" })]).action, "create");
});

test("rule 1: a second confirmation while still waiting for a reply changes nothing", () => {
  const p = plan("APPLIED", [app({ id: "a", status: "APPLIED" })]);
  assert.deepEqual(p, { action: "none", reason: "confirms an application already tracked" });
});

test("rule 1: a confirmation with the same job ID as a closed application changes nothing", () => {
  const p = plan("APPLIED", [app({ id: "a", status: "REJECTED", jobRef: "R-77" })], { ...email, jobRef: "R-77" });
  assert.equal(p.action, "none");
});

test("rule 1: with several same-title applications, any one still unanswered absorbs the confirmation", () => {
  const p = plan("APPLIED", [app({ id: "a", status: "REJECTED" }), app({ id: "b", status: "APPLIED" })]);
  assert.equal(p.action, "none");
});

test("rule 2: an interview invite matching a rejected application asks which one", () => {
  const p = plan("INTERVIEW", [app({ id: "old", status: "REJECTED" })]);
  assert.equal(p.action, "ask");
  assert.deepEqual(p.action === "ask" && p.candidates.map((c) => c.id), ["old"]);
});

test("rule 2: unless the job ID proves it's the same job; then it's an (unusual) update", () => {
  const p = plan("INTERVIEW", [app({ id: "old", status: "REJECTED", jobRef: "R-77" })], { ...email, jobRef: "R-77" });
  assert.equal(p.action, "update");
  assert.match(p.action === "update" ? p.warnings.join() : "", /Unusual change: Rejected → Interview/);
});

test("normal progress is a plain update; same status is no change", () => {
  assert.equal(plan("REJECTED", [app({ id: "a", status: "INTERVIEW" })]).action, "update");
  assert.equal(plan("REJECTED", [app({ id: "a", status: "REJECTED" })]).action, "none");
});

test("unknown company: create", () => {
  assert.equal(plan("REJECTED", []).action, "create");
});
