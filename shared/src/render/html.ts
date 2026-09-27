import type { Deck, Slide, Theme } from "../deck.js";
import { fontStack, glowOf, sanitizeTheme } from "../theme.js";
import { esc, inline } from "./escape.js";
import { chartSvg, seriesPalette } from "./charts.js";
import { mapGrid, mapTiles, tileName } from "../map.js";
import { diagramHtml } from "./diagrams.js";

export interface RenderCtx {
  index: number;
  total: number;
  /** Resolves a media id to an address the page can load. */
  mediaUrl: (id: string) => string;
  lang: "en" | "ms";
}

export function themeVars(raw: Theme): string {
  const t = sanitizeTheme(raw);
  const c = t.colors;
  return [
    `--bg:${c.bg}`,
    `--surface:${c.surface}`,
    `--ink:${c.ink}`,
    `--ink2:${c.ink2}`,
    `--muted:${c.muted}`,
    `--line:${c.line}`,
    `--brand:${c.brand}`,
    `--brand-deep:${c.brandDeep}`,
    `--accent:${c.accent}`,
    `--gold:${c.gold}`,
    `--radius:${t.radius}px`,
    `--font-display:${fontStack(t.fontDisplay)}`,
    `--font-body:${fontStack(t.fontBody)}`,
    `--font-quote:${fontStack(t.fontQuote ?? t.fontDisplay)}`,
    `--glow:${glowOf(c.brand)}`,
  ].join(";");
}

function bulletsHtml(items: string[] | undefined, cls = ""): string {
  if (!items?.length) return "";
  const n = items.length <= 4 ? "n-few" : items.length <= 6 ? "n-some" : "n-many";
  return `<ul class="sc-bullets ${n} ${cls}">${items.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`;
}

function heading(s: Slide, kicker?: string): string {
  const k = s.kicker || kicker;
  const dek = s.subtitle && !["title", "closing", "section"].includes(s.layout) ? `<p class="sc-dek">${inline(s.subtitle)}</p>` : "";
  const h = `<h2 class="sc-h">${k ? `<span class="sc-kicker">${esc(k)}</span>` : ""}${inline(s.title)}</h2>${dek}`;
  if (!s.badge || ["title", "closing", "section"].includes(s.layout)) return h;
  const tone = verdictTone(s.badge);
  return `<div class="sc-headrow"><div class="sc-headtxt">${h}</div><span class="sc-badge sc-vbadge ${tone ? `v-${tone}` : "v-plain"}">${inline(s.badge)}</span></div>`;
}

/** Verdict words shown as coloured badges in tables and card tags. */
export function verdictTone(text: string): "good" | "mid" | "bad" | "" {
  const t = text.trim().replace(/[.!]$/, "").toUpperCase();
  if (/^(YES|YA|HIGH|TINGGI|PASS|LULUS|DONE|SIAP|GO|STRONG|✓|MET|ON TRACK|APPROVED|OFFICIAL)$/.test(t)) return "good";
  if (/^(PARTLY|PARTIAL|SEBAHAGIAN|MEDIUM|MID|SEDERHANA|MID-HIGH|MID TO HIGH|PENDING|TBC|ESTIMATE|ANGGARAN|WATCH|MODERATE)$/.test(t)) return "mid";
  if (/^(NO|TIDAK|LOW|RENDAH|FAIL|GAGAL|✗|NOT MET|AT RISK|NO GO|BLOCKED|WEAK)$/.test(t)) return "bad";
  return "";
}

function cell(v: string): string {
  const tone = verdictTone(v);
  return tone ? `<span class="sc-badge v-${tone}">${inline(v)}</span>` : inline(v);
}

function cardsHtml(s: Slide, pal: string[] | null): string {
  const items = s.cards ?? [];
  const n = items.length;
  // Wide grids for many cards, so ten or twelve still read at a useful size.
  const cols = n <= 3 ? Math.max(n, 1) : n === 4 ? 2 : n <= 6 || n === 9 ? 3 : 4;
  return `<div class="sc-cards" style="--cols:${cols}">${items
    .map((c, i) => {
      const tone = c.tag ? verdictTone(c.tag) : "";
      return `<div class="sc-card"${pal ? ` style="--cc:${pal[i % pal.length]}"` : ""}><div class="top"><span class="no">${i + 1}</span>${c.tag ? `<span class="sc-badge ${tone ? `v-${tone}` : "v-plain"}">${inline(c.tag)}</span>` : ""}</div><div class="hd">${inline(c.heading)}</div>${c.detail ? `<div class="dt">${inline(c.detail)}</div>` : ""}</div>`;
    })
    .join("")}</div>`;
}

function logoHtml(t: Theme, ctx: RenderCtx): string {
  const src = t.logoMediaId ? ctx.mediaUrl(t.logoMediaId) : t.logoUrl;
  return src ? `<div class="sc-logo"><img src="${esc(src)}" alt=""></div>` : "";
}

function chrome(s: Slide, t: Theme, ctx: RenderCtx): string {
  let out = "";
  if (s.citations?.length && s.layout !== "title") {
    out += `<div class="sc-cite">${s.citations.map((c) => `<span>${inline(c)}</span>`).join("")}</div>`;
  }
  const foot: string[] = [];
  if (t.footer) foot.push(`<span>${esc(t.footer)}</span>`);
  if (t.slideNumbers) foot.push(`<span class="sc-num">${ctx.index + 1} / ${ctx.total}</span>`);
  if (foot.length) out += `<div class="sc-foot">${foot.join("")}</div>`;
  if (t.tag) out += `<div class="sc-tag">${esc(t.tag)}</div>`;
  return out;
}

/** A deterministic number from a string, so a slide's particle field is the same on every render. */
function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** About forty faint dots behind a bloom slide: 3 to 9 px, the brand colour at 5 to 15%. */
export function particles(seed: string, n = 40): { x: number; y: number; r: number; o: number }[] {
  let x = seedOf(seed) || 1;
  const rnd = () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909)), ((x ^= x >>> 16) >>> 0) / 4294967296);
  return Array.from({ length: n }, () => ({ x: Math.round(rnd() * 1920), y: Math.round(rnd() * 1080), r: Math.round((1.5 + rnd() * 3) * 1.5 * 10) / 10, o: Math.round((0.05 + rnd() * 0.1) * 100) / 100 }));
}

function particlesSvg(seed: string): string {
  return `<svg class="sc-dots" viewBox="0 0 1920 1080" aria-hidden="true">${particles(seed).map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" style="fill:var(--brand)" fill-opacity="${p.o}"/>`).join("")}</svg>`;
}

/** A title on two lines: the second one lit on a dark cover. */
function titleLines(s: Slide): string {
  const [a, ...rest] = s.title.split(/\n+/);
  return rest.length ? `${inline(a)}<br><span class="l2">${inline(rest.join(" "))}</span>` : inline(s.title);
}

/** A number drawn as a ring: the percentage in the figure, or null when it carries none. */
export function ringPercent(value: string): number | null {
  const m = /(-?\d+(?:[.,]\d+)?)\s*%/.exec(value);
  if (!m) return null;
  const n = Math.abs(Number(m[1].replace(",", ".")));
  return Number.isFinite(n) ? Math.min(100, n) : null;
}

function ringHtml(k: NonNullable<Slide["kpi"]>[number], colour: string): string {
  const p = ringPercent(k.value);
  const C = 527.8;
  const arc = !p ? "" : `<circle cx="100" cy="100" r="84" fill="none" style="stroke:${colour}" stroke-width="22" stroke-linecap="round" stroke-dasharray="${((p / 100) * C).toFixed(1)} ${C}" transform="rotate(-90 100 100)"/>`;
  return `<div class="sc-ring"><div class="g"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="84" fill="none" style="stroke:var(--line)" stroke-width="22"/>${arc}</svg><div class="v">${inline(k.value)}</div></div><div class="l">${inline(k.label)}</div>${k.note ? `<div class="n">${inline(k.note)}</div>` : ""}</div>`;
}

function kpiHtml(s: Slide, t: Theme, pal: string[]): string {
  const items = s.kpi ?? [];
  const rings = (s.kpiStyle ?? t.kpiStyle) === "rings";
  if (rings) return `<div class="sc-rings" style="--kpi-n:${Math.min(Math.max(items.length, 1), 4)}">${items.map((k, i) => ringHtml(k, pal[i % pal.length])).join("")}</div>`;
  return `<div class="sc-kpis" style="--kpi-n:${Math.min(Math.max(items.length, 1), 4)}">${items
    .map((k) => `<div class="sc-kpi"><div class="v">${inline(k.value)}</div><div class="l">${inline(k.label)}</div>${k.note ? `<div class="n">${inline(k.note)}</div>` : ""}</div>`)
    .join("")}</div>`;
}

function factsHtml(s: Slide): string {
  return `<div class="sc-facts">${(s.facts ?? [])
    .map((f) => `<div class="fr${f.highlight ? " hl" : ""}"><div class="fl">${inline(f.label)}</div><div class="fv">${cell(f.value)}</div></div>`)
    .join("")}</div>`;
}

function galleryHtml(s: Slide, ctx: RenderCtx): string {
  const items = s.gallery ?? [];
  const n = items.length;
  const cols = n <= 4 ? Math.max(n, 1) : 3;
  return `<div class="sc-gallery" style="--gc:${cols}">${items
    .map((g) => {
      const src = g.mediaId ? ctx.mediaUrl(g.mediaId) : g.url;
      const ph = src ? `<img src="${esc(src)}" alt="${esc(g.alt ?? g.caption ?? "")}">` : `<div class="sc-placeholder">${esc(g.prompt || (ctx.lang === "ms" ? "Tiada gambar" : "No picture"))}</div>`;
      return `<figure class="gi"><div class="ph">${ph}</div>${g.caption ? `<figcaption>${inline(g.caption)}</figcaption>` : ""}</figure>`;
    })
    .join("")}</div>`;
}

/** The colour class of a map tile from its status. */
export function mapTone(status: string): "good" | "mid" | "bad" | "info" | "none" {
  if (!status.trim()) return "none";
  const v = verdictTone(status);
  if (v) return v;
  const t = status.toUpperCase();
  if (/\b(BANNED|PROHIBITED|DILARANG|NOT ALLOWED|NOT PERMITTED|REJECTED)\b/.test(t)) return "bad";
  if (/\b(RESTRICTED|LIMIT(?:ED)?|CAPPED|DIHADKAN|CONDITIONAL|PENDING|DRAFT|REVIEW)\b/i.test(t)) return "mid";
  if (/\b(ALLOWED|PERMITTED|DIBENARKAN|APPROVED|LISTED|IN FORCE|BERKUAT KUASA)\b/.test(t)) return "good";
  return "info";
}

function mapHtml(s: Slide, ctx: RenderCtx): string {
  const m = s.map;
  if (!m) return placeholder("No map", ctx.lang);
  const tiles = mapTiles(m.region, m.areas.map((a) => a.code));
  const grid = mapGrid(tiles);
  const by = new Map(m.areas.map((a) => [a.code, a]));
  const cells = tiles
    .map((t) => {
      const a = by.get(t.code);
      const at = grid.at(t);
      return `<div class="tile t-${a ? mapTone(a.status) : "none"}" style="grid-column:${at.col + 1};grid-row:${at.row + 1}" title="${esc(tileName(t.code, ctx.lang))}"><b>${esc(t.code)}</b>${a?.status ? `<span>${esc(a.status)}</span>` : ""}</div>`;
    })
    .join("");
  const key = m.areas
    .map((a) => `<li><i class="sw t-${mapTone(a.status)}"></i><b>${esc(tileName(a.code, ctx.lang))}</b>${a.status ? `: ${inline(a.status)}` : ""}${a.note ? `<span class="nt">${inline(a.note)}</span>` : ""}</li>`)
    .join("");
  return `<div class="sc-mapwrap"><div class="sc-mapbox"><div class="sc-map" style="grid-template-columns:repeat(${grid.cols},1fr);grid-template-rows:repeat(${grid.rows},1fr);--ar:${grid.cols}/${grid.rows}">${cells}</div></div><div class="sc-mapkey">${m.legend ? `<p class="lg">${inline(m.legend)}</p>` : ""}<ul>${key}</ul></div></div>`;
}

function asidesHtml(s: Slide): string {
  return `<div class="sc-asides">${(s.aside ?? [])
    .map((a, i) => `<div class="sc-aside a${i + 1}">${a.heading ? `<h4>${inline(a.heading)}</h4>` : ""}${a.items.length ? `<ul>${a.items.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>` : ""}</div>`)
    .join("")}</div>`;
}

const NO_ASIDE = new Set(["title", "section", "closing", "two-column", "quote"]);

export function renderSlideHtml(s: Slide, rawTheme: Theme, ctx: RenderCtx): string {
  // Every theme value goes into markup, whoever saved it (a deck, a design, an old file): only safe values get there.
  const t = sanitizeTheme(rawTheme);
  const c = t.colors;
  const font = fontStack(t.fontBody);
  const pal = seriesPalette(c, t.series);
  const cap = (text?: string) => (text ? `<p class="sc-cap">${inline(text)}</p>` : "");
  const lineUnder = (text?: string) => (text ? `<p class="sc-cap" style="color:var(--ink2);font-size:calc(26px * var(--k, 1))">${inline(text)}</p>` : "");
  // The slide's own content under its heading; asides and a callout are added around it.
  let main = "";
  const head = heading(s);
  let body = "";
  switch (s.layout) {
    case "title":
    case "closing": {
      const hero = s.layout === "title" && s.kpi?.length ? `<div class="sc-hero">${s.kpi.slice(0, 4).map((k) => `<div class="hs"><div class="v">${inline(k.value)}</div><div class="l">${inline(k.label)}</div></div>`).join("")}</div>` : "";
      const chips = s.layout === "closing" && s.bullets?.length ? `<div class="sc-chips">${s.bullets.slice(0, 4).map((b) => `<span>${inline(b)}</span>`).join("")}</div>` : "";
      const k = s.kicker;
      body = `<h2 class="sc-h">${k ? `<span class="sc-kicker">${esc(k)}</span>` : ""}${titleLines(s)}</h2><div class="sc-rule"></div>${s.subtitle ? `<p class="sc-sub">${inline(s.subtitle)}</p>` : ""}${s.body ? `<p class="sc-sub">${inline(s.body)}</p>` : ""}${hero}${chips}`;
      break;
    }
    case "section":
      body = `${heading(s, s.subtitle ? undefined : sectionKicker(s, ctx))}<div class="sc-rule"></div>${s.subtitle ? `<p class="sc-sub">${inline(s.subtitle)}</p>` : ""}`;
      break;
    case "two-column":
      body = `${head}<div class="sc-cols"><div class="sc-col">${s.leftHeading ? `<h3>${inline(s.leftHeading)}</h3>` : ""}${bulletsHtml(s.bullets)}</div><div class="sc-col">${s.rightHeading ? `<h3>${inline(s.rightHeading)}</h3>` : ""}${bulletsHtml(s.bulletsRight)}</div></div>`;
      break;
    case "quote":
      body = `${head}<div class="sc-quote"><p class="q">${inline(s.quote?.text ?? "")}</p>${s.quote?.by ? `<p class="by">${inline(s.quote.by)}</p>` : ""}</div>`;
      break;
    case "bullets":
      main = `<div class="sc-content">${s.body ? `<p class="sc-prose" style="margin-bottom:24px;font-size:calc(32px * var(--k, 1));color:var(--ink2)">${inline(s.body)}</p>` : ""}${bulletsHtml(s.bullets)}</div>`;
      break;
    case "chart": {
      const svg = s.chart ? chartSvg(s.chart, c, 1500, 620, font, t.series) : "";
      const side = s.bullets?.length ? `<div class="sc-col" style="max-width:520px">${bulletsHtml(s.bullets)}</div>` : "";
      main = `<div class="sc-content" style="flex-direction:row;gap:40px"><div class="sc-fig">${svg || placeholder("No chart data", ctx.lang)}</div>${side}</div>${cap(s.chart?.source)}`;
      break;
    }
    case "table": {
      const t2 = s.table;
      const many = (t2?.rows.length ?? 0) > 7 ? "rows-many" : "";
      const tbl = t2
        ? `<table class="sc-table ${many}"><thead><tr>${t2.header.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${t2.rows
            .map((r) => `<tr>${r.map((v) => `<td>${cell(v)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`
        : placeholder("No table", ctx.lang);
      main = `<div class="sc-content">${tbl}</div>${cap(t2?.source)}`;
      break;
    }
    case "diagram": {
      const dg = s.diagram ? diagramHtml(s.diagram) : placeholder("No diagram", ctx.lang);
      // A design with its own series colours gives each funnel stage its own colour, as in PowerPoint.
      const pv = t.series?.length ? ` sc-pal" style="${pal.slice(0, 8).map((x, i) => `--p${i}:${x}`).join(";")}` : "";
      main = `<div class="sc-content"><div class="sc-diagram${pv}">${dg}</div>${lineUnder(s.body)}</div>`;
      break;
    }
    case "image": {
      const src = s.image?.mediaId ? ctx.mediaUrl(s.image.mediaId) : s.image?.url;
      const fig = src
        ? `<div class="sc-fig"><img src="${esc(src)}" alt="${esc(s.image?.alt ?? "")}"></div>`
        : `<div class="sc-placeholder">${esc(s.image?.prompt ? (ctx.lang === "ms" ? "Gambar: " : "Figure: ") + s.image.prompt : ctx.lang === "ms" ? "Tiada gambar dipilih" : "No picture chosen")}</div>`;
      const side = s.bullets?.length ? `<div class="sc-col" style="max-width:560px">${bulletsHtml(s.bullets)}</div>` : "";
      main = `<div class="sc-content" style="flex-direction:row;gap:40px">${fig}${side}</div>${cap(s.image?.caption)}`;
      break;
    }
    case "cards":
      main = `<div class="sc-content">${cardsHtml(s, t.series?.length ? pal : null)}</div>${lineUnder(s.body)}`;
      break;
    case "kpi":
      main = `${kpiHtml(s, t, pal)}${lineUnder(s.body)}`;
      break;
    case "facts":
      main = `<div class="sc-content">${s.facts?.length ? factsHtml(s) : placeholder("No facts", ctx.lang)}</div>${lineUnder(s.body)}`;
      break;
    case "gallery":
      main = `<div class="sc-content">${s.gallery?.length ? galleryHtml(s, ctx) : placeholder("No pictures", ctx.lang)}</div>${lineUnder(s.body)}`;
      break;
    case "map":
      main = `<div class="sc-content">${mapHtml(s, ctx)}</div>${cap(s.map?.source)}`;
      break;
    default:
      main = `<div class="sc-content">${bulletsHtml(s.bullets)}</div>`;
  }
  if (!body) {
    const withAside = s.aside?.length && !NO_ASIDE.has(s.layout) ? `<div class="sc-row"><div class="sc-main">${main}</div>${asidesHtml(s)}</div>` : main;
    body = `${head}${withAside}`;
  }
  if (s.callout && !["title", "section", "closing"].includes(s.layout)) body += `<div class="sc-callout">${inline(s.callout)}</div>`;
  const cls = ["sc-slide", `sc-${s.layout}`, `sc-style-${t.slideStyle}`];
  if (t.upperTitles) cls.push("sc-upper");
  if (t.darkTitle && (s.layout === "title" || s.layout === "closing")) cls.push("sc-dark");
  const dots = t.slideStyle === "bloom" && s.layout !== "section" ? particlesSvg(s.id) : "";
  return `<div class="${cls.join(" ")}" style="${themeVars(t)}" data-slide="${esc(s.id)}">${dots}${logoHtml(t, ctx)}<div class="sc-body">${body}</div>${chrome(s, t, ctx)}</div>`;
}

function placeholder(text: string, lang: "en" | "ms"): string {
  return `<div class="sc-placeholder">${esc(lang === "ms" ? text.replace("No ", "Tiada ") : text)}</div>`;
}

function sectionKicker(s: Slide, ctx: RenderCtx): string {
  return ctx.lang === "ms" ? "Bahagian" : "Section";
}

export function renderDeckSlides(deck: Deck, mediaUrl: (id: string) => string): string[] {
  return deck.slides.map((s, i) => renderSlideHtml(s, deck.theme, { index: i, total: deck.slides.length, mediaUrl, lang: deck.lang }));
}
