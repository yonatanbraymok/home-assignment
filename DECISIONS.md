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
| A5 | The chat remembers only the last 3 questions and answers from the last 30 minutes | Enough for follow-ups ("and which of them are open?") without carrying old context into new questions; history is read from the audit log, ordered by id |
| A6 | Unanswered proposals expire 7 days after their card is shown | A week-old proposal may no longer reflect the inbox. Counting from when it's shown means a card waiting in the past-email review (A15) doesn't expire unseen. |
| A7 | Statuses: Applied, Assessment, Interview, Offer, Rejected, Withdrawn | Online assessments are a distinct, common stage for CS internships |
| A8 | Testers connect their own Gmail and approve in their own Telegram chat; a shared demo inbox comes last | Exercises the real flow end to end; the demo inbox is a convenience, not a requirement |
| A9 | Applications the agent hasn't seen before are *proposed*, not auto-created | Keeps one rule everywhere: the agent never writes without a tap |
| A10 | The dashboard lets the user edit applications directly; agent proposals are approved only in Telegram | A human editing their own data needs no approval; one approval surface keeps the audit trail simple |
| A11 | A job ID only counts if the email labels it as a job/requisition/posting ID and it appears verbatim. Without one, same company + same title is one application; when several applications fit, the card asks the user which one | Companies like Amazon have several applications per student, often with identical titles; guessing would silently update the wrong one |
| A13 | A confirmation ("we received your application") never moves an existing application. It's the same application only if the job ID matches, or if a same-title application hasn't had any reply yet; otherwise it's a new application. A test/interview/offer email that matches a *rejected or withdrawn* application asks "which application is this?" (that one, or a new one) unless a job ID proves it's the same job. In the database: only one same-title application can be waiting for a first reply at a time. | Students re-apply and apply to several same-title postings. Before a reply there's no way to tell same-title applications apart; after one, a new confirmation can only mean a new application. |
| A14 | Two data rights, each confirmed with a button that only the account owner can use and that expires after 10 minutes. `/disconnect` revokes Gmail access at Google and deletes the token but keeps the tracker. `/delete_my_data` erases applications, emails, cards, chat history, the audit trail and the registration. Cost rows stay without a user (they hold no content and keep the budget honest), and one anonymous "account deleted" record notes that it happened. Messages already in the Telegram chat stay, because bots can't delete their messages after 48 hours. | Testers and real users connect a real inbox; they need a way to stop and a way to leave that doesn't depend on me |
| A15 | Emails from before Gmail was connected don't each push a card. The agent reads all of them first, sends one summary ("12 updates from 9 companies"), then shows one card at a time, grouped by company, with "⏭ Later" to move a card to the end. New emails still get a card right away. There is no "approve all": every card is still its own tap. | A 60-day backfill produced a wall of cards on the first sync (found by the user). Requirement 3 asks for approval of each specific action, so the fix is in delivery, not approval. Waiting until everything is read also turns a confirmation followed by a rejection into one card. |
| A16 | The dashboard has no password: Telegram is the identity. `/dashboard` sends a link that signs you in once, within 10 minutes. The session cookie lasts 7 days (fixed) and holds the internal user id, so `/delete_my_data` ends it. There's no "log out of all devices" yet. The dashboard is read-only for now; approving stays in Telegram (A10). | Whoever controls the Telegram account can already approve cards, so a link from the bot doesn't lower the bar, and there are no passwords to store or reset. It works on localhost, unlike Telegram's login widget. On phones Telegram often opens links in its own browser, which may not keep the cookie, so `/dashboard` is the way back in. |
| A17 | Each person has a $5 monthly AI allowance, and everyone shares a $25 cap (§7). Registration stays open: anyone can `/start` the bot | The brief's $50 for 5 people is $10 each, hosting included. Open registration lets reviewers try it without setup; the shared cap protects the total however many people join, and the per-person cap keeps one account from using everyone's budget. |
| A12 | The chat answers only about tracked applications (emails in the connected inbox since the backfill start), and says so when asked about anything else | It can't know about applications that never produced an email there |

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
| 4. Channel | Telegram bot + Next.js dashboard (signed in through the bot; read-only for now, approvals stay in Telegram) |
| 5. MCP | Read-only tools, per-user token, SELECT-only database role; see §8 |
| 6. Budget | See §6–7 |

## 6. Cost (measured)

Prices: Gemini API pricing page, checked 2026-10-07. `gemini-3.5-flash-lite` (the default) costs $0.30 per 1M input tokens and $2.50 per 1M output tokens; thinking tokens are billed as output. `gemini-3.1-flash-lite` costs $0.25 / $1.50.

Measured from the `LlmUsage` table, which records the exact token counts the API reports for every call:
- Reading one job email: 740 tokens in, 100 out, **$0.00047**.
- One chat model call: $0.00051 on average, $0.0015 at most. A question takes 2–3 calls (the chat eval: 13 calls for 6 questions), so about **$0.0013** typical and **$0.0075** heavy.

The brief allows under $50 a month for 5 people at 20 uses a day. Each account is one person, so that's **$10 per person per month for 600 uses** (20 × 30 days; the brief says working days, about 440, so 600 is the cautious figure).

| Per person per month | Typical | Heavy |
|---|---|---|
| Chat, if all 600 uses are questions | $0.78 | $4.50 |
| Reading job emails (6 a day typical, 60 heavy) | $0.09 | $0.85 |
| First month only: reading 60 days of past email | $0.17 | $1.70 |
| Hosting share (Vercel Hobby + Supabase Free; $4 if we ever move to Vercel Pro) | $0 | $4 |
| **Total** | **≈ $1** | **≈ $7–11** |

Typical use is about 10% of the $10. Only the combined extreme (every question heavy, a paid hosting plan, and the first month) could go over, which is why each person also has a hard cap (§7).

Telegram Bot API, Gmail API and Google OAuth cost nothing. The ≤ $45 total in §7 assumes Supabase stays on the Free plan.

## 7. Budget: two hard caps, and what happens near them

**Two caps, both checked before every AI call.**
- **Each person: $5 a month** (`LLM_USER_MONTHLY_BUDGET_USD`). With up to $4 each for hosting, that stays under the $10 per person.
- **Shared: $25 a month** (`LLM_MONTHLY_BUDGET_USD`) for everyone, evals included. With hosting at most $20, the total stays under $45 whatever the usage or the number of users.
- A month is the UTC calendar month; budgets reset at 02:00–03:00 Israel time on the 1st.

**Levels, for each cap.** The worse of the two applies.
- **ok** below 80%.
- **low** from 80%.
- **used up** once one more whole question might not fit: spend + $0.045 (the worst case of a question: 6 calls at 8k tokens in and 2,048 out) > cap. Spend never actually reaches 100%, because a call only runs if its worst case fits; this rule makes chat and email reading stop at the same moment, and a question is never cut off halfway. Up to about 1% of an allowance stays unused.

| Budget | At | Who is told (once a month) | Until the 1st |
|---|---|---|---|
| Shared | 50% | the admin | nothing changes |
| A person's | 80% | that person | up to 20 questions a day (instead of 40); emails are read with the lighter model |
| Shared | 80% | the admin and every user | the same, for everyone |
| A person's | used up | that person | no questions, no new emails read; emails wait unread and are read after the reset |
| Shared | used up | the admin and every user | the same, for everyone |

`/status`, `/pending`, approving cards and the dashboard never need the AI, so they keep working at every level.

**The lighter model must pass the same evals.** `gemini-3.1-flash-lite` passed the classifier eval (24/24) but not the chat eval (11/12: once it gave a count without naming its source). So only email reading switches; chat keeps the default model and is limited to 20 questions a day instead.

**Dropped from the first plan: "pause backfills at 80%".** Reading past emails after newer ones the user may already have approved produces wrong cards (a bogus "new application" or "which application?"). Reading 60 days of past email costs at most $0.17–$1.70 per person, and the caps already bound it.

**Never over budget silently.**
- A Telegram message at each threshold.
- Every refused question and every `/sync` says whose budget, and until when.
- `/status` shows this month's spend.
- The dashboard header shows your allowance; Settings shows both budgets.
- `/api/health` reports the shared level, without amounts.

**Known limits.**
- Two calls running at the same moment can each pass the check, so a budget can go over by about one call's worst case each: cents.
- Deleting your data and registering again starts a new allowance. The shared cap still bounds the total.
- The costs are our own calculation from the token counts, not Google's bill: prices can change, Google's billing day follows Pacific time, and caching discounts make our figure slightly high (the safe side). As an outer safety net, set a $25 budget alert in Google Cloud Billing; it emails, but doesn't stop spending.
- After a pause, the emails that waited are read from the 1st, 10 per person per sync run, so their cards trickle in.

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
| 5a. Job IDs + ambiguity (2026-10-07) | Classifier extracts job IDs; matching uses them first; ambiguous emails get a "Which application is this?" card. 40 unit tests (incl. an Amazon case with two same-title roles) and 7 approval-eval scenarios. | Asking beats guessing: an update applied to the wrong Amazon application is worse than one extra tap. |
| 5b. Chat (2026-10-07) | Telegram questions answered by Gemini with four read-only tools (list, detail, stats, email search); a tool call is forced before the first answer; `/status` with no AI. Live test on the real tracker: open/no-reply, Amazon (correctly "none, here's what I checked"), rejection count, follow-up, refusal to edit, Hebrew. | The chat has no write tools at all, so a request to change data can only be refused. Measured about $0.001 per question (2–3 model calls), about 4× under the estimate. Daily cap: 40 questions per user. |
| 5c. Re-applications (2026-10-07) | Found by the user: a new TechNova confirmation was applied to the rejected TechNova application and offered "Rejected → Applied" as a normal approval. Added a pure planning step (`planProposal`) with the rules in A13, made the same-title uniqueness apply only to applications waiting for a first reply, and made `/status` and the chat describe statuses in words ("waiting for a reply" shown inside "Open"). 49 unit tests, 9 approval-eval scenarios. | A backwards move used to be only a warning. Now a confirmation can't move anything, and a closed application can't reopen without the user choosing it. |
| 5d. Test round (2026-10-07) | Added two evals that call the real model: the classifier (12 known-answer emails incl. traps and a prompt injection) and the chat (seeded data: counts, "don't know", refusal, planted instruction). Stress-tested two analyses at once, the hard budget cap and the cron endpoint. | The evals found two real chat bugs and the stress tests found two more (see the AI log). All four are fixed and covered by tests. |
| 5e. Open email + data rights (2026-10-07) | The user reported that "Open email" landed on Gmail's "Temporary Error (404)". Three link formats were tested on a real email; `?authuser=<email>#all/<messageId>` works. Added `/disconnect` and `/delete_my_data` with owner-only, expiring confirmations. 56 unit tests; `npm run eval:account` (owner/expiry checks, disconnect keeps the tracker, delete removes every row of that user and nothing of another). | A disconnected user keeps chat and `/status` over their tracker. The revoke is best effort: if Google can't confirm it, the user is told where to remove access by hand. |
| 5f. First-sync review (2026-10-07) | The user found the first sync floods the chat with cards. Proposals from past emails are now held; one summary when all are read; one card at a time with "Later"; `/pending` resumes; expiry counts from when a card is shown; review cards are silent. Also fixed taps that waited behind a long `/sync` (see the AI log). 61 unit tests; `npm run eval:review` (6 checks). | Requirement 3 rules out "approve all", so the fix changes when cards arrive, not how they're approved. Live emails are never held: an interview invite shouldn't wait behind a review. |
| 5g. Monthly budget (2026-10-07) | Measured the real cost per call (§6). Added a $5 allowance per person next to the $25 shared cap, with levels at 80% and "used up", once-a-month Telegram notices (50% to the admin), the budget in `/status`, the dashboard and the health check. The cheaper model was tested with our evals first; it's used for reading emails only. Planned with a code map by one AI agent and a design review by another, which found five flaws in my draft (see the AI log). 85 unit tests; `npm run eval:budget` (8 checks, $0). | The budget no longer changes an email's state: when it's used up, reading simply doesn't start, so nothing needs undoing. A question starts only if a whole one fits. |
| 6a. Dashboard: sign-in + read-only views (2026-10-07) | `/dashboard` in the bot sends a single-use sign-in link (A16). Pages: overview (counts, the proposals waiting in Telegram, applications with a colour per stage), an application timeline (each email with the agent's reasoning, the verified quote, confidence and the owner's decision), settings (Gmail status, the AI budget explained), and an AI-budget bar in the header. Built with shadcn/ui (Radix, tested on a throwaway copy first). A five-angle review by independent AI reviewers, each finding checked by a skeptic, found 4 real bugs, all fixed (see the AI log). 70 unit tests; `npm run eval:dashboard` (5 checks, including HTTP against the running app); screenshots of every page from a headless browser with seeded demo data. | The dashboard can't approve anything: proposals show "Awaiting your approval in Telegram". The budget bar shows spend against the $25 AI cap the code enforces, not the $50 total, because the agent stops at $25. Dates shown are the emails' dates, not the day you tapped Approve. |
| 6b. Dashboard edits | **TODO.** Before edits ship, a sign-in link should open a "Continue as @username" page instead of signing in directly; otherwise someone could send you a link to their account, and your edits would land in their tracker. | |
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
- Ran the shadcn CLI on a throwaway copy of the project before touching the repo. It made the font setting point at itself and switched dark mode to a CSS class nothing sets; both were fixed before the real run. It also now installs a `cn` package instead of `clsx` + `tailwind-merge`; checked its publisher (shadcn's own account and repository) and that it has no install scripts before accepting it.
- Took screenshots of every dashboard page with headless Chrome and seeded demo data, which caught a wrong date that all tests had passed.
- Tested `create-next-app` in a scratch folder: it refuses to run in a folder that already contains this file, my planning notes or the brief, so the setup commands move them aside first.

**Wrong or misleading**

| When | What the AI said or did | How I caught it | Fix |
|---|---|---|---|
| Phase 5g | My first budget design said "stop at 100%". But a call only runs if its worst case fits, so spend never reaches 100%: the "used up" notices would never fire, and chat and email reading would stop on different days | The AI design reviewer | "Used up" means one more whole question doesn't fit ($0.045 reserve) |
| Phase 5g | Hitting the budget cap during a first sync marked the remaining past emails as deferred, and the past-email review counted them as read: the review summary went out early, and those emails later arrived as one-by-one cards | The AI agent mapping the budget code | One shared definition of "not read yet" (it includes the old deferred state); the budget no longer changes email states; covered by `eval:budget` |
| Phase 6 | The "used" marker of a sign-in link was a hash of the link text, but the token parser ignored anything after a second dot. So `<link>.x`, `<link>.y`… each passed as a fresh link: a used link could sign in again for its 10 minutes, which broke the one-use rule | Two of the five AI reviewers, independently | Tokens must have exactly two parts; unit tests and an eval step try `.`, `.x` and `.a.b` |
| Phase 6 | The home page looked up `?login=` messages with `in`, which also matches built-in keys: `/?login=toString` rendered a function and crashed the page | Three AI reviewers, independently | Own-key check (`Object.hasOwn`), unit-tested with `toString`, `constructor`, `__proto__`; same fix on the Gmail result page |
| Phase 6 | The session check reads the clock (cookie expiry). Next 16 refuses that during the per-session prefetch render, which logged an error on every signed-in page. The production build passed, so only the dev log showed it | Reading the dev server log after the first eval | `await connection()` before the session read, as the bundled Next docs prescribe |
| Phase 6 | "Since" dates used `statusChangedAt`, the moment you tapped Approve. Every application from the first-day review of past emails showed that day, contradicting "Applied 12 Aug" one line below. My first fix then took the newest approval, which picks the wrong one when two approvals share a timestamp ("Offer since 18 Aug" for a 5 Oct offer) | The first by an AI reviewer; the second by me, reading a screenshot of seeded data | The date of the email behind the approval that set the current status; an eval case with two approvals at the same instant |
| Phase 4 | I designed delivery as one card per email the moment it's analysed, and tested it with a handful of mock emails. A real first sync reads 60 days of mail and pushed a wall of cards at once. | The user's first sync | Past emails are reviewed one card at a time after one summary (A15); covered by `eval:review` |
| Phase 4 | The approve handler answered the tap only after the database work. The local bot handles one update at a time, so taps made during a long `/sync` waited more than 15 seconds, Telegram refused the late answer, and the error stopped the card from being redrawn: the approval was saved but the buttons stayed. | Four "query is too old" errors in the bot log | A late answer is ignored and the card is redrawn anyway; past-email cards no longer arrive during a sync |
| Phase 4 | I built the "Open email" link with the account email percent-encoded inside the path (`/mail/u/name%40gmail.com/`) and never opened one. Gmail answers that with "Temporary Error (404)". | The user tapped it | `?authuser=<email>` plus the message ID, a format the user verified on a real email; covered by a unit test |
| Phase 5 | A chat answer cited an email subject that doesn't exist ("Update on your application"). The real subject was a planted instruction, which the model rightly ignored but replaced with an invented, plausible one | `npm run eval:chat`, 1 run in 2 | Anything the answer puts in quotes must appear verbatim in this turn's tool results: one retry with the reason, then the quote is removed and the failure logged. Prompt also forbids writing a subject it didn't fetch. |
| Phase 5 | My tool loop relied on Gemini's mode NONE to force a text answer in the last round; Gemini sometimes still returned a tool call and no text, so the user got "I couldn't put an answer together" | `npm run eval:chat`, intermittent | The final round gets no tools at all plus an explicit "answer now" instruction; verified by forcing the final round |
| Phase 5 | Analysis had no protection against two runs at once (5-minute cron + a manual `/sync`): the same email was classified twice and produced two cards | A stress test running two analyses in parallel | Each email is claimed atomically (`ANALYZING` + `claimedAt`) before the model call; a claim older than 5 minutes can be taken over. Re-test: one call, one card. |
| Phase 5 | The cron endpoint returned raw database errors (query shape, user id) in its JSON response | Calling the endpoint the way pg_cron will | Responses carry a generic message; details go to the server log |
| Phase 5 | My matching design applied a new "application received" email to an existing *rejected* application with the same title and proposed "Rejected → Applied", flagged only as an "unusual change". It treated status as one line per company + title, but students re-apply and apply to several same-title postings. | The user's own test in Telegram | A confirmation can no longer move an application; a closed application can't reopen without the user choosing it (A13) |
| Phase 5 | The first chat answers cited internal tool names as their source ("from get_stats", "list_applications with no_reply_yet=true"), meaningless to a student | Reading the answers of the first live test | Prompt now requires sources in the user's terms: company, role, email subject and date |
| Phase 4 | My first version logged a non-owner's tap on an Approve button as `PROPOSAL_REJECTED`, which would put a rejection that never happened into the audit trail | Re-reading the approval code before testing it | Added a dedicated `APPROVAL_DENIED` action (one-line migration) |
| Phase 1 | Read the Next 16 guide's "Route Handlers are not cached by default" and concluded no caching config was needed, without opening `next.config.ts`. The scaffold had turned on `cacheComponents`, where pages that read the URL must be wrapped in `<Suspense>`. | The first page reading `searchParams` failed `next build` | Wrapped it per the bundled Next docs; added the rule to the project conventions |
| Phase 0 plan | Said the partial unique index couldn't be expressed in the Prisma schema and planned to add it as raw SQL in a migration | While building Phase 1, tested Prisma 7.10's `partialIndexes` preview feature in a scratch project; it works | Index declared in the schema. Raw SQL would have looked like drift, and a later migration would have dropped it. |
| Phase 0 plan | Wrote that Supabase RLS "does not apply" because Prisma connects as the owner role. That ignored Supabase's auto-generated REST API: with RLS off, the `anon` role could read **and insert** into every table, including the one that will hold Gmail tokens | Before Phase 3, checked `has_table_privilege('anon', …)` on the live database | Migration enables RLS on every table, revokes the `anon`/`authenticated` grants and the default grants for future tables. Verified with `SET ROLE anon`: permission denied. |
| Phase 0 plan | Stored "who is admin" twice: a `role` column and the `ADMIN_TELEGRAM_USER_ID` env var. After the first `/start` they already disagreed (`MEMBER` in the DB, admin in env). | Explaining the tables to the user | Dropped the column; the env var is the single source |
| Phase 0 plan | Put `CREATE ROLE mcp_readonly ... PASSWORD '...'` in the list of migration SQL | Noticed while writing the migration that it would commit a database password to git | The role is created by hand in the Supabase SQL editor in Phase 7 |

## 11. Evals

| Eval | What it proves | Command | Latest result |
|---|---|---|---|
| Monthly budget | Spend per person and in total within the UTC month; ok → low (lighter email model, 20 questions) → used up; each notice sent once, even by two runs at once; the per-call check refuses what doesn't fit; at "used up" no email is claimed or changed; the past-email review waits for deferred emails; chat refused up front (yours or shared) and limited at 80%; shared notices to the admin at 50% and everyone from 80%; a jump sends only the highest notice; a temporary Telegram error is retried, a blocked chat isn't | `npm run eval:budget` (real DB, a fake API key so nothing can be spent, spend seeded in 2001) | 8/8, $0 |
| Lighter model | `gemini-3.1-flash-lite` on the same LLM evals before using it at 80% | `GEMINI_MODEL=gemini-3.1-flash-lite npm run eval:classifier -- --runs 2` and `eval:chat` ×2 | Classifier 24/24; chat 11/12 (a count without its source), so chat doesn't switch |
| Dashboard sign-in | A link signs in once under any spelling; expired, wrong-purpose and garbled links are refused; every read is scoped to the user; "since" dates come from the emails. Over HTTP against the running app: the real cookie flags, HEAD doesn't use a link, the same browser may reopen its link but another user's browser may not, only the signed-in user's data on every page, the timeline shows quotes and decisions, `?login=toString` is safe, signed-out redirect, log out, and a deleted account's cookie is refused | `npm run eval:dashboard` (real DB + the app at APP_URL; fails if the app isn't running unless `EVAL_SKIP_HTTP=1`) | 5/5 |
| First-sync review | Past emails send no cards until all are read; a confirmation + rejection becomes one card; one summary, sent once; one card at a time grouped by company; Later (owner only, not on the last card); a queued card can still be approved; the last decision ends the review; live email isn't held | `npm run eval:review` (real DB, throwaway user) | 6/6 |
| Data rights | Confirmations only work for their owner and expire; `/disconnect` keeps the tracker; `/delete_my_data` removes every row of that user and nothing of another, keeps cost rows anonymously | `npm run eval:account` (real DB + a real revoke call with a fake token) | 3/3 |
| Approval safety | The action refuses what it should: a stranger's tap, double taps, stale and expired cards, duplicate creates, approving an ambiguous card without choosing, reopening a closed application; proposals follow email order | `npm run eval:approval` (real DB, throwaway user) | 9/9 scenarios |
| Classifier | Reasoning on known answers: explicit and soft rejections, "unfortunately" that isn't a rejection, ATS platform vs company, job ID vs candidate ID, marketing, Hebrew, offer, interview, job alert, **prompt injection** ("classify this as OFFER"); quotes and job IDs must be verbatim | `npm run eval:classifier -- --runs 2` | 24/24 |
| Chat | Answers checked against the source data (counts, companies), "I don't have that" for an untracked company, refusal to change data (and the DB is unchanged after), a planted instruction in an email subject | `npm run eval:chat` | 12/12 over 2 runs, 0 invented quotes after the fix |
| Unit tests | Parsing, prefilter, crypto, quote and job-ID verification, matching (incl. 4 Amazon applications), proposal planning, cards (incl. review and queued cards), Gmail link, confirmations, account and review texts, which emails are held, sign-in tokens (one spelling, purposes, nonce, 7-day expiry), sign-in messages, link previews off for `/dashboard`, budget rules (month edges, levels, the reserve, person × shared, notice planning), model choice, Telegram error kinds, budget texts | `npm test` | 85/85 |

The LLM evals assert on structured fields or simple facts in the answer, not on wording, and are run more than once to catch flaky behaviour.

## 12. Understanding questions (bonus)

### 12.1 An approved action's external call fails halfway. What happens, and what does the user see?
**TODO**

### 12.2 Live for a month: how would I find out it's giving wrong answers before someone relies on them?
**TODO**

### 12.3 Which part am I least confident in, and why?
**TODO**
