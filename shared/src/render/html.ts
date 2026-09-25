import type { Deck, Slide, Theme } from "../deck.js";
import { esc, inline } from "./escape.js";
import { chartSvg } from "./charts.js";
import { diagramSvg } from "./diagrams.js";

export interface RenderCtx {
  index: number;
  total: number;
  /** Resolves a media id to an address the page can load. */
  mediaUrl: (id: string) => string;
  lang: "en" | "ms";
}

export function themeVars(t: Theme): string {
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
    `--font-display:'${t.fontDisplay.replace(/'/g, "")}'`,
    `--font-body:'${t.fontBody.replace(/'/g, "")}'`,
  ].join(";");
}

function bulletsHtml(items: string[] | undefined, cls = ""): string {
  if (!items?.length) return "";
  const n = items.length <= 4 ? "n-few" : items.length <= 6 ? "n-some" : "n-many";
  return `<ul class="sc-bullets ${n} ${cls}">${items.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`;
}

function heading(s: Slide, kicker?: string): string {
  return `<h2 class="sc-h">${kicker ? `<span class="sc-kicker">${esc(kicker)}</span>` : ""}${inline(s.title)}</h2>`;
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
  return out;
}

export function renderSlideHtml(s: Slide, t: Theme, ctx: RenderCtx): string {
  const c = t.colors;
  const font = t.fontBody;
  let body = "";
  switch (s.layout) {
    case "title":
    case "closing":
      body = `${heading(s)}<div class="sc-rule"></div>${s.subtitle ? `<p class="sc-sub">${inline(s.subtitle)}</p>` : ""}${s.body ? `<p class="sc-sub">${inline(s.body)}</p>` : ""}`;
      break;
    case "section":
      body = `${heading(s, s.subtitle ? undefined : sectionKicker(s, ctx))}<div class="sc-rule"></div>${s.subtitle ? `<p class="sc-sub">${inline(s.subtitle)}</p>` : ""}`;
      break;
    case "bullets":
      body = `${heading(s)}<div class="sc-content">${s.body ? `<p class="sc-prose" style="margin-bottom:24px;font-size:32px;color:var(--ink2)">${inline(s.body)}</p>` : ""}${bulletsHtml(s.bullets)}</div>`;
      break;
    case "two-column":
      body = `${heading(s)}<div class="sc-cols"><div class="sc-col">${s.leftHeading ? `<h3>${inline(s.leftHeading)}</h3>` : ""}${bulletsHtml(s.bullets)}</div><div class="sc-col">${s.rightHeading ? `<h3>${inline(s.rightHeading)}</h3>` : ""}${bulletsHtml(s.bulletsRight)}</div></div>`;
      break;
    case "chart": {
      const svg = s.chart ? chartSvg(s.chart, c, 1500, 620, font) : "";
      const cap = s.chart?.source ? `<p class="sc-cap">${inline(s.chart.source)}</p>` : "";
      const side = s.bullets?.length ? `<div class="sc-col" style="max-width:520px">${bulletsHtml(s.bullets)}</div>` : "";
      body = `${heading(s)}<div class="sc-content" style="flex-direction:row;gap:40px"><div class="sc-fig">${svg || placeholder("No chart data", ctx.lang)}</div>${side}</div>${cap}`;
      break;
    }
    case "table": {
      const t2 = s.table;
      const many = (t2?.rows.length ?? 0) > 7 ? "rows-many" : "";
      const tbl = t2
        ? `<table class="sc-table ${many}"><thead><tr>${t2.header.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${t2.rows
            .map((r) => `<tr>${r.map((v) => `<td>${inline(v)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`
        : placeholder("No table", ctx.lang);
      const cap = t2?.source ? `<p class="sc-cap">${inline(t2.source)}</p>` : "";
      body = `${heading(s)}<div class="sc-content">${tbl}</div>${cap}`;
      break;
    }
    case "diagram": {
      const svg = s.diagram ? diagramSvg(s.diagram, c, 1600, 620, font, t.radius) : placeholder("No diagram", ctx.lang);
      body = `${heading(s)}<div class="sc-content"><div class="sc-fig">${svg}</div>${s.body ? `<p class="sc-cap" style="color:var(--ink2);font-size:26px">${inline(s.body)}</p>` : ""}</div>`;
      break;
    }
    case "image": {
      const src = s.image?.mediaId ? ctx.mediaUrl(s.image.mediaId) : s.image?.url;
      const fig = src
        ? `<div class="sc-fig"><img src="${esc(src)}" alt="${esc(s.image?.alt ?? "")}"></div>`
        : `<div class="sc-placeholder">${esc(s.image?.prompt ? (ctx.lang === "ms" ? "Gambar: " : "Figure: ") + s.image.prompt : ctx.lang === "ms" ? "Tiada gambar dipilih" : "No picture chosen")}</div>`;
      const side = s.bullets?.length ? `<div class="sc-col" style="max-width:560px">${bulletsHtml(s.bullets)}</div>` : "";
      body = `${heading(s)}<div class="sc-content" style="flex-direction:row;gap:40px">${fig}${side}</div>${s.image?.caption ? `<p class="sc-cap">${inline(s.image.caption)}</p>` : ""}`;
      break;
    }
    case "quote":
      body = `${heading(s)}<div class="sc-quote"><p class="q">${inline(s.quote?.text ?? "")}</p>${s.quote?.by ? `<p class="by">${inline(s.quote.by)}</p>` : ""}</div>`;
      break;
    case "kpi": {
      const items = s.kpi ?? [];
      body = `${heading(s)}<div class="sc-kpis" style="--kpi-n:${Math.min(Math.max(items.length, 1), 4)}">${items
        .map((k) => `<div class="sc-kpi"><div class="v">${inline(k.value)}</div><div class="l">${inline(k.label)}</div>${k.note ? `<div class="n">${inline(k.note)}</div>` : ""}</div>`)
        .join("")}</div>${s.body ? `<p class="sc-cap" style="color:var(--ink2);font-size:26px">${inline(s.body)}</p>` : ""}`;
      break;
    }
    default:
      body = `${heading(s)}<div class="sc-content">${bulletsHtml(s.bullets)}</div>`;
  }
  return `<div class="sc-slide sc-${s.layout} sc-style-${t.slideStyle}" style="${themeVars(t)}" data-slide="${esc(s.id)}">${logoHtml(t, ctx)}<div class="sc-body">${body}</div>${chrome(s, t, ctx)}</div>`;
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
