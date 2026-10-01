import fs from "node:fs";
import PptxGenJSImport from "pptxgenjs";
import { glowOf, isStepList, isVersusPair, mapGrid, pieShares, mapTiles, mapTone, particles, ringPercent, sanitizeSlide, sanitizeTheme, seriesPalette, stepRate, tileName, verdictTone, type ChartSpec, type Deck, type DiagramSpec, type ImageRef, type Slide, type Theme } from "@slidecraft/shared";
import { fetchPicture } from "./fetchPicture.js";
import { bloomBackgrounds } from "./bloom.js";
import { getMedia } from "../store.js";
import { fitFont, textHeightIn } from "./textfit.js";

// Native PPTX from the same spec the HTML renderer reads. Sizes are in inches
// on a 13.333 x 7.5 canvas; the HTML canvas is 1920 x 1080, so 1 px = 1/144 in.
const W = 13.333;
const H = 7.5;
const px = (n: number) => n / 144;

// pptxgenjs ships an ESM build, but NodeNext reads its type file as CommonJS,
// so the default import is typed as the module object. Resolve the class at
// runtime and take the instance types off the declaration.
type PptxCtor = (typeof import("pptxgenjs"))["default"];
type Pres = InstanceType<PptxCtor>;
type PSlide = ReturnType<Pres["addSlide"]>;
type TableRows = Parameters<PSlide["addTable"]>[0];
type ChartName = Parameters<PSlide["addChart"]>[0];
const PptxGenJS = ((PptxGenJSImport as unknown as { default?: unknown }).default ?? PptxGenJSImport) as PptxCtor;

function hex(c: string): string {
  let h = String(c ?? "").replace("#", "").toUpperCase();
  if (/^[0-9A-F]{3}$/.test(h)) h = h.replace(/./g, (x) => x + x);
  if (/^[0-9A-F]{8}$/.test(h)) h = h.slice(0, 6);
  return /^[0-9A-F]{6}$/.test(h) ? h : "000000";
}

function plain(s: string): string {
  return String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2").replace(/`([^`]+)`/g, "$1");
}

function fontOk(name: string): string {
  return /^(system-ui|ui-sans-serif)$/i.test(name) ? "Calibri" : name;
}

// The studio style is compared as a string so this file does not depend on the style union
// in the shared package carrying it yet.
function isStudio(t: Theme): boolean {
  return String(t.slideStyle) === "studio";
}

/** Whether a colour reads as dark, for the studio presets whose canvas is near black. */
function isDark(c: string): boolean {
  const h = hex(c);
  const ch = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return 0.299 * ch(0) + 0.587 * ch(2) + 0.114 * ch(4) < 128;
}

/** A line pptxgenjs writes but PowerPoint never draws: the shape has no border. */
function noLine(colour: string): { color: string; transparency: number } {
  return { color: hex(colour), transparency: 100 };
}

/** The studio style's soft accent disc, a quarter of it showing at the top right corner of a content slide. */
function studioDisc(ps: PSlide, c: Ctx): void {
  const col = c.theme.colors;
  const d = px(900);
  ps.addShape(c.pres.ShapeType.ellipse, { x: W - d / 2, y: -d / 2, w: d, h: d, fill: { color: hex(col.brand), transparency: isDark(col.bg) ? 86 : 92 }, line: noLine(col.brand) });
}

interface Ctx {
  pres: Pres;
  theme: Theme;
  userId: string;
  total: number;
  lang: "en" | "ms";
  /** Pictures given by address, fetched safely beforehand: address → "mime;base64,…". */
  urls: Map<string, string>;
}

function mediaData(userId: string, id: string): string | null {
  const m = getMedia(userId, id);
  if (!m || !fs.existsSync(m.path)) return null;
  if (m.mime === "image/svg+xml") return null;
  return `${m.mime};base64,${fs.readFileSync(m.path).toString("base64")}`;
}

function chrome(ps: PSlide, s: Slide, i: number, c: Ctx, dark = false): void {
  const t = c.theme;
  const col = dark ? "FFFFFF" : hex(t.colors.muted);
  const foot: string[] = [];
  if (t.footer) foot.push(t.footer);
  if (t.slideNumbers) foot.push(`${i + 1} / ${c.total}`);
  // Footer on the right, source lines on the left; neither runs into the other.
  const footW = foot.length ? Math.min(px(500), Math.max(px(120), foot.join("    ").length * 0.075)) : 0;
  if (foot.length) {
    const ft = foot.join("    ");
    ps.addText(ft, { x: W - px(120) - footW, y: H - px(96), w: footW, h: px(64), fontSize: fitFont(ft, footW, px(64), 9, 6), color: col, fontFace: fontOk(t.fontBody), align: "right", valign: "bottom", fit: "shrink" });
  }
  if (s.citations?.length && s.layout !== "title") {
    // Source lines fill the strip under the body; one line each while they fit, run together when not.
    const cw = W - px(240) - footW - (footW ? 0.25 : 0), chh = px(80);
    let text = s.citations.map(plain).join("\n");
    let size = fitFont(text, cw, chh, 9, 6);
    if (textHeightIn(text.split("\n"), cw, size) > chh) {
      text = s.citations.map(plain).join("  ·  ");
      size = fitFont(text, cw, chh, 9, 5);
    }
    ps.addText(text, { x: px(120), y: H - px(112), w: cw, h: chh, fontSize: size, color: col, fontFace: fontOk(t.fontBody), valign: "bottom", fit: "shrink" });
  }
  if (t.logoMediaId && s.layout !== "section") {
    const data = mediaData(c.userId, t.logoMediaId);
    if (data) ps.addImage({ data, x: px(120), y: px(44), h: px(56), w: px(200), sizing: { type: "contain", w: px(200), h: px(56) } });
  }
  if (t.tag) {
    const tag = t.tag.toUpperCase();
    ps.addText(tag, { x: W - px(120) - 6, y: px(28), w: 6, h: px(40), fontSize: fitFont(tag, 6, px(40), 9, 6, { bold: true, maxLines: 1 }), bold: true, charSpacing: 2, color: col, fontFace: fontOk(t.fontBody), align: "right", valign: "middle" });
  }
  if (s.notes) ps.addNotes(plain(s.notes));
}

const TONE = { good: { bg: "E3F5EA", ink: "0F5A34" }, mid: { bg: "FFF1D6", ink: "7A4B00" }, bad: { bg: "FDECEC", ink: "8C2323" } } as const;

function cards(ps: PSlide, items: NonNullable<Slide["cards"]>, x: number, y: number, w: number, h: number, c: Ctx): void {
  const col = c.theme.colors;
  const n = items.length;
  const cols = n <= 3 ? Math.max(n, 1) : n === 4 ? 2 : n <= 6 || n === 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const gap = 0.25;
  const cw = (w - gap * (cols - 1)) / cols;
  // Two or more rows share the whole height, as on screen; one row stops at a readable height.
  const ch = rows > 1 ? (h - gap * (rows - 1)) / rows : Math.min(h, 3.2);
  const tw = cw - 0.4;
  // The number row takes a share of short cards rather than a fixed strip, and the heading and
  // detail are sized together (one scale for every card) so both always fit what is left.
  const top = Math.max(0.36, Math.min(0.72, ch * 0.28));
  const dot = Math.max(0.24, Math.min(0.4, top - 0.3));
  const room = ch - top - 0.1;
  // A single row of cards is drawn larger, as on screen.
  const H0 = rows === 1 ? 20 : 15, D0 = rows === 1 ? 14 : 11;
  let hs = H0, ds = D0, headH = 0.3;
  for (let f = 1; f >= 0.3; f -= 0.02) {
    hs = Math.max(5, Math.round(H0 * f * 2) / 2);
    ds = Math.max(4, Math.round(D0 * f * 2) / 2);
    headH = Math.max(...items.map((it) => textHeightIn([plain(it.heading)], tw, hs, { bold: true })));
    const detNeed = Math.max(0, ...items.map((it) => (it.detail ? textHeightIn([plain(it.detail)], tw, ds) : 0)));
    if (headH + 0.04 + detNeed <= room) break;
  }
  const detH = Math.max(0.15, room - headH - 0.04);
  items.forEach((it, i) => {
    const cx = x + (i % cols) * (cw + gap);
    const cy = y + Math.floor(i / cols) * (ch + gap);
    const bloom = c.theme.slideStyle === "bloom";
    // The bloom style alternates white and tint cards and draws no stripe on them.
    if (bloom && i % 2) ps.addShape(c.pres.ShapeType.roundRect, { x: cx, y: cy, w: cw, h: ch, fill: { color: tint(col.brand, "#FFFFFF", 0.07) }, line: { color: tint(col.brand, "#FFFFFF", 0.07) }, rectRadius: Math.min(0.2, px(c.theme.radius)) });
    else panel(ps, cx, cy, cw, ch, c);
    // A design with its own series colours gives each card its own header colour.
    const cc = c.theme.series?.length ? hex(c.theme.series[i % c.theme.series.length]) : hex(col.brand);
    // The studio card has no stripe either: a shadow, a brand disc for the number, nothing else.
    if (!bloom && c.theme.slideStyle !== "briefing" && !isStudio(c.theme)) ps.addShape(c.pres.ShapeType.rect, { x: cx, y: cy, w: cw, h: 0.07, fill: { color: cc }, line: { color: cc } });
    ps.addShape(c.pres.ShapeType.ellipse, { x: cx + 0.2, y: cy + (top - dot) / 2 + 0.03, w: dot, h: dot, fill: { color: cc }, line: { color: cc } });
    ps.addText(String(i + 1), { x: cx + 0.2, y: cy + (top - dot) / 2 + 0.03, w: dot, h: dot, fontSize: Math.round(13 * (dot / 0.4)), bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontOk(c.theme.fontBody) });
    if (it.tag) {
      const tone = verdictTone(it.tag);
      const tagW = Math.min(cw - 0.9, 0.35 + it.tag.length * 0.11);
      ps.addText(it.tag.toUpperCase(), { x: cx + cw - tagW - 0.2, y: cy + (top - 0.3) / 2 + 0.03, w: tagW, h: 0.3, fontSize: fitFont(it.tag.toUpperCase(), tagW, 0.32, 9, 6, { bold: true, maxLines: 1 }), bold: true, align: "center", valign: "middle", color: tone ? TONE[tone].ink : hex(col.brandDeep), fill: { color: tone ? TONE[tone].bg : hex(col.surface) }, fontFace: fontOk(c.theme.fontBody), rectRadius: 0.16, shape: c.pres.ShapeType.roundRect });
    }
    ps.addText(plain(it.heading), { x: cx + 0.2, y: cy + top, w: tw, h: headH, fontSize: hs, bold: true, color: hex(col.ink), fontFace: fontOk(c.theme.fontDisplay), valign: "top", fit: "shrink" });
    if (it.detail) ps.addText(plain(it.detail), { x: cx + 0.2, y: cy + top + headH + 0.04, w: tw, h: detH, fontSize: ds, color: hex(col.ink2), fontFace: fontOk(c.theme.fontBody), valign: "top", fit: "shrink" });
  });
}

/** The title as the theme writes it: in capitals when the design says so. */
function titleText(s: Slide, t: Theme): string {
  return t.upperTitles ? plain(s.title).toUpperCase() : plain(s.title);
}

function title(ps: PSlide, s: Slide, c: Ctx, opts: { y?: number; size?: number; color?: string; kicker?: string } = {}): number {
  const t = c.theme;
  const studio = isStudio(t);
  // The studio title block starts lower to leave room for the accent bar above it.
  const y = opts.y ?? px(studio ? 144 : 96);
  let w = W - px(240);
  if (studio) ps.addShape(c.pres.ShapeType.roundRect, { x: px(120), y: y - px(40), w: px(160), h: px(12), fill: { color: hex(t.colors.brand) }, line: noLine(t.colors.brand), rectRadius: px(6) });
  if (s.badge) {
    // The verdict pill sits top right, level with the title; the title wraps before it.
    const b = plain(s.badge).toUpperCase();
    const bw = Math.min(3, 0.5 + b.length * 0.11);
    const tone = verdictTone(s.badge);
    ps.addText(b, { x: px(120) + w - bw, y: y + (s.kicker ? px(44) : 0), w: bw, h: 0.42, fontSize: fitFont(b, bw - 0.1, 0.42, 12, 7, { bold: true, maxLines: 1 }), bold: true, align: "center", valign: "middle", color: tone ? TONE[tone].ink : hex(t.colors.brandDeep), fill: { color: tone ? TONE[tone].bg : hex(t.colors.surface) }, line: { color: tone ? TONE[tone].bg : hex(t.colors.line), width: 1 }, fontFace: fontOk(t.fontBody), rectRadius: 0.21, shape: c.pres.ShapeType.roundRect });
    w -= bw + 0.25;
  }
  let yy = y;
  const kicker = s.kicker || opts.kicker;
  if (kicker) {
    ps.addText(kicker.toUpperCase(), { x: px(120), y: yy, w, h: px(36), fontSize: fitFont(kicker.toUpperCase(), w, px(36), 12, 8, { bold: true, maxLines: 1 }), bold: true, charSpacing: studio ? 4 : 3, color: opts.color ?? hex(t.slideStyle === "bloom" ? t.colors.accent : t.slideStyle === "briefing" || studio ? t.colors.brand : t.colors.brandDeep), fontFace: fontOk(t.fontBody) });
    yy += px(44);
  }
  // The title takes at most three lines and a quarter of the slide; its box is as tall as its text.
  // The studio title is 72 px on the canvas, which is 36 pt.
  const max = opts.size ?? (studio ? 36 : 30);
  const tt = titleText(s, t);
  const size = fitFont(tt, w, 3 * max * 1.2 / 72 + 0.1, max, 14, { bold: true, maxLines: 3 });
  const h = Math.min(textHeightIn([tt], w, size, { bold: true }), H * 0.28);
  ps.addText(tt, { x: px(120), y: yy, w, h, fontSize: size, bold: true, color: opts.color ?? hex(t.slideStyle === "briefing" ? t.colors.brandDeep : t.colors.ink), fontFace: fontOk(t.fontDisplay), valign: "top", fit: "shrink" });
  let end = yy + h + px(10);
  // The reading line under a content slide's title: at most two lines.
  w = W - px(240);
  if (s.subtitle) {
    const ss = fitFont(plain(s.subtitle), w, 2 * 14 * 1.2 / 72 + 0.1, 14, 9, { maxLines: 2 });
    const sh = textHeightIn([plain(s.subtitle)], w, ss);
    ps.addText(plain(s.subtitle), { x: px(120), y: end, w, h: sh, fontSize: ss, color: hex(t.colors.ink2), fontFace: fontOk(t.fontBody), valign: "top", fit: "shrink" });
    end += sh + px(12);
  }
  return end;
}

function bullets(ps: PSlide, items: string[], x: number, y: number, w: number, h: number, c: Ctx, size?: number): void {
  if (!items.length) return;
  const max = size ?? (items.length <= 4 ? 20 : items.length <= 6 ? 17 : 14);
  const fs = fitFont(items.map(plain), w, h, max, 6, { indentPt: 18, paraSpacePt: 8 });
  ps.addText(
    items.map((b) => ({ text: plain(b), options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: Math.max(2, Math.round((8 * fs) / max)) } })),
    { x, y, w, h, fontSize: fs, color: hex(c.theme.colors.ink), fontFace: fontOk(c.theme.fontBody), valign: "top", fit: "shrink" },
  );
}

/** A text box whose font is sized to the box. */
function fitText(ps: PSlide, text: string, box: { x: number; y: number; w: number; h: number }, max: number, style: Record<string, unknown>, min = 6, bold = false): void {
  const t = plain(text);
  ps.addText(t, { ...box, ...style, bold: bold || (style.bold as boolean | undefined), fontSize: fitFont(t, box.w, box.h, max, min, { bold: bold || !!style.bold }), fit: "shrink" });
}

function panel(ps: PSlide, x: number, y: number, w: number, h: number, c: Ctx): void {
  // The briefing style's panel: pale blue, no border, no shadow.
  if (c.theme.slideStyle === "briefing") {
    ps.addShape(c.pres.ShapeType.roundRect, { x, y, w, h, fill: { color: hex(c.theme.colors.surface) }, line: { color: hex(c.theme.colors.surface), width: 0.5 }, rectRadius: Math.min(0.15, px(c.theme.radius)) });
    return;
  }
  // The studio style's card: the surface colour, no border, a soft close shadow.
  if (isStudio(c.theme)) {
    ps.addShape(c.pres.ShapeType.roundRect, { x, y, w, h, fill: { color: hex(c.theme.colors.surface) }, line: noLine(c.theme.colors.surface), rectRadius: Math.min(0.25, px(c.theme.radius)), shadow: { type: "outer", blur: 12, offset: 4, angle: 90, color: "000000", opacity: 0.08 } });
    return;
  }
  // The bloom style's card: white, no border, a soft wide shadow.
  if (c.theme.slideStyle === "bloom") {
    ps.addShape(c.pres.ShapeType.roundRect, { x, y, w, h, fill: { color: hex(c.theme.colors.surface) }, line: { color: hex(c.theme.colors.surface), width: 0.5 }, rectRadius: Math.min(0.23, px(c.theme.radius)), shadow: { type: "outer", blur: 20, offset: 6, angle: 90, color: "0B1B3A", opacity: 0.1 } });
    return;
  }
  ps.addShape(c.pres.ShapeType.roundRect, { x, y, w, h, fill: { color: hex(c.theme.colors.surface) }, line: { color: hex(c.theme.colors.line), width: 1 }, rectRadius: Math.min(0.2, px(c.theme.radius)) });
}

/**
 * PowerPoint draws bar categories bottom up; the slide reads top down, as in the editor. pptxgenjs
 * writes the value into <c:orientation> as given, though its type file only names "minMax".
 */
function barOrder(ch: ChartSpec): "minMax" {
  return (ch.kind === "bar" ? "maxMin" : "minMax") as "minMax";
}

function chart(ps: PSlide, ch: ChartSpec, x: number, y: number, w: number, h: number, c: Ctx): void {
  const P = c.pres;
  const kindMap: Record<ChartSpec["kind"], string> = { column: P.ChartType.bar, bar: P.ChartType.bar, line: P.ChartType.line, area: P.ChartType.area, pie: P.ChartType.pie, doughnut: P.ChartType.doughnut };
  const pal = seriesPalette(c.theme.colors, c.theme.series).map(hex);
  const pie = ch.kind === "pie" || ch.kind === "doughnut";
  // Brand against comparators: the highlighted category and the rest as two stacked series, one of them zero
  // at every bar, so each bar takes its own colour in a native chart.
  if (ch.highlight && ch.series.length === 1 && (ch.kind === "bar" || ch.kind === "column")) {
    const v = ch.series[0].values;
    const mine = v.map((n, i) => (ch.categories[i] === ch.highlight ? n : 0));
    const rest = v.map((n, i) => (ch.categories[i] === ch.highlight ? 0 : n));
    ps.addChart(P.ChartType.bar as ChartName, [
      { name: ch.highlight, labels: ch.categories, values: mine },
      { name: ch.series[0].name || "Others", labels: ch.categories, values: rest },
    ], {
      x, y, w, h,
      barDir: ch.kind === "bar" ? "bar" : "col",
      barGrouping: "stacked",
      catAxisOrientation: barOrder(ch),
      chartColors: [pal[0], "A7B0BC"],
      showLegend: false,
      catAxisLabelColor: hex(c.theme.colors.ink2),
      valAxisLabelColor: hex(c.theme.colors.muted),
      catAxisLabelFontSize: 11,
      valAxisLabelFontSize: 10,
      valGridLine: { color: hex(c.theme.colors.line), style: "solid", size: 0.5 },
      catGridLine: { style: "none" },
      showValue: true,
      dataLabelFontSize: 10,
      dataLabelColor: hex(c.theme.colors.ink),
      dataLabelFormatCode: "#,##0.##;-#,##0.##;;",
      valAxisTitle: ch.unit || undefined,
      showValAxisTitle: !!ch.unit,
      valAxisTitleFontSize: 10,
      valAxisTitleColor: hex(c.theme.colors.muted),
      fontFace: fontOk(c.theme.fontBody),
    });
    return;
  }
  const data = ch.series.map((s) => ({ name: s.name, labels: ch.categories, values: s.values }));
  ps.addChart(kindMap[ch.kind] as ChartName, data, {
    x, y, w, h,
    barDir: ch.kind === "bar" ? "bar" : "col",
    catAxisOrientation: barOrder(ch),
    chartColors: pie ? pal : pal.slice(0, ch.series.length),
    showLegend: pie || ch.series.length > 1,
    legendPos: pie ? "r" : "b",
    legendFontSize: 11,
    legendColor: hex(c.theme.colors.ink2),
    catAxisLabelColor: hex(c.theme.colors.ink2),
    valAxisLabelColor: hex(c.theme.colors.muted),
    catAxisLabelFontSize: 11,
    valAxisLabelFontSize: 10,
    valGridLine: { color: hex(c.theme.colors.line), style: "solid", size: 0.5 },
    catGridLine: { style: "none" },
    showValue: ch.series.length === 1 && !pie,
    dataLabelFontSize: 10,
    dataLabelColor: hex(c.theme.colors.ink),
    showPercent: pie,
    valAxisTitle: ch.unit || undefined,
    showValAxisTitle: !!ch.unit && !pie,
    valAxisTitleFontSize: 10,
    valAxisTitleColor: hex(c.theme.colors.muted),
    holeSize: ch.kind === "doughnut" ? 55 : undefined,
    fontFace: fontOk(c.theme.fontBody),
  });
}

/** Row heights (in) for a table at a font size: each row as tall as its tallest cell. */
function rowHeights(rows: string[][], colW: number[], size: number, bold: (r: number, c: number) => boolean): number[] {
  // Table cells have PowerPoint's default 0.1 in side and 0.05 in top and bottom margins.
  return rows.map((r, ri) => Math.max(...r.map((v, ci) => textHeightIn([v], colW[ci] ?? colW[0], size, { bold: bold(ri, ci) })), size * 1.2 / 72 + 0.1));
}

/** The largest table font at which every row fits the height, with the row heights to use. */
function fitTable(rows: string[][], colW: number[], h: number, max: number, min = 3): { size: number; heights: number[] } {
  for (let size = max; size >= min; size -= 0.5) {
    const heights = rowHeights(rows, colW, size, (r) => r === 0);
    if (heights.reduce((a, b) => a + b, 0) <= h) return { size, heights };
  }
  return { size: min, heights: rowHeights(rows, colW, min, (r) => r === 0) };
}

function table(ps: PSlide, t: NonNullable<Slide["table"]>, x: number, y: number, w: number, h: number, c: Ctx): void {
  const colW = Array(t.header.length).fill(w / Math.max(t.header.length, 1));
  const text = [t.header.map(plain), ...t.rows.map((r) => r.map(plain))];
  // A short table is drawn large, as on screen, rather than as a strip at the top of the slide.
  const few = t.rows.length <= 5;
  const fit = fitTable(text, colW, h, few ? 16 : 13);
  const size = fit.size;
  // A short table's rows are opened up to fill most of the space, as the screen pads them.
  const used = fit.heights.reduce((a, b) => a + b, 0);
  const want = few ? Math.min(h, (t.rows.length + 1) * 0.75) : used;
  const heights = want > used ? fit.heights.map((x) => x + (want - used) / fit.heights.length) : fit.heights;
  const col = c.theme.colors;
  // The briefing style: a navy header row, zebra rows, the first column bold in navy.
  const brief = c.theme.slideStyle === "briefing";
  // The studio style: a brand header row, rows alternating the canvas and surface colours, no rules.
  const studio = isStudio(c.theme);
  const rows: TableRows = [
    t.header.map((hd) => ({ text: plain(hd), options: { bold: true, color: brief || studio ? "FFFFFF" : hex(col.brandDeep), fill: { color: brief ? hex(col.brandDeep) : studio ? hex(col.brand) : hex(col.surface) }, fontSize: size } })),
    ...t.rows.map((r, ri) =>
      r.map((v, ci) => {
        const tone = verdictTone(plain(v));
        const zebra = studio ? hex(ri % 2 ? col.surface : col.bg) : brief && ri % 2 ? "F5F8FD" : "FFFFFF";
        return { text: plain(v), options: tone ? { color: TONE[tone].ink, fill: { color: TONE[tone].bg }, bold: true, fontSize: size } : { color: brief && ci === 0 ? hex(col.brandDeep) : hex(col.ink), bold: brief && ci === 0, fill: { color: zebra }, fontSize: size } };
      }),
    ),
  ];
  ps.addTable(rows, { x, y, w, colW, border: studio ? { type: "none" } : { type: "solid", color: hex(c.theme.colors.line), pt: 0.75 }, fontFace: fontOk(c.theme.fontBody), valign: "middle", autoPage: false, rowH: heights });
}

const YES_RE = /^(yes|ya|✓|true|wajib|required|mandatory)$/i;
const NO_RE = /^(no|tidak|✗|false|x)$/i;

function diagram(ps: PSlide, d: DiagramSpec, x: number, y: number, w: number, h: number, c: Ctx): void {
  const P = c.pres;
  const col = c.theme.colors;
  if (d.kind === "flow") {
    const n = d.steps.length;
    const rows = n > 5 ? 2 : 1;
    const per = Math.ceil(n / rows);
    const gap = 0.35;
    const bw = (w - gap * (per - 1)) / per;
    const bh = rows === 1 ? Math.min(h * 0.6, 2.1) : (h - 0.5) / 2;
    // Every step shares one label size and one detail size.
    const labH = Math.min(0.9, bh * 0.35);
    const detH = Math.max(0.2, bh - 0.6 - labH - 0.1);
    const ls = Math.min(...d.steps.map((st) => fitFont(plain(st.label), bw - 0.3, labH, 13, 7, { bold: true })));
    const ds = Math.min(...d.steps.map((st) => (st.detail ? fitFont(plain(st.detail), bw - 0.3, detH, 10, 6) : 10)));
    d.steps.forEach((s, i) => {
      const r = Math.floor(i / per), k = i % per;
      const bx = x + k * (bw + gap);
      const by = rows === 1 ? y + (h - bh) / 2 : y + r * (bh + 0.5);
      panel(ps, bx, by, bw, bh, c);
      ps.addShape(P.ShapeType.ellipse, { x: bx + 0.15, y: by + 0.15, w: 0.36, h: 0.36, fill: { color: hex(col.brand) }, line: { color: hex(col.brand) } });
      ps.addText(String(i + 1), { x: bx + 0.15, y: by + 0.15, w: 0.36, h: 0.36, fontSize: 11, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontOk(c.theme.fontBody) });
      ps.addText(plain(s.label), { x: bx + 0.15, y: by + 0.6, w: bw - 0.3, h: labH, fontSize: ls, bold: true, color: hex(col.ink), fontFace: fontOk(c.theme.fontBody), valign: "top", fit: "shrink" });
      if (s.detail) ps.addText(plain(s.detail), { x: bx + 0.15, y: by + 0.6 + labH + 0.05, w: bw - 0.3, h: detH, fontSize: ds, color: hex(col.ink2), fontFace: fontOk(c.theme.fontBody), valign: "top", fit: "shrink" });
      if (i < n - 1) {
        if (k < per - 1) ps.addShape(P.ShapeType.line, { x: bx + bw + 0.05, y: by + bh / 2, w: gap - 0.1, h: 0, line: { color: hex(col.brandDeep), width: 2, endArrowType: "triangle" } });
        else ps.addShape(P.ShapeType.line, { x: bx + bw / 2, y: by + bh + 0.05, w: 0, h: 0.4, line: { color: hex(col.brandDeep), width: 2, endArrowType: "triangle" } });
      }
    });
  } else if (d.kind === "timeline") {
    const n = d.events.length;
    const cy = y + h / 2;
    ps.addShape(P.ShapeType.line, { x: x + 0.3, y: cy, w: w - 0.6, h: 0, line: { color: hex(col.line), width: 4 } });
    const step = (w - 0.6) / Math.max(n - 1, 1);
    d.events.forEach((e, i) => {
      const cx = n === 1 ? x + w / 2 : x + 0.3 + step * i;
      const up = i % 2 === 0;
      ps.addShape(P.ShapeType.ellipse, { x: cx - 0.14, y: cy - 0.14, w: 0.28, h: 0.28, fill: { color: hex(col.brand) }, line: { color: "FFFFFF", width: 2 } });
      const tw = Math.max(step, 1.6);
      ps.addText(e.when, { x: cx - tw / 2, y: up ? cy - 0.75 : cy + 0.3, w: tw, h: 0.35, fontSize: fitFont(e.when, tw, 0.35, 12, 7, { bold: true, maxLines: 1 }), bold: true, color: hex(col.brandDeep), align: "center", fontFace: fontOk(c.theme.fontBody) });
      const lh = Math.min(h / 2 - 0.75, 1.6);
      ps.addText(plain(e.label), { x: cx - tw / 2, y: up ? cy - 0.8 - lh : cy + 0.65, w: tw, h: lh, fontSize: fitFont(plain(e.label), tw, lh, 11, 6), color: hex(col.ink), align: "center", valign: up ? "bottom" : "top", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
    });
  } else if (d.kind === "hub") {
    hub(ps, d, x, y, w, h, c);
  } else if (d.kind === "funnel") {
    funnel(ps, d, x, y, w, h, c);
  } else if (d.kind === "equation") {
    equation(ps, d, x, y, w, h, c);
  } else {
    const colW = [2.2, ...Array(d.cols.length).fill((w - 2.2) / Math.max(d.cols.length, 1))];
    const mark = (v: string) => YES_RE.test(v.trim()) || NO_RE.test(v.trim());
    const text = [["", ...d.cols.map(plain)], ...d.rows.map((r, i) => [plain(r), ...d.cols.map((_, j) => (mark(d.cells[i]?.[j] ?? "") ? "✓" : plain(d.cells[i]?.[j] ?? "")))])];
    const { size: ms, heights } = fitTable(text, colW, h, 12);
    const rows: TableRows = [
      ["", ...d.cols].map((v) => ({ text: plain(v), options: { bold: true, color: hex(col.brandDeep), fontSize: ms, align: "center" as const } })),
      ...d.rows.map((r, i) => [{ text: plain(r), options: { bold: true, color: hex(col.ink), fontSize: ms } }, ...d.cols.map((_, j) => {
        const v = d.cells[i]?.[j] ?? "";
        const yes = YES_RE.test(v.trim());
        const no = NO_RE.test(v.trim());
        return { text: yes ? "✓" : no ? "✗" : plain(v), options: { color: yes ? hex(col.brand) : hex(col.ink2), fontSize: yes || no ? Math.min(16, ms + 3) : ms, align: "center" as const, bold: yes } };
      })]),
    ];
    ps.addTable(rows, { x, y, w, colW, border: { type: "solid", color: hex(col.line), pt: 0.75 }, fontFace: fontOk(c.theme.fontBody), autoPage: false, rowH: heights });
  }
}


type Hub = Extract<DiagramSpec, { kind: "hub" }>;
type Funnel = Extract<DiagramSpec, { kind: "funnel" }>;
type Equation = Extract<DiagramSpec, { kind: "equation" }>;

/** The mechanism map: a disc in the middle, benefits either side joined to it, metric pills underneath. */
function hub(ps: PSlide, d: Hub, x: number, y: number, w: number, h: number, c: Ctx): void {
  const P = c.pres;
  const col = c.theme.colors;
  const pillH = d.pills?.length ? 0.45 : 0;
  const mapH = h - (pillH ? pillH + 0.2 : 0);
  const disc = Math.min(2.4, mapH * 0.85, w * 0.24);
  const cx = x + w / 2, cy = y + mapH / 2;
  const sideW = (w - disc) / 2 - 0.45;
  const half = Math.ceil(d.nodes.length / 2);
  const sides = [d.nodes.slice(0, half), d.nodes.slice(half)];
  const most = Math.max(sides[0].length, sides[1].length, 1);
  const gap = 0.14;
  const nh = Math.min(1.1, (mapH - gap * (most - 1)) / most);
  const labH = Math.min(0.4, nh * 0.42);
  const ls = Math.min(...d.nodes.map((n) => fitFont(plain(n.label), sideW - 0.3, labH, 13, 7, { bold: true })));
  const ds = Math.min(10, ...d.nodes.map((n) => (n.detail ? fitFont(plain(n.detail), sideW - 0.3, nh - labH - 0.12, 10, 6) : 10)));
  sides.forEach((list, si) => {
    const left = si === 0;
    const nx = left ? x : x + w - sideW;
    const top = cy - (list.length * nh + gap * (list.length - 1)) / 2;
    list.forEach((n, i) => {
      const ny = top + i * (nh + gap);
      panel(ps, nx, ny, sideW, nh, c);
      ps.addShape(P.ShapeType.rect, { x: left ? nx + sideW - 0.06 : nx, y: ny, w: 0.06, h: nh, fill: { color: hex(col.brand) }, line: { color: hex(col.brand) } });
      ps.addText(plain(n.label), { x: nx + 0.15, y: ny + 0.06, w: sideW - 0.3, h: labH, fontSize: ls, bold: true, color: hex(col.ink), align: left ? "right" : "left", valign: "top", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
      if (n.detail) ps.addText(plain(n.detail), { x: nx + 0.15, y: ny + 0.06 + labH, w: sideW - 0.3, h: Math.max(0.2, nh - labH - 0.12), fontSize: ds, color: hex(col.ink2), align: left ? "right" : "left", valign: "top", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
      const ly = ny + nh / 2;
      const x1 = left ? nx + sideW : cx + disc / 2;
      const x2 = left ? cx - disc / 2 : nx;
      ps.addShape(P.ShapeType.line, { x: Math.min(x1, x2), y: ly, w: Math.abs(x2 - x1), h: 0, line: { color: hex(col.line), width: 1.5 } });
    });
  });
  ps.addShape(P.ShapeType.ellipse, { x: cx - disc / 2 - 0.12, y: cy - disc / 2 - 0.12, w: disc + 0.24, h: disc + 0.24, fill: { color: hex(col.brand), transparency: 80 }, line: { color: hex(col.brand), transparency: 100 } });
  ps.addShape(P.ShapeType.ellipse, { x: cx - disc / 2, y: cy - disc / 2, w: disc, h: disc, fill: { color: hex(col.brandDeep) }, line: { color: hex(col.brandDeep) } });
  const ct = plain(d.center);
  ps.addText(ct, { x: cx - disc / 2 + 0.2, y: cy - disc / 2 + 0.2, w: disc - 0.4, h: disc - 0.4, fontSize: fitFont(ct, disc - 0.4, disc - 0.4, 20, 8, { bold: true }), bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontOk(c.theme.fontDisplay), fit: "shrink" });
  if (d.pills?.length) {
    const n = d.pills.length;
    const pw = Math.min(3, (w - 0.2 * (n - 1)) / n);
    const px0 = x + (w - (pw * n + 0.2 * (n - 1))) / 2;
    d.pills.forEach((p, i) => {
      const tx = plain(p);
      ps.addText(tx, { x: px0 + i * (pw + 0.2), y: y + h - pillH, w: pw, h: pillH, fontSize: fitFont(tx, pw - 0.2, pillH, 12, 7, { bold: true, maxLines: 1 }), bold: true, align: "center", valign: "middle", color: hex(col.brandDeep), fill: { color: hex(col.surface) }, line: { color: hex(col.brand), width: 1 }, rectRadius: pillH / 2, shape: P.ShapeType.roundRect, fontFace: fontOk(c.theme.fontBody) });
    });
  }
}

/** Chevrons with a big number in each, what it counts underneath, and how many carried over. */
function funnel(ps: PSlide, d: Funnel, x: number, y: number, w: number, h: number, c: Ctx): void {
  const P = c.pres;
  const col = c.theme.colors;
  const pal = seriesPalette(col, c.theme.series).map(hex);
  const n = d.stages.length;
  const sw = w / n;
  const ch = Math.min(1.6, h * 0.45);
  const top = y + (h - ch - 1.2) / 2;
  const vs = Math.min(...d.stages.map((st) => fitFont(st.value, sw - 0.7, ch - 0.2, 44, 10, { bold: true, maxLines: 1 })));
  const ls = Math.min(...d.stages.map((st) => fitFont(plain(st.label), sw - 0.2, 0.7, 13, 7)));
  d.stages.forEach((st, i) => {
    const sx = x + i * sw;
    const shade = n > 1 && !c.theme.series?.length ? (i * 60) / (n - 1) : 0;
    const fill = c.theme.series?.length ? pal[i % pal.length] : hex(col.brandDeep);
    ps.addText(st.value, { x: sx, y: top, w: sw + 0.05, h: ch, shape: i === 0 ? P.ShapeType.homePlate : P.ShapeType.chevron, fill: { color: fill, transparency: shade }, line: { color: fill, transparency: 100 }, fontSize: vs, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontOk(c.theme.fontDisplay) });
    ps.addText(plain(st.label), { x: sx + 0.1, y: top + ch + 0.12, w: sw - 0.2, h: 0.7, fontSize: ls, bold: true, color: hex(col.ink), align: "center", valign: "top", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
    const rate = i > 0 ? stepRate(d.stages[i - 1].value, st.value) : "";
    if (rate) ps.addText(rate, { x: sx + 0.1, y: top + ch + 0.84, w: sw - 0.2, h: 0.32, fontSize: 10, color: hex(col.muted), align: "center", valign: "top", fontFace: fontOk(c.theme.fontBody) });
  });
}

/** Terms joined by + and = into a result, the result filled in the deep brand colour. */
function equation(ps: PSlide, d: Equation, x: number, y: number, w: number, h: number, c: Ctx): void {
  const P = c.pres;
  const col = c.theme.colors;
  const items = [...d.terms.map((t) => ({ ...t, res: false })), ...(d.result ? [{ ...d.result, res: true }] : [])];
  const ops = items.length - 1;
  const opW = 0.5;
  const bw = (w - ops * opW) / items.length;
  const bh = Math.min(2.4, h * 0.8);
  const by = y + (h - bh) / 2;
  const vs = Math.min(...items.map((t) => fitFont(t.value, bw - 0.3, bh * 0.45, 36, 10, { bold: true, maxLines: 1 })));
  const ls = Math.min(...items.map((t) => fitFont(plain(t.label), bw - 0.3, bh * 0.4, 13, 7)));
  items.forEach((t, i) => {
    const bx = x + i * (bw + opW);
    if (t.res) ps.addShape(P.ShapeType.roundRect, { x: bx, y: by, w: bw, h: bh, fill: { color: hex(col.brandDeep) }, line: { color: hex(col.brandDeep) }, rectRadius: Math.min(0.2, px(c.theme.radius)) });
    else panel(ps, bx, by, bw, bh, c);
    ps.addText(t.value, { x: bx + 0.15, y: by + bh * 0.1, w: bw - 0.3, h: bh * 0.45, fontSize: vs, bold: true, color: t.res ? "FFFFFF" : hex(col.brandDeep), align: "center", valign: "bottom", fontFace: fontOk(c.theme.fontDisplay) });
    ps.addText(plain(t.label), { x: bx + 0.15, y: by + bh * 0.57, w: bw - 0.3, h: bh * 0.38, fontSize: ls, color: t.res ? "FFFFFF" : hex(col.ink2), align: "center", valign: "top", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
    if (i < ops) ps.addText(i === ops - 1 && d.result ? "=" : "+", { x: bx + bw, y: by, w: opW, h: bh, fontSize: 30, bold: true, color: hex(col.brand), align: "center", valign: "middle", fontFace: fontOk(c.theme.fontBody) });
  });
}

/** Figures as ring gauges: a native doughnut per figure, the figure in its hole. */
function rings(ps: PSlide, items: NonNullable<Slide["kpi"]>, x: number, y: number, w: number, h: number, c: Ctx): void {
  const P = c.pres;
  const col = c.theme.colors;
  const pal = seriesPalette(col, c.theme.series).map(hex);
  const n = Math.min(Math.max(items.length, 1), 4);
  const rowsN = Math.max(1, Math.ceil(items.length / 4));
  const cw = w / n;
  const rowH = h / rowsN;
  const d = Math.min(cw - 0.4, rowH - 1.1, 2.4);
  items.forEach((k, i) => {
    const cx = x + (i % 4) * cw + cw / 2;
    const top = y + Math.floor(i / 4) * rowH + (rowH - d - 1) / 2;
    const p = ringPercent(k.value);
    ps.addChart(P.ChartType.doughnut as ChartName, [{ name: plain(k.label), labels: ["", ""], values: p === null ? [0, 100] : [p, 100 - p] }], {
      x: cx - d / 2, y: top, w: d, h: d,
      holeSize: 72,
      chartColors: [pal[i % pal.length], hex(col.line)],
      showLegend: false,
      showValue: false,
      showPercent: false,
      showLabel: false,
      showTitle: false,
      dataBorder: { pt: 0.5, color: hex(col.bg) },
    });
    const v = plain(k.value);
    ps.addText(v, { x: cx - d * 0.34, y: top + d * 0.3, w: d * 0.68, h: d * 0.4, fontSize: fitFont(v, d * 0.68, d * 0.4, 30, 9, { bold: true, maxLines: 1 }), bold: true, color: hex(col.brandDeep), align: "center", valign: "middle", fontFace: fontOk(c.theme.fontDisplay) });
    ps.addText(plain(k.label), { x: cx - cw / 2 + 0.1, y: top + d + 0.08, w: cw - 0.2, h: 0.5, fontSize: fitFont(plain(k.label), cw - 0.2, 0.5, 13, 7, { bold: true }), bold: true, color: hex(col.ink), align: "center", valign: "top", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
    if (k.note) ps.addText(plain(k.note), { x: cx - cw / 2 + 0.1, y: top + d + 0.58, w: cw - 0.2, h: 0.4, fontSize: fitFont(plain(k.note), cw - 0.2, 0.4, 10, 6), color: hex(col.muted), align: "center", valign: "top", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
  });
}

/** Label and value rows; the highlighted row shaded in the accent. */
function facts(ps: PSlide, items: NonNullable<Slide["facts"]>, x: number, y: number, w: number, h: number, c: Ctx): void {
  const col = c.theme.colors;
  const lw = Math.max(2.2, w * 0.3);
  const colW = [lw, w - lw];
  const text = items.map((f) => [plain(f.label).toUpperCase(), plain(f.value)]);
  const { size, heights } = fitTable(text, colW, h, 14);
  const rows: TableRows = items.map((f, i) => {
    const tone = verdictTone(plain(f.value));
    const shade = f.highlight ? tint(col.accent, col.surface, 0.18) : hex(col.surface);
    return [
      { text: text[i][0], options: { bold: true, color: hex(col.brandDeep), fill: { color: f.highlight ? tint(col.accent, col.surface, 0.3) : tint(col.brand, col.surface, 0.1) }, fontSize: Math.max(5, size - 2), charSpacing: 1 } },
      { text: text[i][1], options: tone ? { bold: true, color: TONE[tone].ink, fill: { color: TONE[tone].bg }, fontSize: size } : { color: hex(col.ink), fill: { color: shade }, bold: !!f.highlight, fontSize: size } },
    ];
  });
  ps.addTable(rows, { x, y, w, colW, border: { type: "solid", color: hex(col.line), pt: 0.75 }, fontFace: fontOk(c.theme.fontBody), valign: "middle", autoPage: false, rowH: heights });
}

/** A colour mixed toward another: amount 0 is the second colour, 1 the first. */
function tint(a: string, b: string, amount: number): string {
  const pa = hex(a), pb = hex(b);
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return [0, 2, 4].map((i) => Math.round(ch(pa, i) * amount + ch(pb, i) * (1 - amount)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function pictureData(img: ImageRef | undefined, c: Ctx): string | null {
  if (!img) return null;
  if (img.mediaId) return mediaData(c.userId, img.mediaId);
  return img.url ? c.urls.get(img.url) ?? null : null;
}

/** Pictures in a grid, each with its caption under it. */
function gallery(ps: PSlide, items: ImageRef[], x: number, y: number, w: number, h: number, c: Ctx): void {
  const col = c.theme.colors;
  const n = items.length;
  const cols = n <= 4 ? Math.max(n, 1) : 3;
  const rowsN = Math.ceil(n / cols);
  const gap = 0.2;
  const cw = (w - gap * (cols - 1)) / cols;
  const rh = (h - gap * (rowsN - 1)) / rowsN;
  const capH = items.some((g) => g.caption) ? Math.min(0.45, rh * 0.22) : 0;
  items.forEach((g, i) => {
    const gx = x + (i % cols) * (cw + gap);
    const gy = y + Math.floor(i / cols) * (rh + gap);
    const ph = rh - capH - (capH ? 0.06 : 0);
    const data = pictureData(g, c);
    if (data) ps.addImage({ data, x: gx, y: gy, w: cw, h: ph, sizing: { type: "cover", w: cw, h: ph } });
    else {
      ps.addShape(c.pres.ShapeType.roundRect, { x: gx, y: gy, w: cw, h: ph, fill: { color: hex(col.surface) }, line: { color: hex(col.line), width: 1.5, dashType: "dash" }, rectRadius: 0.1 });
      const t = plain(g.prompt || (c.lang === "ms" ? "Tiada gambar" : "No picture"));
      ps.addText(t, { x: gx + 0.1, y: gy, w: cw - 0.2, h: ph, fontSize: fitFont(t, cw - 0.2, ph, 11, 6), color: hex(col.muted), align: "center", valign: "middle", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
    }
    if (g.caption) ps.addText(plain(g.caption), { x: gx, y: gy + ph + 0.06, w: cw, h: capH, fontSize: fitFont(plain(g.caption), cw, capH, 11, 6), color: hex(col.ink2), valign: "top", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
  });
}

const MAP_FILL = { good: { bg: "2E9E6A", ink: "FFFFFF" }, mid: { bg: "E8A13B", ink: "2B1B00" }, bad: { bg: "D64545", ink: "FFFFFF" } } as const;

/** The tile map on the left, the countries with their status and note on the right. */
function countryMap(ps: PSlide, m: NonNullable<Slide["map"]>, x: number, y: number, w: number, h: number, c: Ctx): void {
  const col = c.theme.colors;
  const tiles = mapTiles(m.region, m.areas.map((a) => a.code));
  const grid = mapGrid(tiles);
  const by = new Map(m.areas.map((a) => [a.code, a]));
  const mapW = w * 0.56;
  const gap = 0.06;
  const cell = Math.min((mapW - gap * (grid.cols - 1)) / grid.cols, (h - gap * (grid.rows - 1)) / grid.rows);
  const gx = x + (mapW - (cell * grid.cols + gap * (grid.cols - 1))) / 2;
  const gy = y + (h - (cell * grid.rows + gap * (grid.rows - 1))) / 2;
  const fillOf = (status: string | undefined) => {
    const tone = status === undefined ? "none" : mapTone(status);
    if (tone === "good" || tone === "mid" || tone === "bad") return MAP_FILL[tone];
    if (tone === "info") return { bg: hex(col.brand), ink: "FFFFFF" };
    return { bg: tint(col.line, col.surface, 0.7), ink: hex(col.muted) };
  };
  for (const t of tiles) {
    const a = by.get(t.code);
    const f = fillOf(a?.status);
    const at = grid.at(t);
    const tx = gx + at.col * (cell + gap), ty = gy + at.row * (cell + gap);
    ps.addShape(c.pres.ShapeType.roundRect, { x: tx, y: ty, w: cell, h: cell, fill: { color: f.bg }, line: { color: f.bg }, rectRadius: Math.min(0.08, cell * 0.12) });
    const lines = a?.status ? [{ text: t.code, options: { bold: true, fontSize: Math.max(6, Math.min(14, cell * 14)), breakLine: true } }, { text: plain(a.status), options: { fontSize: Math.max(5, Math.min(8, cell * 8)) } }] : [{ text: t.code, options: { bold: true, fontSize: Math.max(6, Math.min(14, cell * 14)) } }];
    ps.addText(lines, { x: tx, y: ty, w: cell, h: cell, color: f.ink, align: "center", valign: "middle", fontFace: fontOk(c.theme.fontBody), fit: "shrink", margin: 1 });
  }
  const kx = x + mapW + 0.35;
  const kw = w - mapW - 0.35;
  let ky = y;
  if (m.legend) {
    const lh = Math.min(0.6, textHeightIn([plain(m.legend)], kw, 12, { bold: true }));
    ps.addText(plain(m.legend), { x: kx, y: ky, w: kw, h: lh, fontSize: fitFont(plain(m.legend), kw, lh, 12, 7, { bold: true }), bold: true, color: hex(col.ink2), valign: "top", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
    ky += lh + 0.12;
  }
  // One size for every row, the largest at which the rows, each one text box as tall as its own text, fill the column.
  const room = y + h - ky;
  const sw = 0.16;
  const tw = kw - sw - 0.08;
  const head = (a: (typeof m.areas)[number]) => `${tileName(a.code, c.lang)}${a.status ? `: ${plain(a.status)}` : ""}`;
  // A row's box: the name line at the size, the note under it two points smaller, one set of insets.
  const rowH = (a: (typeof m.areas)[number], size: number) => {
    const ns = Math.max(3, size - 2);
    return textHeightIn([head(a)], tw, size, { bold: true }) + (a.note ? textHeightIn([plain(a.note)], tw, ns) - 0.1 : 0);
  };
  let size = 13;
  while (size > 3 && m.areas.reduce((sum, a) => sum + rowH(a, size), 0) > room) size -= 0.5;
  let ry = ky;
  m.areas.forEach((a) => {
    const f = fillOf(a.status);
    const ns = Math.max(3, size - 2);
    const hh = rowH(a, size);
    // The swatch is as tall as the name line, never taller.
    const sq = Math.min(sw, (size * 0.9) / 72);
    ps.addShape(c.pres.ShapeType.roundRect, { x: kx + (sw - sq), y: ry + 0.05 + ((size * 1.2) / 72 - sq) / 2, w: sq, h: sq, fill: { color: f.bg }, line: { color: f.bg }, rectRadius: 0.03 });
    const parts = [
      { text: head(a), options: { bold: true, color: hex(col.ink), fontSize: size, breakLine: !!a.note } },
      ...(a.note ? [{ text: plain(a.note), options: { color: hex(col.muted), fontSize: ns } }] : []),
    ];
    ps.addText(parts, { x: kx + sw + 0.08, y: ry, w: tw, h: hh, valign: "top", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
    ry += hh;
  });
}

/** Side panels, stacked in the right column: a brand tint, then an accent tint. */
function asides(ps: PSlide, list: NonNullable<Slide["aside"]>, x: number, y: number, w: number, h: number, c: Ctx): void {
  const col = c.theme.colors;
  const gap = 0.2;
  const each = (h - gap * (list.length - 1)) / list.length;
  list.forEach((a, i) => {
    const ay = y + i * (each + gap);
    const edge = i === 0 ? col.brand : col.accent;
    ps.addShape(c.pres.ShapeType.roundRect, { x, y: ay, w, h: each, fill: { color: tint(edge, col.surface, 0.1) }, line: { color: tint(edge, col.surface, 0.1) }, rectRadius: Math.min(0.15, px(c.theme.radius)) });
    ps.addShape(c.pres.ShapeType.rect, { x, y: ay, w: 0.06, h: each, fill: { color: hex(edge) }, line: { color: hex(edge) } });
    let ty = ay + 0.15;
    if (a.heading) {
      const hd = plain(a.heading).toUpperCase();
      ps.addText(hd, { x: x + 0.22, y: ty, w: w - 0.35, h: 0.32, fontSize: fitFont(hd, w - 0.35, 0.32, 11, 7, { bold: true, maxLines: 1 }), bold: true, charSpacing: 2, color: hex(col.brandDeep), fontFace: fontOk(c.theme.fontBody), valign: "top" });
      ty += 0.38;
    }
    if (a.items.length) bullets(ps, a.items, x + 0.2, ty, w - 0.35, ay + each - ty - 0.1, c, 12);
  });
}

/** Say against don't say: a green column of ticks and a red column of crosses, one tinted row per line. */
function versus(ps: PSlide, s: Slide, x: number, y: number, w: number, h: number, c: Ctx): void {
  const gap = 0.35;
  const cw = (w - gap) / 2;
  const sides = [
    { hd: s.leftHeading ?? "", items: s.bullets ?? [], mark: "✓", bar: "2E9E6A", bg: "EAF7F0", ink: "1E6B47" },
    { hd: s.rightHeading ?? "", items: s.bulletsRight ?? [], mark: "✗", bar: "E8174B", bg: "FFF1F4", ink: "B0123A" },
  ];
  const headH = 0.5;
  const n = Math.max(1, ...sides.map((x) => x.items.length));
  const rowGap = 0.1;
  const rowH = Math.min(1.05, (h - headH - 0.15 - rowGap * (n - 1)) / n);
  // One size for every row on both sides, so the two columns read as a pair.
  const size = Math.min(15, ...sides.flatMap((x) => x.items.map((it) => fitFont(`${x.mark}  ${plain(it)}`, cw - 0.4, rowH - 0.08, 15, 6, { bold: true }))));
  sides.forEach((sd, j) => {
    const cx = x + j * (cw + gap);
    ps.addText(plain(sd.hd), { x: cx, y, w: cw, h: headH, fontSize: fitFont(plain(sd.hd), cw - 0.3, headH - 0.06, 16, 8, { bold: true, maxLines: 1 }), bold: true, color: "FFFFFF", align: "center", valign: "middle", fill: { color: sd.bar }, line: { color: sd.bar }, shape: c.pres.ShapeType.roundRect, rectRadius: 0.08, fontFace: fontOk(c.theme.fontBody) });
    sd.items.forEach((it, i) => {
      ps.addText(`${sd.mark}  ${plain(it)}`, { x: cx, y: y + headH + 0.15 + i * (rowH + rowGap), w: cw, h: rowH, fontSize: size, bold: true, color: sd.ink, valign: "middle", fill: { color: sd.bg }, line: { color: sd.bg }, shape: c.pres.ShapeType.roundRect, rectRadius: 0.08, margin: [12, 12, 4, 4], fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
    });
  });
}

/** A pie or doughnut on the left, each share on the right as a card: colour bar, name, value, per cent. */
function pieWithShares(ps: PSlide, ch: ChartSpec, x: number, y: number, w: number, h: number, c: Ctx): void {
  const col = c.theme.colors;
  const pal = seriesPalette(col, c.theme.series).map(hex);
  const d = Math.min(h, w * 0.45);
  ps.addChart((ch.kind === "pie" ? c.pres.ChartType.pie : c.pres.ChartType.doughnut) as ChartName, [{ name: ch.series[0].name, labels: ch.categories, values: ch.series[0].values }], {
    x, y: y + (h - d) / 2, w: d, h: d,
    holeSize: ch.kind === "doughnut" ? 55 : undefined,
    chartColors: pal,
    showLegend: false,
    showValue: false,
    showPercent: false,
    showLabel: false,
    showTitle: false,
    dataBorder: { pt: 1.5, color: "FFFFFF" },
  });
  const rows = pieShares(ch);
  const lx = x + d + 0.5, lw = w - d - 0.5;
  const gap = 0.12;
  const rh = Math.min(0.85, (h - gap * (rows.length - 1)) / rows.length);
  const top = y + (h - (rh * rows.length + gap * (rows.length - 1))) / 2;
  const ns = Math.min(...rows.map((r) => fitFont(plain(r.name), lw * 0.55, rh - 0.1, 15, 6, { bold: true })));
  rows.forEach((r, i) => {
    const ry = top + i * (rh + gap);
    const cc = pal[i % pal.length];
    ps.addShape(c.pres.ShapeType.rect, { x: lx, y: ry, w: lw, h: rh, fill: { color: tint(cc, col.surface, 0.08) }, line: { color: tint(cc, col.surface, 0.08) } });
    ps.addShape(c.pres.ShapeType.rect, { x: lx, y: ry, w: 0.08, h: rh, fill: { color: cc }, line: { color: cc } });
    ps.addText(plain(r.name), { x: lx + 0.2, y: ry, w: lw * 0.55, h: rh, fontSize: ns, bold: true, color: hex(col.ink), valign: "middle", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
    const v = r.value.toLocaleString("en-US");
    ps.addText(v, { x: lx + lw * 0.55 + 0.2, y: ry, w: lw * 0.25, h: rh, fontSize: fitFont(v, lw * 0.25, rh - 0.1, 24, 8, { bold: true, maxLines: 1 }), bold: true, color: cc, align: "right", valign: "middle", fontFace: fontOk(c.theme.fontDisplay) });
    ps.addText(`${r.pct}%`, { x: lx + lw * 0.8 + 0.2, y: ry, w: lw * 0.2 - 0.3, h: rh, fontSize: Math.min(13, fitFont(`${r.pct}%`, lw * 0.2 - 0.3, rh - 0.1, 13, 6, { maxLines: 1 })), color: hex(col.muted), align: "right", valign: "middle", fontFace: fontOk(c.theme.fontBody) });
  });
}

/** The bloom style's faint particle field, the same dots as the editor draws, as native shapes. */
function bloomDots(ps: PSlide, s: Slide, c: Ctx): void {
  for (const p of particles(s.id)) {
    const r = px(p.r);
    ps.addShape(c.pres.ShapeType.ellipse, { x: px(p.x) - r, y: px(p.y) - r, w: 2 * r, h: 2 * r, fill: { color: hex(c.theme.colors.brand), transparency: Math.round(100 - p.o * 100) }, line: { color: hex(c.theme.colors.brand), transparency: 100 } });
  }
}

/** A slide's background: the bloom wash or glow as a picture, or the theme's plain colour. */
function background(ps: PSlide, s: Slide, c: Ctx, dark: boolean, plainColour: string): void {
  if (c.theme.slideStyle !== "bloom") {
    ps.background = { color: plainColour };
    return;
  }
  const bg = bloomBackgrounds(c.theme);
  ps.background = { data: dark ? bg.dark : bg.light };
  if (s.layout !== "section") bloomDots(ps, s, c);
}

/**
 * Every box on the slide at least a sliver wide and tall. Content past what a slide can hold would give a
 * negative or zero size, which PowerPoint reads as a damaged file and offers to repair.
 */
function sized(ps: PSlide): PSlide {
  // A line is drawn with one side 0 on purpose: it only may not go below zero.
  const fix = (o: unknown, least = 0.05) => {
    if (o && typeof o === "object") {
      const b = o as { w?: unknown; h?: unknown };
      if (typeof b.w === "number") b.w = Number.isFinite(b.w) ? Math.max(least, b.w) : least;
      if (typeof b.h === "number") b.h = Number.isFinite(b.h) ? Math.max(least, b.h) : least;
    }
    return o;
  };
  const text = ps.addText.bind(ps), shape = ps.addShape.bind(ps), image = ps.addImage.bind(ps), chart = ps.addChart.bind(ps);
  ps.addText = ((t: Parameters<PSlide["addText"]>[0], o: Parameters<PSlide["addText"]>[1]) => text(t, fix(o) as typeof o)) as PSlide["addText"];
  ps.addShape = ((k: Parameters<PSlide["addShape"]>[0], o: Parameters<PSlide["addShape"]>[1]) => shape(k, fix(o, String(k) === "line" ? 0 : 0.05) as typeof o)) as PSlide["addShape"];
  ps.addImage = ((o: Parameters<PSlide["addImage"]>[0]) => image(fix(o) as typeof o)) as PSlide["addImage"];
  ps.addChart = ((k: Parameters<PSlide["addChart"]>[0], d: Parameters<PSlide["addChart"]>[1], o: Parameters<PSlide["addChart"]>[2]) => chart(k, d, fix(o) as typeof o)) as PSlide["addChart"];
  return ps;
}

/**
 * The studio cover and close: the headline on the left two thirds, a brand block filling the right third
 * with a rounded left edge, the hero figures stacked inside it in white, takeaways as white pills on the left.
 */
function studioCover(ps: PSlide, s: Slide, i: number, c: Ctx): void {
  const t = c.theme;
  const col = t.colors;
  const dark = !!t.darkTitle;
  const ink = dark ? "FFFFFF" : hex(col.ink);
  ps.background = { color: dark ? hex(col.brandDeep) : hex(col.bg) };
  // The block runs past the right edge so only its left corners show rounded.
  const bx = px(1280);
  ps.addShape(c.pres.ShapeType.roundRect, { x: bx, y: 0, w: W - bx + 1, h: H, fill: { color: hex(col.brand) }, line: noLine(col.brand), rectRadius: px(64) });
  const lx = px(120), lw = bx - px(240);
  const hero = s.layout === "title" ? (s.kpi ?? []).slice(0, 4) : [];
  const steps = s.layout === "closing" && isStepList(s.bullets);
  const chips = s.layout === "closing" && !steps ? (s.bullets ?? []).slice(0, 4).map(plain) : [];
  const low = steps || chips.length ? 0.9 : 0;
  const tt = titleText(s, t);
  if (s.kicker) ps.addText(plain(s.kicker).toUpperCase(), { x: lx, y: 1.6 - low, w: lw, h: 0.35, fontSize: 12, bold: true, charSpacing: 4, color: dark ? "FFFFFF" : hex(col.brand), fontFace: fontOk(t.fontBody) });
  // The headline is 112 px on the canvas, which is 56 pt.
  ps.addText(tt.replace(/\n+/g, "\n"), { x: lx, y: 2.0 - low, w: lw, h: 2.4, fontSize: fitFont(tt.replace(/\n+/g, "\n"), lw, 2.4, 56, 18, { bold: true, lineSpacing: 1.05 }), bold: true, color: ink, fontFace: fontOk(t.fontDisplay), valign: "bottom", fit: "shrink" });
  const sub = [s.subtitle, s.body].filter(Boolean).map((x) => plain(x!)).join("\n");
  if (sub) ps.addText(sub, { x: lx, y: 4.55 - low, w: lw, h: 1.3, fontSize: fitFont(sub, lw, 1.3, 18, 8), color: dark ? "E6ECF3" : hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top", fit: "shrink" });
  if (hero.length) {
    const hx = bx + px(80), hw = W - bx - px(160);
    const rh = Math.min(1.3, (H - 1.6) / hero.length);
    const top = (H - rh * hero.length) / 2;
    hero.forEach((k, j) => {
      const hy = top + j * rh;
      ps.addText(plain(k.value), { x: hx, y: hy, w: hw, h: rh * 0.58, fontSize: fitFont(plain(k.value), hw, rh * 0.58, 36, 10, { bold: true, maxLines: 1 }), bold: true, color: "FFFFFF", fontFace: fontOk(t.fontDisplay), valign: "bottom" });
      ps.addText(plain(k.label), { x: hx, y: hy + rh * 0.6, w: hw, h: rh * 0.38, fontSize: fitFont(plain(k.label), hw, rh * 0.38, 12, 6), color: "FFFFFF", fontFace: fontOk(t.fontBody), valign: "top", fit: "shrink" });
    });
  }
  if (steps) {
    const items = s.bullets!.slice(0, 6).map(plain);
    const top = 5.15 - low, room = H - px(120) - top, gap = 0.1;
    const rh = Math.min(0.55, (room - gap * (items.length - 1)) / items.length);
    const size = Math.min(...items.map((x) => fitFont(x, lw - 0.7, rh, 16, 7)));
    const dot = Math.min(0.4, rh - 0.05);
    items.forEach((x, j) => {
      const ry = top + j * (rh + gap);
      ps.addShape(c.pres.ShapeType.ellipse, { x: lx, y: ry + (rh - dot) / 2, w: dot, h: dot, fill: { color: dark ? "FFFFFF" : hex(col.brand) }, line: noLine(col.brand) });
      ps.addText(String(j + 1), { x: lx, y: ry + (rh - dot) / 2, w: dot, h: dot, fontSize: Math.round(14 * dot / 0.4), bold: true, color: dark ? hex(col.brandDeep) : "FFFFFF", align: "center", valign: "middle", fontFace: fontOk(t.fontBody) });
      ps.addText(x, { x: lx + dot + 0.2, y: ry, w: lw - dot - 0.2, h: rh, fontSize: size, color: ink, valign: "middle", fontFace: fontOk(t.fontBody), fit: "shrink" });
    });
  }
  if (chips.length) {
    // Two pills a row at most, so each keeps a readable width in two thirds of the slide.
    const per = Math.min(2, chips.length);
    const cw = (lw - 0.25 * (per - 1)) / per;
    const cs = Math.min(...chips.map((x) => fitFont(x, cw - 0.3, 0.55, 13, 7, { bold: true })));
    chips.forEach((x, j) => ps.addText(x, { x: lx + (j % per) * (cw + 0.25), y: 5.95 - low + Math.floor(j / per) * 0.75, w: cw, h: 0.6, fontSize: cs, bold: true, align: "center", valign: "middle", color: hex(col.brand), fill: { color: "FFFFFF" }, line: noLine("FFFFFF"), shape: c.pres.ShapeType.roundRect, rectRadius: 0.3, shadow: { type: "outer", blur: 12, offset: 4, angle: 90, color: "000000", opacity: 0.08 }, fontFace: fontOk(t.fontBody), fit: "shrink" }));
  }
  chrome(ps, s, i, c, dark);
}

function addSlide(deck: Deck, s: Slide, i: number, c: Ctx): void {
  const t = c.theme;
  const col = t.colors;
  const ps = sized(c.pres.addSlide());
  const contentX = px(120);
  let contentW = W - px(240);
  let bodyBottom = H - px(140);
  switch (s.layout) {
    case "title":
    case "closing": {
      if (isStudio(t)) {
        studioCover(ps, s, i, c);
        return;
      }
      const dark = !!t.darkTitle;
      const bloom = t.slideStyle === "bloom";
      const brief = t.slideStyle === "briefing";
      // The briefing cover and close are flat navy: no glow, no rule under the title.
      const plainCover = bloom || brief;
      const ink = dark ? "FFFFFF" : hex(col.ink);
      background(ps, s, c, dark, dark ? hex(col.brandDeep) : hex(col.bg));
      if (!plainCover) ps.addShape(c.pres.ShapeType.ellipse, { x: W - 3.2, y: -2.2, w: 5, h: 5, fill: { color: hex(col.brand), transparency: dark ? 70 : 82 }, line: { color: hex(col.brand), transparency: 100 } });
      // A hero row of figures moves the title up to make room.
      const hero = s.layout === "title" ? (s.kpi ?? []).slice(0, 4) : [];
      const steps = s.layout === "closing" && isStepList(s.bullets);
      const up = hero.length || steps ? 0.85 : 0;
      const tt = titleText(s, t);
      // A two-line title keeps its break, the second line lit on a dark cover.
      const [l1, ...l2] = tt.split(/\n+/);
      const runs = l2.length ? [{ text: l1, options: { color: ink, breakLine: true } }, { text: l2.join(" "), options: { color: dark ? (brief ? "CFE0FA" : hex(glowOf(col.brand))) : hex(col.brand) } }] : tt;
      if (s.kicker) ps.addText(plain(s.kicker).toUpperCase(), { x: px(160), y: 1.5 - up, w: W - px(320), h: 0.35, fontSize: 12, bold: true, charSpacing: 3, color: dark ? (brief ? "8FB6F2" : hex(glowOf(col.accent))) : hex(bloom ? col.accent : col.brandDeep), fontFace: fontOk(t.fontBody) });
      ps.addText(runs, { x: px(160), y: 1.9 - up, w: W - px(320), h: 2.2, fontSize: fitFont(tt.replace(/\n+/g, "\n"), W - px(320), 2.2, 44, 16, { bold: true, lineSpacing: 1.1 }), bold: true, color: ink, fontFace: fontOk(t.fontDisplay), valign: "bottom", fit: "shrink" });
      if (!plainCover) ps.addShape(c.pres.ShapeType.rect, { x: px(160), y: 4.25 - up, w: 0.85, h: 0.06, fill: { color: hex(col.brand) }, line: { color: hex(col.brand) } });
      // The briefing cover puts its body (the main finding) in a panel of its own under the subtitle.
      const lead = brief && dark && s.layout === "title" && s.body ? plain(s.body) : "";
      const sub = [s.subtitle, lead ? undefined : s.body].filter(Boolean).map((x) => plain(x!)).join("\n");
      const subH = steps ? 0.6 : lead ? 0.5 : hero.length ? 1.0 : 1.4;
      if (sub) ps.addText(sub, { x: px(160), y: 4.45 - up, w: W - px(320), h: subH, fontSize: fitFont(sub, W - px(320), subH, 18, 8), color: dark ? "E6ECF3" : hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top", fit: "shrink" });
      if (lead) {
        const ly = 4.45 - up + subH + 0.05, lh = hero.length ? 0.55 : 0.9;
        ps.addShape(c.pres.ShapeType.rect, { x: px(160), y: ly, w: 0.07, h: lh, fill: { color: "8FB6F2" }, line: { color: "8FB6F2" } });
        ps.addText(lead, { x: px(160) + 0.07, y: ly, w: 8.8, h: lh, fontSize: fitFont(lead, 8.5, lh - 0.1, 16, 7), color: "FFFFFF", fill: { color: "FFFFFF", transparency: 90 }, valign: "middle", margin: [14, 14, 4, 4], fontFace: fontOk(t.fontBody), fit: "shrink" });
      }
      if (hero.length) {
        const hw = (W - px(320) - 0.3 * (hero.length - 1)) / hero.length;
        hero.forEach((k, j) => {
          const hx = px(160) + j * (hw + 0.3);
          if (!brief) ps.addShape(c.pres.ShapeType.roundRect, { x: hx, y: 4.75, w: hw, h: 1.25, fill: { color: dark ? "FFFFFF" : hex(col.surface), transparency: dark ? 90 : 0 }, line: { color: dark ? "FFFFFF" : hex(col.line), transparency: dark ? 75 : 0, width: 1 }, rectRadius: Math.min(0.15, px(t.radius)) });
          ps.addText(plain(k.value), { x: hx + 0.15, y: 4.82, w: hw - 0.3, h: 0.6, fontSize: fitFont(plain(k.value), hw - 0.3, 0.6, 28, 10, { bold: true, maxLines: 1 }), bold: true, color: dark ? "FFFFFF" : hex(col.brandDeep), fontFace: fontOk(t.fontDisplay), valign: "middle" });
          ps.addText(plain(k.label), { x: hx + 0.15, y: 5.42, w: hw - 0.3, h: 0.5, fontSize: fitFont(plain(k.label), hw - 0.3, 0.5, 11, 6), color: dark ? "E6ECF3" : hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top", fit: "shrink" });
        });
      }
      // Next steps as a numbered list when they are sentences, as on screen.
      if (steps) {
        const items = s.bullets!.slice(0, 6).map(plain);
        const top = 5.1 - up, room = H - px(120) - top, gap = 0.1;
        const rh = Math.min(0.55, (room - gap * (items.length - 1)) / items.length);
        const size = Math.min(...items.map((x) => fitFont(x, W - px(320) - 0.7, rh, 16, 7)));
        const dot = Math.min(0.4, rh - 0.05);
        items.forEach((x, j) => {
          const ry = top + j * (rh + gap);
          ps.addShape(c.pres.ShapeType.ellipse, { x: px(160), y: ry + (rh - dot) / 2, w: dot, h: dot, fill: { color: hex(col.accent) }, line: { color: hex(col.accent) } });
          ps.addText(String(j + 1), { x: px(160), y: ry + (rh - dot) / 2, w: dot, h: dot, fontSize: Math.round(14 * dot / 0.4), bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontOk(t.fontBody) });
          ps.addText(x, { x: px(160) + dot + 0.2, y: ry, w: W - px(320) - dot - 0.2, h: rh, fontSize: size, color: ink, valign: "middle", fontFace: fontOk(t.fontBody), fit: "shrink" });
        });
      }
      // Takeaways on the closing slide, as a row of chips.
      const chips = s.layout === "closing" && !steps ? (s.bullets ?? []).slice(0, 4).map(plain) : [];
      if (chips.length) {
        const cw = (W - px(320) - 0.25 * (chips.length - 1)) / chips.length;
        const cs = Math.min(...chips.map((x) => fitFont(x, cw - 0.3, 0.55, 13, 7, { bold: true })));
        chips.forEach((x, j) => ps.addText(x, { x: px(160) + j * (cw + 0.25), y: 5.95, w: cw, h: 0.6, fontSize: cs, bold: true, align: "center", valign: "middle", color: dark ? "FFFFFF" : hex(col.ink), fill: { color: dark ? "FFFFFF" : hex(col.surface), transparency: dark ? 88 : 0 }, line: { color: dark ? "FFFFFF" : hex(col.line), transparency: dark ? 70 : 0, width: 1 }, shape: c.pres.ShapeType.roundRect, rectRadius: 0.3, fontFace: fontOk(t.fontBody), fit: "shrink" }));
      }
      chrome(ps, s, i, c, dark);
      return;
    }
    case "section": {
      background(ps, s, c, true, hex(col.brandDeep));
      if (isStudio(t)) {
        // The studio section: the slide's number huge and faint at the bottom right, the title at 96 px (48 pt).
        const num = String(i + 1).padStart(2, "0");
        ps.addText(num, { x: W - 6.2, y: H - 3.6, w: 6, h: 3.4, fontSize: 210, bold: true, color: "FFFFFF", transparency: 90, align: "right", valign: "bottom", fontFace: fontOk(t.fontDisplay), margin: 0 });
        ps.addText(plain(s.kicker || (c.lang === "ms" ? "Bahagian" : "Section")).toUpperCase(), { x: px(160), y: 2.2, w: 6, h: 0.4, fontSize: 12, bold: true, charSpacing: 4, color: "FFFFFF", transparency: 30, fontFace: fontOk(t.fontBody) });
        ps.addText(titleText(s, t), { x: px(160), y: 2.65, w: W - px(320), h: 2.0, fontSize: fitFont(titleText(s, t), W - px(320), 2.0, 48, 16, { bold: true, lineSpacing: 1.05 }), bold: true, color: "FFFFFF", fontFace: fontOk(t.fontDisplay), valign: "top", fit: "shrink" });
        if (s.subtitle) fitText(ps, s.subtitle, { x: px(160), y: 4.75, w: W - px(320), h: 1 }, 16, { color: "FFFFFF", transparency: 30, fontFace: fontOk(t.fontBody), valign: "top" }, 8);
        chrome(ps, s, i, c, true);
        return;
      }
      ps.addText((c.lang === "ms" ? "BAHAGIAN" : "SECTION"), { x: px(160), y: 2.3, w: 6, h: 0.4, fontSize: 12, bold: true, charSpacing: 3, color: "FFFFFF", transparency: 25, fontFace: fontOk(t.fontBody) });
      ps.addText(titleText(s, t), { x: px(160), y: 2.7, w: W - px(320), h: 1.6, fontSize: fitFont(titleText(s, t), W - px(320), 1.6, 40, 16, { bold: true, lineSpacing: 1.1 }), bold: true, color: "FFFFFF", fontFace: fontOk(t.fontDisplay), valign: "top", fit: "shrink" });
      ps.addShape(c.pres.ShapeType.rect, { x: px(160), y: 4.4, w: 0.85, h: 0.06, fill: { color: "FFFFFF" }, line: { color: "FFFFFF" } });
      if (s.subtitle) fitText(ps, s.subtitle, { x: px(160), y: 4.6, w: W - px(320), h: 1 }, 16, { color: "FFFFFF", fontFace: fontOk(t.fontBody), valign: "top" }, 8);
      chrome(ps, s, i, c, true);
      return;
    }
    default:
      break;
  }
  background(ps, s, c, false, hex(col.bg));
  // The studio disc goes down first so everything else sits over it.
  if (isStudio(t)) studioDisc(ps, c);
  if (t.slideStyle === "panel") panel(ps, px(96), px(72), W - px(192), H - px(176), c);
  const y0 = title(ps, s, c);
  // A callout banner takes the foot of the body, side panels the right of it; the content fits in what is left.
  if (s.callout) {
    const txt = plain(s.callout);
    const ch = Math.min(0.9, Math.max(0.5, textHeightIn([txt], W - px(240) - 0.6, 14, { bold: true }) + 0.2));
    if (t.slideStyle === "bloom") {
      // The pull-quote band: a teal pill, the line in the quote font, italic, centred.
      ps.addText(txt, { x: contentX, y: bodyBottom - ch, w: W - px(240), h: ch, fontSize: fitFont(txt, W - px(240) - 0.8, ch - 0.1, 17, 8), italic: true, color: "FFFFFF", fill: { color: hex(col.brand) }, line: { color: hex(col.brand) }, align: "center", valign: "middle", margin: [24, 24, 4, 4], fontFace: fontOk(t.fontQuote ?? t.fontDisplay), shape: c.pres.ShapeType.roundRect, rectRadius: ch / 2, fit: "shrink" });
    } else if (isStudio(t)) {
      // The studio callout is a brand pill.
      ps.addText(txt, { x: contentX, y: bodyBottom - ch, w: W - px(240), h: ch, fontSize: fitFont(txt, W - px(240) - 0.8, ch - 0.1, 14, 8, { bold: true }), bold: true, color: "FFFFFF", fill: { color: hex(col.brand) }, line: noLine(col.brand), valign: "middle", margin: [24, 24, 4, 4], fontFace: fontOk(t.fontBody), shape: c.pres.ShapeType.roundRect, rectRadius: ch / 2, fit: "shrink" });
    } else ps.addText(txt, { x: contentX, y: bodyBottom - ch, w: W - px(240), h: ch, fontSize: fitFont(txt, W - px(240) - 0.6, ch - 0.1, 14, 8, { bold: true }), bold: true, color: "FFFFFF", fill: { color: hex(col.brandDeep) }, line: { color: hex(col.brandDeep) }, valign: "middle", margin: [18, 18, 4, 4], fontFace: fontOk(t.fontBody), shape: c.pres.ShapeType.roundRect, rectRadius: Math.min(0.15, px(t.radius)), fit: "shrink" });
    bodyBottom -= ch + 0.15;
  }
  if (s.aside?.length && !["two-column", "quote"].includes(s.layout)) {
    const aw = 3.5;
    asides(ps, s.aside, contentX + contentW - aw, y0, aw, bodyBottom - y0, c);
    contentW -= aw + 0.3;
  }
  const availH = bodyBottom - y0;
  switch (s.layout) {
    case "bullets": {
      let y = y0;
      if (s.body) {
        // The line above the bullets takes up to two lines and no more than a fifth of the space.
        const bs = fitFont(plain(s.body), contentW, Math.min(0.75, availH * 0.2), 15, 9);
        const bh = Math.min(textHeightIn([plain(s.body)], contentW, bs), Math.min(0.75, availH * 0.2));
        ps.addText(plain(s.body), { x: contentX, y, w: contentW, h: bh, fontSize: bs, color: hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top", fit: "shrink" });
        y += bh + 0.08;
      }
      bullets(ps, s.bullets ?? [], contentX, y, contentW, bodyBottom - y, c);
      break;
    }
    case "two-column": {
      if (isVersusPair(s.leftHeading, s.rightHeading)) {
        versus(ps, s, contentX, y0, contentW, availH, c);
        break;
      }
      const gap = 0.35;
      const cw = (contentW - gap) / 2;
      [[s.leftHeading, s.bullets, contentX], [s.rightHeading, s.bulletsRight, contentX + cw + gap]].forEach(([hd, items, x]) => {
        panel(ps, x as number, y0, cw, availH, c);
        let y = y0 + 0.2;
        if (hd) {
          fitText(ps, hd as string, { x: (x as number) + 0.25, y, w: cw - 0.5, h: 0.5 }, 18, { color: hex(col.brandDeep), fontFace: fontOk(t.fontDisplay) }, 9, true);
          y += 0.6;
        }
        bullets(ps, (items as string[]) ?? [], (x as number) + 0.25, y, cw - 0.5, availH - (y - y0) - 0.2, c, 15);
      });
      break;
    }
    case "chart": {
      if (s.chart) {
        const side = s.bullets?.length ? 3.4 : 0;
        const pie = (s.chart.kind === "pie" || s.chart.kind === "doughnut") && s.chart.series.length === 1;
        (pie ? pieWithShares : chart)(ps, s.chart, contentX, y0, contentW - side - (side ? 0.3 : 0), availH - (s.chart.source ? 0.4 : 0), c);
        if (side) bullets(ps, s.bullets!, contentX + contentW - side, y0 + 0.3, side, availH - 0.6, c, 14);
        if (s.chart.source) fitText(ps, s.chart.source, { x: contentX, y: bodyBottom - 0.35, w: contentW, h: 0.3 }, 10, { color: hex(col.muted), fontFace: fontOk(t.fontBody), valign: "top" });
      }
      break;
    }
    case "table": {
      if (s.table) {
        table(ps, s.table, contentX, y0, contentW, availH - (s.table.source ? 0.45 : 0), c);
        if (s.table.source) fitText(ps, s.table.source, { x: contentX, y: bodyBottom - 0.35, w: contentW, h: 0.3 }, 10, { color: hex(col.muted), fontFace: fontOk(t.fontBody), valign: "top" });
      }
      break;
    }
    case "diagram": {
      if (s.diagram) diagram(ps, s.diagram, contentX, y0, contentW, availH - (s.body ? 0.5 : 0), c);
      if (s.body) fitText(ps, s.body, { x: contentX, y: bodyBottom - 0.45, w: contentW, h: 0.4 }, 12, { color: hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top" });
      break;
    }
    case "image": {
      const side = s.bullets?.length ? 3.6 : 0;
      const fw = contentW - side - (side ? 0.3 : 0);
      const fh = availH - (s.image?.caption ? 0.45 : 0);
      const data = s.image?.mediaId ? mediaData(c.userId, s.image.mediaId) : null;
      if (data) ps.addImage({ data, x: contentX, y: y0, w: fw, h: fh, sizing: { type: "contain", w: fw, h: fh } });
      else if (s.image?.url && c.urls.get(s.image.url)) ps.addImage({ data: c.urls.get(s.image.url)!, x: contentX, y: y0, w: fw, h: fh, sizing: { type: "contain", w: fw, h: fh } });
      else {
        ps.addShape(c.pres.ShapeType.roundRect, { x: contentX, y: y0, w: fw, h: fh, fill: { color: hex(col.surface) }, line: { color: hex(col.line), width: 1.5, dashType: "dash" }, rectRadius: 0.15 });
        const ph = plain(s.image?.prompt ? `${c.lang === "ms" ? "Gambar" : "Figure"}: ${s.image.prompt}` : c.lang === "ms" ? "Tiada gambar dipilih" : "No picture chosen");
        ps.addText(ph, { x: contentX + 0.4, y: y0, w: fw - 0.8, h: fh, fontSize: fitFont(ph, fw - 0.8, fh, 13, 7), color: hex(col.muted), align: "center", valign: "middle", fontFace: fontOk(t.fontBody), fit: "shrink" });
      }
      if (side) bullets(ps, s.bullets!, contentX + contentW - side, y0 + 0.2, side, availH - 0.4, c, 14);
      if (s.image?.caption) fitText(ps, s.image.caption, { x: contentX, y: bodyBottom - 0.4, w: contentW, h: 0.35 }, 11, { color: hex(col.muted), fontFace: fontOk(t.fontBody), valign: "top" });
      break;
    }
    case "quote": {
      ps.addText(`“${plain(s.quote?.text ?? "")}`, { x: contentX, y: y0 + 0.2, w: contentW - 1, h: availH * 0.65, fontSize: fitFont(`“${plain(s.quote?.text ?? "")}`, contentW - 1, availH * 0.65, 30, 10, { lineSpacing: 1.25 }), color: hex(col.ink), fontFace: fontOk(t.fontDisplay), valign: "middle", fit: "shrink" });
      if (s.quote?.by) fitText(ps, s.quote.by, { x: contentX, y: y0 + availH * 0.7, w: contentW - 1, h: Math.min(0.6, availH * 0.28) }, 15, { color: hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top" }, 8);
      break;
    }
    case "kpi": {
      const items = s.kpi ?? [];
      if ((s.kpiStyle ?? t.kpiStyle) === "rings") {
        rings(ps, items, contentX, y0, contentW, availH - (s.body ? 0.5 : 0), c);
        if (s.body) fitText(ps, s.body, { x: contentX, y: bodyBottom - 0.45, w: contentW, h: 0.4 }, 12, { color: hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top" });
        break;
      }
      // Every figure is drawn: rows of up to four, as on screen.
      const perRow = Math.min(Math.max(items.length, 1), 4);
      const rowsN = Math.max(1, Math.ceil(items.length / 4));
      const gap = 0.3;
      const tw = (contentW - gap * (perRow - 1)) / perRow;
      const room = availH - (s.body ? 0.5 : 0);
      const th = Math.min(3.2, (room - gap * (rowsN - 1)) / rowsN);
      // The briefing style centres each figure and draws it in its own series colour.
      const brief = t.slideStyle === "briefing";
      // The studio tile: the figure at 132 px on the canvas (56 pt) in the brand colour, the note in ink2.
      const studio = isStudio(t);
      const kpal = seriesPalette(col, t.series).map(hex);
      const top = y0 + (room - (th * rowsN + gap * (rowsN - 1))) / 2;
      items.forEach((k, idx) => {
        const j = idx % 4;
        const ty = top + Math.floor(idx / 4) * (th + gap);
        const x = contentX + j * (tw + gap);
        panel(ps, x, ty, tw, th, c);
        const vh = Math.min(1.1, th * 0.42);
        const al = brief ? "center" : "left";
        ps.addText(plain(k.value), { x: x + 0.2, y: ty + th * 0.1, w: tw - 0.4, h: vh, fontSize: fitFont(plain(k.value), tw - 0.4, vh, brief ? 54 : studio ? 56 : 40, 10, { bold: true, maxLines: 1 }), bold: true, color: brief ? kpal[idx % kpal.length] : hex(studio ? col.brand : col.brandDeep), fontFace: fontOk(t.fontDisplay), align: al, valign: "middle", fit: "shrink" });
        const lh = Math.min(0.6, th * 0.25);
        ps.addText(plain(k.label), { x: x + 0.2, y: ty + th * 0.1 + vh + 0.05, w: tw - 0.4, h: lh, fontSize: fitFont(plain(k.label), tw - 0.4, lh, 13, 6, { bold: true }), bold: true, color: hex(col.ink), fontFace: fontOk(t.fontBody), align: al, valign: "top", fit: "shrink" });
        if (k.note) fitText(ps, k.note, { x: x + 0.2, y: ty + th * 0.1 + vh + lh + 0.1, w: tw - 0.4, h: Math.max(0.2, th - (th * 0.1 + vh + lh + 0.2)) }, 10, { color: hex(studio ? col.ink2 : col.muted), fontFace: fontOk(t.fontBody), align: al, valign: "top" });
      });
      if (s.body) fitText(ps, s.body, { x: contentX, y: bodyBottom - 0.45, w: contentW, h: 0.4 }, 12, { color: hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top" });
      break;
    }
    case "facts": {
      if (s.facts?.length) facts(ps, s.facts, contentX, y0, contentW, availH - (s.body ? 0.5 : 0), c);
      if (s.body) fitText(ps, s.body, { x: contentX, y: bodyBottom - 0.45, w: contentW, h: 0.4 }, 12, { color: hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top" });
      break;
    }
    case "gallery": {
      if (s.gallery?.length) gallery(ps, s.gallery, contentX, y0, contentW, availH - (s.body ? 0.5 : 0), c);
      if (s.body) fitText(ps, s.body, { x: contentX, y: bodyBottom - 0.45, w: contentW, h: 0.4 }, 12, { color: hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top" });
      break;
    }
    case "map": {
      if (s.map) countryMap(ps, s.map, contentX, y0, contentW, availH - (s.map.source ? 0.4 : 0), c);
      if (s.map?.source) fitText(ps, s.map.source, { x: contentX, y: bodyBottom - 0.35, w: contentW, h: 0.3 }, 10, { color: hex(col.muted), fontFace: fontOk(t.fontBody), valign: "top" });
      break;
    }
    case "cards": {
      cards(ps, s.cards ?? [], contentX, y0, contentW, availH - (s.body ? 0.5 : 0), c);
      if (s.body) fitText(ps, s.body, { x: contentX, y: bodyBottom - 0.45, w: contentW, h: 0.4 }, 12, { color: hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top" });
      break;
    }
    default:
      bullets(ps, s.bullets ?? [], contentX, y0, contentW, availH, c);
  }
  chrome(ps, s, i, c);
}

export async function deckToPptx(rawDeck: Deck, userId: string): Promise<Buffer> {
  const deck: Deck = { ...rawDeck, lang: rawDeck.lang === "ms" ? "ms" : "en", theme: sanitizeTheme(rawDeck.theme), slides: (rawDeck.slides ?? []).map((x) => sanitizeSlide(x)) };
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = plain(deck.title);
  // A picture given by address is fetched here, under rules, never handed to pptxgenjs to fetch:
  // it would read a local path from disk and crash the process on an unreachable host.
  const urls = new Map<string, string>();
  const wanted = [...new Set(deck.slides.flatMap((x) => [x.layout === "image" && !x.image?.mediaId ? x.image?.url : undefined, ...(x.layout === "gallery" ? (x.gallery ?? []).map((g) => (g.mediaId ? undefined : g.url)) : [])]).filter((u): u is string => !!u))].slice(0, 20);
  await Promise.all(wanted.map(async (u) => {
    const d = await fetchPicture(u);
    if (d) urls.set(u, d);
  }));
  const ctx: Ctx = { pres, theme: deck.theme, userId, total: deck.slides.length, lang: deck.lang, urls };
  deck.slides.forEach((s, i) => addSlide(deck, s, i, ctx));
  const out = await pres.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
