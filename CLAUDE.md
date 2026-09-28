# Standing rules for this repo

Read this before editing anything.

## 1. This repo is PUBLIC and it is Slidecraft

Everything merged to `main` is world-readable, immediately and permanently,
git history included. Never commit a key, a `.env`, a client file, a
generated deck or a screenshot of one. Uploads and the database live in
`data/`, which is ignored.

Slidecraft replaced the retired ws.regulab landing page on 24 Sep 2026 (Wan:
"create in new repo or replace wan-test if not affected"; creating a repo is
refused for a session, so this one was repurposed). It is a slide builder and
nothing else: no social scheduling, no scraping, no cron. The one thing kept
from before is `retired/`, which GitHub Pages still serves at
https://wanshah07.github.io/Wanshah-Test/ as a redirect to
https://wanshah07.github.io/kkm-halal/. `.github/workflows/deploy-pages.yml`
publishes that folder at the root and, since 28 Sep 2026, Slidecraft at
`/app/`, built in Supabase mode (below). Keep the redirect at the root.

### Moving to Pages, Actions and Supabase (from 28 Sep 2026)

Wan: *"codespace is not for me because it's always off and my teammate cannot
use it anytime. Prepare to migrate and function like semasa."* The plan and
its phases are in `docs/MIGRATION.md`. The Pages build talks to Supabase and the worker; a
build without `VITE_SUPABASE_URL` still talks to the Node server, which is how
the Codespace and `npm test` run. These rules apply:

- `supabase/*.sql` is the security boundary once the site is public. Any
  change to a table, policy or bucket comes with a case in
  `supabase/test/rls_check.sql`, and `scripts/sql-check.sh` (run in CI) must
  pass. Every table is owner-only and members-only; the anon key reads nothing.
- Actions logs in this public repository are public. The worker may log ids,
  counts and timings, never slide text, source text, file names or a key.

## 2. One spec, three consumers

`shared/src/deck.ts` is the deck. The editor edits it, the writer returns it
(as strict JSON schema output, `server/src/llm/schema.ts`, where every field is
required and optional ones are nullable), the HTML renderer draws it and the
PPTX exporter builds it. A new field goes into all four or into none. A new
layout goes into `LAYOUTS`, `blankSlide`, the schema enum, `render/html.ts`,
`export/pptx.ts` and the system prompt's layout list.

## 3. The writer may not invent

A fact the sources do not carry is left out or stated without the figure,
never guessed. No placeholder or marker of any kind is written on a slide
(the `[SAHKAN: …]` marker was removed on Wan's instruction, 26 Sep 2026).
Citations name the instrument, clause, paper or file, never a blog. Do not soften either rule in `server/src/llm/prompts.ts`.

## 4. De-slop is a scan and a rewrite, not a silent edit

`shared/src/slop.ts` flags; it rewrites only dashes, emoji and exclamation
marks, because those cannot change meaning. Everything else is shown to the
person and sent back to the writer for that one slide when they ask. Do not
add auto-replacements of words. Malay text is checked against Indonesian
forms (`bisa`, `obat`, `perusahaan`, `kualitas`, `kemasan`) as errors, and UI
copy is English.

## 5. Keys never leave the server

An OpenAI key is stored AES-256-GCM encrypted with `APP_SECRET`, sent only to
`OPENAI_BASE_URL`, and shown masked. The web app never sees it. Do not add a
client-side call to OpenAI.

## 6. Tests run in mock mode

`MOCK_LLM=1` returns a fixture deck (`server/src/llm/mock.ts`) that uses every
layout. `npm test` needs no key and no network; keep it that way. The browser
smoke (`npm run smoke`) needs a built `web/dist` and Playwright's Chromium.
When a bug is fixed, add the case that would have caught it.

## 7. Line endings

`.gitattributes` sets `* text=auto`. If every file shows as modified, that is
CRLF: `git config core.autocrlf true`, and check with
`git diff --ignore-all-space --stat`.

## 8. Language

Bahasa Malaysia, never Bahasa Indonesia. `boleh` not `bisa`, `ubat` not
`obat`, `syarikat` not `perusahaan`, `kualiti` not `kualitas`.

## 9. Anti-slop writing rules (from blader/humanizer, MIT)

These govern how you write, not what the app's de-slop scan (section 4) does.

### Scope
- Apply to prose only: chat replies, code comments, docstrings, commit messages, PR titles and descriptions, READMEs, docs, changelogs.
- Never rewrite code, identifiers, config, test data, API payloads or UI strings unless I ask.

### Say it straight
- State the point directly.
- No "not X but Y", "it's not just X, it's Y" or "this doesn't mean X, it means Y".
- No staged run-ups: "let's dive in", "here's the thing", "honestly?".
- No one-line punchy closers, dramatic fragments or fake-deep sayings.
- Don't argue against objections nobody raised.

### Rhythm
- Use as many list items as the meaning needs. No triads by habit.
- No em dashes as connectors. Use periods, commas, colons or parentheses.
- Cut stacked hedges ("could potentially possibly").
- Vary sentence openings.

### Words
- Banned: delve, testament, landscape, showcase, pivotal, crucial, robust, seamless, unlock, elevate, tapestry, boasts, serves as, nestled, game-changer.
- Use "is" and "has".
- No inflated significance, no sales language, no unnamed "experts say".

### Facts
- Never add a fact, number, date, name or source that I didn't supply or that you didn't verify. If a detail is missing, ask.

### Leftovers
- No chatbot residue: "great question", "I hope this helps", "let me know if".
- Commit messages: plain imperative mood, no emoji.
- Describe what code does now, not what it replaced.

### Exempt (keep wording verbatim)
- NPRA / ACD prescribed label warnings and cautionary statements.
- Regulatory submissions, SAR / PIF, safety assessment reports.
- Legal, contract and MOU text.
- Direct quotes and pasted source text.
