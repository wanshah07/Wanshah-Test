import path from "node:path";
import JSZip from "jszip";
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
}

const IMAGE_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };
const SKIP = /(^|\/)(\.git|node_modules|__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/;

export async function extractMany(name: string, buf: Buffer, relPath = name): Promise<Extracted[]> {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".zip") return extractZip(buf, relPath.replace(/\.zip$/i, ""));
  return [await extractOne(name, buf, relPath)];
}

async function extractZip(buf: Buffer, prefix: string): Promise<Extracted[]> {
  const zip = await JSZip.loadAsync(buf);
  const out: Extracted[] = [];
  const entries = Object.values(zip.files).filter((f) => !f.dir && !SKIP.test(f.name));
  for (const f of entries) {
    const b = Buffer.from(await f.async("uint8array"));
    const rel = `${prefix}/${f.name}`;
    if (path.extname(f.name).toLowerCase() === ".zip") {
      out.push(...(await extractZip(b, rel.replace(/\.zip$/i, ""))));
    } else {
      out.push(await extractOne(path.basename(f.name), b, rel));
    }
  }
  return out;
}

export async function extractOne(name: string, buf: Buffer, relPath = name): Promise<Extracted> {
  const ext = path.extname(name).toLowerCase();
  const base = { name, relPath };
  try {
    if (ext === ".pdf") return { ...base, kind: "pdf", text: clean(await pdfText(buf)) };
    if (ext === ".docx") return { ...base, kind: "docx", text: clean((await mammoth.extractRawText({ buffer: buf })).value) };
    if (ext === ".pptx") return { ...base, kind: "pptx", text: clean(await pptxText(buf)) };
    if ([".xlsx", ".xlsm", ".xls", ".csv", ".tsv"].includes(ext)) return { ...base, kind: "sheet", text: sheetText(buf) };
    if ([".html", ".htm"].includes(ext)) return { ...base, kind: "html", text: clean(htmlToText(buf.toString("utf8"))) };
    if ([".md", ".txt", ".json", ".yaml", ".yml", ".rtf", ".xml"].includes(ext)) return { ...base, kind: "text", text: clean(buf.toString("utf8")) };
    if (IMAGE_MIME[ext]) return { ...base, kind: "image", text: "", image: { buf, mime: IMAGE_MIME[ext] } };
    // Unknown extension: keep it if it looks like text.
    const sample = buf.subarray(0, 4000).toString("utf8");
    if (!/[\u0000-\u0008\u000E-\u001F]/.test(sample)) return { ...base, kind: "text", text: clean(buf.toString("utf8")) };
    return { ...base, kind: "unknown", text: "" };
  } catch (e) {
    return { ...base, kind: "unknown", text: `[could not read ${name}: ${(e as Error).message}]` };
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
