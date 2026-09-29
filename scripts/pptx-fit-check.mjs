// Builds a PowerPoint file from over-full slides of every layout, removes
// PowerPoint's own "shrink on overflow" so only the exporter's sizing is
// tested, renders it with LibreOffice, and fails if any line of text leaves
// the slide or lands on top of another. Needs soffice on the PATH.
// Run: node scripts/pptx-fit-check.mjs [outDir]   (outDir gets the PDF)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pptx-fit-"));
process.env.DATA_DIR = tmp;
const { deckToPptx } = await import("../server/dist/export/pptx.js");
const { themePreset } = await import("../shared/dist/index.js");
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const out = process.argv[2];
const w = (n) => Array.from({ length: n }, (_, i) => `evidence${i % 7 ? "" : ","}`).join(" ");
const long = (n) => `Salicylic acid in rinse-off products ${w(n)}`;
const cites = ["EC 1223/2009 Annex III entry 98, as amended by Regulation (EU) 2019/1966", "ASEAN Cosmetic Directive Annex III Part 1", "NPRA Guidelines for Control of Cosmetic Products in Malaysia, rev. 2024", "Author A, Author B. J Cosmet Dermatol. 2025;24(3):101-112. doi:10.1111/jocd.99999"];
const slides = [
  { id: "t", layout: "title", title: long(30), subtitle: long(40) },
  { id: "s", layout: "section", title: long(25), subtitle: long(40) },
  { id: "b", layout: "bullets", kicker: "THE RULE", title: long(22), subtitle: long(30), body: long(40), bullets: Array.from({ length: 9 }, () => long(28)), citations: cites },
  { id: "2", layout: "two-column", kicker: "OBLIGATIONS", title: long(18), subtitle: long(25), leftHeading: long(8), rightHeading: long(8), bullets: Array.from({ length: 8 }, () => long(22)), bulletsRight: Array.from({ length: 8 }, () => long(22)), citations: cites },
  { id: "tb", layout: "table", kicker: "PATHWAYS", title: long(18), subtitle: long(20), table: { header: ["Pathway", "Duration and conditions", "Instrument", "Verdict"], rows: Array.from({ length: 10 }, () => [long(6), long(22), long(12), "PARTLY"]), source: long(12) }, citations: cites },
  { id: "k", layout: "kpi", kicker: "AT A GLANCE", title: long(18), kpi: Array.from({ length: 4 }, () => ({ value: "RM 1,250,000.00", label: long(14), note: long(20) })), body: long(30) },
  { id: "c", layout: "cards", kicker: "NEXT STEPS", title: long(18), subtitle: long(25), cards: Array.from({ length: 6 }, () => ({ heading: long(12), detail: long(45), tag: "MEDIUM" })), body: long(20), citations: cites },
  { id: "d", layout: "diagram", kicker: "PROCESS", title: long(15), diagram: { kind: "flow", steps: Array.from({ length: 7 }, () => ({ label: long(6), detail: long(20) })) }, body: long(25) },
  { id: "tl", layout: "diagram", kicker: "DATES", title: long(12), diagram: { kind: "timeline", events: Array.from({ length: 7 }, (_, i) => ({ when: `Q${(i % 4) + 1} 202${6 + (i >> 2)}`, label: long(18) })) } },
  { id: "mx", layout: "diagram", kicker: "COMPARISON", title: long(12), diagram: { kind: "matrix", rows: Array.from({ length: 8 }, () => long(5)), cols: ["Malaysia", "EU", "ASEAN", "China"], cells: Array.from({ length: 8 }, (_, i) => ["yes", "no", long(8), i % 2 ? "yes" : long(4)]) } },
  { id: "q", layout: "quote", title: long(10), quote: { text: long(90), by: long(20) } },
  { id: "i", layout: "image", title: long(20), image: { caption: long(30), prompt: long(30) }, bullets: Array.from({ length: 6 }, () => long(20)) },
  { id: "ch", layout: "chart", title: long(20), chart: { kind: "column", categories: ["2023", "2024", "2025"], series: [{ name: "Complaints", values: [412, 610, 838] }], source: long(15) }, bullets: Array.from({ length: 5 }, () => long(20)) },
  // The elements from the reference decks, over-full.
  { id: "hero", layout: "title", title: long(20), subtitle: long(30), kpi: Array.from({ length: 4 }, () => ({ value: "RM 1,250,000", label: long(10) })) },
  { id: "chx", layout: "chart", kicker: "EVIDENCE", badge: "PARTIAL EVIDENCE ONLY", title: long(18), subtitle: long(20), chart: { kind: "bar", categories: ["Ours", "Brand B", "Brand C", "Brand D"], series: [{ name: "Score", values: [9, 6, 5, 4] }], highlight: "Ours", source: long(12) }, aside: [{ heading: "Reading", items: Array.from({ length: 5 }, () => long(14)) }, { heading: "Watch-outs", items: Array.from({ length: 5 }, () => long(14)) }], callout: long(40), citations: cites },
  { id: "rg", layout: "kpi", kpiStyle: "rings", title: long(15), kpi: Array.from({ length: 4 }, (_, i) => ({ value: `+${20 * i + 5}%`, label: long(12), note: long(16) })), body: long(20), callout: long(25) },
  { id: "fx", layout: "facts", badge: "Q1", title: long(15), facts: Array.from({ length: 10 }, (_, i) => ({ label: long(3), value: long(30), highlight: i === 6 })), aside: [{ heading: "Watch-outs", items: Array.from({ length: 4 }, () => long(12)) }], citations: cites },
  { id: "gx", layout: "gallery", title: long(15), gallery: Array.from({ length: 6 }, () => ({ caption: long(18), prompt: long(8) })), body: long(20) },
  { id: "mpx", layout: "map", title: long(15), map: { region: "world", areas: ["MY", "SG", "ID", "TH", "VN", "PH", "EU", "UK", "US", "CN", "JP", "KR", "IN", "AU", "GCC", "BR", "ZA", "CA"].map((code, i) => ({ code, status: ["ALLOWED", "RESTRICTED 2%", "BANNED", "PENDING"][i % 4], note: long(12) })), legend: long(12), source: long(10) }, citations: cites },
  { id: "hbx", layout: "diagram", title: long(15), diagram: { kind: "hub", center: long(6), nodes: Array.from({ length: 8 }, () => ({ label: long(5), detail: long(16) })), pills: Array.from({ length: 5 }, () => long(3)) } },
  { id: "fnx", layout: "diagram", title: long(15), diagram: { kind: "funnel", stages: Array.from({ length: 7 }, (_, i) => ({ value: String(3000 - i * 400), label: long(10) })) }, body: long(20), callout: long(20) },
  { id: "eqx", layout: "diagram", title: long(15), diagram: { kind: "equation", terms: Array.from({ length: 5 }, () => ({ value: "1,250", label: long(12) })), result: { value: "40/40", label: long(12) } }, callout: long(25) },
  { id: "hcov", layout: "title", kicker: "WORKSHOP", title: `${long(8)}\n${long(8)}`, subtitle: long(30) },
  { id: "hclose", layout: "closing", title: `${long(8)}\n${long(8)}`, subtitle: long(25), bullets: Array.from({ length: 4 }, () => long(6)) },
  { id: "n", layout: "cards", kicker: "NEXT STEPS", title: "Three decisions before the next batch", subtitle: "Each card is one owner and one date.", cards: [{ heading: "Reformulate rinse-off SKUs to 2%", detail: "R&D, before the next batch.", tag: "HIGH" }, { heading: "Update the labels", detail: "Regulatory and packaging.", tag: "MEDIUM" }, { heading: "Confirm the effective date", detail: "With NPRA this month." }], citations: ["EC 1223/2009 Annex III entry 98"] },
];
const fails = [];
// Each design is checked with its own slides: the briefing design draws several layouts its own way.
async function check(tag, theme, slides) {
// ONLY=tb keeps one slide, and with an outDir also writes it as a picture.
if (process.env.ONLY) slides.splice(0, slides.length, ...slides.filter((s) => s.id === process.env.ONLY));
if (!slides.length) return;
const deck = { id: "d", title: "Fit", lang: "en", angle: "custom", theme, slides, sources: [], createdAt: "", updatedAt: "" };
const buf = await deckToPptx(deck, "u");

// Only the exporter's own sizing is under test: take PowerPoint's shrink-on-overflow out.
const zip = await JSZip.loadAsync(buf);
for (const name of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
  const xml = await zip.file(name).async("string");
  zip.file(name, xml.replace(/<a:normAutofit[^>]*\/>/g, "").replace(/<a:normAutofit[^>]*>[\s\S]*?<\/a:normAutofit>/g, ""));
}
const pptx = path.join(tmp, `fit-${tag}.pptx`);
fs.writeFileSync(pptx, await zip.generateAsync({ type: "nodebuffer" }));
execFileSync("soffice", ["--headless", `-env:UserInstallation=file://${tmp}/lo`, "--convert-to", "pdf", "--outdir", tmp, pptx], { stdio: "ignore", timeout: 180000 });
const pdfPath = path.join(tmp, `fit-${tag}.pdf`);
if (out && process.env.ONLY) {
  execFileSync("soffice", ["--headless", `-env:UserInstallation=file://${tmp}/lo`, "--convert-to", "png", "--outdir", tmp, pptx], { stdio: "ignore", timeout: 180000 });
  fs.copyFileSync(path.join(tmp, `fit-${tag}.png`), path.join(out, `pptx-${process.env.ONLY}.png`));
}
if (out) fs.copyFileSync(pdfPath, path.join(out, `pptx-fit-${tag}.pdf`));

const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), useSystemFonts: true }).promise;
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const [, , pw, ph] = page.view;
  const items = (await page.getTextContent()).items.filter((it) => it.str && it.str.trim());
  const boxes = items.map((it) => {
    const [a, , , d, e, f] = it.transform;
    const hgt = Math.abs(d) || Math.abs(a);
    return { s: it.str, x0: e, x1: e + it.width, y0: f - hgt * 0.2, y1: f + hgt * 0.8 };
  });
  const bad = [];
  for (const b of boxes) if (b.x0 < -1 || b.x1 > pw + 1 || b.y0 < -1 || b.y1 > ph + 1) bad.push(`off the slide: "${b.s.slice(0, 30)}"`);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      const minH = Math.min(a.y1 - a.y0, b.y1 - b.y0);
      if (ox > 2 && oy > minH * 0.35) bad.push(`overlap: "${a.s.slice(0, 24)}" / "${b.s.slice(0, 24)}"`);
    }
  const name = `${tag} ${slides[p - 1]?.layout} ${slides[p - 1]?.id}`;
  if (bad.length) fails.push(`${name}: ${bad.slice(0, 4).join("; ")}${bad.length > 4 ? ` and ${bad.length - 4} more` : ""}`);
  console.log(`${bad.length ? "FAIL" : "ok  "} ${name} (${boxes.length} lines)`);
}
}
await check("booth", { ...themePreset("booth-bright"), fontDisplay: "Liberation Serif", fontBody: "Liberation Sans", footer: "Slidecraft fit check", tag: "For healthcare professionals only" }, slides);
// The briefing design, over-full: a cover with a finding panel, shares beside a doughnut, say against don't
// say, a short table, figures in colour, one row of cards and numbered next steps.
await check("briefing", { ...themePreset("briefing"), fontDisplay: "Liberation Serif", fontBody: "Liberation Sans" }, [
  { id: "bcov", layout: "title", kicker: "DEBRIEF", title: `${long(8)}\n${long(8)}`, subtitle: long(20), body: long(30), kpi: Array.from({ length: 4 }, () => ({ value: "12,500", label: long(6) })) },
  { id: "bpie", layout: "chart", title: long(15), chart: { kind: "doughnut", categories: Array.from({ length: 8 }, (_, i) => `${long(4)} ${i}`), series: [{ name: "n", values: [30, 20, 15, 10, 9, 7, 5, 4] }], source: long(15) }, callout: long(20), citations: cites },
  { id: "bvs", layout: "two-column", title: long(15), leftHeading: "Say", rightHeading: "Don't say", bullets: Array.from({ length: 8 }, () => long(14)), bulletsRight: Array.from({ length: 8 }, () => long(14)), citations: cites },
  { id: "btb", layout: "table", title: long(15), table: { header: ["Brand", "Detail", "Share", "OK"], rows: Array.from({ length: 5 }, () => [long(4), long(30), "43%", "NO"]), source: long(10) }, aside: [{ heading: "How to read", items: Array.from({ length: 4 }, () => long(10)) }] },
  { id: "bkp", layout: "kpi", title: long(15), kpi: Array.from({ length: 8 }, () => ({ value: "RM 1,250,000", label: long(10), note: long(14) })), callout: long(20) },
  { id: "bcd", layout: "cards", title: long(15), cards: Array.from({ length: 3 }, () => ({ heading: long(10), detail: long(40), tag: "HIGH" })), callout: long(20) },
  { id: "bnx", layout: "closing", title: `${long(8)}\n${long(8)}`, subtitle: long(20), bullets: Array.from({ length: 6 }, () => long(18)) },
  { id: "nbnx", layout: "closing", title: "Fix the PA grade\nbefore the next batch", subtitle: "One line on the label closes most gaps.", bullets: ["Share the brand ranking with sales and marketing (internal only).", "Brief R&D to print the PA grade on every sunscreen.", "Ask QA for water resistance test reports.", "Re-audit the same 42 pharmacies in Q1 2027."] },
]);
fs.rmSync(tmp, { recursive: true, force: true });
if (fails.length) {
  console.log("\n" + fails.join("\n") + `\n\n${fails.length} failed`);
  process.exit(1);
}
console.log("\nall PowerPoint fit checks passed");
