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

The dashboard **bundle** is therefore built on a branch, not on `main`.
Merging is what makes it live — treat that merge as a publishing decision.
Card images under `public/media/` are the one exception and go straight to
`main`; see [Card hosting](#card-hosting-publicmedia) below for why.

What the bundle does and does not contain:

| In the bundle | Not in the bundle |
| --- | --- |
| Dates, pillar names, post formats | **Caption text — never** |
| Character counts per channel | Unapproved draft cards |
| Compliance gate verdicts | Client names, case details |
| Credit totals and the plan | Anything from `facts.yml` |
| Which channels are connected | WhatsApp conversations |
| Fact-verification status | Anything read from OneDrive |

`scripts/sync-hermes.py` copies only those first-column fields. Caption
bodies stay in the private repo. If you would rather not publish even the
operational state, keep this on a branch and run `npm run dev` locally —
the dashboard works exactly the same.

## Card hosting (`public/media/`)

**Approved post cards live in this repo, deliberately.** An earlier version
of this README listed "image files and carousel cards" as never present.
That was wrong from 2026-08-29 onward, and it stayed wrong long enough to
cost real time — a later session read that line, believed there was no image
host, and went looking for one that already existed here.

Instagram's `publish_media_v2` and Facebook's `page_photo` both take a file
upload *or* a publicly reachable URL. Hermes runs against a **private** repo,
so it has no URL to hand them. This repo is public, so it does.

    public/media/<date>/card-1.png

Vite copies `public/*` into `dist/` verbatim and the Pages workflow serves
`dist/`, so each card is reachable two ways:

| URL | When it works |
| --- | --- |
| `raw.githubusercontent.com/wanshah07/Wanshah-Test/main/public/media/<date>/card-1.png` | The moment the push lands. **Use this one.** |
| `wanshah07.github.io/Wanshah-Test/media/<date>/card-1.png` | Only after the Pages deploy finishes |

Post with the raw URL. Calling Meta during a Pages deploy makes it fetch a
URL that does not exist yet, and the resulting error says nothing useful.

**The approval gate.** `hermes/tools/publish-cards.py` refuses to copy
anything whose `meta.json` status is not `approved`. That is the whole point
of the draft-first design: an approved card is about to be public anyway, so
nothing is exposed early — but an unapproved draft never leaves the private
repo. `ready_for_approval` is **not** approved; a human has to say so.

That script also pushes here and then fetches each URL back and compares
SHA256 against the local file. A URL it cannot verify is never recorded, and
it exits with an error rather than let a broken image reach a live account.

Cards are pushed to `main` rather than a branch because the URL has to exist
before the post goes out — there is no review window to wait for. The
approval gate above is what makes that safe.

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
`[SAHKAN: ...]` and holds the draft as `needs_verification`. A figure that
is present but still carries `status: belum_disahkan` may go on a card but
never into a caption. Fill the file in and the markers stop appearing.

(This README used to name the specific figures a draft was waiting on. That
kind of line goes stale within a day — check the dashboard's amber "Perlu
disahkan sebelum lulus" panel instead, which reads the live state.)

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
