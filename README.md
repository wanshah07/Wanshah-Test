# Slidecraft

A slide deck builder for briefs and files. You give it a brief, the documents
it should read, an angle and the features you want; it writes the deck with
OpenAI, you edit it in the browser, and you take it out as PowerPoint or as a
single HTML file. Runs on your own machine or server, with your own key.

    brief + files + angle + features  →  deck spec (JSON)  →  editor  →  .pptx / .html

## What it does

- **Sources.** PDF, Word, PowerPoint, Excel and CSV, Markdown, text, HTML,
  pictures, zips and whole folders. Text is extracted on the server; pictures
  become media the writer can place. A large pile of sources is condensed to
  the facts relevant to the brief before the deck is written.
- **Angles.** Regulatory briefing, client proposal, training, medical affairs,
  brand pitch, conference talk, internal update, or custom. Each sets the
  tone, a suggested structure and the default features.
- **Features.** Charts (column, bar, line, area, pie, doughnut, native in
  PPTX), tables, diagrams (flow, timeline, matrix), KPI tiles, figures from
  your uploads or from the image model, speaker notes, citations, section
  dividers, a summary slide, a Q&A slide.
- **De-slop.** The writer is told what not to write. What slips through is
  flagged per slide (English and Malay lists, plus the Indonesian forms that
  must never appear in Malaysian text) and can be sent back for a rewrite of
  that slide alone. Dashes, emoji and exclamation marks are fixed
  automatically because that cannot change meaning; nothing else is.
- **Facts.** A fact the sources do not carry comes out as
  `[SAHKAN: the exact missing fact]`, printed in yellow on the slide and
  counted in the editor, until you replace it with the sourced one.
- **Themes.** Colours, fonts, radius, slide style, footer and logo per deck,
  with presets. The default preset is the token set of my.facerinna.com
  (Fraunces and Inter, brand `#4898D8` on ink `#1D344E`, 20px radius); the
  app chrome uses the same tokens, light and dark.
- **Export.** PowerPoint with editable text, native charts, tables and shapes;
  a standalone HTML deck with keyboard navigation, speaker notes and a grid
  view; the JSON spec.
- **Login.** Off by default (single user). Set `AUTH_MODE=local` and create
  accounts with `npm run user:add` for email and password sign-in. Other
  providers plug into `server/src/auth.ts`.

## Running it

Node 22.13 or later.

    cp .env.example .env        # set APP_SECRET; OPENAI_API_KEY is optional here
    npm ci
    npm run build
    npm start                   # http://localhost:8787

Add your OpenAI key in Settings (stored encrypted with `APP_SECRET`) or in
`.env`. A key in Settings wins over the one in `.env`.

Development, with the web app hot-reloading and the API on 8787:

    npm run dev                 # web on http://localhost:5173

Try it without a key: `MOCK_LLM=1 npm start` returns a fixture deck that
exercises every layout.

Docker:

    docker compose up --build   # reads APP_SECRET etc. from .env, data in a volume

The server serves the built web app, so one process and one port is the
whole deployment. Put it behind HTTPS and set `COOKIE_SECURE=1` when login
is on. GitHub Pages cannot host it: it needs a disk and a secret.

### Another provider: Mireld or any OpenAI-compatible endpoint

Settings → Writer endpoint and key → Provider. Mireld is listed
(`https://api.mireld.my/v1`); "Other OpenAI-compatible" takes any address
ending in `/v1`. Paste the key, press **Test**: it asks the endpoint for its
model list from the server Slidecraft is running on, so the answer is the
real one for that machine. Click a model name to use it, then Save.

Three things behave differently on a gateway, and the client handles each:
it retries once with `json_object` and the schema in the prompt when strict
`json_schema` is refused; it retries with `max_tokens` when
`max_completion_tokens` is refused; and it reads JSON out of code fences.
An endpoint that accepts the connection and never answers is reported as
silent after the timeout and is **not** retried, so a dead gateway costs one
wait, not three.

Reachability depends on the machine, not the app. Measured 25 Sep 2026:
`api.mireld.my` answers (401 without a key) from the Composio sandbox;
it sent nothing back to GitHub Actions runners on 19 Sep (three client
shapes, all timeouts). A Codespace runs on GitHub's own cloud, so **Test**
from inside it is the check that settles it there.

The key is sent only to the endpoint it was saved with. The server-wide
`OPENAI_API_KEY` is only ever sent to `OPENAI_BASE_URL`, never to an endpoint
a user picks in Settings.

### On GitHub, no laptop: Codespaces

`.devcontainer/devcontainer.json` builds and starts the server inside a GitHub
Codespace. Before the first launch add two Codespaces secrets for this
repository (Settings → Secrets and variables → Codespaces): `APP_SECRET`
(a long random string) and, optionally, `OPENAI_API_KEY`. Then Code →
Codespaces → Create codespace on main. When it opens, port 8787 is forwarded
and the browser tab opens on the app. The forwarded address is **private**:
only your GitHub login can open it, which is a login screen for free until
`AUTH_MODE=local` is wanted for other people (make the port public then).

What a Codespace is and is not: it stops after 30 minutes idle (Settings →
Codespaces → Default idle timeout, up to 4 hours) and starts again in about
a minute; decks and uploads live in `/workspaces/slidecraft-data` inside the
codespace and survive stops, but a codespace unused for 30 days is deleted,
so export anything you want to keep. The free allowance on a personal
account is 120 core-hours a month, which at 2 cores is 60 hours of running
time. For an always-on address for a team, use the Docker image on a host.

### Login

    AUTH_MODE=local npm start
    npm run user:add -- you@example.com "a long password" "Your name" owner

## Layout

    shared/   deck schema, theme presets, angles, the de-slop scanner, the
              SVG chart and diagram renderers, the slide HTML renderer and the
              standalone deck exporter. Built once, used by server and web.
    server/   Fastify API: SQLite (node:sqlite, no native build), ingestion,
              OpenAI calls over plain fetch with strict JSON schema output,
              PPTX export (pptxgenjs), sessions and encrypted settings.
    web/      Vite + React editor. Plain CSS on the token set, no Tailwind.
    retired/  the redirect this repository's GitHub Pages site still serves
              (see CLAUDE.md).

## Tests

    npm test          # shared: scanner and renderers; server: the whole API in mock mode
    npm run smoke     # drives the built app in Chromium: wizard, editor, export, presenter

## Settings reference

| Variable | Meaning |
|---|---|
| `APP_SECRET` | Encrypts stored keys, signs sessions. Long and random. Required in production. |
| `AUTH_MODE` | `off` (single user, default) or `local` (email and password). |
| `OPENAI_API_KEY` | Server-wide key. Optional; a key saved in Settings takes precedence. |
| `OPENAI_MODEL` | Writer model, default `gpt-4.1`. Per-user override in Settings. |
| `OPENAI_IMAGE_MODEL` | Image model, default `gpt-image-1`. |
| `OPENAI_BASE_URL` | Another OpenAI-compatible endpoint, if you use one. |
| `DATA_DIR` | Database, uploads and media. Default `./data`. |
| `SOURCE_BUDGET` | Characters of source text sent in one call before condensing, default 90000. |
| `MAX_UPLOAD_MB` | Per-file upload limit, default 40. |
| `MOCK_LLM` | `1` to skip OpenAI and return a fixture deck. |
