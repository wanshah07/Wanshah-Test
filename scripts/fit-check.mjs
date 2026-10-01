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
  // The elements from the reference decks, over-full, in the designs that use them.
  { id: "hero", _theme: "booth-bright", layout: "title", title: long(20), subtitle: long(30), kpi: Array.from({ length: 4 }, () => ({ value: "RM 1,250,000", label: long(10) })) },
  { id: "chx", _theme: "clinical-evidence", layout: "chart", kicker: "EVIDENCE", badge: "PARTIAL EVIDENCE ONLY", title: long(18), subtitle: long(20), chart: { kind: "bar", categories: ["Ours", "Brand B", "Brand C", "Brand D"], series: [{ name: "Score", values: [9, 6, 5, 4] }], highlight: "Ours", source: long(12) }, aside: [{ heading: "Reading", items: Array.from({ length: 5 }, () => long(14)) }, { heading: "Watch-outs", items: Array.from({ length: 5 }, () => long(14)) }], callout: long(40), citations: cites },
  { id: "rg", _theme: "booth-bright", layout: "kpi", kpiStyle: "rings", title: long(15), kpi: Array.from({ length: 4 }, (_, i) => ({ value: `+${20 * i + 5}%`, label: long(12), note: long(16) })), body: long(20), callout: long(25) },
  { id: "fx", _theme: "clinical-evidence", layout: "facts", badge: "Q1", title: long(15), facts: Array.from({ length: 10 }, (_, i) => ({ label: long(3), value: long(30), highlight: i === 6 })), aside: [{ heading: "Watch-outs", items: Array.from({ length: 4 }, () => long(12)) }], citations: cites },
  { id: "gx", _theme: "audit-report", layout: "gallery", title: long(15), gallery: Array.from({ length: 6 }, () => ({ caption: long(18), prompt: long(8) })), body: long(20) },
  { id: "mpx", _theme: "audit-report", layout: "map", title: long(15), map: { region: "world", areas: ["MY", "SG", "ID", "TH", "VN", "PH", "EU", "UK", "US", "CN", "JP", "KR", "IN", "AU", "GCC", "BR", "ZA", "CA"].map((code, i) => ({ code, status: ["ALLOWED", "RESTRICTED 2%", "BANNED", "PENDING"][i % 4], note: long(12) })), legend: long(12), source: long(10) }, citations: cites },
  { id: "hbx", _theme: "rose-aesthetic", layout: "diagram", title: long(15), diagram: { kind: "hub", center: long(6), nodes: Array.from({ length: 8 }, () => ({ label: long(5), detail: long(16) })), pills: Array.from({ length: 5 }, () => long(3)) } },
  { id: "fnx", _theme: "audit-report", layout: "diagram", title: long(15), diagram: { kind: "funnel", stages: Array.from({ length: 7 }, (_, i) => ({ value: String(3000 - i * 400), label: long(10) })) }, body: long(20), callout: long(20) },
  // The house design system: dark cover with a two-line title, content with a pull-quote band, closing chips.
  { id: "hcov", _theme: "house", layout: "title", kicker: "WORKSHOP", title: `${long(8)}\n${long(8)}`, subtitle: long(30), kpi: Array.from({ length: 4 }, () => ({ value: "1,250", label: long(8) })) },
  { id: "hcard", _theme: "house", layout: "cards", kicker: "HOW IT WORKS", title: long(18), cards: Array.from({ length: 6 }, () => ({ heading: long(8), detail: long(30), tag: "HIGH" })), callout: long(30), citations: cites },
  { id: "hclose", _theme: "house", layout: "closing", title: `${long(8)}\n${long(8)}`, subtitle: long(25), bullets: Array.from({ length: 4 }, () => long(6)) },
  { id: "eqx", _theme: "booth-bright", layout: "diagram", title: long(15), diagram: { kind: "equation", terms: Array.from({ length: 5 }, () => ({ value: "1,250", label: long(12) })), result: { value: "40/40", label: long(12) } }, callout: long(25) },
  // The briefing design and the devices it brought: a cover with a finding panel, shares listed beside a
  // doughnut, say against don't say, a short table at full size, and numbered next steps.
  { id: "bcov", _theme: "briefing", layout: "title", kicker: "DEBRIEF", title: `${long(8)}\n${long(8)}`, subtitle: long(20), body: long(30), kpi: Array.from({ length: 4 }, () => ({ value: "12,500", label: long(6) })) },
  { id: "bpie", _theme: "briefing", layout: "chart", title: long(15), chart: { kind: "doughnut", categories: Array.from({ length: 8 }, (_, i) => `${long(4)} ${i}`), series: [{ name: "n", values: [30, 20, 15, 10, 9, 7, 5, 4] }], source: long(15) }, callout: long(20), citations: cites },
  { id: "bvs", _theme: "briefing", layout: "two-column", title: long(15), leftHeading: "Say", rightHeading: "Don't say", bullets: Array.from({ length: 8 }, () => long(14)), bulletsRight: Array.from({ length: 8 }, () => long(14)), citations: cites },
  { id: "btb", _theme: "briefing", layout: "table", title: long(15), table: { header: ["Brand", "Detail", "Share", "OK"], rows: Array.from({ length: 5 }, () => [long(4), long(30), "43%", "NO"]), source: long(10) }, aside: [{ heading: "How to read", items: Array.from({ length: 4 }, () => long(10)) }] },
  { id: "bnx", _theme: "briefing", layout: "closing", title: `${long(8)}\n${long(8)}`, subtitle: long(20), bullets: Array.from({ length: 6 }, () => long(18)) },
  { id: "bkp", _theme: "briefing", layout: "kpi", title: long(15), kpi: Array.from({ length: 8 }, () => ({ value: "RM 1,250,000", label: long(10), note: long(14) })), callout: long(20) },
  { id: "bcd", _theme: "briefing", layout: "cards", title: long(15), cards: Array.from({ length: 3 }, () => ({ heading: long(10), detail: long(40), tag: "HIGH" })), callout: long(20) },
];
const normal = [
  { id: "nb", layout: "bullets", kicker: "THE RULE", title: "Salicylic acid is capped at 2% in rinse-off", subtitle: "Read the limit first, then the exception.", bullets: ["Annex III entry 98 sets the limit", "Leave-on stays at 0.5%", "Mandatory label: not for children under 3"], citations: ["EC 1223/2009 Annex III entry 98"] },
  { id: "nc", layout: "cards", kicker: "NEXT STEPS", title: "Three decisions before the next batch", subtitle: "Each card is one owner and one date.", cards: [{ heading: "Reformulate rinse-off SKUs", detail: "R&D, before the next batch.", tag: "HIGH" }, { heading: "Update the labels", detail: "Regulatory and packaging.", tag: "MEDIUM" }, { heading: "Confirm the date", detail: "With NPRA this month." }] },
  { id: "nk", layout: "kpi", kicker: "AT A GLANCE", title: "The figures to remember", kpi: [{ value: "2%", label: "Rinse-off cap", note: "Annex III/98" }, { value: "2 years", label: "Notification validity", note: "NPRA" }, { value: "838", label: "Complaints 2025" }] },
  // A realistic slide of each new element fits as designed, with nothing shrunk.
  { id: "nhero", _theme: "booth-bright", layout: "title", title: "Product training day", subtitle: "Training day, Kuala Lumpur", kpi: [{ value: "120", label: "doctors met" }, { value: "4", label: "cities" }, { value: "40/40", label: "users improved" }] },
  { id: "nch", _theme: "clinical-evidence", layout: "chart", kicker: "HYDRATION", badge: "DIRECT", title: "Ours leads on 4-week hydration", subtitle: "Corneometer units, change from baseline.", chart: { kind: "bar", categories: ["Ours", "Brand B", "Brand C"], series: [{ name: "Change", values: [38, 24, 19] }], highlight: "Ours", source: "Study 1, n = 60" }, aside: [{ heading: "Reading", items: ["Ours rises most by week 4", "B and C track together"] }, { heading: "Watch-outs", items: ["One study, 60 subjects", "Sponsor-run"] }], callout: "Only one head-to-head study supports the claim.", citations: ["Author A. J Cosmet Dermatol. 2025"] },
  { id: "nrg", _theme: "rose-aesthetic", layout: "kpi", kpiStyle: "rings", kicker: "RESULTS", title: "Week 4 results", kpi: [{ value: "+45%", label: "Hydration", note: "Corneometer" }, { value: "23%", label: "Fewer wrinkles" }, { value: "0%", label: "Irritation" }] },
  { id: "nfx", _theme: "clinical-evidence", layout: "facts", badge: "Q1", kicker: "STUDY 1", title: "The active improves barrier repair", facts: [{ label: "Design", value: "Randomised, double blind, split face" }, { label: "Subjects", value: "n = 60, aged 25 to 55" }, { label: "Method", value: "Corneometer and TEWL at weeks 0, 2, 4" }, { label: "Result", value: "Hydration up 38% at week 4", highlight: true }, { label: "Reference", value: "Author A. J Cosmet Dermatol. 2025" }] },
  { id: "ngx", _theme: "audit-report", layout: "gallery", kicker: "EVIDENCE", title: "Three shelves, three findings", gallery: [{ caption: "Shelf A: label faded" }, { caption: "Shelf B: price tag missing" }, { caption: "Shelf C: stock blocked" }] },
  { id: "nmp", _theme: "audit-report", layout: "map", kicker: "STATUS", title: "Salicylic acid is allowed in 2 of 4 markets", map: { region: "asean", areas: [{ code: "MY", status: "ALLOWED", note: "ACD Annex III" }, { code: "SG", status: "ALLOWED", note: "HSA" }, { code: "TH", status: "RESTRICTED", note: "FDA Thailand" }, { code: "ID", status: "PENDING", note: "BPOM draft" }], legend: "Leave-on products", source: "ASEAN Cosmetic Directive" } },
  { id: "nhb", _theme: "rose-aesthetic", layout: "diagram", kicker: "MECHANISM", title: "What niacinamide does in the skin", diagram: { kind: "hub", center: "Niacinamide", nodes: [{ label: "Repairs", detail: "Barrier lipids up" }, { label: "Hydrates", detail: "TEWL down" }, { label: "Calms", detail: "Less redness" }, { label: "Firms", detail: "Collagen up" }], pills: ["+45% hydration", "1.25x elasticity"] } },
  { id: "nfn", _theme: "audit-report", layout: "diagram", kicker: "DROP-OFF", title: "One in thirteen visits became a sale", diagram: { kind: "funnel", stages: [{ value: "400", label: "Visited" }, { value: "120", label: "Engaged" }, { value: "36", label: "Leads" }, { value: "30", label: "Sales" }] } },
  { id: "nhcov", _theme: "house", layout: "title", kicker: "WORKSHOP", title: "How a label becomes\ncompliant in five steps", subtitle: "Regulatory training for the product team", kpi: [] },
  { id: "nhcard", _theme: "house", layout: "cards", kicker: "THE PATHWAY", title: "A notification is a form, not a licence", cards: [{ heading: "Screen the formula", detail: "Like checking a recipe before cooking." }, { heading: "Build the PIF", detail: "The product's passport, kept on file." }, { heading: "Notify NPRA", detail: "One product, one notification." }], callout: "A notification tells NPRA; it is not an approval." },
  { id: "nhclose", _theme: "house", layout: "closing", title: "Notify first,\nsell second", subtitle: "Every product on the shelf has a number behind it.", bullets: ["Screen the formula", "Keep the PIF", "Notify before sale", "Label as notified"] },
  { id: "neq", _theme: "booth-bright", layout: "diagram", kicker: "THE CLAIM", title: "What the claim rests on", diagram: { kind: "equation", terms: [{ value: "3", label: "actives" }, { value: "28", label: "days" }, { value: "40", label: "users" }], result: { value: "40/40", label: "improved" } }, callout: "Every user improved by day 28." },
  { id: "nbcov", _theme: "briefing", layout: "title", kicker: "DEBRIEF", title: "Sunscreen shelf audit\nKlang Valley 2026", subtitle: "42 pharmacies, 6 to 10 August 2026", body: "Main finding: one missing line, the PA grade, explains most label gaps.", kpi: [{ value: "42", label: "pharmacies" }, { value: "318", label: "SKUs" }, { value: "6", label: "brands" }] },
  { id: "nbpie", _theme: "briefing", layout: "chart", kicker: "CHANNELS", title: "Chains carried most of the range", chart: { kind: "doughnut", categories: ["Chain", "Independent", "Online"], series: [{ name: "SKUs", values: [52, 33, 15] }], source: "Shelf audit, Aug 2026" } },
  { id: "nbvs", _theme: "briefing", layout: "two-column", kicker: "WORDING", title: "How to quote these numbers", leftHeading: "Say", rightHeading: "Don't say", bullets: ["SKUs audited", "42 pharmacies", "Label gaps found"], bulletsRight: ["X% of Malaysia", "All pharmacies", "Brand B fails"] },
  { id: "nbtb", _theme: "briefing", layout: "table", kicker: "DETAIL", title: "Label gaps by brand", table: { header: ["Brand", "SKUs", "Gaps", "Share", "OK"], rows: [["Brand A", "40", "8", "20%", "YES"], ["Brand B", "28", "12", "43%", "NO"], ["Brand C", "18", "6", "33%", "NO"], ["Brand D", "10", "5", "50%", "NO"]] } },
  { id: "nbnx", _theme: "briefing", layout: "closing", title: "Fix the PA grade\nbefore the next batch", subtitle: "One line on the label closes most gaps.", bullets: ["Share the brand ranking with sales and marketing (internal only).", "Brief R&D to print the PA grade on every sunscreen.", "Ask QA for water resistance test reports.", "Re-audit the same 42 pharmacies in Q1 2027."] },
  { id: "nbkp", _theme: "briefing", layout: "kpi", kicker: "WHO", title: "Who we audited", kpi: [{ value: "42", label: "Pharmacies", note: "Chains 30, independents 12" }, { value: "96", label: "Sunscreens", note: "of 318 SKUs" }, { value: "31", label: "Label gaps", note: "32% of sunscreens" }] },
  { id: "nbcd", _theme: "briefing", layout: "cards", kicker: "WHAT WE LEARNED", title: "Three things the shelf told us", cards: [{ heading: "SPF is printed, PA is not", detail: "19 of 31 gaps were a missing PA grade." }, { heading: "Batch numbers fade", detail: "Heat in the window bleaches the print." }, { heading: "Claims outrun tests", detail: "Water resistant with no test on file." }] },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const fails = [];
const render = async (s) => {
  const html = renderSlideHtml(s, s._theme ? themePreset(s._theme) : theme, { index: 2, total: 12, mediaUrl: (x) => x, lang: "en" });
  await page.setContent(`<!doctype html><html><head><style>body{margin:0}${SLIDE_CSS}</style></head><body>${html}</body></html>`);
  await page.evaluate(`window.fitSlide = ${fitSlide.toString()}`);
  return page.evaluate(() => {
    const slide = document.querySelector(".sc-slide");
    const r = window.fitSlide(slide);
    const sb = slide.getBoundingClientRect();
    const bad = [];
    for (const el of slide.querySelectorAll(".sc-body, .sc-content, .sc-hub .disc, .sc-col, .sc-card, .sc-kpi, .sc-cards, .sc-kpis, .sc-quote, .sc-fig, .sc-cols, .sc-diagram, table.sc-table, .sc-row, .sc-main, .sc-asides, .sc-aside, .sc-rings, .sc-facts, .sc-gallery, .sc-mapwrap, .sc-mapkey, .sc-hub .node, .sc-hub .side, .sc-hub .core, .sc-eq .term, .sc-funnel .stage, .sc-callout, .sc-hero .hs, .sc-chips, .sc-pie, .sc-legend, .sc-next")) {
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
// The studio style has its own cover block, section number and tile sizes: every heavy slide again in it.
for (const s of heavy.slice()) heavy.push({ ...s, id: `${s.id}-studio`, _theme: "studio-green" });
heavy.push({ id: "cl-studio", layout: "closing", title: long(14), subtitle: long(20), bullets: Array.from({ length: 6 }, () => long(16)), _theme: "graphite-teal" });
heavy.push({ id: "t-dark-studio", layout: "title", title: long(24), subtitle: long(30), kpi: Array.from({ length: 4 }, () => ({ value: "RM 1,250,000", label: long(10) })), _theme: "graphite-teal" });
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
  if (out) await page.screenshot({ path: path.join(out, `normal-${s.layout}-${s.id}.png`) });
  if (r.scale !== 1 || r.bad.length) fails.push(`normal ${s.layout} was changed: scale ${r.scale} ${r.bad.join("; ")}`);
  console.log(`${r.scale === 1 && !r.bad.length ? "ok  " : "FAIL"} normal ${s.layout} ${s.id} untouched${r.scale !== 1 ? ` (scale ${r.scale})` : ""}${r.bad.length ? `: ${r.bad.join("; ")}` : ""}`);
}
await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} failed`);
  process.exit(1);
}
console.log("\nall fit checks passed");
