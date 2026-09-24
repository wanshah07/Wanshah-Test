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
publishes that folder and nothing else. Do not point it at the app: the app
needs a server, a disk and a secret, which Pages cannot provide.

## 2. One spec, three consumers

`shared/src/deck.ts` is the deck. The editor edits it, the writer returns it
(as strict JSON schema output, `server/src/llm/schema.ts`, where every field is
required and optional ones are nullable), the HTML renderer draws it and the
PPTX exporter builds it. A new field goes into all four or into none. A new
layout goes into `LAYOUTS`, `blankSlide`, the schema enum, `render/html.ts`,
`export/pptx.ts` and the system prompt's layout list.

## 3. The writer may not invent

The prompt says so and the editor counts it: a fact the sources do not carry
is written as `[SAHKAN: the exact missing fact]`, never as a guess and never
as `[SAHKAN: what to verify]`. Citations name the instrument, clause, paper or
file, never a blog. Do not soften either rule in `server/src/llm/prompts.ts`.

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
