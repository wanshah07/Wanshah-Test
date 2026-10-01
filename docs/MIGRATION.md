# Slidecraft off Codespaces: Pages, Actions and Supabase

Wan, 28 Sep 2026: *"codespace is not for me because it's always off and my
teammate cannot use it anytime. Prepare to migrate and function like semasa:
can PR, merge and open the link anytime anywhere."*

Slidecraft is moving to the same shape as `wanshah07/semasa`:

| Part | Today | After |
|---|---|---|
| Site | served by the Node server in a Codespace | GitHub Pages, rebuilt on every merge to `main` |
| Data | SQLite file and `data/` folder in the Codespace | Supabase: Postgres tables and private Storage buckets |
| Sign-in | `AUTH_MODE`, users made with `npm run user:add` | Supabase Auth, plus a members list the owner controls |
| Writing, reading files, Composio, PowerPoint | the Node server, on request | a worker in GitHub Actions, woken by the database within seconds |
| Keys | saved encrypted in Settings | GitHub Actions secrets, read only by the worker |

The link stays up whether or not anyone has anything open: Pages and Supabase
are always on, and the worker starts when a job arrives.

## How a click becomes work

```
 browser (GitHub Pages)                   Supabase                          GitHub Actions
 ──────────────────────                   ────────                          ──────────────
 read / edit own decks  ───── RLS ──────▶ sc_decks, sc_sources, …
 "Write deck"           ── insert ──────▶ sc_jobs (pending) ── trigger ───▶ repository_dispatch
                                                                            worker.yml:
                                          sc_jobs, sc_decks  ◀── writes ──  load the job's rows
 progress and result    ◀── realtime ──── (running → done)                  run the existing server code
                                                                            write rows and files back
```

The worker keeps the server code that already works and is already tested.
For each job it:

1. loads the person's rows (settings, the deck, its sources, media, designs,
   prompts) from Supabase into an in-memory SQLite database, and downloads
   the files the job needs into a temporary folder;
2. sends the job's request (`POST /api/decks/d_x/generate` and so on) to the
   existing Fastify app with `app.inject()`, as that person;
3. writes back every row the request changed and uploads any new file, then
   stores the response on the job.

So `server/src/llm`, `export`, `ingest`, `design`, `onedrive.ts` and
`gdrive.ts` move without a rewrite, and `npm test` keeps testing them.

## Which requests go where

**Straight to Supabase from the page** (instant, protected by RLS):
list, open, rename, save and delete decks; read, rename and delete Studio
outputs and save a note (`sc_outputs`, `supabase/005_outputs.sql`); the
notebook guide while its sources have not changed; list and delete sources and media;
open a picture (a signed link); designs and prompts; Settings choices (model,
theme, default folder, the Composio account picks, the house instructions);
sign-in and sign-out.

**Through the worker** (starts in roughly 20 to 60 seconds, then runs as long
as the work takes):
write a deck, design pass, rewrite or feedback on a slide, answer a chat
question, make a Studio output, write the notebook guide, upload and read a
source file, read a Google Drive or Sheets link, OneDrive import and browse,
find Composio accounts, analyse a design file, export PowerPoint and HTML,
duplicate a deck.

**Dropped:** "Test key" and the picture reader's key (keys are secrets now);
Microsoft direct sign-in for OneDrive (it stores a refresh token per person;
Composio covers OneDrive without one); `AUTH_MODE` and `npm run user:add`.

The waiting is the one real cost. Writing a whole deck already takes minutes,
so 30 seconds more is small. The worker stays warm for five minutes after a
job (`SC_IDLE_MS`) and keeps its installed packages between runs, so the
first question in a sitting waits for a runner and the ones after it start
at once.

## What a teammate sees

They open the link, sign in with their email, and see "not added yet" until
Wan adds them (one line in the Supabase SQL editor, in `supabase/001_schema.sql`).
After that they have their own decks, sources and settings. Nobody sees
anybody else's decks. Every deck is written on the team's OpenAI key.

## Safety

- **The repository is public, and so are its Actions logs.** The worker logs
  job ids, counts and timings only, never slide text, source text, file names
  or a key. A test enforces this before the worker ships.
- **The Pages site is public.** The anon key it carries can read nothing:
  every table and bucket is owner-only and members-only
  (`supabase/002_rls.sql`, `003_storage.sql`). `scripts/sql-check.sh` proves it
  on a real Postgres from four sides: the owner, a teammate, a signed-in
  stranger and the anon key.
- **Only the job id travels to GitHub.** The dispatch body carries the id; the
  worker reads the job itself with the service key.
- **A stranger cannot spend the OpenAI key.** Queuing a job needs membership.

## Limits worth knowing

- Supabase Free: 500 MB database, 50 MB per file, two active projects, and a
  project with no database activity for 7 days is paused. The worker's
  15-minute poll touches the database, which keeps it awake.
- GitHub turns off scheduled workflows in a public repository after 60 days
  with no activity in it. If that happens only the poll stops; the dispatch
  still starts the worker. Re-enable it from the Actions tab.
- Actions minutes are free for a public repository.

## Phases

Each phase is one pull request. Phases 1 to 4 and 6 are done; phase 5 was
not needed.

1. **Plan and database** (this PR): this file, `supabase/001` to `004`,
   `scripts/sql-check.sh`. Nothing runs yet.
2. **Worker** (done): `server/src/worker/` and `.github/workflows/worker.yml`.
   - `mirror.ts` loads what a job is about (its deck, that deck's sources and
     pictures, the person's designs, prompts and settings) into an in-memory
     SQLite database under the one local user, and afterwards writes back
     every row and picture that changed, always filtered by the owner's id.
   - `run.ts` claims a pending job, sends its request to the existing app with
     `app.inject()`, waits for background work (writing a deck) while passing
     its progress to `sc_jobs.progress`, and stores the answer in
     `sc_jobs.result` as `{status, body}` (or `{status, file}` for a
     PowerPoint or HTML export, put in `sc-exports`). A request the app
     answers with 404 or 409 is still a finished job: the page reads the
     status like a fetch response. `error` is only for the worker failing.
   - `merge.ts`: when the person edited the deck in the browser while the job
     ran, the two versions are merged slide by slide instead of the worker
     overwriting the edit.
   - It refuses sign-in routes, any path outside `/api`, and the routes that
     test, save or sign in with a key: keys are the worker's own secrets now.
   - The workflow skips quietly until the Supabase secrets exist, and a
     scheduled poll only installs and builds when a job is waiting.
   - `server/test/worker.test.ts` runs every kind of job against a stand-in
     for Supabase, and checks that another person's deck and files are out of
     reach and that no content reaches the log.
3. **Page** (done): `web/src/cloud/`. A build with `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` runs in Supabase mode; without them the page talks
   to the Node server exactly as before, so the Codespace keeps working.
   - `routes.ts` answers each `/api` request the page makes, in the shape the
     server route answered in. Decks, sources, pictures, settings, designs,
     prompts and the house instructions go straight to Supabase (row level
     security keeps each person to their own rows). Anything else is queued in
     `sc_jobs` for the worker, with uploaded files put in `sc-inbox` first,
     and the page polls the job every 2 seconds.
   - Writing a deck and applying feedback return once the worker has taken
     the job, so a refusal (a deck already being written, pictures the writer
     cannot read) still reaches the page as before; the editor then follows
     the job's progress as it always did.
   - Pictures are shown through signed links made in one batch whenever a
     deck, its pictures or the designs are read (`media.ts`).
   - Present, the HTML export and the JSON export are built in the page from
     the shared renderer; only the PowerPoint needs the worker. A downloaded
     PowerPoint and a finished job are removed afterwards.
   - Sign-in is Supabase Auth with email and password; a new account sees
     "the workspace owner has not added you yet" until it is in `sc_members`.
     Settings has a Password card, so a person given a first password by the
     owner can replace it, and a project with sign-ups off tells a visitor
     that the owner makes accounts instead of showing Supabase's own message.
   - Settings shows no key fields: the AI is the owner's.
   - Routes use `#/…` in this mode, because GitHub Pages serves one file.
   - `scripts/cloud-check.mjs` (`npm run check:cloud`) builds the page in this
     mode and drives it in Chromium against a stand-in for Supabase that
     applies the same row level security, with the real worker taking jobs:
     sign-up, the members notice, a source read by the worker, a deck written,
     an edit saved, a picture through a signed link, the exports, Present,
     Settings, and a teammate who sees none of it. The teammate checks fail
     when the stand-in's owner-only rule is removed.
4. **Deploy** (done): `deploy-pages.yml` builds `web/` in Supabase mode with
   `VITE_BASE=/Wanshah-Test/app/` and publishes it beside the existing
   redirect, so https://wanshah07.github.io/Wanshah-Test/ keeps redirecting to
   kkm-halal and Slidecraft opens at https://wanshah07.github.io/Wanshah-Test/app/.
   Every merge to `main` redeploys it. Until the two repository variables
   exist, `/app/` shows "Slidecraft is being set up" (`docs/pages-setup.html`)
   instead of a page that cannot work. `CLOUD_BASE=/Wanshah-Test/app/ npm run
   check:cloud` runs the end-to-end check with the page served from that path.
5. **Move the data** (not done): a one-off script to copy the Codespace's
   SQLite rows and pictures into Supabase. Nobody asked for the old decks,
   and a Codespace unused for 30 days deletes itself.
6. **Retire Codespaces** (done, 29 Sep 2026): `.devcontainer/` is removed,
   the README's Codespaces section is replaced by "The team link", and
   `CLAUDE.md` rules 1 and 5 describe Pages and the worker's key. The Node
   server stays for development and tests.

## What Wan does, once

1. Create a Supabase project for Slidecraft (Free plan, region Singapore). A
   separate project keeps client decks apart from KPI data. The files also
   run in the KPI project if a second free project is not available.
2. In the SQL editor, run `supabase/001` to `005` in order (005 adds the
   Studio's outputs; run it on its own when 001 to 004 are already in).
3. Put the dispatch token and repo in Vault (the two lines at the top of
   `004_dispatch.sql`).
4. In GitHub, Settings, Secrets and variables, Actions:
   - secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`,
     and `COMPOSIO_API_KEY` if Drive or OneDrive is used;
   - optionally variables `OPENAI_BASE_URL` and `OPENAI_MODEL` for another
     endpoint or model (each person's model choice in Settings still wins);
   - optionally `AI_MODELS`, the models people may pick in the notebook
     (`claude-opus-5.5=Claude Opus 5.5, gpt-6-luna=GPT-6 Luna`), and
     `AI_FAST_MODEL`, a quicker model for reading long sources;
   - variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. In GitHub, Settings, Secrets and variables, Actions, **Variables** tab:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase, Project
   Settings, API: the Project URL and the `anon` `public` key). These are
   public by design; never put the service role key here. Then run the
   "Deploy to GitHub Pages" workflow once, or merge anything.
6. In Supabase, Authentication, URL Configuration, add
   `https://wanshah07.github.io/Wanshah-Test/app/` to **Redirect URLs**, so the
   confirmation email of a new account comes back to Slidecraft. Leave the
   Site URL alone: in a project another app uses, it belongs to that app.
7. Accounts. kpi-system has sign-ups switched off, and should keep them off
   while other apps share its logins, so the owner makes each account:
   Authentication, Users, Add user, Create new user, with a first password
   and **Auto Confirm User** ticked. Then add the person with the insert at
   the top of `001_schema.sql` (`owner` for Wan, `member` for everyone else)
   and send them the link, their email and the first password. They sign in
   and replace the password in Settings, Password. An email that already has
   an account in the project (Wan's, from KPI) signs in with that password.
   A visitor who tries to create an account is told the owner makes them.

Steps 4 to 7 are needed before the link works; nothing breaks meanwhile.
