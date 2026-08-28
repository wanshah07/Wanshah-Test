# Wanshah-Test

Vite + React 19 + TypeScript + Tailwind CSS v4, set up with the **shadcn/ui**
project structure, hosting the `HolographicBeams` animated canvas background.

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
