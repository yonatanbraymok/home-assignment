# Job Hunt Tracker

A Telegram agent that keeps a student's job applications up to date from their Gmail. It reads job emails (confirmations, online assessments, interviews, rejections, offers) and proposes each status change in Telegram, quoting the exact sentence that justifies it. Nothing changes until you tap **Approve**.

- **Telegram bot:** [@jobapplicationtracker1907bot](https://t.me/jobapplicationtracker1907bot)
- **Web app (dashboard):** https://home-assignment-henna.vercel.app
- **How and why it's built this way:** [DECISIONS.md](DECISIONS.md)

**For reviewers:** [how action approval works for testers](#how-action-approval-works-for-testers-who-approves-and-where) · [how it's deployed, and the environment variables to redeploy it](#deployment-and-environment-variables-redeploy-it-yourself)

## Try it

### Option A: the demo, in two minutes, no Gmail needed
Disclosure: The demo does not keep at with the platform's feature, and does not mimic the cron job working every 5 minutes to scan your mail. It only displays how an alert would look like, and let you explore the dashboard.

1. Open **https://t.me/jobapplicationtracker1907bot?start=demo** and tap **Start**. The bot loads 11 fictional emails into your own account and the real agent reads them (about 30 seconds).
2. You get a summary: *6 updates from 5 companies*. Tap **▶️ Start review**.
3. Each card shows the proposed change, why, the sentence it relies on, the sender, the date and how sure the agent is. Tap **✅ Approve**, **❌ Reject** or **⏭ Later**.
4. After the last card, tap **📨 Simulate a new email**: a new email "arrives" and its card pops up, as it would from Gmail. Five of them cover an interview, a job-ID match between two roles at one company, a rejection, a "Which application is this?" and an offer.
5. **/demo_reset** removes the samples when you're done.

### Option B: your own Gmail

1. Send **/start**, then **/connect**, and tap **Connect Gmail**. Access is read-only: the agent can never send, delete or change an email.
   Google warns *"Google hasn't verified this app"*. The app is published but not verified, so choose **Advanced → Go to Job Hunt Tracker**.
2. Tracking starts the moment you connect: emails from before that aren't read. The bot checks Gmail every 5 minutes; **/sync** checks right away.
3. To see a card, email yourself something a recruiter would send (or forward one), e.g. *"We'd like to invite you to an interview for the Backend Intern role."*

## How action approval works for testers (who approves, and where)

**Who approves: you, for your own tracker. Where: in your private Telegram chat with the bot, by tapping ✅ Approve on the card.**


- **The action:** creating or updating an application in your tracker (a new application, a status change, a job ID saved).
- **Who approves:** only the Telegram account that owns the tracker, by tapping **Approve** on that specific card in its private chat with the bot. As a tester, that's you, for your own tracker. One card is one change; there is no "approve all".
- **What's refused:**
  - someone else's tap;
  - a card older than 7 days;
  - a card whose application changed after it was made.

  Group chats are ignored.
- **What can't approve:** the agent never changes your tracker by itself, and other agents (MCP) can only read. On the web app you can correct a status by hand when an email was missed. That's your own change, recorded as such.

## More to try

- **Ask questions** in plain words, in the bot or in the web app's chat (it's the same conversation): *"Which applications haven't replied?"*, *"What happened with Lumen Health?"* Answers come only from your tracker and say which email they came from. When the tracker doesn't have the answer, the agent says so.
- **The web app:** send **/dashboard** and tap the button, then **Continue as &lt;your name&gt;**. Each link works once, within 10 minutes. You'll see:
  - your pipeline;
  - each application's timeline, with the quote behind every status;
  - the AI budget;
  - the chat.
- **Other commands:**
  - **/status** gives a summary.
  - **/pending** shows the cards waiting for you.
  - **/disconnect** stops reading your Gmail and keeps your tracker.
  - **/delete_my_data** erases everything.
- **MCP (for other AI agents):** on the web app's **Developers** page, create a token and connect Claude Code, Cursor or the MCP Inspector. `list_applications` lists your tracker; `generate_prep_brief` writes a grounded brief for an interview or assessment. Both are read-only.

## Good to know

- **Budget:** each person gets \$5 of AI a month, and the whole service \$25. At 80% you get a Telegram message and a lower daily question limit. When a budget is used up, the agent pauses until the 1st and tells you so. Approving, /status and the web app keep working.
- **Gmail:** read-only, checked every 5 minutes. Only job-related emails are kept in full. For anything else, only the sender and subject are stored.
- **Google:** the app is unverified, so it shows a warning and allows up to 100 Google accounts.

## Deployment and environment variables (redeploy it yourself)

**The deployment:**
- One Next.js app on **Vercel** (Washington, D.C. region) hosts the website, the Telegram webhook, the MCP endpoint, the Google sign-in callback and the sync endpoint.
- The database is **Supabase** Postgres in us-east-1. Supabase `pg_cron` calls the sync every 5 minutes, because Vercel's free plan runs scheduled jobs only once a day.
- The AI is **Gemini**.

**To redeploy your own copy:**

1. **Supabase:** create a project, set `DATABASE_URL` and `DIRECT_URL` (below), and run `npm install && npm run db:deploy` to create the tables.
2. **Google Cloud:**
   - Enable the Gmail API.
   - Set up the OAuth consent screen (External, scope `gmail.readonly`, home page `<APP_URL>`, privacy page `<APP_URL>/privacy`) and **publish it**. In "Testing", Gmail access expires after 7 days.
   - Create an OAuth client (Web) with the redirect URI `<APP_URL>/api/gmail/callback`.
3. **Gemini:** create an API key in a billed project. On the paid tier, email content isn't used for training.
4. **Telegram:** create a bot with BotFather.
5. **Vercel:**
   - Import the repository, set the environment variables below, and deploy.
   - Then point Telegram at it: `APP_URL=https://<your-app> npm run bot:setup -- --webhook`. This sets the command menu and the webhook.
6. **The 5-minute sync:** in Supabase, enable the `pg_cron` and `pg_net` extensions, then run this in the SQL editor with your values. The secret is kept in Supabase Vault.

   ```sql
   select vault.create_secret('<CRON_SECRET>', 'job_hunt_cron_secret');
   select vault.create_secret('https://<your-app>/api/cron/sync', 'job_hunt_cron_url');
   select cron.schedule('job-hunt-sync', '*/5 * * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'job_hunt_cron_url'),
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'job_hunt_cron_secret'),
         'Content-Type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 60000);
   $$);
   ```
7. **Check:** `https://<your-app>/api/health` returns `{"ok":true,...}`; send `/start` to your bot.

### Environment variables

**No keys or tokens are committed to this repository.** Set them in Vercel's project settings; for local use, copy [`.env.example`](.env.example) to `.env.local`, which git ignores.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler URL (port 6543), used by the app |
| `DIRECT_URL` | Supabase session pooler URL (port 5432), used by migrations |
| `TELEGRAM_BOT_TOKEN` | The bot's token, from BotFather |
| `TELEGRAM_BOT_USERNAME` | The bot's username, without `@` |
| `TELEGRAM_WEBHOOK_SECRET` | Any random string (letters, digits, `_`, `-`); Telegram sends it with every update and the webhook refuses requests without it |
| `ADMIN_TELEGRAM_USER_ID` | Your numeric Telegram id: shared-budget notices and the admin view in Settings |
| `APP_URL` | The app's public address, e.g. `https://your-app.vercel.app` |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`); encrypts Gmail access tokens |
| `SESSION_SECRET` | Random string (`openssl rand -base64 32`); signs sign-in links and sessions |
| `CRON_SECRET` | Random string; the sync endpoint accepts only calls that carry it |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The OAuth client from Google Cloud |
| `GEMINI_API_KEY` | Gemini API key |
| `LLM_MONTHLY_BUDGET_USD`, `LLM_USER_MONTHLY_BUDGET_USD` | Optional: the shared and per-person monthly AI caps (default 25 and 5) |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | Optional: the model (default `gemini-3.5-flash-lite`) and the lighter one used near a cap (default `gemini-3.1-flash-lite`, `none` to turn off) |

### Tests

`npm test` runs the unit tests. `npm run evals` runs the evals that make no model calls, and `npm run evals -- --all` runs all ten, including the five that call the model (about \$0.05). What each eval proves is in [DECISIONS.md §11](DECISIONS.md#11-evals).
