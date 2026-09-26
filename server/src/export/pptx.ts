import fs from "node:fs";
import PptxGenJSImport from "pptxgenjs";
import { seriesPalette, verdictTone, type ChartSpec, type Deck, type DiagramSpec, type Slide, type Theme } from "@slidecraft/shared";
import { getMedia } from "../store.js";

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
  if (s.citations?.length && s.layout !== "title") {
    ps.addText(s.citations.map(plain).join("\n"), { x: px(120), y: H - px(96), w: W - px(440), h: px(64), fontSize: 9, color: col, fontFace: fontOk(t.fontBody), valign: "bottom" });
  }
  const foot: string[] = [];
  if (t.footer) foot.push(t.footer);
  if (t.slideNumbers) foot.push(`${i + 1} / ${c.total}`);
  if (foot.length) ps.addText(foot.join("    "), { x: W - px(620), y: H - px(96), w: px(500), h: px(64), fontSize: 9, color: col, fontFace: fontOk(t.fontBody), align: "right", valign: "bottom" });
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
  items.slice(0, 9).forEach((it, i) => {
    const cx = x + (i % cols) * (cw + gap);
    const cy = y + Math.floor(i / cols) * (ch + gap);
    panel(ps, cx, cy, cw, ch, c);
    ps.addShape(c.pres.ShapeType.rect, { x: cx, y: cy, w: cw, h: 0.07, fill: { color: hex(col.brand) }, line: { color: hex(col.brand) } });
    ps.addShape(c.pres.ShapeType.ellipse, { x: cx + 0.2, y: cy + 0.22, w: 0.4, h: 0.4, fill: { color: hex(col.brand) }, line: { color: hex(col.brand) } });
    ps.addText(String(i + 1), { x: cx + 0.2, y: cy + 0.22, w: 0.4, h: 0.4, fontSize: 13, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontOk(c.theme.fontBody) });
    if (it.tag) {
      const tone = verdictTone(it.tag);
      const tw = Math.min(cw - 0.9, 0.25 + it.tag.length * 0.09);
      ps.addText(it.tag.toUpperCase(), { x: cx + cw - tw - 0.2, y: cy + 0.26, w: tw, h: 0.32, fontSize: 9, bold: true, align: "center", valign: "middle", color: tone ? TONE[tone].ink : hex(col.brandDeep), fill: { color: tone ? TONE[tone].bg : hex(col.surface) }, fontFace: fontOk(c.theme.fontBody), rectRadius: 0.16, shape: c.pres.ShapeType.roundRect });
    }
    ps.addText(plain(it.heading), { x: cx + 0.2, y: cy + 0.72, w: cw - 0.4, h: 0.55, fontSize: 15, bold: true, color: hex(col.ink), fontFace: fontOk(c.theme.fontDisplay), valign: "top", fit: "shrink" });
    if (it.detail) ps.addText(plain(it.detail), { x: cx + 0.2, y: cy + 1.28, w: cw - 0.4, h: ch - 1.38, fontSize: 11, color: hex(col.ink2), fontFace: fontOk(c.theme.fontBody), valign: "top", fit: "shrink" });
  });
}

function title(ps: PSlide, s: Slide, c: Ctx, opts: { y?: number; size?: number; color?: string; kicker?: string } = {}): number {
  const t = c.theme;
  const y = opts.y ?? px(96);
  let yy = y;
  const kicker = s.kicker || opts.kicker;
  if (kicker) {
    ps.addText(kicker.toUpperCase(), { x: px(120), y: yy, w: W - px(240), h: px(36), fontSize: 12, bold: true, charSpacing: 3, color: opts.color ?? hex(t.colors.brandDeep), fontFace: fontOk(t.fontBody) });
    yy += px(44);
  }
  const size = opts.size ?? 30;
  const lines = Math.ceil(plain(s.title).length / 52);
  const h = px(Math.max(80, lines * size * 2.2));
  ps.addText(plain(s.title), { x: px(120), y: yy, w: W - px(240), h, fontSize: size, bold: true, color: opts.color ?? hex(t.colors.ink), fontFace: fontOk(t.fontDisplay), valign: "top", fit: "shrink" });
  let end = yy + h + px(16);
  // The reading line under a content slide's title.
  if (s.subtitle) {
    ps.addText(plain(s.subtitle), { x: px(120), y: end - px(8), w: W - px(240), h: px(56), fontSize: 14, color: hex(t.colors.ink2), fontFace: fontOk(t.fontBody), valign: "top", fit: "shrink" });
    end += px(60);
  }
  return end;
}

function bullets(ps: PSlide, items: string[], x: number, y: number, w: number, h: number, c: Ctx, size?: number): void {
  const fs = size ?? (items.length <= 4 ? 20 : items.length <= 6 ? 17 : 14);
  ps.addText(
    items.map((b) => ({ text: plain(b), options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: 8 } })),
    { x, y, w, h, fontSize: fs, color: hex(c.theme.colors.ink), fontFace: fontOk(c.theme.fontBody), valign: "top", fit: "shrink" },
  );
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

function table(ps: PSlide, t: NonNullable<Slide["table"]>, x: number, y: number, w: number, h: number, c: Ctx): void {
  const many = t.rows.length > 7;
  const rows: TableRows = [
    t.header.map((hd) => ({ text: plain(hd), options: { bold: true, color: hex(c.theme.colors.brandDeep), fill: { color: hex(c.theme.colors.surface) }, fontSize: many ? 11 : 13 } })),
    ...t.rows.map((r) =>
      r.map((v) => {
        const tone = verdictTone(plain(v));
        return { text: plain(v), options: tone ? { color: TONE[tone].ink, fill: { color: TONE[tone].bg }, bold: true, fontSize: many ? 10 : 12 } : { color: hex(c.theme.colors.ink), fontSize: many ? 10 : 12 } };
      }),
    ),
  ];
  ps.addTable(rows, { x, y, w, colW: Array(t.header.length).fill(w / Math.max(t.header.length, 1)), border: { type: "solid", color: hex(c.theme.colors.line), pt: 0.75 }, fontFace: fontOk(c.theme.fontBody), valign: "top", autoPage: false, rowH: many ? 0.3 : 0.4 });
}

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
    d.steps.forEach((s, i) => {
      const r = Math.floor(i / per), k = i % per;
      const bx = x + k * (bw + gap);
      const by = rows === 1 ? y + (h - bh) / 2 : y + r * (bh + 0.5);
      panel(ps, bx, by, bw, bh, c);
      ps.addShape(P.ShapeType.ellipse, { x: bx + 0.15, y: by + 0.15, w: 0.36, h: 0.36, fill: { color: hex(col.brand) }, line: { color: hex(col.brand) } });
      ps.addText(String(i + 1), { x: bx + 0.15, y: by + 0.15, w: 0.36, h: 0.36, fontSize: 11, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontOk(c.theme.fontBody) });
      ps.addText(plain(s.label), { x: bx + 0.15, y: by + 0.6, w: bw - 0.3, h: 0.5, fontSize: 13, bold: true, color: hex(col.ink), fontFace: fontOk(c.theme.fontBody), valign: "top", fit: "shrink" });
      if (s.detail) ps.addText(plain(s.detail), { x: bx + 0.15, y: by + 1.1, w: bw - 0.3, h: bh - 1.2, fontSize: 10, color: hex(col.ink2), fontFace: fontOk(c.theme.fontBody), valign: "top", fit: "shrink" });
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
      ps.addText(e.when, { x: cx - tw / 2, y: up ? cy - 0.75 : cy + 0.3, w: tw, h: 0.35, fontSize: 12, bold: true, color: hex(col.brandDeep), align: "center", fontFace: fontOk(c.theme.fontBody) });
      ps.addText(plain(e.label), { x: cx - tw / 2, y: up ? cy - 1.6 : cy + 0.65, w: tw, h: 0.85, fontSize: 11, color: hex(col.ink), align: "center", valign: up ? "bottom" : "top", fontFace: fontOk(c.theme.fontBody), fit: "shrink" });
    });
  } else {
    const rows: TableRows = [
      ["", ...d.cols].map((v) => ({ text: v, options: { bold: true, color: hex(col.brandDeep), fontSize: 12, align: "center" as const } })),
      ...d.rows.map((r, i) => [{ text: r, options: { bold: true, color: hex(col.ink), fontSize: 12 } }, ...d.cols.map((_, j) => {
        const v = d.cells[i]?.[j] ?? "";
        const yes = /^(yes|ya|✓|true|wajib|required|mandatory)$/i.test(v.trim());
        const no = /^(no|tidak|✗|false|x)$/i.test(v.trim());
        return { text: yes ? "✓" : no ? "✗" : plain(v), options: { color: yes ? hex(col.brand) : hex(col.ink2), fontSize: yes || no ? 16 : 11, align: "center" as const, bold: yes } };
      })]),
    ];
    ps.addTable(rows, { x, y, w, colW: [2.2, ...Array(d.cols.length).fill((w - 2.2) / Math.max(d.cols.length, 1))], border: { type: "solid", color: hex(col.line), pt: 0.75 }, fontFace: fontOk(c.theme.fontBody), autoPage: false, rowH: Math.min(0.7, (h - 0.5) / Math.max(d.rows.length, 1)) });
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
      ps.addText(plain(s.title), { x: px(160), y: 1.9, w: W - px(320), h: 2.2, fontSize: 44, bold: true, color: hex(col.ink), fontFace: fontOk(t.fontDisplay), valign: "bottom", fit: "shrink" });
      ps.addShape(c.pres.ShapeType.rect, { x: px(160), y: 4.25, w: 0.85, h: 0.06, fill: { color: hex(col.brand) }, line: { color: hex(col.brand) } });
      const sub = [s.subtitle, s.body].filter(Boolean).map((x) => plain(x!)).join("\n");
      if (sub) ps.addText(sub, { x: px(160), y: 4.45, w: W - px(320), h: 1.4, fontSize: 18, color: hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top" });
      chrome(ps, s, i, c);
      return;
    }
    case "section": {
      ps.background = { color: hex(col.brandDeep) };
      ps.addText((c.lang === "ms" ? "BAHAGIAN" : "SECTION"), { x: px(160), y: 2.3, w: 6, h: 0.4, fontSize: 12, bold: true, charSpacing: 3, color: "FFFFFF", transparency: 25, fontFace: fontOk(t.fontBody) });
      ps.addText(plain(s.title), { x: px(160), y: 2.7, w: W - px(320), h: 1.6, fontSize: 40, bold: true, color: "FFFFFF", fontFace: fontOk(t.fontDisplay), valign: "top", fit: "shrink" });
      ps.addShape(c.pres.ShapeType.rect, { x: px(160), y: 4.4, w: 0.85, h: 0.06, fill: { color: "FFFFFF" }, line: { color: "FFFFFF" } });
      if (s.subtitle) ps.addText(plain(s.subtitle), { x: px(160), y: 4.6, w: W - px(320), h: 1, fontSize: 16, color: "FFFFFF", fontFace: fontOk(t.fontBody) });
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
        ps.addText(plain(s.body), { x: contentX, y, w: contentW, h: 0.6, fontSize: 15, color: hex(col.ink2), fontFace: fontOk(t.fontBody), valign: "top" });
        y += 0.65;
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
          ps.addText(plain(hd as string), { x: (x as number) + 0.25, y, w: cw - 0.5, h: 0.5, fontSize: 18, bold: true, color: hex(col.brandDeep), fontFace: fontOk(t.fontDisplay) });
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
        if (s.chart.source) ps.addText(plain(s.chart.source), { x: contentX, y: bodyBottom - 0.35, w: contentW, h: 0.3, fontSize: 10, color: hex(col.muted), fontFace: fontOk(t.fontBody) });
      }
      break;
    }
    case "table": {
      if (s.table) {
        table(ps, s.table, contentX, y0, contentW, availH, c);
        if (s.table.source) ps.addText(plain(s.table.source), { x: contentX, y: bodyBottom - 0.35, w: contentW, h: 0.3, fontSize: 10, color: hex(col.muted), fontFace: fontOk(t.fontBody) });
      }
      break;
    }
    case "diagram": {
      if (s.diagram) diagram(ps, s.diagram, contentX, y0, contentW, availH - (s.body ? 0.5 : 0), c);
      if (s.body) ps.addText(plain(s.body), { x: contentX, y: bodyBottom - 0.45, w: contentW, h: 0.4, fontSize: 12, color: hex(col.ink2), fontFace: fontOk(t.fontBody) });
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
        ps.addText(s.image?.prompt ? `${c.lang === "ms" ? "Gambar" : "Figure"}: ${s.image.prompt}` : c.lang === "ms" ? "Tiada gambar dipilih" : "No picture chosen", { x: contentX + 0.4, y: y0, w: fw - 0.8, h: fh, fontSize: 13, color: hex(col.muted), align: "center", valign: "middle", fontFace: fontOk(t.fontBody) });
      }
      if (side) bullets(ps, s.bullets!, contentX + contentW - side, y0 + 0.2, side, availH - 0.4, c, 14);
      if (s.image?.caption) ps.addText(plain(s.image.caption), { x: contentX, y: bodyBottom - 0.4, w: contentW, h: 0.35, fontSize: 11, color: hex(col.muted), fontFace: fontOk(t.fontBody) });
      break;
    }
    case "quote": {
      ps.addText(`“${plain(s.quote?.text ?? "")}`, { x: contentX, y: y0 + 0.2, w: contentW - 1, h: availH * 0.65, fontSize: 30, color: hex(col.ink), fontFace: fontOk(t.fontDisplay), valign: "middle", fit: "shrink" });
      if (s.quote?.by) ps.addText(plain(s.quote.by), { x: contentX, y: y0 + availH * 0.7, w: contentW - 1, h: 0.6, fontSize: 15, color: hex(col.ink2), fontFace: fontOk(t.fontBody) });
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
        ps.addText(plain(k.value), { x: x + 0.2, y: ty + 0.25, w: tw - 0.4, h: 1.1, fontSize: 40, bold: true, color: hex(col.brandDeep), fontFace: fontOk(t.fontDisplay), valign: "middle", fit: "shrink" });
        ps.addText(plain(k.label), { x: x + 0.2, y: ty + 1.35, w: tw - 0.4, h: 0.6, fontSize: 13, bold: true, color: hex(col.ink), fontFace: fontOk(t.fontBody), valign: "top", fit: "shrink" });
        if (k.note) ps.addText(plain(k.note), { x: x + 0.2, y: ty + 1.9, w: tw - 0.4, h: th - 2, fontSize: 10, color: hex(col.muted), fontFace: fontOk(t.fontBody), valign: "top" });
      });
      if (s.body) ps.addText(plain(s.body), { x: contentX, y: bodyBottom - 0.45, w: contentW, h: 0.4, fontSize: 12, color: hex(col.ink2), fontFace: fontOk(t.fontBody) });
      break;
    }
    case "cards": {
      cards(ps, s.cards ?? [], contentX, y0, contentW, availH - (s.body ? 0.5 : 0), c);
      if (s.body) ps.addText(plain(s.body), { x: contentX, y: bodyBottom - 0.45, w: contentW, h: 0.4, fontSize: 12, color: hex(col.ink2), fontFace: fontOk(t.fontBody) });
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
