# Wanshah-Test — ws.regulab landing page

Vite + React 19 + TypeScript + Tailwind CSS v4 on the **shadcn/ui** project
structure. Live at https://wanshah07.github.io/Wanshah-Test/ (public).

## What the page renders

`src/App.tsx` renders one thing: `SaasTemplate`
(`src/components/ui/saa-s-template.tsx`), the landing page. Inside it,
`NotaRegulatori` (`src/components/ui/nota-regulatori.tsx`) draws the
"Nota regulatori" section from `src/data/notes.json`: date, domain, angle,
instrument cited, and links to the published posts. Never captions, never
client names.

**`notes.json` is edited by hand.** Nothing writes to it automatically.
ws.regulab Studio keeps its posts in its own store and does not publish
here. The file holds 5 notes, the latest dated 2 Sep 2026.

## What is here but not rendered

Everything else under `src/components/` is a shelf of ported components kept
for reuse. `App.tsx` imports none of it:

| Path | What it is |
|---|---|
| `src/components/demo/*` | One demo per ported component: 3D card, gradient border, bar chart, dialog, hover-reveal cards, link preview, sidebar, text rotate, SaaS template, hologram |
| `src/components/ui/beams-background.tsx` | `HolographicBeams`, used only by `demo/hologram-demo.tsx` |
| `src/components/ui/dashboard-sidebar.tsx`, `sidebar.tsx` | The 21st.dev sidebar (#23), generic UI |
| `src/components/ui/link-preview.tsx` | The Aceternity LinkPreview (#23) |

## Hermes retired (5 September 2026)

This site used to carry a Hermes operations dashboard at `?view=dashboard`,
a build-time bundle `src/data/hermes.json` written by `scripts/sync-hermes.py`,
and card images under `public/media/`. All three are gone.

Social content for ws.regulab now runs from **ws.regulab Studio**
(`wanshah07/argus`), a private control page with one approval gate. None of
it runs from this repo.

- **Buffer** posts ws.regulab to Facebook, Instagram and Threads.
- **Composio** posts Wan's LinkedIn, from the release Routine.
- **Zapier is not used anywhere** since 20 Sep 2026.
- **Pictures are hosted permanently** in the public repo
  `wanshah07/argus-cards`, pinned by commit SHA, and only once a post is
  approved. Temporary Unsplash or BudgetPixel addresses are never handed to
  Buffer.

## Build

    npm ci
    npm run build      # tsc -b first, so a type error fails the build

Pushing to `main` deploys via `.github/workflows/deploy-pages.yml`. `main`
is protected, and merging is a publishing decision (see `CLAUDE.md`).
