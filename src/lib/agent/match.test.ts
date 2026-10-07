import assert from "node:assert/strict";
import { test } from "node:test";
import { companyDomainFor, dedupeKey, matchApplication, normalizeCompany, roleSimilarity, type MatchableApplication } from "./match";

const apps: MatchableApplication[] = [
  { id: "ms-swe", company: "Microsoft", companyDomain: "microsoft.com", roleTitle: "Software Engineering Intern", status: "APPLIED" },
  { id: "ms-ds", company: "Microsoft", companyDomain: "microsoft.com", roleTitle: "Data Science Intern", status: "ASSESSMENT" },
  { id: "wix", company: "Wix.com Ltd.", companyDomain: "wix.com", roleTitle: "Backend Developer Student", status: "APPLIED" },
];

test("strong match on company and role", () => {
  const r = matchApplication({ company: "Microsoft Corporation", roleTitle: "Software Engineer Intern - Summer 2027" }, "careers.microsoft.com", apps);
  assert.equal(r.kind, "matched");
  assert.equal(r.kind === "matched" && r.application.id, "ms-swe");
  assert.equal(r.kind === "matched" && r.strength, "strong");
});

test("sender domain matches even when the company name differs", () => {
  const r = matchApplication({ company: "Wix", roleTitle: "Backend Developer (Student)" }, "wix.com", apps);
  assert.equal(r.kind === "matched" && r.application.id, "wix");
});

test("same company, different role is a separate application", () => {
  const r = matchApplication({ company: "Microsoft", roleTitle: "Product Manager Intern" }, "microsoft.com", apps);
  assert.equal(r.kind, "none");
  assert.match(r.warnings[0], /You also track Microsoft/);
});

test("role not stated: weak match with the alternatives listed", () => {
  const r = matchApplication({ company: "Microsoft", roleTitle: null }, "microsoft.com", apps);
  assert.equal(r.kind === "matched" && r.strength, "weak");
  assert.ok(r.warnings.some((w) => w.startsWith("Also possible")));
});

test("an ATS sender domain is not evidence of the company", () => {
  const r = matchApplication({ company: "Unknown Startup", roleTitle: "Software Engineering Intern" }, "greenhouse-mail.io", apps);
  assert.equal(r.kind, "none");
});

test("normalization and keys", () => {
  assert.equal(normalizeCompany("Wix.com Ltd."), "wix com");
  assert.equal(normalizeCompany('צ\'ק פוינט בע"מ'), "צ ק פוינט");
  assert.equal(dedupeKey("Microsoft Corp", "Software Engineering Intern"), "microsoft|software engineering intern");
  assert.ok(roleSimilarity("Software Engineering Intern", "Software Engineer Internship 2027") >= 0.5);
  assert.ok(roleSimilarity("Software Engineering Intern", "Data Science Intern") < 0.5);
});

test("companyDomainFor keeps the registrable domain and ignores ATS/personal mail", () => {
  assert.equal(companyDomainFor("careers.microsoft.com"), "microsoft.com");
  assert.equal(companyDomainFor("jobs.wix.co.il"), "wix.co.il");
  assert.equal(companyDomainFor("us.greenhouse-mail.io"), null);
  assert.equal(companyDomainFor("gmail.com"), null);
});
