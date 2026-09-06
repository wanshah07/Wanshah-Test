# Wanshah-Test — ws.regulab landing page

Vite + React 19 + TypeScript + Tailwind CSS v4 on the **shadcn/ui** project
structure. `src/App.tsx` renders the landing page only.

The `HolographicBeams` background component is still here, unused by the
dashboard — see the bottom of this file.

## Hermes retired (5 September 2026)

This site used to carry a Hermes operations dashboard at `?view=dashboard`,
a build-time bundle `src/data/hermes.json` written by `scripts/sync-hermes.py`,
and card images under `public/media/`. All three are gone. Social content for
ws.regulab is now run from **ws.regulab Studio**, a private control page with
one approval gate that posts through Buffer and Zapier; images come from
Unsplash and BudgetPixel URLs, so no public image host is needed.

What remains here is the landing page. The "Nota regulatori" section reads
`src/data/notes.json`: date, domain, angle, instrument cited, and links to the
published posts. Never captions, never client names.

## Build

    npm ci
    npm run build      # tsc -b first, so a type error fails the build

Pushing to `main` deploys via `.github/workflows/deploy-pages.yml`.
