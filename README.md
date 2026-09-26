# Slidecraft

A slide deck builder for briefs and files. You give it a brief, the documents
it should read, an angle and the features you want; it writes the deck with
OpenAI, you edit it in the browser, and you take it out as PowerPoint or as a
single HTML file. Runs on your own machine or server, with your own key.

    brief + files + angle + features  →  deck spec (JSON)  →  editor  →  .pptx / .html

## What it does

- **Auto** (on by default). Nothing to fill in: the AI reads the sources,
  chooses the angle, audience, number of slides and layouts, logs what it
  chose and why, then writes. Anything ticked or typed still steers it, and
  Regenerate remembers the choice.
- **Deck craft.** Every deck is written to one standard: a kicker label and
  an action title with its number on each content slide, a one-line reading
  line under the title, an at-a-glance slide second, one visual per slide
  (big numbers, chart, diagram, table, two columns or numbered cards),
  verdict tags (YES / PARTLY / NO, HIGH / MEDIUM / LOW, English or Malay)
  coloured in cards and tables, sources on every chart and table, caveats
  when the evidence is thin, and decisions and next steps at the end. The
  same standard is on the Prompts page as the "Deck standard" starter.
- **Sources.** PDF, Word, PowerPoint, Excel and CSV, Markdown, text, HTML,
  pictures, zips and whole folders. Text is extracted on the server; pictures
  become media the writer can place. A large pile of sources is condensed to
  the facts relevant to the brief before the deck is written.
- **Angles.** Regulatory briefing, client proposal, training, medical affairs,
  brand pitch, conference talk, internal update, or custom. Each sets the
  tone, a suggested structure and the default features.
- **Features.** Charts (column, bar, line, area, pie, doughnut, native in
  PPTX), tables, diagrams (flow, timeline, matrix), KPI tiles, numbered
  cards, figures from
  your uploads or from the image model, speaker notes, citations, section
  dividers, a summary slide, a Q&A slide.
- **De-slop.** The writer is told what not to write. What slips through is
  flagged per slide (English and Malay lists, plus the Indonesian forms that
  must never appear in Malaysian text) and can be sent back for a rewrite of
  that slide alone. Dashes, emoji and exclamation marks are fixed
  automatically because that cannot change meaning; nothing else is.
- **Facts.** The writer uses only what the sources carry. A figure, date or
  clause it cannot stand behind is left out, never guessed and never left as a
  placeholder on the slide.
- **Fits the slide.** Nothing spills over or is cut off. On screen and in the
  web deck the text shrinks just enough to fit (the editor says when it had to
  go below half size); in PowerPoint each text box is sized from its text.
  The writer keeps the slide face short and at least half the content slides
  visual (chart, diagram, big numbers, picture, table); a slide with over 90
  words on its face is flagged.
- **Themes.** Colours, fonts, radius, slide style, footer and logo per deck,
  with presets. The default preset is the token set of my.facerinna.com
  (Fraunces and Inter, brand `#4898D8` on ink `#1D344E`, 20px radius); the
  app chrome uses the same tokens, light and dark.
- **Brief by ticking.** What the deck is for, what it must include, the
  audience and the language are tick boxes; typing is optional. The choices
  are kept on the deck, so Regenerate starts from them.
- **Saved prompts** (Prompts page). Instructions written once, such as "cite
  NPRA before any EU source", ticked on any deck; some can start ticked on
  every new deck. They sit below the fact rules: no prompt can make the
  writer invent a fee, date or clause.
- **Reference designs** (Designs page). Drop a PowerPoint, a PDF or a
  screenshot of slides you like. A PowerPoint gives its theme colours
  (through its colour map), the colours its slides actually use, its fonts,
  and how dense it is (title length, lines per slide, charts, tables,
  pictures). A PDF gives the page background, text and fill colours, and
  fonts by size and by use. A screenshot gives its colours from the pixels;
  its fonts and layout need a writer model that can see pictures. Text
  colours are adjusted until they read on the background; brand colours are
  kept exact. Pick a design for a new deck or in the editor's Theme tab; its
  notes, which you can edit, guide the writer. Office fonts (Calibri,
  Cambria, Arial, Times New Roman) stay named in the PPTX and are shown in
  the browser with free fonts of the same widths.
- **Slide sign-off.** Under every slide: OK, or say what should change and
  apply it now or save it for later. Feedback can be added to a slide that
  was already OK, which reopens it. Apply saved feedback runs every waiting
  note in one go. The editor counts the slides that are OK.
- **Pictures as sources.** Settings, Test also checks whether the writer
  model can read pictures, and remembers the answer per endpoint and model.
  If it can, pictures uploaded as sources are read (text, tables, chart
  values) before the deck is written, once each. If it cannot, Slidecraft
  stops before writing and names the pictures; the user can paste their
  content, change model, or write anyway with them as slide pictures only.
  Pictures pulled from OneDrive are slide pictures and are never read.
- **When the writer fails.** The JSON rules are written into the instructions
  on every call, not only set as a request option, and the first 500
  characters of a reply that could not be used go into the job log.
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

**Google Gemini** is listed too
(`https://generativelanguage.googleapis.com/v1beta/openai`), with a key from
aistudio.google.com. Gemini models read pictures and follow the JSON schema,
so uploaded pictures reach the deck and Auto plans reliably. For generated
pictures the image model is an Imagen model; Google serves Imagen only on a
billed project, so on the free tier leave "Pictures come from" on uploads.

**Picture reader** (Settings, optional). A second endpoint and model that
only reads the pictures uploaded as sources and hands their text to the
writer, so a writer that cannot see still writes from a poster or a table
screenshot: for example Gemini Flash reads, Mireld writes. It has its own key,
sent only to its own endpoint. Turned off, the writer reads pictures itself.

The key is sent only to the endpoint it was saved with. The server-wide
`OPENAI_API_KEY` is only ever sent to `OPENAI_BASE_URL`, never to an endpoint
a user picks in Settings.

### Pictures from OneDrive

A deck can pull the pictures in one OneDrive folder, and pull again before
every generation, so the folder stays the one place photos live. New and
changed pictures come in; a changed picture replaces the old one on every
slide that shows it. Nothing in OneDrive is changed: the only permission
asked for is `Files.Read`.

Two ways to connect, chosen in Settings, OneDrive pictures:

- **Composio.** Uses the OneDrive already connected in a Composio project.
  Paste that project's API key, press Find my OneDrive accounts, pick the
  account. No Microsoft setup. The key reaches every app connected in its
  project, so give Slidecraft a key from a project that holds only OneDrive,
  or a scoped key limited to reading. Pictures pass through Composio's
  servers. Folder paths only (no share links).
- **Microsoft direct.** No third party; needs the one-time registration below.

Either way, a picture whose SHA-256 does not match the one OneDrive reports
is not stored.

One-time setup for Microsoft direct, about ten minutes:

1. portal.azure.com, Microsoft Entra ID, App registrations, New registration.
   Name it `Slidecraft`. Supported account types: "Accounts in any
   organizational directory and personal Microsoft accounts". No redirect URI.
2. In the new registration, Authentication, set "Allow public client flows"
   to Yes and save.
3. Copy the Application (client) ID. Put it in Settings, OneDrive pictures,
   or in the `MS_CLIENT_ID` Codespaces secret or `.env`.
4. Settings, Connect OneDrive. Open the address shown, enter the code, sign
   in with the account that owns the folder. The page updates by itself.

Then, in a deck (the wizard's Sources step, or Files & regenerate in the
editor), type a folder path such as `40. HERMES/photos`, or Browse and click
through the folders, or paste a OneDrive share link, and press Pull pictures.

- The writer picks a picture by its file name. Name files for what they show.
- JPG, PNG, WebP, GIF and SVG are pulled. HEIC and camera RAW files are
  listed as skipped: save them as JPG first.
- At most 300 pictures a pull, each under `MAX_UPLOAD_MB`, subfolders to
  three levels when ticked.
- A work or school account may need an administrator to approve the app.
- Sign-in uses the device code flow, so it needs no client secret and no
  redirect address, which a codespace (whose address changes) could not give.
  The refresh token is stored encrypted with `APP_SECRET`.

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
| `MS_CLIENT_ID` | Microsoft app (client) ID for OneDrive pictures. Optional; a per-user one in Settings takes precedence. |
| `MS_TENANT` | Sign-in authority for OneDrive, default `common` (personal and work accounts). |
