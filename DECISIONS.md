# DECISIONS — Job Hunt Tracker

> Draft. Sections marked **TODO** are filled in as the build progresses. Deployment steps and environment variables are in the README.

## 1. Who uses it and what it makes easier

**User:** a computer-science student applying to tech internships (Microsoft, Google, local startups) during recruiting season. They run dozens of applications in parallel. Updates arrive by email from many senders: company domains, applicant-tracking systems (Greenhouse, Workday, Lever, Ashby) and assessment platforms (HackerRank, Codility). They arrive in English and Hebrew and in no fixed format.

<!-- TODO(me): one or two sentences from my own search: how many applications, what I used before (spreadsheet? nothing?), what went wrong. -->

**What it makes easier:** the student stops keeping a spreadsheet by hand. The agent reads their inbox, recognises application confirmations, online-assessment invites, interview invites, rejections and offers, and proposes the matching status change in Telegram with the exact sentence that justifies it. One tap keeps the tracker correct. They can also just ask "what's still open?" or "what happened with Google?" and get an answer that points to the email it came from.

## 2. Why an agent is the right tool (and where it isn't)

- **The input is unstructured language, and rules break on it.** "We'll keep your resume on file" is a rejection. "Unfortunately we need to reschedule your interview" is not, even though it contains "unfortunately". A Workday email comes from `myworkday.com`, and the company is named only in the body. Gmail filters and keyword rules can't tell these apart; a language model can, and it can explain why.
- **The output needs judgment and an explanation.** The model has to map the email to the right application among several (two Microsoft roles), say why it thinks the status changed, and say how sure it is.
- **The risky part is deliberately not left to the model.** The model only *proposes*. Deterministic code checks its evidence: the quoted sentence must appear verbatim in the email, the company match is scored by rules, and the confidence is capped by those checks. The database changes only after the owner taps Approve. The model has no write tools at all.
- **Where I don't use an LLM:** counting and stats are plain SQL, approvals are plain code, and a free keyword/domain prefilter decides which emails are worth a model call at all. This keeps answers exact and costs low.

## 3. Assumptions

The brief allows one question; everything else is an assumption, written down here.

| # | Assumption | Why |
|---|---|---|
| A1 | "A team of 5, 20 uses/day each" = 5 students, each with their own Gmail and Telegram | Matches the target user; each tracker is personal |
| A2 | The "real action" is creating or updating an application record after approval | The brief lists "update a record" as an example action |
| A3 | One Telegram account = one user; the bot answers in private chats only | Approvals must be tied to one owner |
| A4 | On first connect, the agent backfills the last 60 days of email | Covers the current season without a huge first bill |
| A5 | Each chat question is answered on its own (no conversation memory) | Cheaper, and removes a class of history bugs; follow-ups are a v2 item |
| A6 | Unanswered proposals expire after 7 days | A week-old proposal may no longer reflect the inbox |
| A7 | Statuses: Applied, Assessment, Interview, Offer, Rejected, Withdrawn | Online assessments are a distinct, common stage for CS internships |
| A8 | Testers connect their own Gmail and approve in their own Telegram chat; a shared demo inbox comes last | Exercises the real flow end to end; the demo inbox is a convenience, not a requirement |
| A9 | Applications the agent hasn't seen before are *proposed*, not auto-created | Keeps one rule everywhere: the agent never writes without a tap |
| A10 | The dashboard lets the user edit applications directly; agent proposals are approved only in Telegram | A human editing their own data needs no approval; one approval surface keeps the audit trail simple |

## 4. Stack and why

| Choice | Why | Alternative considered |
|---|---|---|
| **Next.js 16 (App Router) on Vercel** | One deploy hosts the Telegram webhook, cron endpoint, MCP endpoint, OAuth callback and dashboard | Separate bot server + frontend: more moving parts for a 24h build |
| **Supabase Postgres** | Managed Postgres with a free tier, plus `pg_cron` to schedule the sync every 5 minutes (Vercel Hobby cron runs at most once a day) | Vercel Postgres/Neon: no built-in scheduler |
| **Prisma 7** (pinned 7.10.0) | Typed models and migrations; the schema doubles as documentation | Supabase JS client: less type safety for transactions |
| **Gemini Flash-Lite** | Cheap, supports structured JSON output, handles Hebrew; paid tier so inbox content is not used for training | Larger models: unnecessary for classification of short emails |
| **Telegram (grammY)** | Free; inline keyboard buttons are a natural "approve this exact action" UI | Slack: needs a workspace for every tester |
| **Gmail API, `gmail.readonly`** | Least privilege: the agent can never send, delete or modify mail | `gmail.modify` (for labels): more power than v1 needs |
| **MCP TypeScript SDK** | Official SDK; stateless Streamable HTTP fits serverless | — |

## 5. How each requirement is met

| Requirement | Implementation |
|---|---|
| 1. Grounded | Every proposal must reference a stored email. The quoted evidence is verified verbatim in code, and chat answers cite company + email subject/date. If the data has nothing relevant, the bot says so. |
| 2. Reasoning | Each proposal carries "why" + evidence + confidence. Code caps the model's confidence when the company match is weak or the keyword check disagrees, and inferences are labelled as such. |
| 3. Action with approval | Status update / record creation runs only from an owner-verified Telegram tap, in one transaction, with a check that the application hasn't changed since the proposal. |
| 4. Channel | Telegram bot + Next.js dashboard |
| 5. MCP | Read-only tools, per-user token, SELECT-only database role; see §8 |
| 6. Budget | See §6–7 |

## 6. Cost estimate

Prices: Gemini API pricing page, checked 2026-10-07. `gemini-3.5-flash-lite` costs $0.30 / 1M input tokens and $2.50 / 1M output tokens (thinking tokens are billed as output). `gemini-3.1-flash-lite` costs $0.25 / $1.50. The estimate uses the more expensive 3.5 model.

**Usage:** 5 users × 20 uses/working day × 22 working days = **2,200 interactions/month**. To be conservative, every interaction is counted as an LLM chat question, even though approvals and `/status` cost nothing.

| Item | Assumption | Tokens/month | Cost/month |
|---|---|---|---|
| Chat Q&A | 2,200 × (2 model calls: ~5,500 input + ~1,000 output tokens incl. thinking) | 12.1M in / 2.2M out | $3.63 + $5.50 = **$9.13** |
| Email classification | Free prefilter leaves ~6 candidate emails/user/day → 5 × 6 × 30 = 900 calls × (2,500 in + 500 out) | 2.25M in / 0.45M out | $0.68 + $1.13 = **$1.80** |
| Evals | ~200 model calls/month | — | **~$0.60** |
| Vercel Hobby | | | $0 |
| Supabase Free | | | $0 |
| Telegram Bot API, Gmail API, Google OAuth | | | $0 |
| **Steady state** | | | **≈ $11.50** |
| One-time backfill (first month) | 60 days × 6/day × 5 users = 1,800 calls × $0.002 | | +$3.60 → **≈ $15** |
| Stress case: prefilter lets all ~60 emails/user/day through | +8,100 calls × $0.002 | | **≈ $28** |

Upgrade path: moving to Vercel Pro (+$20/mo, for commercial use and per-minute cron) gives ≈ $32 steady state. The stress case would then reach ≈ $48, which is why the hard cap below exists.

<!-- TODO(me): replace estimates with measured averages from LlmUsage after the first real runs. -->

## 7. What happens near the limit

The LLM hard cap is **$25/month**. Hosting is at most $20 even after an upgrade, so total spend stays ≤ $45 by construction, whatever the usage. Before every model call the code checks *month-to-date spend + worst-case cost of this call* against the cap. After the call it records the exact token counts the API reports.

| Spend | What the agent does |
|---|---|
| 50% | Tells the admin in Telegram |
| 80% | Tells every user once. Switches to the cheaper model, which must also pass the evals. Limits chat to 20 questions/user/day and pauses backfills. |
| 100% | Stops calling the model. New emails are still fetched and queued (free). The bot says what's paused and until when. Dashboard, `/status`, MCP stats and approving existing proposals keep working because they don't need the model. |

It never goes over silently: every threshold sends a message, and the dashboard shows a budget bar.

## 8. MCP: who can trigger the action

Other agents can **read**: stats, the application list, per-application timelines with evidence, and pending proposals. **Nobody can trigger the approval action through MCP**, not even with the owner's token.

Why: the whole point of the action is that the owner looked at the evidence and decided. An MCP client is another agent. If it could approve, an agent would be approving on the human's behalf. I also rejected a "propose update" tool. It would let any token holder fill the owner's Telegram with proposals, and those proposals wouldn't be grounded in an email.

How it's enforced: (1) no write tools exist on the server; (2) tool handlers use a database role that only has SELECT rights, so even a bug can't write; (3) every result is filtered to the token's user; (4) every call is logged; (5) calls are rate-limited per token.

## 9. Build log (what I did in each step)

| Step | What I did | Decisions / findings |
|---|---|---|
| 0. Planning (2026-10-07) | Read the brief, picked the problem, wrote an internal build plan (architecture, schema, state machines) and this skeleton, checked current package versions and platform limits | Pinned Prisma 7.10.0. Scheduled sync with Supabase pg_cron because Vercel Hobby cron is daily only. Flagged Google's 7-day token expiry in "Testing" mode. |
| 1. Scaffold + DB (2026-10-07) | Scaffolded Next.js 16, created the Supabase project, wrote the Prisma schema (6 tables), applied the first migration, added the DB client and a `/api/health` check. Smoke-tested through the transaction pooler: a write inside a transaction, a 64-bit Telegram ID, and rollback. | Migrations are generated with `prisma migrate diff` and applied with `migrate deploy`, so no shadow database is needed on Supabase. "One pending proposal per application" is enforced by a partial unique index in the database, not only in code. |
| 2. Telegram (2026-10-07) | Created the bot with BotFather. Added `/start` (registers the Telegram account as a user), `/help`, the webhook route, a local polling script and a command-menu setup script. Tested the route with fake updates (no secret, wrong secret, valid update, group chat), then live in Telegram (`/start` twice, `/help`, free text). | The webhook rejects requests without the exact secret and refuses to work if no secret is configured. Failed updates are logged and acknowledged so Telegram doesn't re-send them. The bot ignores group chats, so approvals stay one-to-one. |
| 3. Gmail sync (2026-10-07) | Google Cloud project with the Gmail API and a read-only OAuth client (Testing mode). Built `/connect` (signed 10-minute link → Google consent → encrypted refresh token), `/sync`, a cron endpoint, and a free prefilter. 16 unit tests. Live test: real inbox backfill (17 unrelated emails skipped, nothing stored but sender and subject), then a mock rejection email, which was caught and queued. | The prefilter is tuned for recall, because a missed rejection is worse than one extra model call. Unrelated emails keep sender and subject only. A tester who emails themselves would have been silently ignored by Gmail's `-in:sent` filter; outgoing mail is now dropped by label instead. |
| 4. Classifier + approval (2026-10-07) | Gemini key on a **billed** project (paid tier, so inbox content isn't used to improve Google's products). Built the classifier, the verbatim-quote check, deterministic matching, proposals, Telegram cards and approve/reject/retry/expiry. 32 unit tests, plus `npm run eval:approval` against the real database. Live test with mock emails: a TechNova rejection was approved, an Apex Systems assessment was rejected by the user, and a CloudScale rejection was approved; the audit trail matches each tap. | The model only proposes; code decides whether a proposal exists (quote found verbatim), which application it belongs to (domain → name → role similarity), and caps the model's confidence. Approving is one transaction with an optimistic check, so double taps, stale cards and duplicate creates can't corrupt data. Measured: 678 input / 97 output tokens per classification, $0.00045, about 4× below the $0.002 estimate. |
| 5. Q&A + budget | **TODO** | |
| 6. Dashboard | **TODO** | |
| 7. MCP | **TODO** | |
| 8. Deploy | **TODO** | |
| 9. Evals | **TODO** | |

## 10. Where AI helped, and where it was wrong or misleading

I used Claude Code (Claude Opus) as a pair programmer for planning, scaffolding and code.

**Helped**
- Checked the npm registry before writing install commands. `prisma`'s `latest` tag points to `8.0.0-rc.21` (a release candidate) while `@prisma/client`'s points to `7.10.0`, so a plain `npm install` would have mixed major versions. All Prisma packages are now pinned to 7.10.0.
- Found that Google OAuth apps in "Testing" mode issue refresh tokens for `gmail.readonly` that expire after 7 days. That would have broken the deployment during the 10-day review window, so publishing the app to "In production" is now a deploy step.
- Found that Vercel Hobby cron runs at most once a day, which led to scheduling the sync with Supabase pg_cron.
- Before keeping a code comment that says Google advises against lowering temperature for Gemini 3 models, checked Google's Gemini 3 guide: it does ("may lead to unexpected behavior, such as looping"). Also called both candidate models before relying on them, because the model-list API isn't proof a model is available.
- Read grammY's webhook source before relying on it. When no secret is configured, the library skips the secret check entirely, and a handler error returns HTTP 500, which makes Telegram re-send the update. Both are now handled in our route.
- Tested `create-next-app` in a scratch folder: it refuses to run in a folder that already contains this file, my planning notes or the brief, so the setup commands move them aside first.

**Wrong or misleading**

| When | What the AI said or did | How I caught it | Fix |
|---|---|---|---|
| Phase 4 | My first version logged a non-owner's tap on an Approve button as `PROPOSAL_REJECTED`, which would put a rejection that never happened into the audit trail | Re-reading the approval code before testing it | Added a dedicated `APPROVAL_DENIED` action (one-line migration) |
| Phase 1 | Read the Next 16 guide's "Route Handlers are not cached by default" and concluded no caching config was needed, without opening `next.config.ts`. The scaffold had turned on `cacheComponents`, where pages that read the URL must be wrapped in `<Suspense>`. | The first page reading `searchParams` failed `next build` | Wrapped it per the bundled Next docs; added the rule to the project conventions |
| Phase 0 plan | Said the partial unique index couldn't be expressed in the Prisma schema and planned to add it as raw SQL in a migration | While building Phase 1, tested Prisma 7.10's `partialIndexes` preview feature in a scratch project; it works | Index declared in the schema. Raw SQL would have looked like drift, and a later migration would have dropped it. |
| Phase 0 plan | Wrote that Supabase RLS "does not apply" because Prisma connects as the owner role. That ignored Supabase's auto-generated REST API: with RLS off, the `anon` role could read **and insert** into every table, including the one that will hold Gmail tokens | Before Phase 3, checked `has_table_privilege('anon', …)` on the live database | Migration enables RLS on every table, revokes the `anon`/`authenticated` grants and the default grants for future tables. Verified with `SET ROLE anon`: permission denied. |
| Phase 0 plan | Stored "who is admin" twice: a `role` column and the `ADMIN_TELEGRAM_USER_ID` env var. After the first `/start` they already disagreed (`MEMBER` in the DB, admin in env). | Explaining the tables to the user | Dropped the column; the env var is the single source |
| Phase 0 plan | Put `CREATE ROLE mcp_readonly ... PASSWORD '...'` in the list of migration SQL | Noticed while writing the migration that it would commit a database password to git | The role is created by hand in the Supabase SQL editor in Phase 7 |

## 11. Evals

**TODO**: list of evals, how to run them, latest results.

## 12. Understanding questions (bonus)

### 12.1 An approved action's external call fails halfway. What happens, and what does the user see?
**TODO**

### 12.2 Live for a month: how would I find out it's giving wrong answers before someone relies on them?
**TODO**

### 12.3 Which part am I least confident in, and why?
**TODO**
