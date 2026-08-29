# Wanshah-Test — Hermes dashboard (ws.regulab)

Vite + React 19 + TypeScript + Tailwind CSS v4 on the **shadcn/ui** project
structure. `src/App.tsx` renders the **Hermes operations dashboard**: what
goes out today, which compliance gates cleared, what the credit plan can
afford, and which channels are still unconnected.

The `HolographicBeams` background component is still here, unused by the
dashboard — see the bottom of this file.

## Where this publishes

`.github/workflows/deploy-pages.yml` fires **on push to `main`** and
publishes to **<https://wanshah07.github.io/Wanshah-Test/>**, which is a
**public URL**. Anyone with the link can read it.

The dashboard is therefore built on a branch, not on `main`. Merging is
what makes it live — treat that merge as a publishing decision.

What the bundle does and does not contain:

| In the bundle | Not in the bundle |
| --- | --- |
| Dates, pillar names, post formats | **Caption text — never** |
| Character counts per channel | Image files and carousel cards |
| Compliance gate verdicts | Client names, case details |
| Credit totals and the plan | Anything from `facts.yml` |
| Which channels are connected | WhatsApp conversations |
| Fact-verification status | Anything read from OneDrive |

`scripts/sync-hermes.py` copies only those first-column fields. Caption
bodies stay in the private repo. If you would rather not publish even the
operational state, keep this on a branch and run `npm run dev` locally —
the dashboard works exactly the same.

## How the data gets in

The dashboard is a static site. It cannot read the Hermes repo at runtime,
and that repo is private, so state is snapshotted at build time:

```bash
python3 scripts/sync-hermes.py ../malaysian-regulatory-affairs
npm run build
```

That reads `hermes/config/*.yml`, `hermes/state/ledger.json` and the newest
`hermes/content/<date>/meta.json`, and writes `src/data/hermes.json`.
Re-run it whenever Hermes produces a draft. Nothing in `src/data/` should
be hand-edited — it is generated, and the next sync overwrites it.

Python rather than Node because the Hermes configs are YAML and this repo
has no YAML dependency; adding one to ship a maintenance script was not
worth it. It needs `pyyaml`.

### Adding content data — where each thing lives

All of it is in the **`malaysian-regulatory-affairs`** repo, not this one:

| What you want to change | File |
| --- | --- |
| Voice, what Hermes may never say, CTAs, hashtags | `hermes/config/brands.yml` |
| Which pillar runs on which day, post formats | `hermes/config/calendar.yml` |
| **Real fees, timelines, circulars, DM questions** | `hermes/config/facts.yml` |
| Character limits, which channels are live | `hermes/config/channels.yml` |
| Credit ceiling, image model, video switch | `hermes/config/budget.yml` |
| Diagram styling for post visuals | `hermes/tools/visual-template.html` |

`facts.yml` is the one that matters most. Hermes never invents a
regulatory number: if a figure is not in that file, it writes
`[SAHKAN: ...]` and holds the draft. Today's draft is held on exactly
that — two JAKIM figures with nowhere to look them up. Fill the file in
once and the markers stop appearing.

It also holds `soalan_masuk`, a list of real questions from DMs and
WhatsApp. That feeds the `soal_jawab` pillar, which is both the
highest-engagement one and the easiest to supply: paste questions as they
were actually asked.

## Platforms

Instagram, Facebook Page, Threads. **X is not used** — it was removed on
request, not overlooked. It is gone from `hermes/config/channels.yml`, so
it disappears from this dashboard automatically; there is nothing to
change here.

## The chart layer

`src/index.css` carries a `--viz-*` token block separate from the shadcn UI
tokens: those dress controls, these encode meaning. Light and dark steps
are both selected rather than flipped, and validated against this
project's real surfaces (`#ffffff` light card, `#343434` dark card) for
lightness band, chroma floor, colourblind separation and normal-vision
separation.

Every coloured cell also carries a text label. That is load-bearing, not
decorative: the text-only slot colour measures 2.82:1 against the light
card, below the 3:1 bar, so colour never carries meaning alone.

## Run it

```bash
npm install     # once
npm run dev     # http://localhost:5173
npm run build   # type-check + production build into dist/
npm run preview # serve the production build on http://localhost:4173
```

## Where things live

| Path                                     | What it is                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `src/components/ui/beams-background.tsx` | The `HolographicBeams` component (default export)                        |
| `src/components/demo/hologram-demo.tsx`  | Demo page: full-screen beams behind a "Calmness in design" heading        |
| `src/lib/utils.ts`                       | `cn()` — the `clsx` + `tailwind-merge` helper every shadcn component uses |
| `src/index.css`                          | Tailwind v4 entry + shadcn design tokens (neutral base, light + dark)     |
| `components.json`                        | shadcn CLI config — makes `npx shadcn@latest add <component>` work        |

`@/*` is aliased to `src/*` in both `tsconfig.json` (for the type-checker) and
`vite.config.ts` (for the bundler). Both are needed — TypeScript resolves the
types, Vite resolves the actual import at build time.

## Why `src/components/ui/`

`components.json` declares `"ui": "@/components/ui"`. Every component the shadcn
CLI installs lands there, and every published shadcn-style snippet (this one
included) imports its siblings with that exact path. Keeping the folder means
`npx shadcn@latest add button` drops files where imports already expect them,
and copy-pasted community components work unmodified.

## Using the component

```tsx
import HolographicBeams from "@/components/ui/beams-background";

<div className="relative w-full h-screen overflow-hidden">
  <HolographicBeams density={15} speed={1.5} aberration={3} opacity={90} />
  <h1 className="relative z-30">Your content</h1>
</div>;
```

It is a **default** export, and it positions itself `absolute inset-0`, so the
parent needs `position: relative`, and content stacked above it needs a z-index
higher than 20 (the vignette layer).

| Prop         | Type     | Default | What it does                                      |
| ------------ | -------- | ------- | ------------------------------------------------- |
| `density`    | `number` | `30`    | Number of light pillars across the width          |
| `speed`      | `number` | `1`     | Animation speed multiplier                        |
| `aberration` | `number` | `2.5`   | Pixel offset of the red/blue channels (RGB split) |
| `opacity`    | `number` | `50`    | Overall brightness, as a percentage               |

Any other `div` prop (`className`, `style`, …) is forwarded to the wrapper.

## Adding more shadcn components

```bash
npx shadcn@latest add button card
```

The CLI reads `components.json` and writes into `src/components/ui/`.
