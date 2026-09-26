import JSZip from "jszip";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { FONT_CHOICES, knownFonts, type Theme } from "@slidecraft/shared";
import { contrast, designTheme, distance, hueGap, isChromatic, parseHex, themeColors, toHex, type Picked, type RGB } from "./colour.js";
import { chatJson, type ContentPart, type LlmAuth } from "../llm/client.js";

// Reads a reference design: a PowerPoint file, a PDF of slides, or pictures
// of slides. What comes out is a theme (colours and fonts) and plain notes
// on how dense the reference is, which the writer follows.
//
// Everything that can be read from the file itself is read deterministically.
// Only pictures need a model, and only for what pixels cannot say (the fonts);
// if the endpoint cannot look at pictures, the colours still come through.

export interface DesignStats {
  slides: number;
  titleWords: number;
  longestTitle: number;
  linesPerSlide: number;
  charts: number;
  tables: number;
  pictures: number;
}

export interface DesignAnalysis {
  kind: "pptx" | "pdf" | "image";
  files: string[];
  colours: { hex: string; share: number }[];
  fonts: { display?: string; body?: string; found: string[] };
  stats?: DesignStats;
  warnings: string[];
}

export interface DesignDraft {
  name: string;
  theme: Theme;
  notes: string;
  analysis: DesignAnalysis;
  preview?: { buf: Buffer; mime: string };
}

export class DesignError extends Error {
  constructor(message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------- fonts

const FONT_KEYS = new Map(knownFonts().map((f) => [f.toLowerCase().replace(/[^a-z0-9]/g, ""), f]));

/** "ABCDEF+TimesNewRomanPS-BoldMT" → "Times New Roman". */
export function cleanFontName(raw: string): string {
  let n = raw.replace(/^[A-Z]{6}\+/, "").trim();
  n = n.replace(/[-,](Bold|Italic|BoldItalic|Regular|Light|Medium|SemiBold|Semibold|Black|Heavy|Thin|ExtraBold|ExtraLight|Oblique|BoldOblique|Book|Roman)+(MT)?$/i, "");
  n = n.replace(/(PSMT|PS|MT)$/, "").replace(/[-_]+$/, "");
  const key = n.toLowerCase().replace(/[^a-z0-9]/g, "");
  const known = FONT_KEYS.get(key);
  if (known) return known;
  if (!/\s/.test(n)) n = n.replace(/([a-z])([A-Z])/g, "$1 $2");
  return n;
}

// ---------------------------------------------------------------- PPTX

const SCHEME_SLOTS = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];

function colourOf(xml: string): string | null {
  const m = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(xml) ?? /<a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/.exec(xml);
  return m ? m[1].toUpperCase() : null;
}

function textOf(xml: string): string {
  return Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => m[1]).join(" ").replace(/\s+/g, " ").trim();
}

function words(s: string): number {
  return s ? s.split(/\s+/).filter(Boolean).length : 0;
}

async function readPptx(name: string, buf: Buffer): Promise<{ picked: Picked; fonts: DesignAnalysis["fonts"]; stats: DesignStats; colours: DesignAnalysis["colours"]; preview?: { buf: Buffer; mime: string }; warnings: string[] }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new DesignError(`${name} is not a readable PowerPoint file.`);
  }
  const read = async (p: string) => (zip.file(p) ? await zip.file(p)!.async("string") : "");
  const warnings: string[] = [];

  // The theme the first slide master uses.
  const masterRels = await read("ppt/slideMasters/_rels/slideMaster1.xml.rels");
  const themeTarget = /Target="\.\.\/theme\/(theme\d+\.xml)"/.exec(masterRels)?.[1] ?? "theme1.xml";
  const themeXml = await read(`ppt/theme/${themeTarget}`);
  if (!themeXml) throw new DesignError(`${name} has no theme inside. Is it a PowerPoint file?`);
  const scheme: Record<string, string> = {};
  const clrScheme = /<a:clrScheme[\s\S]*?<\/a:clrScheme>/.exec(themeXml)?.[0] ?? "";
  for (const slot of SCHEME_SLOTS) {
    const block = new RegExp(`<a:${slot}>([\\s\\S]*?)</a:${slot}>`).exec(clrScheme)?.[1];
    const c = block ? colourOf(block) : null;
    if (c) scheme[slot] = c;
  }
  const master = await read("ppt/slideMasters/slideMaster1.xml");
  const clrMapTag = /<p:clrMap([^>]*)\/>/.exec(master)?.[1] ?? "";
  const clrMap: Record<string, string> = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };
  for (const m of clrMapTag.matchAll(/(\w+)="(\w+)"/g)) clrMap[m[1]] = m[2];
  const resolve = (val: string): string | null => scheme[clrMap[val] ?? val] ?? null;
  const fillOf = (xml: string): string | null => {
    const m = /<a:(srgbClr|schemeClr|sysClr) (?:val|lastClr)="([^"]+)"/.exec(xml);
    if (!m) return null;
    if (m[1] === "schemeClr") return resolve(m[2]);
    return colourOf(xml);
  };
  const bgOf = (xml: string): string | null => {
    const bg = /<p:bg>([\s\S]*?)<\/p:bg>/.exec(xml)?.[1];
    if (!bg) return null;
    const solid = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(bg)?.[1];
    if (solid) return fillOf(solid);
    const grad = /<a:gs [^>]*>([\s\S]*?)<\/a:gs>/.exec(bg)?.[1];
    if (grad) return fillOf(grad);
    const ref = /<p:bgRef[^>]*>([\s\S]*?)<\/p:bgRef>/.exec(bg)?.[1];
    if (ref) return fillOf(ref);
    return null; // a picture background: no single colour
  };
  const masterBg = bgOf(master) ?? resolve("bg1") ?? "FFFFFF";

  const fontsFrom = (tag: "majorFont" | "minorFont") => {
    const block = new RegExp(`<a:${tag}>([\\s\\S]*?)</a:${tag}>`).exec(themeXml)?.[1] ?? "";
    const tf = /<a:latin typeface="([^"]*)"/.exec(block)?.[1] ?? "";
    return tf ? cleanFontName(tf) : "";
  };
  let display = fontsFrom("majorFont");
  let body = fontsFrom("minorFont");

  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]))
    .slice(0, 200);
  const tally = new Map<string, number>();
  const bgTally = new Map<string, number>();
  const typefaces = new Map<string, number>();
  const titleLens: number[] = [];
  const lineCounts: number[] = [];
  let charts = 0;
  let tables = 0;
  let pictures = 0;
  for (const p of slidePaths) {
    const x = await read(p);
    const bg = bgOf(x) ?? masterBg;
    bgTally.set(bg, (bgTally.get(bg) ?? 0) + 1);
    for (const m of x.matchAll(/<a:solidFill>\s*<a:(srgbClr|schemeClr) val="([^"]+)"/g)) {
      const c = m[1] === "schemeClr" ? resolve(m[2]) : m[2].toUpperCase();
      if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
    }
    for (const m of x.matchAll(/<a:latin typeface="([^"+][^"]*)"/g)) typefaces.set(cleanFontName(m[1]), (typefaces.get(cleanFontName(m[1])) ?? 0) + 1);
    charts += (x.match(/graphicData uri="[^"]*drawingml\/2006\/chart"/g) ?? []).length;
    tables += (x.match(/<a:tbl[\s>/]/g) ?? []).length;
    pictures += (x.match(/<p:pic[\s>/]/g) ?? []).length;
    const shapes = (x.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []).filter((sp) => textOf(sp));
    // A title placeholder is the title; a deck built from plain text boxes has
    // none, and there the largest text on the slide is the title.
    const sizeOf = (sp: string) => Math.max(0, ...Array.from(sp.matchAll(/ sz="(\d+)"/g)).map((m) => Number(m[1])));
    let title = shapes.find((sp) => /<p:ph [^>]*type="(title|ctrTitle)"/.test(sp));
    if (!title && shapes.length > 1) {
      const biggest = [...shapes].sort((a, b) => sizeOf(b) - sizeOf(a))[0];
      if (sizeOf(biggest) > 0) title = biggest;
    }
    if (title) titleLens.push(words(textOf(title)));
    let lines = 0;
    for (const sp of shapes) if (sp !== title) lines += (sp.match(/<a:p>(?:(?!<\/a:p>)[\s\S])*?<a:t>[^<]+<\/a:t>/g) ?? []).length;
    lineCounts.push(lines);
  }
  if (!slidePaths.length) warnings.push("The file has no slides; only its theme was read.");
  // A typeface set by hand on most runs is the real body font, whatever the theme says.
  const topFace = [...typefaces.entries()].sort((a, b) => b[1] - a[1])[0];
  const totalFaces = [...typefaces.values()].reduce((a, b) => a + b, 0);
  if (topFace && topFace[1] / totalFaces > 0.5 && topFace[1] >= 5) body = topFace[0];
  if (!display) display = body;

  const bgHex = [...bgTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? masterBg;
  const bg = parseHex(bgHex) ?? [255, 255, 255];
  const candidates: RGB[] = [];
  for (const [hex] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    const c = parseHex(hex);
    if (c && isChromatic(c) && distance(c, bg) > 40) candidates.push(c);
  }
  // Fall back on the theme's own accents when the slides use none by hand.
  for (const slot of ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"]) {
    const c = scheme[slot] ? parseHex(scheme[slot]) : null;
    if (c && isChromatic(c) && distance(c, bg) > 40) candidates.push(c);
  }
  const brand = candidates[0];
  const accent = candidates.find((c) => brand && hueGap(c, brand) >= 25);
  const accent2 = candidates.find((c) => brand && accent && hueGap(c, brand) >= 25 && hueGap(c, accent) >= 25);
  const inkOptions = [resolve("tx1"), resolve("tx2"), scheme.dk1, scheme.lt1].map((h) => (h ? parseHex(h) : null)).filter((c): c is RGB => !!c);
  const ink = inkOptions.find((c) => contrast(c, bg) >= 4.5);

  const totalUse = [...tally.values()].reduce((a, b) => a + b, 0) || 1;
  const colours = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([hex, n]) => ({ hex: "#" + hex, share: Math.round((n / totalUse) * 100) / 100 }));
  const thumb = zip.file("docProps/thumbnail.jpeg");
  const preview = thumb ? { buf: Buffer.from(await thumb.async("uint8array")), mime: "image/jpeg" } : undefined;
  return {
    picked: { bg, ink, brand, accent, accent2 },
    fonts: { display, body, found: [...new Set([display, body, ...typefaces.keys()].filter(Boolean))] },
    stats: statsOf(slidePaths.length, titleLens, lineCounts, charts, tables, pictures),
    colours,
    preview,
    warnings,
  };
}

function statsOf(slides: number, titleLens: number[], lineCounts: number[], charts: number, tables: number, pictures: number): DesignStats {
  const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0);
  const content = lineCounts.filter((n) => n > 0);
  return { slides, titleWords: avg(titleLens), longestTitle: titleLens.length ? Math.max(...titleLens) : 0, linesPerSlide: avg(content), charts, tables, pictures };
}

// ---------------------------------------------------------------- PDF

async function readPdf(name: string, buf: Buffer): Promise<{ picked: Picked; fonts: DesignAnalysis["fonts"]; stats: DesignStats; colours: DesignAnalysis["colours"]; warnings: string[] }> {
  const spec = "pdfjs-dist/legacy/build/pdf.mjs";
  const pdfjs = await import(spec);
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0, isEvalSupported: false, useSystemFonts: true }).promise;
  } catch {
    throw new DesignError(`${name} is not a readable PDF.`);
  }
  const OPS = pdfjs.OPS as Record<string, number>;
  const FILLS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const fillWeight = new Map<string, number>();
  const textColour = new Map<string, number>();
  const bgTally = new Map<string, number>();
  const fontChars = new Map<string, number>();
  const fontMaxSize = new Map<string, number>();
  const titleLens: number[] = [];
  const lineCounts: number[] = [];
  const pages = Math.min(doc.numPages, 30);
  for (let n = 1; n <= pages; n++) {
    const page = await doc.getPage(n);
    const [x0, y0, x1, y1] = page.view as number[];
    const pageArea = Math.abs((x1 - x0) * (y1 - y0)) || 1;
    const ops = await page.getOperatorList();
    let fill = "#000000";
    let font = "";
    let size = 0;
    let pageBg = "#FFFFFF";
    const runs: { font: string; size: number; text: string }[] = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === OPS.setFillRGBColor && typeof args?.[0] === "string") fill = args[0].toUpperCase();
      else if (fn === OPS.setFont) {
        let fname = String(args[0]);
        try {
          fname = cleanFontName(String(page.commonObjs.get(args[0])?.name ?? fname));
        } catch {
          /* font object not resolved: keep the id */
        }
        font = fname;
        size = Math.abs(Number(args[1]) || 0);
      } else if (fn === OPS.showText || fn === OPS.showSpacedText) {
        const glyphs = (Array.isArray(args[0]) ? args[0] : []) as ({ unicode?: string } | number)[];
        const text = glyphs.map((g) => (typeof g === "object" && g ? g.unicode ?? "" : "")).join("");
        const chars = text.replace(/\s/g, "").length;
        if (!chars) continue;
        textColour.set(fill, (textColour.get(fill) ?? 0) + chars);
        fontChars.set(font, (fontChars.get(font) ?? 0) + chars);
        fontMaxSize.set(font, Math.max(fontMaxSize.get(font) ?? 0, size));
        runs.push({ font, size, text });
      } else if (fn === OPS.constructPath) {
        const paint = args?.[0];
        const box = args?.[2] as Record<string, number> | undefined;
        if (!FILLS.has(paint) || !box) continue;
        const area = Math.abs((box[2] - box[0]) * (box[3] - box[1]));
        if (area / pageArea >= 0.85) pageBg = fill;
        else fillWeight.set(fill, (fillWeight.get(fill) ?? 0) + Math.min(1, area / pageArea) * 100);
      }
    }
    bgTally.set(pageBg, (bgTally.get(pageBg) ?? 0) + 1);
    if (runs.length) {
      const top = Math.max(...runs.map((r) => r.size));
      titleLens.push(words(runs.filter((r) => r.size === top).map((r) => r.text).join(" ").trim()));
      lineCounts.push(runs.filter((r) => r.size < top).length);
    }
  }
  const bg = parseHex([...bgTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#FFFFFF") ?? [255, 255, 255];
  const inkHex = [...textColour.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => parseHex(h)).find((c): c is RGB => !!c && contrast(c, bg) >= 4.5);
  const all = new Map(fillWeight);
  for (const [h, n] of textColour) all.set(h, (all.get(h) ?? 0) + n / 20);
  const ranked = [...all.entries()].sort((a, b) => b[1] - a[1]);
  const chroma = ranked.map(([h]) => parseHex(h)).filter((c): c is RGB => !!c && isChromatic(c) && distance(c, bg) > 40);
  const brand = chroma[0];
  const accent = chroma.find((c) => brand && hueGap(c, brand) >= 25);
  const accent2 = chroma.find((c) => brand && accent && hueGap(c, brand) >= 25 && hueGap(c, accent) >= 25);
  const byChars = [...fontChars.entries()].sort((a, b) => b[1] - a[1]);
  const body = byChars[0]?.[0] || "";
  const display = [...fontMaxSize.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || body;
  const total = ranked.reduce((a, [, n]) => a + n, 0) || 1;
  return {
    picked: { bg, ink: inkHex, brand, accent, accent2 },
    fonts: { display, body, found: byChars.map(([f]) => f).filter(Boolean) },
    stats: statsOf(pages, titleLens, lineCounts, 0, 0, 0),
    colours: ranked.slice(0, 8).map(([hex, n]) => ({ hex, share: Math.round((n / total) * 100) / 100 })),
    warnings: doc.numPages > pages ? [`Read the first ${pages} of ${doc.numPages} pages.`] : [],
  };
}

// ---------------------------------------------------------------- pictures

function decode(name: string, buf: Buffer, mime: string): { width: number; height: number; data: Uint8Array } {
  try {
    if (mime === "image/png") return PNG.sync.read(buf);
    if (mime === "image/jpeg") return jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512, maxResolutionInMP: 60 });
  } catch (e) {
    throw new DesignError(`${name} could not be read as a picture: ${(e as Error).message}`);
  }
  throw new DesignError(`${name}: use a PNG or JPEG screenshot of a slide.`);
}

export function paletteOf(img: { width: number; height: number; data: Uint8Array }): { picked: Picked; colours: DesignAnalysis["colours"] } {
  const { width: w, height: h, data } = img;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 80000)));
  type Bucket = { n: number; r: number; g: number; b: number };
  const all = new Map<number, Bucket>();
  const edge = new Map<number, Bucket>();
  let samples = 0;
  const add = (m: Map<number, Bucket>, k: number, r: number, g: number, b: number) => {
    const x = m.get(k);
    if (x) {
      x.n++;
      x.r += r;
      x.g += g;
      x.b += b;
    } else m.set(k, { n: 1, r, g, b });
  };
  const ex = Math.max(1, Math.round(w * 0.03));
  const ey = Math.max(1, Math.round(h * 0.03));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      add(all, k, r, g, b);
      samples++;
      if (x < ex || x >= w - ex || y < ey || y >= h - ey) add(edge, k, r, g, b);
    }
  }
  if (!samples) throw new DesignError("The picture is empty or fully transparent.");
  const cluster = (m: Map<number, Bucket>) => {
    const out: { c: RGB; n: number }[] = [];
    for (const bk of [...m.values()].sort((a, b) => b.n - a.n)) {
      const c: RGB = [bk.r / bk.n, bk.g / bk.n, bk.b / bk.n];
      const near = out.find((o) => distance(o.c, c) < 30);
      if (near) {
        near.c = [(near.c[0] * near.n + c[0] * bk.n) / (near.n + bk.n), (near.c[1] * near.n + c[1] * bk.n) / (near.n + bk.n), (near.c[2] * near.n + c[2] * bk.n) / (near.n + bk.n)];
        near.n += bk.n;
      } else if (out.length < 32) out.push({ c, n: bk.n });
    }
    return out.sort((a, b) => b.n - a.n);
  };
  const clusters = cluster(all);
  const bg = (cluster(edge)[0] ?? clusters[0]).c;
  const share = (n: number) => n / samples;
  const ink = clusters.filter((k) => share(k.n) >= 0.002 && contrast(k.c, bg) >= 4.5)[0]?.c;
  const chroma = clusters.filter((k) => share(k.n) >= 0.003 && isChromatic(k.c) && distance(k.c, bg) > 40).map((k) => k.c);
  const brand = chroma[0];
  const accent = chroma.find((c) => brand && hueGap(c, brand) >= 25);
  const accent2 = chroma.find((c) => brand && accent && hueGap(c, brand) >= 25 && hueGap(c, accent) >= 25);
  return { picked: { bg, ink, brand, accent, accent2 }, colours: clusters.slice(0, 8).map((k) => ({ hex: toHex(k.c), share: Math.round(share(k.n) * 100) / 100 })) };
}

const LOOK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fontDisplay", "fontBody", "style"],
  properties: {
    fontDisplay: { type: "string", enum: FONT_CHOICES },
    fontBody: { type: "string", enum: FONT_CHOICES },
    style: { type: "string" },
  },
};

/** Asks the writer model, if it can see pictures, which fonts and layout habits the slides use. */
async function look(auth: LlmAuth, pics: { name: string; buf: Buffer; mime: string }[]): Promise<{ fontDisplay: string; fontBody: string; style: string }> {
  const content: ContentPart[] = [
    { type: "text", text: `These are pictures of slides from a reference deck. Name the closest heading font and body font from this list: ${FONT_CHOICES.join(", ")}. Then describe in at most 60 words how the slides are laid out: title position and length, how much text per slide, use of charts, icons, photos, colour blocks. Plain words, no praise.` },
    ...pics.slice(0, 4).map((p): ContentPart => ({ type: "image_url", image_url: { url: `data:${p.mime};base64,${p.buf.toString("base64")}`, detail: "low" } })),
  ];
  return chatJson({ auth, system: "You describe slide designs for a designer who will reproduce them. Answer only with the JSON the schema asks for.", user: content, schemaName: "look", schema: LOOK_SCHEMA, maxTokens: 600, timeoutMs: 60000 });
}

// ---------------------------------------------------------------- entry

export function styleNotes(s: DesignStats | undefined, extra?: string): string {
  const out: string[] = [];
  if (s && s.slides) {
    out.push(`Reference deck: ${s.slides} slide${s.slides === 1 ? "" : "s"}.`);
    if (s.titleWords) out.push(`Titles average ${s.titleWords} words (longest ${s.longestTitle}); keep titles near that length.`);
    if (s.linesPerSlide) out.push(`Content slides carry about ${Math.round(s.linesPerSlide)} lines of text; match that density.`);
    const uses = [s.charts && `${s.charts} chart${s.charts === 1 ? "" : "s"}`, s.tables && `${s.tables} table${s.tables === 1 ? "" : "s"}`, s.pictures && `${s.pictures} picture${s.pictures === 1 ? "" : "s"}`].filter(Boolean);
    if (uses.length) out.push(`It uses ${uses.join(", ")}; use the same kinds of visual where the sources allow.`);
  }
  if (extra) out.push(extra.trim());
  return out.join(" ");
}

export interface RefFile {
  name: string;
  buf: Buffer;
}

function kindOf(name: string): "pptx" | "pdf" | "png" | "jpeg" | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pptx" || ext === "potx") return "pptx";
  if (ext === "pdf") return "pdf";
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  return null;
}

/**
 * Reads the reference files into a design. A PowerPoint file wins over a PDF,
 * which wins over pictures, for colours and fonts; pictures still supply the
 * preview and, when the model can see them, the fonts and layout notes.
 */
export async function analyseReference(files: RefFile[], name: string, auth: LlmAuth | null): Promise<DesignDraft> {
  if (!files.length) throw new DesignError("Add a PowerPoint file, a PDF, or a PNG or JPEG of a slide.");
  const usable = files.filter((f) => kindOf(f.name));
  const unusable = files.filter((f) => !kindOf(f.name)).map((f) => f.name);
  if (!usable.length) throw new DesignError(`Could not use ${unusable.join(", ")}. Add a .pptx, .pdf, .png or .jpg.`);
  const warnings: string[] = unusable.length ? [`Not read: ${unusable.join(", ")}.`] : [];
  const pptx = usable.find((f) => kindOf(f.name) === "pptx");
  const pdf = usable.find((f) => kindOf(f.name) === "pdf");
  const pics = usable.filter((f) => ["png", "jpeg"].includes(kindOf(f.name)!)).map((f) => ({ name: f.name, buf: f.buf, mime: kindOf(f.name) === "png" ? "image/png" : "image/jpeg" }));

  let picked: Picked = {};
  let fonts: DesignAnalysis["fonts"] = { found: [] };
  let stats: DesignStats | undefined;
  let colours: DesignAnalysis["colours"] = [];
  let preview: DesignDraft["preview"];
  let kind: DesignAnalysis["kind"] = "image";
  if (pptx) {
    const r = await readPptx(pptx.name, pptx.buf);
    ({ picked, fonts, stats, colours, preview } = r);
    warnings.push(...r.warnings);
    kind = "pptx";
  } else if (pdf) {
    const r = await readPdf(pdf.name, pdf.buf);
    ({ picked, fonts, stats, colours } = r);
    warnings.push(...r.warnings);
    kind = "pdf";
  }
  if (pics.length) {
    preview = { buf: pics[0].buf, mime: pics[0].mime };
    if (kind === "image") {
      const pal = paletteOf(decode(pics[0].name, pics[0].buf, pics[0].mime));
      picked = pal.picked;
      colours = pal.colours;
    }
  }
  let lookNotes = "";
  if (pics.length && auth) {
    try {
      const l = await look(auth, pics);
      if (kind === "image") fonts = { display: l.fontDisplay, body: l.fontBody, found: [l.fontDisplay, l.fontBody] };
      lookNotes = l.style;
    } catch (e) {
      warnings.push(`The writer model could not look at the pictures (${(e as Error).message}). Colours were read from the pixels; pick the fonts in the editor.`);
    }
  } else if (kind === "image") {
    warnings.push("Fonts cannot be read from pixels without a writer model that sees pictures. Pick them in the editor.");
  }
  const theme = designTheme(name, themeColors(picked), { display: fonts.display, body: fonts.body });
  return {
    name,
    theme,
    notes: styleNotes(stats, lookNotes),
    analysis: { kind, files: usable.map((f) => f.name), colours, fonts, stats, warnings },
    preview,
  };
}
