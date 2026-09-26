import fs from "node:fs";
import PptxGenJSImport from "pptxgenjs";
import { seriesPalette, verdictTone, type ChartSpec, type Deck, type DiagramSpec, type Slide, type Theme } from "@slidecraft/shared";
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
  return c.replace("#", "").toUpperCase();
}

function plain(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2").replace(/`([^`]+)`/g, "$1");
}

function fontOk(name: string): string {
  return /^(system-ui|ui-sans-serif)$/i.test(name) ? "Calibri" : name;
}

interface Ctx {
  pres: Pres;
  theme: Theme;
  userId: string;
  total: number;
  lang: "en" | "ms";
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
  if (s.notes) ps.addNotes(plain(s.notes));
}

const TONE = { good: { bg: "E3F5EA", ink: "0F5A34" }, mid: { bg: "FFF1D6", ink: "7A4B00" }, bad: { bg: "FDECEC", ink: "8C2323" } } as const;

function cards(ps: PSlide, items: NonNullable<Slide["cards"]>, x: number, y: number, w: number, h: number, c: Ctx): void {
  const col = c.theme.colors;
  const n = items.length;
  const cols = n <= 3 ? Math.max(n, 1) : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = 0.25;
  const cw = (w - gap * (cols - 1)) / cols;
  const ch = Math.min((h - gap * (rows - 1)) / rows, 2.6);
  const tw = cw - 0.4;
  // The number row takes a share of short cards rather than a fixed strip, and the heading and
  // detail are sized together (one scale for every card) so both always fit what is left.
  const top = Math.max(0.36, Math.min(0.72, ch * 0.28));
  const dot = Math.max(0.24, Math.min(0.4, top - 0.3));
  const room = ch - top - 0.1;
  let hs = 15, ds = 11, headH = 0.3;
  for (let f = 1; f >= 0.3; f -= 0.02) {
    hs = Math.max(5, Math.round(15 * f * 2) / 2);
    ds = Math.max(4, Math.round(11 * f * 2) / 2);
    headH = Math.max(...items.map((it) => textHeightIn([plain(it.heading)], tw, hs, { bold: true })));
    const detNeed = Math.max(0, ...items.map((it) => (it.detail ? textHeightIn([plain(it.detail)], tw, ds) : 0)));
    if (headH + 0.04 + detNeed <= room) break;
  }
  const detH = Math.max(0.15, room - headH - 0.04);
  items.forEach((it, i) => {
    const cx = x + (i % cols) * (cw + gap);
    const cy = y + Math.floor(i / cols) * (ch + gap);
    panel(ps, cx, cy, cw, ch, c);
    ps.addShape(c.pres.ShapeType.rect, { x: cx, y: cy, w: cw, h: 0.07, fill: { color: hex(col.brand) }, line: { color: hex(col.brand) } });
    ps.addShape(c.pres.ShapeType.ellipse, { x: cx + 0.2, y: cy + (top - dot) / 2 + 0.03, w: dot, h: dot, fill: { color: hex(col.brand) }, line: { color: hex(col.brand) } });
    ps.addText(String(i + 1), { x: cx + 0.2, y: cy + (top - dot) / 2 + 0.03, w: dot, h: dot, fontSize: Math.round(13 * (dot / 0.4)), bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontOk(c.theme.fontBody) });
    if (it.tag) {
      const tone = verdictTone(it.tag);
      const tagW = Math.min(cw - 0.9, 0.3 + it.tag.length * 0.09);
      ps.addText(it.tag.toUpperCase(), { x: cx + cw - tagW - 0.2, y: cy + (top - 0.3) / 2 + 0.03, w: tagW, h: 0.3, fontSize: fitFont(it.tag.toUpperCase(), tagW, 0.32, 9, 6, { bold: true, maxLines: 1 }), bold: true, align: "center", valign: "middle", color: tone ? TONE[tone].ink : hex(col.brandDeep), fill: { color: tone ? TONE[tone].bg : hex(col.surface) }, fontFace: fontOk(c.theme.fontBody), rectRadius: 0.16, shape: c.pres.ShapeType.roundRect });
    }
    ps.addText(plain(it.heading), { x: cx + 0.2, y: cy + top, w: tw, h: headH, fontSize: hs, bold: true, color: hex(col.ink), fontFace: fontOk(c.theme.fontDisplay), valign: "top", fit: "shrink" });
    if (it.detail) ps.addText(plain(it.detail), { x: cx + 0.2, y: cy + top + headH + 0.04, w: tw, h: detH, fontSize: ds, color: hex(col.ink2), fontFace: fontOk(c.theme.fontBody), valign: "top", fit: "shrink" });
  });
}

function title(ps: PSlide, s: Slide, c: Ctx, opts: { y?: number; size?: number; color?: string; kicker?: string } = {}): number {
  const t = c.theme;
  const y = opts.y ?? px(96);
  const w = W - px(240);
  let yy = y;
  const kicker = s.kicker || opts.kicker;
  if (kicker) {
    ps.addText(kicker.toUpperCase(), { x: px(120), y: yy, w, h: px(36), fontSize: fitFont(kicker.toUpperCase(), w, px(36), 12, 8, { bold: true, maxLines: 1 }), bold: true, charSpacing: 3, color: opts.color ?? hex(t.colors.brandDeep), fontFace: fontOk(t.fontBody) });
    yy += px(44);
  }
  // The title takes at most three lines and a quarter of the slide; its box is as tall as its text.
  const max = opts.size ?? 30;
  const size = fitFont(plain(s.title), w, 3 * max * 1.2 / 72 + 0.1, max, 14, { bold: true, maxLines: 3 });
  const h = Math.min(textHeightIn([plain(s.title)], w, size, { bold: true }), H * 0.28);
  ps.addText(plain(s.title), { x: px(120), y: yy, w, h, fontSize: size, bold: true, color: opts.color ?? hex(t.colors.ink), fontFace: fontOk(t.fontDisplay), valign: "top", fit: "shrink" });
  let end = yy + h + px(10);
  // The reading line under a content slide's title: at most two lines.
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
  ps.addShape(c.pres.ShapeType.roundRect, { x, y, w, h, fill: { color: hex(c.theme.colors.surface) }, line: { color: hex(c.theme.colors.line), width: 1 }, rectRadius: Math.min(0.2, px(c.theme.radius)) });
}

function chart(ps: PSlide, ch: ChartSpec, x: number, y: number, w: number, h: number, c: Ctx): void {
  const P = c.pres;
  const kindMap: Record<ChartSpec["kind"], string> = { column: P.ChartType.bar, bar: P.ChartType.bar, line: P.ChartType.line, area: P.ChartType.area, pie: P.ChartType.pie, doughnut: P.ChartType.doughnut };
  const data = ch.series.map((s) => ({ name: s.name, labels: ch.categories, values: s.values }));
  const pal = seriesPalette(c.theme.colors).map(hex);
  const pie = ch.kind === "pie" || ch.kind === "doughnut";
  ps.addChart(kindMap[ch.kind] as ChartName, data, {
    x, y, w, h,
    barDir: ch.kind === "bar" ? "bar" : "col",
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
  const { size, heights } = fitTable(text, colW, h, 13);
  const rows: TableRows = [
    t.header.map((hd) => ({ text: plain(hd), options: { bold: true, color: hex(c.theme.colors.brandDeep), fill: { color: hex(c.theme.colors.surface) }, fontSize: size } })),
    ...t.rows.map((r) =>
      r.map((v) => {
        const tone = verdictTone(plain(v));
        return { text: plain(v), options: tone ? { color: TONE[tone].ink, fill: { color: TONE[tone].bg }, bold: true, fontSize: size } : { color: hex(c.theme.colors.ink), fontSize: size } };
      }),
    ),
  ];
  ps.addTable(rows, { x, y, w, colW, border: { type: "solid", color: hex(c.theme.colors.line), pt: 0.75 }, fontFace: fontOk(c.theme.fontBody), valign: "top", autoPage: false, rowH: heights });
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
  } else {
    const colW = [2.2, ...Array(d.cols.length).fill((w - 2.2) / Math.max(d.cols.length, 1))];
    const mark = (v: string) => YES_RE.test(v.trim()) || NO_RE.test(v.trim());
    const text = [["", ...d.cols.map(plain)], ...d.rows.map((r, i) => [plain(r), ...d.cols.map((_, j) => (mark(d.cells[i]?.[j] ?? "") ? "✓" : plain(d.cells[i]?.[j] ?? "")))])];
    const { size: ms, heights } = fitTable(text, colW, h, 12);
    const rows: TableRows = [
      ["", ...d.cols].map((v) => ({ text: v, options: { bold: true, color: hex(col.brandDeep), fontSize: ms, align: "center" as const } })),
      ...d.rows.map((r, i) => [{ text: r, options: { bold: true, color: hex(col.ink), fontSize: ms } }, ...d.cols.map((_, j) => {
        const v = d.cells[i]?.[j] ?? "";
        const yes = YES_RE.test(v.trim());
        const no = NO_RE.test(v.trim());
        return { text: yes ? "✓" : no ? "✗" : plain(v), options: { color: yes ? hex(col.brand) : hex(col.ink2), fontSize: yes || no ? Math.min(16, ms + 3) : ms, align: "center" as const, bold: yes } };
      })]),
    ];
    ps.addTable(rows, { x, y, w, colW, border: { type: "solid", color: hex(col.line), pt: 0.75 }, fontFace: fontOk(c.theme.fontBody), autoPage: false, rowH: heights });
  }
}

function addSlide(deck: Deck, s: Slide, i: number, c: Ctx): void {
  const t = c.theme;
  const col = t.colors;
  const ps = c.pres.addSlide();
  const contentX = px(120), contentW = W - px(240);
  const bodyBottom = H - px(140);
  switch (s.layout) {
    case "title":
    case "closing": {
      ps.background = { color: hex(col.bg) };
      ps.addShape(c.pres.ShapeType.ellipse, { x: W - 3.2, y: -2.2, w: 5, h: 5, fill: { color: hex(col.brand), transparency: 82 }, line: { color: hex(col.brand), transparency: 100 } });
      ps.addText(plain(s.title), { x: px(160), y: 1.9, w: W - px(320), h: 2.2, fontSize: fitFont(plain(s.title), W - px(320), 2.2, 44, 16, { bold: true, lineSpacing: 1.1 }), bold: true, color: hex(col.ink), fontFace: fontOk(t.fontDisplay), valign: "bottom", fit: "shrink" });
      ps.addShape(c.pres.ShapeType.rect, { x: px(160), y: 4.25, w: 0.85, h: 0.06, fill: { color: hex(col.brand) }, line: { color: hex(col.brand) } });
      const sub = [s.subtitle, s.body].filter(Boolean).map((x) => plain(x!)).join("\n");
      if (sub) ps.addText(sub, { x: px(160), y: 4.45, w: W - px(320), h: 1.4, fontSize: fitFont(sub, W - px(320), 1.4, 18, 8), color: hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top", fit: "shrink" });
      chrome(ps, s, i, c);
      return;
    }
    case "section": {
      ps.background = { color: hex(col.brandDeep) };
      ps.addText((c.lang === "ms" ? "BAHAGIAN" : "SECTION"), { x: px(160), y: 2.3, w: 6, h: 0.4, fontSize: 12, bold: true, charSpacing: 3, color: "FFFFFF", transparency: 25, fontFace: fontOk(t.fontBody) });
      ps.addText(plain(s.title), { x: px(160), y: 2.7, w: W - px(320), h: 1.6, fontSize: fitFont(plain(s.title), W - px(320), 1.6, 40, 16, { bold: true, lineSpacing: 1.1 }), bold: true, color: "FFFFFF", fontFace: fontOk(t.fontDisplay), valign: "top", fit: "shrink" });
      ps.addShape(c.pres.ShapeType.rect, { x: px(160), y: 4.4, w: 0.85, h: 0.06, fill: { color: "FFFFFF" }, line: { color: "FFFFFF" } });
      if (s.subtitle) fitText(ps, s.subtitle, { x: px(160), y: 4.6, w: W - px(320), h: 1 }, 16, { color: "FFFFFF", fontFace: fontOk(t.fontBody), valign: "top" }, 8);
      chrome(ps, s, i, c, true);
      return;
    }
    default:
      break;
  }
  ps.background = { color: hex(col.bg) };
  if (t.slideStyle === "panel") panel(ps, px(96), px(72), W - px(192), H - px(176), c);
  const y0 = title(ps, s, c);
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
        chart(ps, s.chart, contentX, y0, contentW - side - (side ? 0.3 : 0), availH - (s.chart.source ? 0.4 : 0), c);
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
      else if (s.image?.url) ps.addImage({ path: s.image.url, x: contentX, y: y0, w: fw, h: fh, sizing: { type: "contain", w: fw, h: fh } });
      else {
        ps.addShape(c.pres.ShapeType.roundRect, { x: contentX, y: y0, w: fw, h: fh, fill: { color: hex(col.surface) }, line: { color: hex(col.line), width: 1.5, dashType: "dash" }, rectRadius: 0.15 });
        ps.addText(s.image?.prompt ? `${c.lang === "ms" ? "Gambar" : "Figure"}: ${s.image.prompt}` : c.lang === "ms" ? "Tiada gambar dipilih" : "No picture chosen", { x: contentX + 0.4, y: y0, w: fw - 0.8, h: fh, fontSize: fitFont(s.image?.prompt ?? "", fw - 0.8, fh, 13, 7), color: hex(col.muted), align: "center", valign: "middle", fontFace: fontOk(t.fontBody), fit: "shrink" });
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
      const n = Math.min(Math.max(items.length, 1), 4);
      const gap = 0.3;
      const tw = (contentW - gap * (n - 1)) / n;
      const th = Math.min(availH - (s.body ? 0.5 : 0), 2.6);
      const ty = y0 + (availH - th - (s.body ? 0.5 : 0)) / 2;
      items.slice(0, 4).forEach((k, j) => {
        const x = contentX + j * (tw + gap);
        panel(ps, x, ty, tw, th, c);
        ps.addText(plain(k.value), { x: x + 0.2, y: ty + 0.25, w: tw - 0.4, h: 1.1, fontSize: fitFont(plain(k.value), tw - 0.4, 1.1, 40, 12, { bold: true, maxLines: 1 }), bold: true, color: hex(col.brandDeep), fontFace: fontOk(t.fontDisplay), valign: "middle", fit: "shrink" });
        ps.addText(plain(k.label), { x: x + 0.2, y: ty + 1.35, w: tw - 0.4, h: 0.6, fontSize: fitFont(plain(k.label), tw - 0.4, 0.6, 13, 7, { bold: true }), bold: true, color: hex(col.ink), fontFace: fontOk(t.fontBody), valign: "top", fit: "shrink" });
        if (k.note) fitText(ps, k.note, { x: x + 0.2, y: ty + 1.9, w: tw - 0.4, h: Math.max(0.25, th - 2) }, 10, { color: hex(col.muted), fontFace: fontOk(t.fontBody), valign: "top" });
      });
      if (s.body) fitText(ps, s.body, { x: contentX, y: bodyBottom - 0.45, w: contentW, h: 0.4 }, 12, { color: hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top" });
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

export async function deckToPptx(deck: Deck, userId: string): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = deck.title;
  const ctx: Ctx = { pres, theme: deck.theme, userId, total: deck.slides.length, lang: deck.lang };
  deck.slides.forEach((s, i) => addSlide(deck, s, i, ctx));
  const out = await pres.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
