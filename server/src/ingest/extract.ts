import path from "node:path";
import JSZip from "jszip";
import { sniffPicture } from "./sniff.js";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

// One entry point for every upload. A zip or a folder upload becomes many
// sources; a picture becomes a media candidate with no text.

export interface Extracted {
  name: string;
  relPath: string;
  kind: "pdf" | "docx" | "pptx" | "sheet" | "text" | "html" | "image" | "unknown";
  text: string;
  /** Present for pictures: the bytes the media store keeps. */
  image?: { buf: Buffer; mime: string };
  /** Pictures found inside this file (figures in a PDF), each its own source. */
  figures?: Extracted[];
  /** Why the file could not be read, when it could not. */
  error?: string;
}

/** A file and the pictures inside it, as separate sources. */
function flat(e: Extracted): Extracted[] {
  const { figures, ...rest } = e;
  return [rest, ...(figures ?? [])];
}

const IMAGE_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };
const SKIP = /(^|\/)(\.git|node_modules|__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/;

export async function extractMany(name: string, buf: Buffer, relPath = name): Promise<Extracted[]> {
  const ext = path.extname(name).toLowerCase();
  const all = ext === ".zip" ? await extractZip(buf, relPath.replace(/\.zip$/i, "")) : flat(await extractOne(name, buf, relPath));
  for (const e of all) if (e.text.length > TEXT_MAX) e.text = e.text.slice(0, TEXT_MAX);
  return all;
}

/** A zip may not unpack past these: a small archive of repeated bytes can otherwise fill memory. */
const ZIP_MAX_TOTAL = 200 * 1024 * 1024;
const ZIP_MAX_ENTRY = 60 * 1024 * 1024;
const ZIP_MAX_FILES = 500;
const ZIP_MAX_DEPTH = 3;
/** Text kept from one file: more than any writer can take in. */
const TEXT_MAX = 2_000_000;

async function extractZip(buf: Buffer, prefix: string, budget = { left: ZIP_MAX_TOTAL, files: ZIP_MAX_FILES }, depth = 0): Promise<Extracted[]> {
  const zip = await JSZip.loadAsync(buf);
  const out: Extracted[] = [];
  const entries = Object.values(zip.files).filter((f) => !f.dir && !SKIP.test(f.name));
  for (const f of entries) {
    const rel = `${prefix}/${f.name}`;
    // The size the entry claims, checked before unpacking; then the real size, as it unpacks.
    const claimed = Number((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0);
    if (budget.files <= 0 || claimed > ZIP_MAX_ENTRY || claimed > budget.left) {
      out.push({ name: path.basename(f.name), relPath: rel, kind: "unknown", text: "", error: "too large to unpack, or the archive holds too much" });
      continue;
    }
    const b = await unpackCapped(f, Math.min(ZIP_MAX_ENTRY, budget.left));
    if (!b) {
      out.push({ name: path.basename(f.name), relPath: rel, kind: "unknown", text: "", error: "too large to unpack" });
      budget.left = 0;
      continue;
    }
    budget.left -= b.length;
    budget.files--;
    if (path.extname(f.name).toLowerCase() === ".zip") {
      if (depth + 1 >= ZIP_MAX_DEPTH) out.push({ name: path.basename(f.name), relPath: rel, kind: "unknown", text: "", error: "zip nested too deep" });
      else out.push(...(await extractZip(b, rel.replace(/\.zip$/i, ""), budget, depth + 1)));
    } else {
      out.push(...flat(await extractOne(path.basename(f.name), b, rel)));
    }
  }
  return out;
}

/** An Office file is a zip: refuse one whose parts would unpack past the limits, before any reader opens it. */
async function assertZipFits(buf: Buffer): Promise<void> {
  const zip = await JSZip.loadAsync(buf);
  let total = 0;
  for (const f of Object.values(zip.files)) {
    const n = Number((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0);
    if (n > ZIP_MAX_ENTRY) throw new Error("a part of this file is too large to unpack");
    total += n;
  }
  if (total > ZIP_MAX_TOTAL / 2) throw new Error("this file unpacks to more than 100 MB");
}

/** Unpack one zip entry, giving up as soon as it passes `max` bytes. */
function unpackCapped(f: JSZip.JSZipObject, max: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const stream = (f as unknown as { internalStream: (t: string) => { on: (e: string, cb: (x?: unknown) => void) => unknown; resume: () => void; pause: () => void } }).internalStream("uint8array");
    stream.on("data", (d) => {
      if (done) return;
      size += (d as Uint8Array).length;
      if (size > max) {
        done = true;
        stream.pause();
        resolve(null);
        return;
      }
      chunks.push(Buffer.from(d as Uint8Array));
    });
    stream.on("error", () => {
      if (!done) resolve(null);
      done = true;
    });
    stream.on("end", () => {
      if (!done) resolve(Buffer.concat(chunks));
      done = true;
    });
    stream.resume();
  });
}

export async function extractOne(name: string, buf: Buffer, relPath = name): Promise<Extracted> {
  const ext = path.extname(name).toLowerCase();
  const base = { name, relPath };
  try {
    if (ext === ".pdf") {
      const text = clean(await pdfText(buf));
      // The figures are a bonus: a PDF whose pictures cannot be read still gives its text.
      const figures = await pdfFigures(buf).catch(() => []);
      const stem = name.replace(/\.pdf$/i, "");
      return {
        ...base,
        kind: "pdf",
        text,
        figures: figures.map((f, i) => ({ name: `${stem} - p${f.page} figure ${i + 1}.jpg`, relPath: `${relPath.replace(/\.pdf$/i, "")}/p${f.page}-figure-${i + 1}.jpg`, kind: "image" as const, text: "", image: { buf: f.jpg, mime: "image/jpeg" } })),
      };
    }
    if ([".docx", ".pptx", ".xlsx", ".xlsm"].includes(ext)) await assertZipFits(buf);
    if (ext === ".docx") return { ...base, kind: "docx", text: clean((await mammoth.extractRawText({ buffer: buf })).value) };
    if (ext === ".pptx") return { ...base, kind: "pptx", text: clean(await pptxText(buf)) };
    if ([".xlsx", ".xlsm", ".xls", ".csv", ".tsv"].includes(ext)) return { ...base, kind: "sheet", text: sheetText(buf) };
    if ([".html", ".htm"].includes(ext)) return { ...base, kind: "html", text: clean(htmlToText(buf.toString("utf8"))) };
    if ([".md", ".txt", ".json", ".yaml", ".yml", ".rtf", ".xml"].includes(ext)) return { ...base, kind: "text", text: clean(buf.toString("utf8")) };
    if (IMAGE_MIME[ext]) {
      // Trust the bytes, not the name: a renamed file is not a picture.
      const mime = sniffPicture(buf);
      return mime ? { ...base, kind: "image", text: "", image: { buf, mime } } : { ...base, kind: "unknown", text: "", error: "not a readable picture" };
    }
    // Unknown extension: keep it if it looks like text.
    const sample = buf.subarray(0, 4000).toString("utf8");
    if (!/[\u0000-\u0008\u000E-\u001F]/.test(sample)) return { ...base, kind: "text", text: clean(buf.toString("utf8")) };
    return { ...base, kind: "unknown", text: "" };
  } catch (e) {
    // Never a source: an error message would reach the writer as if it were the file's content.
    return { ...base, kind: "unknown", text: "", error: (e as Error).message };
  }
}

async function pdfText(buf: Buffer): Promise<string> {
  // Non-literal specifier keeps TypeScript from demanding a declaration file.
  const spec = "pdfjs-dist/legacy/build/pdf.mjs";
  const pdfjs = await import(spec);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let line = "";
    let lastY: number | null = null;
    const parts: string[] = [];
    for (const item of content.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = item.transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        parts.push(line.trim());
        line = "";
      }
      line += item.str + (item.hasEOL ? "\n" : " ");
      lastY = y;
    }
    parts.push(line.trim());
    pages.push(`[p.${p}]\n${parts.filter(Boolean).join("\n")}`);
  }
  await doc.destroy();
  return pages.join("\n\n");
}

/** Figures worth a slide: big enough to be a chart, photo or poster, not a logo, icon or rule. */
const FIG_MIN_W = 240;
const FIG_MIN_H = 160;
const FIG_MIN_AREA = 90_000;
const FIG_MAX = 8;
const FIG_PAGES = 40;
const FIG_MAX_PIXELS = 40_000_000;

/** The raster pictures embedded in a PDF, as JPEG, in page order, at most FIG_MAX. */
export async function pdfFigures(buf: Buffer): Promise<{ page: number; jpg: Buffer; width: number; height: number }[]> {
  const spec = "pdfjs-dist/legacy/build/pdf.mjs";
  const pdfjs = await import(spec);
  const jpeg = (await import("jpeg-js")).default;
  // maxImageSize: pdfjs does not even decode a picture bigger than a slide could ever need.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0, isEvalSupported: false, useSystemFonts: true, isOffscreenCanvasSupported: false, isImageDecoderSupported: false, maxImageSize: FIG_MAX_PIXELS }).promise;
  const out: { page: number; jpg: Buffer; width: number; height: number }[] = [];
  const seen = new Set<string>();
  try {
    for (let p = 1; p <= Math.min(doc.numPages, FIG_PAGES) && out.length < FIG_MAX; p++) {
      const page = await doc.getPage(p);
      const ops = await page.getOperatorList();
      for (let i = 0; i < ops.fnArray.length && out.length < FIG_MAX; i++) {
        if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
        const id = ops.argsArray[i]?.[0];
        if (typeof id !== "string") continue;
        const store = id.startsWith("g_") ? page.commonObjs : page.objs;
        const img = await new Promise<{ width: number; height: number; kind: number; data?: Uint8Array; ref?: string } | null>((res) => {
          const t = setTimeout(() => res(null), 5000);
          try {
            store.get(id, (v: never) => {
              clearTimeout(t);
              res(v);
            });
          } catch {
            clearTimeout(t);
            res(null);
          }
        });
        if (!img?.data || img.width < FIG_MIN_W || img.height < FIG_MIN_H || img.width * img.height < FIG_MIN_AREA || img.width * img.height > FIG_MAX_PIXELS) continue;
        const key = img.ref ?? `${img.width}x${img.height}:${img.data.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // kind 2 is RGB, kind 3 RGBA; kind 1 (1-bit masks) is line art, not a figure.
        const n = img.width * img.height;
        let rgba: Buffer;
        if (img.kind === 3 && img.data.length >= n * 4) rgba = Buffer.from(img.data.buffer, img.data.byteOffset, n * 4);
        else if (img.kind === 2 && img.data.length >= n * 3) {
          rgba = Buffer.alloc(n * 4);
          for (let k = 0, j = 0; k < n; k++, j += 3) {
            rgba[k * 4] = img.data[j];
            rgba[k * 4 + 1] = img.data[j + 1];
            rgba[k * 4 + 2] = img.data[j + 2];
            rgba[k * 4 + 3] = 255;
          }
        } else continue;
        const jpg = Buffer.from(jpeg.encode({ width: img.width, height: img.height, data: rgba }, 85).data);
        out.push({ page: p, jpg, width: img.width, height: img.height });
      }
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
}

async function pptxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => num(a) - num(b));
  const out: string[] = [];
  for (const f of slideFiles) {
    const xml = await zip.file(f)!.async("string");
    const n = num(f);
    const text = xmlText(xml);
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    const notes = notesFile ? xmlText(await notesFile.async("string")) : "";
    out.push(`[slide ${n}]\n${text}${notes ? `\n[notes]\n${notes}` : ""}`);
  }
  return out.join("\n\n");
}

function num(s: string): number {
  return Number(s.match(/(\d+)\.xml$/)?.[1] ?? 0);
}

function xmlText(xml: string): string {
  // Paragraph boundaries become line breaks; runs inside a paragraph join.
  return xml
    .replace(/<\/a:p>/g, "\n")
    .replace(/<a:t>([^<]*)<\/a:t>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}

function sheetText(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const out: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    const lines = csv.split("\n");
    const capped = lines.length > 400 ? [...lines.slice(0, 400), `[… ${lines.length - 400} more rows]`] : lines;
    out.push(`[sheet: ${name}]\n${capped.join("\n")}`);
  }
  return out.join("\n\n");
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function clean(s: string): string {
  return s
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
