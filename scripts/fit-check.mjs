// Renders over-full and normal slides of every layout in a real browser, runs
// fitSlide, and fails if any text spills out of its box or off the slide, if
// source lines run into the body, or if a normal slide is shrunk at all.
// Run: CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/fit-check.mjs [outDir]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { fitSlide, renderSlideHtml, SLIDE_CSS, themePreset } from "../shared/dist/index.js";

const out = process.argv[2];
const theme = themePreset("facerinna");
const w = (n, word = "evidence") => Array.from({ length: n }, (_, i) => `${word}${i % 7 ? "" : ","}`).join(" ");
const long = (n) => `Salicylic acid in rinse-off products ${w(n)}`;
const cites = ["EC 1223/2009 Annex III entry 98, as amended by Regulation (EU) 2019/1966", "ASEAN Cosmetic Directive Annex III Part 1", "NPRA Guidelines for Control of Cosmetic Products in Malaysia, rev. 2024", "Author A, Author B. J Cosmet Dermatol. 2025;24(3):101-112. doi:10.1111/jocd.99999"];

const heavy = [
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
  { id: "i", layout: "image", title: long(20), image: { caption: long(30) }, bullets: Array.from({ length: 6 }, () => long(20)) },
  { id: "ch", layout: "chart", title: long(20), chart: { kind: "column", categories: ["2023", "2024", "2025"], series: [{ name: "Complaints", values: [412, 610, 838] }], source: long(15) }, bullets: Array.from({ length: 5 }, () => long(20)) },
];
const normal = [
  { id: "nb", layout: "bullets", kicker: "THE RULE", title: "Salicylic acid is capped at 2% in rinse-off", subtitle: "Read the limit first, then the exception.", bullets: ["Annex III entry 98 sets the limit", "Leave-on stays at 0.5%", "Mandatory label: not for children under 3"], citations: ["EC 1223/2009 Annex III entry 98"] },
  { id: "nc", layout: "cards", kicker: "NEXT STEPS", title: "Three decisions before the next batch", subtitle: "Each card is one owner and one date.", cards: [{ heading: "Reformulate rinse-off SKUs", detail: "R&D, before the next batch.", tag: "HIGH" }, { heading: "Update the labels", detail: "Regulatory and packaging.", tag: "MEDIUM" }, { heading: "Confirm the date", detail: "With NPRA this month." }] },
  { id: "nk", layout: "kpi", kicker: "AT A GLANCE", title: "The figures to remember", kpi: [{ value: "2%", label: "Rinse-off cap", note: "Annex III/98" }, { value: "2 years", label: "Notification validity", note: "NPRA" }, { value: "838", label: "Complaints 2025" }] },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const fails = [];
const render = async (s) => {
  const html = renderSlideHtml(s, theme, { index: 2, total: 12, mediaUrl: (x) => x, lang: "en" });
  await page.setContent(`<!doctype html><html><head><style>body{margin:0}${SLIDE_CSS}</style></head><body>${html}</body></html>`);
  await page.evaluate(`window.fitSlide = ${fitSlide.toString()}`);
  return page.evaluate(() => {
    const slide = document.querySelector(".sc-slide");
    const r = window.fitSlide(slide);
    const sb = slide.getBoundingClientRect();
    const bad = [];
    for (const el of slide.querySelectorAll(".sc-body, .sc-content, .sc-col, .sc-card, .sc-kpi, .sc-cards, .sc-kpis, .sc-quote, .sc-fig, .sc-cols, .sc-diagram, table.sc-table")) {
      if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) bad.push(`${el.className} spills (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`);
    }
    // Every piece of visible text must sit on the slide.
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const rc of range.getClientRects()) if (rc.right > sb.right + 1 || rc.bottom > sb.bottom + 1 || rc.left < sb.left - 1 || rc.top < sb.top - 1) { bad.push(`text off the slide: "${n.textContent.slice(0, 30)}"`); break; }
    }
    const body = slide.querySelector(".sc-body"), cite = slide.querySelector(".sc-cite");
    if (cite && getComputedStyle(cite).display !== "none" && cite.offsetTop < body.offsetTop + body.offsetHeight - 2) bad.push("source lines run into the body");
    return { ...r, bad };
  });
};
for (const s of heavy) {
  const r = await render(s);
  if (out) await page.screenshot({ path: path.join(out, `fit-${s.layout}-${s.id}.png`) });
  const line = `${s.layout.padEnd(11)} scale ${r.scale.toFixed(2)}${r.tooSmall ? " (below half size: editor warns)" : ""}`;
  // Nothing may spill or be clipped, however full the slide.
  if (r.bad.length || r.overflow) fails.push(`${s.layout}: ${r.bad.join("; ")}`);
  console.log((r.bad.length || r.overflow ? "FAIL " : "ok   ") + line + (r.bad.length ? `\n     ${r.bad.join("\n     ")}` : ""));
}
for (const s of normal) {
  const r = await render(s);
  if (r.scale !== 1 || r.bad.length) fails.push(`normal ${s.layout} was changed: scale ${r.scale} ${r.bad.join("; ")}`);
  console.log(`${r.scale === 1 && !r.bad.length ? "ok  " : "FAIL"} normal ${s.layout} untouched`);
}
await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} failed`);
  process.exit(1);
}
console.log("\nall fit checks passed");
