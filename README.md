# Wanshah-Test — retired

**Merged into `wanshah07/malaysian-regulatory-affairs` on 23 Sep 2026.**
ws.regulab has one landing page now, published at
https://wanshah07.github.io/kkm-halal/ from that repo's `site/` folder.

https://wanshah07.github.io/Wanshah-Test/ serves `retired/` only: a redirect
to that page, deployed as both `index.html` and `404.html`, so every old path
lands there.

## What moved, and what stayed

| Thing | Where it is now |
|---|---|
| "Nota regulatori" section (`src/components/ui/nota-regulatori.tsx`) | `malaysian-regulatory-affairs/site/src/components/ui/nota-regulatori.tsx`, restyled to that page's emerald palette and Tailwind v3 |
| `src/data/notes.json` | `malaysian-regulatory-affairs/site/src/data/notes.json`. Edit notes there, not here |
| The SaaS-template landing page (`saa-s-template.tsx`) | Stays here, not built. Its links all pointed to kkmhalalconsultant.com |
| Ported component shelf (`src/components/demo/*`, 3D card, gradient border, bar chart, dialog, hover-reveal cards, link preview, sidebars, text rotate, `HolographicBeams`) | Stays here, not built. It was never rendered, and it is written for Tailwind v4 where `site/` uses v3 |

The React app in `src/` is kept for its history. Nothing builds it now.

## Bringing a component back

Copy the component file into `malaysian-regulatory-affairs/site/src/components/ui/`,
add its npm dependencies there, and convert any Tailwind v4-only syntax
(for example `aspect-4/5` becomes `aspect-[4/5]`). Then build that site with
`npm run build`.

## Deploy

Pushing to `main` runs `.github/workflows/deploy-pages.yml`, which uploads
`retired/`. `main` is protected, and merging is a publishing decision (see
`CLAUDE.md`). Once the redirect is live, the repository can be archived in
Settings. Open https://wanshah07.github.io/Wanshah-Test/ afterwards to confirm
the redirect still answers.
