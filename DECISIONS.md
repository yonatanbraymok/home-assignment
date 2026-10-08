# DECISIONS: Job Hunt Tracker

How the agent was built, and why. How to try it, deploy it and configure it is in the [README](README.md).

**Contents:**
1. [Who uses it](#1-who-uses-it-and-what-it-makes-easier)
2. [Why an agent](#2-why-an-agent-is-the-right-tool)
3. [How each requirement is met](#3-how-each-requirement-is-met)
4. [Stack](#4-stack-and-why)
5. [Assumptions](#5-assumptions)
6. [Cost](#6-cost-measured)
7. [Budget](#7-budget-never-over-silently)
8. [MCP](#8-mcp-what-other-agents-can-do)
9. [Build log](#9-build-log-what-i-did-in-each-step)
10. [Where AI helped and was wrong](#10-where-ai-helped-and-where-it-was-wrong)
11. [Evals](#11-evals)
12. [Understanding questions](#12-understanding-questions)

## 1. Who uses it and what it makes easier

**Who:** anyone in the middle of a job search. Job hunting is a long, tiring process, and keeping track of every application, rejection and interview invitation is a job of its own. Instead of a messy spreadsheet, the bot works as a personal assistant: it reads your inbox for application updates and keeps your pipeline current, so you can focus on the interviews while it does the data entry.

**What it makes easier:** you no longer need to keep refreshing your inbox or worry about missing an update. Personal inboxes fill up with newsletters and promotions, and an interview invitation is easy to lose among them. The bot sends each update to your private Telegram chat, organised and with a link to the original email. It's also an assistant you can ask: "When is my interview?" or "What is the home assignment about?" It answers from the emails themselves.

## 2. Why an agent is the right tool

- **The input is unstructured language, and rules break on it.** "We'll keep your resume on file" is a rejection; "Unfortunately we need to reschedule your interview" is not. A Workday email comes from `myworkday.com`, and the company is named only in the body. Keyword rules can't tell these apart; a language model can, and it can explain why.
- **The output needs judgment and an explanation:** which of several applications an email belongs to, why the status changed, and how sure it is.
- **The risky part is not left to the model.** The model only *proposes*. Code checks the evidence (the quoted sentence must appear verbatim in the email, matching is done by rules, confidence is capped by those checks), and the tracker changes only after the owner taps Approve. The model has no write tools.
- **Where there's no LLM:** counts and stats are SQL, approvals are plain code, and a free keyword and domain prefilter decides which emails are worth a model call at all.

## 3. How each requirement is met

| Requirement | How |
|---|---|
| **1. Grounded answers** | Every proposal points to a stored email, and its quote is checked word for word in code. Chat answers come only from read-only tools, cite company and email subject and date, and say so when the data can't answer. A quote the tools didn't return is removed. |
| **2. Reasoning, not just fetching** | Each card says *why*, quotes the evidence and states a confidence. Code lowers the confidence when the company match is weak or the wording disagrees. In chat, inferences are labelled as inferences, with a confidence. |
| **3. Action with approval** | The action: create or update an application. It runs only on a Telegram tap by the tracker's owner, as one transaction that first checks the application hasn't changed since the card was made. The approver sees the change, the reason, the verbatim quote, the sender, the date, the confidence, any warnings and a link to the email. |
| **4. Channel** | Telegram, plus a web dashboard. Both have a chat with the same agent, sharing one conversation. The dashboard shows the pipeline and the evidence behind every status. |
| **5. MCP** | Two read-only tools for other agents: `list_applications` and `generate_prep_brief`. Who can trigger the action through MCP: **no one** (§8). |
| **6. Budget** | \$5 of AI per person and \$25 shared, checked before every model call, with notices at 80% and when used up (§6, §7). |

## 4. Stack and why

| Choice | Why |
|---|---|
| **Next.js 16 on Vercel** | One deploy hosts the website, the Telegram webhook, the sync endpoint, the MCP endpoint and the Google callback. |
| **Supabase Postgres** | Managed Postgres on a free tier, plus `pg_cron` to run the sync every 5 minutes (Vercel's free cron runs once a day). |
| **Prisma 7** | Typed models, migrations and transactions. |
| **Gemini Flash-Lite** | Cheap, structured JSON output, handles Hebrew. It's on the paid tier, so inbox content isn't used for training. |
| **Telegram (grammY)** | Free, and inline buttons are a natural "approve this exact change" interface. Slack would need a workspace for every tester. |
| **Gmail API, read-only scope** | Least privilege: the agent can never send, delete or change mail. |
| **MCP TypeScript SDK** | The official SDK. Stateless HTTP fits serverless hosting. |

## 5. Assumptions

The brief allows one question; everything else is an assumption, written down here.

| # | Assumption | Why |
|---|---|---|
| A1 | "5 people, 20 uses a day each" means 5 job seekers, each with their own Gmail and Telegram. | Each tracker is personal. |
| A2 | The real action is creating or updating an application record. | The brief lists "update a record". |
| A3 | One Telegram account is one user; the bot answers in private chats only. | Approvals belong to one owner. |
| A4 | The first sync reads the last 60 days of email. | Covers the current season without a large first bill. |
| A5 | Statuses: Applied, Assessment, Interview, Offer, Rejected, Withdrawn. | Online assessments are a distinct, common stage. |
| A6 | An unanswered card expires 7 days after it's shown. | Old cards may no longer match the inbox. |
| A7 | New applications are proposed, never created silently. | One rule everywhere: nothing changes without a tap. |
| A8 | A job ID counts only if it appears verbatim. Without one, the same company and title is one application. When several fit, the card asks which one. | Guessing would update the wrong application. |
| A9 | A confirmation never moves an existing application, and a closed application reopens only if the user chooses it. Only one same-title application can wait for a first reply. | Students re-apply, and apply to several same-title postings. |
| A10 | Past emails are read first, then one summary, then one card at a time with ⏭ Later. New emails still get a card right away. There is no "approve all". | A first sync otherwise floods the chat; every change still gets its own tap. |
| A11 | The owner can correct a status by hand on the dashboard. It's recorded as "Changed by you", and a card still waiting for that application no longer applies. | A missed email shouldn't leave an application stuck. It's the human's own change, not the agent's. |
| A12 | The dashboard has no password: `/dashboard` sends a single-use link (10 minutes), which asks "Continue as &lt;your name&gt;" before signing in. A session lasts 7 days. | Whoever holds the Telegram account can already approve. The confirmation stops someone from sending you a link to *their* account. |
| A13 | Two data rights, each confirmed by an owner-only button: `/disconnect` (stop reading Gmail, keep the tracker) and `/delete_my_data` (erase everything). | Testers connect a real inbox; they need a way out that doesn't depend on me. |
| A14 | Gmail is checked every 5 minutes, up to 25 job emails per person per run; `/sync` checks now. | Fresh enough for time-sensitive replies, without overlapping runs. |
| A15 | `/demo` loads 11 fictional emails into the tester's own account, but only when no Gmail is connected. The real agent reads them; `/demo_email` simulates a new one, `/demo_reset` removes them. | A reviewer can see every path in two minutes without exposing an inbox. |
| A16 | The chat answers only about tracked applications, and says so otherwise. | It can't know about applications that never sent an email. |

## 6. Cost (measured)

Gemini prices, checked 2026-10-07: `gemini-3.5-flash-lite` (the default) costs \$0.30 per 1M input tokens and \$2.50 per 1M output tokens; `gemini-3.1-flash-lite` costs \$0.25 and \$1.50. Every model call's real token counts are recorded in the `LlmUsage` table. Measured:
- **Reading one job email:** about 740 tokens in and 100 out, **\$0.00047**.
- **One chat question:** 2–3 model calls, about **\$0.0013** typical and **\$0.0075** heavy.

The brief's budget is \$50 a month for 5 people at 20 uses a day. Per person that's **\$10 a month for 600 uses** (20 × 30 days, more than the brief's working days).

| Per person per month | Typical | Heavy |
|---|---|---|
| Chat, if all 600 uses are questions | \$0.78 | \$4.50 |
| Reading job emails (6 a day / 60 a day) | \$0.09 | \$0.85 |
| First month only: 60 days of past email | \$0.17 | \$1.70 |
| Hosting share (Vercel Hobby + Supabase Free; \$4 on Vercel Pro) | \$0 | \$4 |
| **Total** | **≈ \$1** | **≈ \$7–11** |

Typical use is about 10% of the budget. Only every extreme at once could go over, which is why there are hard caps (§7). Telegram, Gmail and Google sign-in cost nothing.

## 7. Budget: never over silently

**Two caps, checked before every model call.** A call runs only if its worst-case cost fits under both.
- **Each person: \$5 a month.** With up to \$4 each for hosting, that stays under \$10 per person.
- **Shared: \$25 a month** for everyone, evals included. With hosting at most \$20, the total stays under \$45, however many people sign up.

**What happens as a budget fills up.** Both caps are calendar months (UTC).

| Level | When | What changes until the 1st | Who is told |
|---|---|---|---|
| ok | below 80% | nothing | – |
| low | from 80% | questions drop from 40 to 20 a day; emails are read with the lighter model | the person (their cap) or everyone (the shared cap); the admin also at 50% |
| used up | when one more whole question might not fit | no questions and no new emails read; emails wait and are read after the reset | the same |

- **"Used up" means a question no longer fits.** Spend never reaches 100%, because each call must fit first. So the trigger is the worst case of a whole question (\$0.045): a question is never cut off halfway, and chat and email reading stop together.
- **The lighter model is used for emails only.** It passed the classifier eval (24/24) but not the chat eval (11/12), so chat keeps the default model.
- **What keeps working:** `/status`, `/pending`, approving cards and the dashboard need no AI, so they work at every level.
- **Never silent:**
  - a Telegram message at each threshold;
  - every refused question and every `/sync` says whose budget is used up, and until when;
  - `/status` and the dashboard show the spend, where it went, and a month-end forecast.
- **Known limits:**
  - two calls at the same moment can overshoot a cap by cents;
  - our costs are our own count of tokens, not Google's bill. A \$25 billing alert in Google Cloud is the outer safety net.

## 8. MCP: what other agents can do

**Who uses it:** the user's own AI assistant (Claude, Cursor, a calendar agent), with a token the user creates in the dashboard. Example: a calendar agent sees "Wix interview tomorrow" and asks our agent for a brief.

**Two tools:**
- **`list_applications`:** your tracked applications, filtered. It uses the same read-only tool as the Telegram chat and costs no AI. Agents use it to find the right application id.
- **`generate_prep_brief(application_id)`:** our agent's reasoning, offered as a tool.
  - **Code decides first** whether there's anything to prepare for: an interview, an assessment, or nothing (applied, rejected, offer). "Nothing" is free.
  - **For an interview or assessment,** it reads that application's emails and returns typed JSON: what's required, the format, the date, the people, the topics, a timeline, and preparation tips.
  - **Grounding:** every fact carries a verbatim quote from an email, and code drops any claim whose quote isn't there.
  - **Cost:** charged to the owner's allowance, cached until something changes, and limited to 10 new briefs an hour.

**Who is allowed to trigger the action from requirement 3 this way?** No one. External agents are strictly limited to read-only data fetching and stateless AI synthesis. Triggering status updates or any database writes remains exclusively locked behind the human's manual Telegram approval to prevent race conditions and enforce strict human-in-the-loop safety.

**How that's enforced:**
1. There are no write tools, and none that could put a card in front of the owner.
2. The tools read through a database client that refuses every write in code (`src/lib/db-readonly.ts`).
3. Every query is limited to the token's owner. Someone else's application id gets the same answer as a missing one.
4. The token is shown once, stored only as a hash, and can be replaced or revoked at once. Every call is logged and limited to 120 an hour.

## 9. Build log: what I did in each step

| Step | What I did | Key decision or finding |
|---|---|---|
| 0. Plan | Read the brief, picked the problem, planned the architecture, schema and approval state machine. | Scheduled the sync from Supabase, because Vercel's free cron is daily. Google's "Testing" mode expires Gmail access after 7 days, so the app must be published. |
| 1. Scaffold | Next.js, Supabase, Prisma schema, health check. | "One pending card per application" is enforced by the database, not only by code. |
| 2. Telegram | The bot, `/start` and `/help`, the webhook with its secret check. | Failed updates are acknowledged, so Telegram doesn't resend them. Groups are ignored. |
| 3. Gmail sync | Read-only OAuth, encrypted tokens, `/connect`, `/sync`, the free prefilter. | Mail that isn't job-related keeps only its sender and subject. |
| 4. Classifier and approval | Gemini classification, the verbatim quote check, matching, cards with Approve, Reject, Retry and expiry. | Approving is one transaction with a check that nothing changed meanwhile, so double taps and stale cards can't corrupt data. |
| 5. Hardening | Job IDs and "which application?", the chat with read-only tools, re-application rules, data rights, the first-sync review, the monthly budget. | Each was driven by a real failure, most found by the user or by evals (§10). |
| 6. Dashboard | Sign-in through the bot, the pipeline, a timeline with the evidence, settings. | Telegram is the identity: no passwords. |
| 7. MCP | The two tools, tokens, and the write-blocking client. | Expose the agent's reasoning, not the database (the user redirected the first plan). |
| 8. Deploy | Vercel, the webhook, `pg_cron`, the Google app published. Verified live: a test email became a card in about 2 minutes. | One database for development and production. |
| 9. Polish for reviewers | `/demo`, a rewrite of every bot message, the landing page and dashboard design, the dashboard chat, status fixes by hand, the "Continue as" sign-in. | Testers need a path that works without exposing their inbox. |
| 10. Evals | Ten eval suites (§11), including one that drives the real bot end to end. | They found real bugs throughout. |

## 10. Where AI helped, and where it was wrong

I used Claude Code as a pair programmer for planning and code.

**Where it helped:**
- **Package versions:** it checked the npm registry first and found that `prisma@latest` was a release candidate while `@prisma/client@latest` was 7.10. A plain install would have mixed versions; everything is pinned to 7.10.0.
- **Gmail access would have expired:** apps in Google's "Testing" mode lose Gmail access after 7 days, which would have broken the 10-day review window. Publishing the app became a deploy step.
- **The free cron limit:** Vercel's free cron runs once a day, so the sync is scheduled by Supabase instead.
- **The Telegram library:** it read grammY's webhook source and found that it skips the secret check when no secret is set, and that errors make Telegram resend updates. Both are handled in our route.
- **Screenshots:** headless-browser screenshots of every page caught a wrong date that all the tests had passed.

**Where it was wrong or misleading (and how it was caught):**

| What went wrong | Caught by | Fix |
|---|---|---|
| Delivered one card per email at once; a real first sync sent a wall of cards. | The user's first sync | Past emails are reviewed one card at a time after a summary (A10). |
| Built the "Open email" link in a format Gmail answers with a 404, and never opened one. | The user | A link format verified on a real email, with a unit test. |
| Matched a new "application received" email to an old *rejected* application and offered "Rejected → Applied". | The user's own test | A confirmation can't move an application; a closed one reopens only by choice (A9). |
| First proposed MCP as read-only database queries: that exposes the data, not the agent. | The user | `generate_prep_brief`: the agent's grounded reasoning as a tool. |
| A chat answer quoted an email subject that doesn't exist. | `eval:chat` | Quoted text must appear in what the tools returned, or it's removed. |
| Two analysis runs at once classified the same email twice and sent two cards. | A stress test | Each email is claimed atomically before the model call. |
| First budget design said "stop at 100%", which can never fire. | An AI design review | "Used up" means one more whole question doesn't fit. |
| A used sign-in link could be reused by appending text to it. | AI code reviewers | Tokens must have exactly two parts; tested. |
| Said Supabase's row-level security didn't matter; the public API could actually read and write every table. | Checking table permissions on the live database | Row-level security on and public access revoked, in a migration. |
| Plain forwarded emails were cut down to nothing before the model read them, so a forwarded interview looked empty. | The user's test | The forwarded message is kept when nothing is written above it. |
| The sign-in confirmation's same-site check refused real browsers (they send `Origin: null` under the page's referrer policy). | The user, on a phone | A same-origin referrer policy, plus the browser's own `Sec-Fetch-Site` header. |
| A 5-second database transaction limit failed approvals on a slow connection. | `eval:approval`, once in three runs | A 15-second limit. |

## 11. Evals

The brief asks for 5 to 10 evals: one checking an answer against the source data, one checking reasoning on a known case, and one checking a refusal. There are ten suites, run with `npm run evals`, or `npm run evals -- --all` to include the five that call the model (about \$0.05 in total).

- **An answer checked against the source data:** `eval:chat` (counts and companies against seeded rows); `eval:mcp` (every quote in a brief appears in an email).
- **Reasoning on a known case:** `eval:classifier` (24 labelled emails, including traps and a prompt injection); `eval:demo` (11 sample emails become exactly the expected cards, and five new emails each update the right application).
- **Refusals:**
  - `eval:approval`: a stranger's tap, stale and expired cards;
  - `eval:chat`: asked to change data, it refuses and nothing changes;
  - `eval:mcp`: no write tools, and writes are blocked;
  - `eval:budget`: a call that can't be afforded is refused.

| Eval | What it proves | Result |
|---|---|---|
| `eval:approval` | Only the owner's tap changes data. Double taps, stale and expired cards, and an ambiguous card without a choice are refused. | 9/9 |
| `eval:review` | The first sync: one summary, then one card at a time; Later; new email isn't held back. | 6/6 |
| `eval:account` | `/disconnect` keeps the tracker; `/delete_my_data` erases one user and no one else. | 3/3 |
| `eval:budget` | Both caps, the levels, notices sent once, calls refused before spending. | 8/8, \$0 |
| `eval:dashboard` | Sign-in links work once and ask to continue; cross-site sign-in is refused; each user sees only their own data; status fixes by hand. | 6/6 |
| `eval:classifier` | Category, verbatim quote and job ID on labelled emails, including a prompt injection. | 24/24 |
| `eval:chat` | Answers match the data; "I don't have that"; refuses to change data. | 6/6 per run |
| `eval:mcp` | Tokens, read-only tools, scoped to the owner, grounded briefs, a planted instruction ignored. | 9/9 |
| `eval:demo` | The sample inbox through the real agent. | 5/5 |
| `eval:bot` | The Telegram bot end to end through its real handlers, with Telegram replaced by a recorder. | 8/8 |

The model evals check structured fields and facts, not wording, and are run more than once to catch flaky behaviour. There are also 99 unit tests (`npm test`).

## 12. Understanding questions

### 12.1 An approved action's external call fails halfway. What happens, and what does the user see?

The action's external call is actually a PostgreSQL transacation.
if anything fails partway for any reason, the entire transaction rolls back compeletely, no half applied states. The card is marked as dailed, and the user gets a Couldnt apply error message, then he can retry or reject.

### 12.2 Live for a month: how would I find out it's giving wrong answers before someone relies on them?

Most wrong answers show up before anyone relies on them: every card shows the sentence it rests on, with the email one tap away, and nothing changes without a tap. To find the rest:
we can watch whats already logged in our db: how often owners reject cards, "which application?" cards, quotes that failed the check, failed analyses. A rising reject rate means the classifier is drifting.
a rejected card is a labelled mistake; with consent, add it to the classifier eval.

### 12.3 Which part am I least confident in, and why?

The budget flow. The brief describes one budget for a team: under \$50 a month for 5 people, each using it about 20 times a working day. Since this is a personal tool that anyone can join, I turned it into two caps: \$5 of AI per person and \$25 shared, with a lower level at 80% (fewer questions a day, a lighter model for emails) and a pause when its used up. It works and it's tested, but it feels forced:
Its a lot of machinery for a limit that's far away. Real use is about 1% of a person's allowance, so the levels and notices will almost never fire.

