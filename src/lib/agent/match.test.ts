import assert from "node:assert/strict";
import { test } from "node:test";
import {
  companyDomainFor,
  dedupeKey,
  matchApplication,
  normalizeCompany,
  normalizeJobRef,
  roleSimilarity,
  type MatchableApplication,
} from "./match";
import { jobRefAppearsIn } from "./verify-quote";

const app = (a: Partial<MatchableApplication> & Pick<MatchableApplication, "id" | "company" | "roleTitle">): MatchableApplication => ({
  companyDomain: null,
  jobRef: null,
  status: "APPLIED",
  ...a,
});

const apps = [
  app({ id: "ms-swe", company: "Microsoft", companyDomain: "microsoft.com", roleTitle: "Software Engineering Intern" }),
  app({ id: "ms-ds", company: "Microsoft", companyDomain: "microsoft.com", roleTitle: "Data Science Intern", status: "ASSESSMENT" }),
  app({ id: "wix", company: "Wix.com Ltd.", companyDomain: "wix.com", roleTitle: "Backend Developer Student" }),
];

// Four Amazon applications, two with the same title, some with job IDs.
const amazon = [
  app({ id: "az-sde-sea", company: "Amazon", roleTitle: "Software Development Engineer Intern", jobRef: "2876543" }),
  app({ id: "az-sde-tlv", company: "Amazon", roleTitle: "Software Development Engineer Intern", jobRef: "2881122" }),
  app({ id: "az-fe", company: "Amazon", roleTitle: "Front-End Engineer Intern" }),
  app({ id: "az-ds", company: "Amazon", roleTitle: "Data Scientist Intern", status: "INTERVIEW" }),
];
const none = { jobRef: null };

test("strong match on company and role", () => {
  const r = matchApplication({ company: "Microsoft Corporation", roleTitle: "Software Engineer Intern - Summer 2027", ...none }, "careers.microsoft.com", apps);
  assert.equal(r.kind === "matched" && r.application.id, "ms-swe");
  assert.equal(r.kind === "matched" && r.strength, "strong");
});

test("sender domain matches even when the company name differs", () => {
  const r = matchApplication({ company: "Wix", roleTitle: "Backend Developer (Student)", ...none }, "wix.com", apps);
  assert.equal(r.kind === "matched" && r.application.id, "wix");
});

test("same company, different role is a separate application", () => {
  const r = matchApplication({ company: "Microsoft", roleTitle: "Product Manager Intern", ...none }, "microsoft.com", apps);
  assert.equal(r.kind, "none");
  assert.match(r.warnings[0], /You also track Microsoft/);
});

test("an ATS sender domain is not evidence of the company", () => {
  const r = matchApplication({ company: "Unknown Startup", roleTitle: "Software Engineering Intern", ...none }, "greenhouse-mail.io", apps);
  assert.equal(r.kind, "none");
});

test("job ID decides between same-title applications", () => {
  const r = matchApplication({ company: "Amazon", roleTitle: "SDE Intern", jobRef: "Job ID: 2881122".split(": ")[1] }, "amazon.jobs", amazon);
  assert.equal(r.kind === "matched" && r.application.id, "az-sde-tlv");
  assert.equal(r.kind === "matched" && r.strength, "strong");
});

test("job ID that matches none of the tracked IDs only considers applications without an ID", () => {
  const r = matchApplication({ company: "Amazon", roleTitle: "Front End Engineer Intern", jobRef: "3000001" }, "amazon.jobs", amazon);
  assert.equal(r.kind === "matched" && r.application.id, "az-fe");
});

test("job ID that matches nothing, when every same-role application has its own ID, is a new application", () => {
  const r = matchApplication({ company: "Amazon", roleTitle: "Software Development Engineer Intern", jobRef: "3000001" }, "amazon.jobs", amazon.slice(0, 2));
  assert.equal(r.kind, "none");
  assert.match(r.warnings[0], /Different job ID/);
});

test("no job ID and two same-title applications: ask, don't guess", () => {
  const r = matchApplication({ company: "Amazon", roleTitle: "Software Development Engineer Intern", ...none }, "amazon.jobs", amazon);
  assert.equal(r.kind, "ambiguous");
  assert.deepEqual(r.kind === "ambiguous" && r.candidates.map((c) => c.id), ["az-sde-sea", "az-sde-tlv"]);
});

test("no role and no job ID at a company with several applications: ask", () => {
  const r = matchApplication({ company: "Amazon", roleTitle: null, ...none }, "amazon.jobs", amazon);
  assert.equal(r.kind === "ambiguous" && r.candidates.length, 4);
});

test("a clearly better role wins without asking, with the runner-up shown", () => {
  const r = matchApplication({ company: "Amazon", roleTitle: "Data Scientist Intern", ...none }, "amazon.jobs", amazon);
  assert.equal(r.kind === "matched" && r.application.id, "az-ds");
});

test("role not stated and only one application there: weak match", () => {
  const r = matchApplication({ company: "Wix", roleTitle: null, ...none }, "wix.com", apps);
  assert.equal(r.kind === "matched" && r.strength, "weak");
});

test("job IDs: normalization and verbatim check", () => {
  assert.equal(normalizeJobRef("jr-12345"), normalizeJobRef("#JR 12345"));
  assert.equal(jobRefAppearsIn("2876543", "Thanks for applying (Job ID: 2876543)."), true);
  assert.equal(jobRefAppearsIn("JR-1234", "Requisition JR-1234 – Intern"), true);
  assert.equal(jobRefAppearsIn("12345", "Your candidate number is 512345"), false); // not a whole token
  assert.equal(jobRefAppearsIn("9999999", "Job ID: 2876543"), false); // invented by the model
});

test("normalization and keys", () => {
  assert.equal(normalizeCompany("Wix.com Ltd."), "wix com");
  assert.equal(normalizeCompany('צ\'ק פוינט בע"מ'), "צ ק פוינט");
  assert.equal(dedupeKey("Microsoft Corp", "Software Engineering Intern"), "microsoft|software engineering intern");
  assert.equal(dedupeKey("Amazon", "SDE Intern", "jr-77"), "amazon|#JR77");
  assert.ok(roleSimilarity("Software Engineering Intern", "Software Engineer Internship 2027") >= 0.5);
  assert.ok(roleSimilarity("Software Engineering Intern", "Data Science Intern") < 0.5);
});

test("companyDomainFor keeps the registrable domain and ignores ATS/personal mail", () => {
  assert.equal(companyDomainFor("careers.microsoft.com"), "microsoft.com");
  assert.equal(companyDomainFor("jobs.wix.co.il"), "wix.co.il");
  assert.equal(companyDomainFor("us.greenhouse-mail.io"), null);
  assert.equal(companyDomainFor("gmail.com"), null);
});
