import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

// The slide elements taken from the reference decks, end to end: what the writer may use,
// what it may not, the native PowerPoint each one becomes, and a design read back from a file.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-elements-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "1";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

type Shared = typeof import("@slidecraft/shared");
let S: Shared;
let deckToPptx: typeof import("../src/export/pptx.js")["deckToPptx"];
let analyseReference: typeof import("../src/design/extract.js")["analyseReference"];
let gen: typeof import("../src/llm/generate.js");
let prompts: typeof import("../src/llm/prompts.js");

beforeAll(async () => {
  S = await import("@slidecraft/shared");
  ({ deckToPptx } = await import("../src/export/pptx.js"));
  ({ analyseReference } = await import("../src/design/extract.js"));
  gen = await import("../src/llm/generate.js");
  prompts = await import("../src/llm/prompts.js");
});

function deckOf(themeId: string, slides: Record<string, unknown>[]) {
  return { id: "d_test", title: "Elements", lang: "en", angle: "custom", theme: S.themePreset(themeId), slides: slides.map((x) => S.sanitizeSlide(x)), sources: [], createdAt: "", updatedAt: "" } as import("@slidecraft/shared").Deck;
}

const EVERY = [
  { layout: "title", title: "Booth training", subtitle: "Day one", kpi: [{ label: "doctors", value: "120" }, { label: "cities", value: "4" }, { label: "products", value: "6" }] },
  { layout: "chart", title: "Ours leads on hydration", badge: "DIRECT", chart: { kind: "bar", categories: ["Ours", "Brand B", "Brand C"], series: [{ name: "Score", values: [9, 6, 5] }], highlight: "Ours", source: "Study 1" }, aside: [{ heading: "Reading", items: ["Ours is highest"] }, { heading: "Watch-outs", items: ["Small study"] }], callout: "Only one study compares directly." },
  { layout: "kpi", title: "Results at week 4", kpiStyle: "rings", kpi: [{ label: "hydration", value: "+45%" }, { label: "redness", value: "0%" }, { label: "elasticity", value: "1.25x" }] },
  { layout: "facts", title: "Study card", badge: "Q1", facts: [{ label: "Design", value: "Randomised, double blind" }, { label: "Subjects", value: "n = 60" }, { label: "Rating", value: "HIGH", highlight: true }] },
  { layout: "map", title: "Where it is allowed", map: { region: "asean", areas: [{ code: "MY", status: "ALLOWED", note: "ACD Annex III" }, { code: "TH", status: "BANNED" }, { code: "UK", status: "RESTRICTED" }], legend: "Leave-on use", source: "ACD" } },
  { layout: "diagram", title: "Mechanism", diagram: { kind: "hub", center: "Niacinamide", nodes: [{ label: "Repairs" }, { label: "Hydrates" }, { label: "Calms" }, { label: "Firms" }], pills: ["+45% hydration", "1.25x elasticity"] } },
  { layout: "diagram", title: "Drop-off", diagram: { kind: "funnel", stages: [{ value: "400", label: "visited" }, { value: "120", label: "engaged" }, { value: "36", label: "leads" }, { value: "30", label: "sales" }] } },
  { layout: "diagram", title: "The claim", diagram: { kind: "equation", terms: [{ value: "3", label: "actives" }, { value: "28", label: "days" }, { value: "40", label: "users" }], result: { value: "40/40", label: "improved" } } },
  { layout: "gallery", title: "Audit wall", gallery: [{ caption: "Wall A", prompt: "a wall" }, { caption: "Wall B" }, { caption: "Wall C" }] },
  { layout: "cards", title: "Next steps", cards: [{ heading: "A", tag: "HIGH" }, { heading: "B" }] },
  { layout: "closing", title: "Thank you" },
];

describe("every element in native PowerPoint", () => {
  it("exports a deck using every element, in every reference design, as a file PowerPoint opens", async () => {
    for (const id of ["clinical-evidence", "booth-bright", "rose-aesthetic", "audit-report"]) {
      const deck = deckOf(id, EVERY);
      deck.theme.tag = "HCP version";
      const buf = await deckToPptx(deck, "u_test");
      const zip = await JSZip.loadAsync(buf);
      const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
      expect(slides.length).toBe(EVERY.length);
      const charts = await Promise.all(Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async("string")));
      // Brand against comparators is a stacked pair; ring gauges are doughnuts, one per figure.
      expect(charts.filter((x) => /<c:grouping val="stacked"\/>/.test(x)).length).toBe(1);
      expect(charts.filter((x) => /<c:doughnutChart>/.test(x)).length).toBe(3);
      // A horizontal bar chart reads top down, as in the editor.
      expect(charts.find((x) => /<c:barDir val="bar"\/>/.test(x))).toMatch(/<c:orientation val="maxMin"\/>/);
      const xml = (n: number) => zip.file(`ppt/slides/slide${n}.xml`)!.async("string");
      const title = await xml(1);
      expect(title).toContain("HCP VERSION");
      expect(title).toContain(">120<");
      if (deck.theme.upperTitles) expect(title).toContain("BOOTH TRAINING");
      expect(await xml(2)).toContain("DIRECT");
      expect(await xml(2)).toContain("Only one study compares directly.");
      expect(await xml(2)).toContain("READING");
      expect(await xml(4)).toContain("<a:tbl>");
      const map = await xml(5);
      expect(map).toContain(">MY<");
      expect(map).toContain(">UK<");
      expect(map).toContain("Malaysia: ALLOWED");
      expect(await xml(6)).toContain("Niacinamide");
      const funnel = await xml(7);
      expect(funnel).toContain('prst="chevron"');
      expect(funnel).toContain('prst="homePlate"');
      expect(funnel).toContain(">30%<");
      expect(await xml(8)).toContain(">=<");
      expect(await xml(9)).toContain("Wall B");
      for (const n of slides) {
        const x = await zip.file(n)!.async("string");
        expect(x).not.toMatch(/undefined|NaN/);
      }
    }
  });
});

describe("what the writer may use", () => {
  it("demotes an element the person switched off to points that keep its facts", () => {
    const s = S.sanitizeSlide(EVERY[4]);
    gen.demote(s);
    expect(s.layout).toBe("bullets");
    expect(s.bullets).toContain("MY: ALLOWED (ACD Annex III)");
    expect(s.map).toBeUndefined();
    expect(s.citations).toContain("ACD");
    const f = S.sanitizeSlide(EVERY[6]);
    gen.demote(f);
    expect(f.bullets).toEqual(["400 visited", "120 engaged", "36 leads", "30 sales"]);
  });

  it("keeps Auto away from a device the person unticked, and turns on the rest", () => {
    const p = gen.normaliseParams({ prompt: "x", auto: true, features: { maps: false, gallery: false, charts: true } });
    gen.applyPlan(p, { title: null, angle: "custom", audience: "a", slides: 10, features: { charts: false, tables: false, diagrams: false, kpis: false, sections: false, summary: false, qa: false }, reason: "" }, true);
    expect(p.features.maps).toBe(false);
    expect(p.features.gallery).toBe(false);
    expect(p.features.charts && p.features.facts && p.features.gauges && p.features.callouts && p.features.kpis).toBe(true);
    expect(p.features.images).toBe(true);
    const sys = prompts.systemPrompt(p);
    expect(sys).not.toMatch(/- map:/);
    expect(sys).toMatch(/- facts: a fact sheet/);
    expect(sys).toMatch(/- badge:/);
  });

  it("tells the writer nothing about a device that is off", () => {
    const off = Object.fromEntries(Object.keys(S.DEFAULT_FEATURES).map((k) => [k, false])) as unknown as import("@slidecraft/shared").Features;
    const sys = prompts.systemPrompt({ prompt: "x", lang: "en", angle: "custom", slides: 8, features: off, imageMode: "none" });
    expect(sys).toMatch(/SLIDE LAYOUTS you may use: title, bullets, two-column, cards, quote, closing\./);
    expect(sys).not.toMatch(/- (map|facts|gallery|badge|callout|aside):/);
    expect(sys).not.toMatch(/The user ticked/);
  });

  it("gives the writer a built-in design's habits when no saved design is chosen", () => {
    const sys = prompts.systemPrompt({ prompt: "x", lang: "en", angle: "custom", slides: 8, features: S.DEFAULT_FEATURES, imageMode: "none", designNotes: S.themeGuide("audit-report") });
    expect(sys).toMatch(/DESIGN REFERENCE .*funnel of big numbers/);
  });
});

describe("a design read back from a PowerPoint file", () => {
  it("recreates the look: series colours, capitals, dark title slides and ring gauges", async () => {
    const buf = await deckToPptx(deckOf("booth-bright", EVERY), "u_test");
    const d = await analyseReference([{ name: "booth.pptx", buf }], "Booth", null);
    expect(d.theme.upperTitles).toBe(true);
    expect(d.theme.darkTitle).toBe(true);
    expect(d.theme.kpiStyle).toBe("rings");
    expect(d.theme.series?.length).toBeGreaterThanOrEqual(2);
    expect(d.notes).toMatch(/ring gauge/);
    expect(d.analysis.warnings.join(" ")).toMatch(/Read from the file and applied: titles in capitals, dark title slides, figures as ring gauges/);
  });
});

describe("the house design system", () => {
  it("is in every writer's instructions: the deck writer, the designer and a single-slide rewrite", async () => {
    const { houseDesign } = await import("../src/llm/house.js");
    const { designSystem } = await import("../src/llm/design.js");
    const house = houseDesign();
    const sys = prompts.systemPrompt({ prompt: "x", lang: "en", angle: "custom", slides: 8, features: S.DEFAULT_FEATURES, imageMode: "none" });
    expect(sys).toContain(house);
    expect(designSystem(S.DEFAULT_FEATURES, "en")).toContain(house);
    expect(prompts.rewriteSystem({ lang: "ms", angle: "custom" })).toContain(house);
    for (const rule of ["One idea per slide", "Titles are statements, not labels", "Diagram over bullets", "ONE everyday analogy", "set `callout` to the one sentence the audience repeats", "never the same layout on two slides in a row", "'Illustrative figure, not from the sources'", "3 to 5 conversational sentences", "No emoji"]) expect(sys).toContain(rule);
    // The facts rules still come first and still forbid inventing a figure.
    expect(sys.indexOf("FACTS AND SOURCES")).toBeLessThan(sys.indexOf("HOUSE DESIGN SYSTEM"));
    expect(sys).toMatch(/Do not invent a fee, a date, a clause number, a statistic or a study/);
    // A writer that answers in JSON is never told to stop and wait for approval.
    expect(sys).not.toMatch(/wait for approval/i);
  });

  it("exports the house look to PowerPoint: wash and glow backgrounds, the italic band, closing chips", async () => {
    const deck = deckOf("house", [
      { layout: "title", title: "How a label becomes\ncompliant", subtitle: "Training" },
      { layout: "cards", kicker: "THE PATHWAY", title: "A notification is a form", cards: [{ heading: "A" }, { heading: "B" }], callout: "It is not an approval." },
      { layout: "closing", title: "Notify first,\nsell second", bullets: ["Screen", "Keep the PIF", "Notify", "Label"] },
    ]);
    const zip = await JSZip.loadAsync(await deckToPptx(deck, "u_test"));
    const xml = (n: number) => zip.file(`ppt/slides/slide${n}.xml`)!.async("string");
    const cover = await xml(1);
    expect(cover).toContain('<a:srgbClr val="5EEAD4"/>');
    expect(cover).toMatch(/<p:bg><p:bgPr><a:blipFill/);
    const content = await xml(2);
    expect(content).toMatch(/lIns="304800" tIns="50800" rIns="304800" bIns="50800"[^>]*anchor="ctr"/);
    expect(content).toMatch(/i="1"[^>]*>[\s\S]*?<a:latin typeface="Cambria"[\s\S]*?It is not an approval\./);
    expect(content).toContain('<a:srgbClr val="D97706"/>');
    const close = await xml(3);
    for (const chip of ["Screen", "Keep the PIF", "Notify", "Label"]) expect(close).toContain(`<a:t>${chip}</a:t>`);
  });
});
