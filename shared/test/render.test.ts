import { describe, it, expect } from "vitest";
import { verdictTone, isVersusPair, isStepList, pieShares, DEFAULT_THEME_ID, renderSlideHtml, renderDeckHtml, chartSvg, diagramSvg, themePreset, blankSlide, normaliseSlide, LAYOUTS, sanitizeSlide, sanitizeTheme, themeGuide, ringPercent, mapTiles, mapTone, stepRate, glowOf, particles, fontsUrl, SLIDE_CSS } from "../src/index.js";
import type { Deck, Slide } from "../src/index.js";

const theme = themePreset("facerinna");
const ctx = { index: 0, total: 3, mediaUrl: (id: string) => `/api/media/${id}`, lang: "en" as const };

describe("renderSlideHtml", () => {
  it("renders every layout without throwing and escapes markup", () => {
    for (const layout of LAYOUTS) {
      const s = blankSlide(layout, "en");
      s.title = "<script>alert(1)</script>";
      const html = renderSlideHtml(s, theme, ctx);
      expect(html).toContain(`sc-${layout}`);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    }
  });
  it("draws citations and slide numbers", () => {
    const s: Slide = { id: "a", layout: "bullets", title: "T", bullets: ["b"], citations: ["EC 1223/2009 Annex III entry 98"] };
    const html = renderSlideHtml(s, theme, ctx);
    expect(html).toContain("sc-cite");
    expect(html).toContain("Annex III entry 98");
    expect(html).toContain("1 / 3");
  });
  it("prints square brackets as plain text, with no marker styling", () => {
    const s: Slide = { id: "a", layout: "bullets", title: "T", bullets: ["fee RM [SAHKAN: NPRA fee]"] };
    const html = renderSlideHtml(s, theme, ctx);
    expect(html).not.toContain("<mark");
    expect(html).toContain("[SAHKAN: NPRA fee]");
  });
  it("resolves media ids through the context", () => {
    const s: Slide = { id: "a", layout: "image", title: "T", image: { mediaId: "m1" } };
    expect(renderSlideHtml(s, theme, ctx)).toContain('src="/api/media/m1"');
  });
});

describe("charts and diagrams", () => {
  const spec = { categories: ["A", "B", "C"], series: [{ name: "S", values: [1, 5, 3] }] };
  it("draws each chart kind as SVG", () => {
    for (const kind of ["bar", "column", "line", "area", "pie", "doughnut"] as const) {
      const svg = chartSvg({ ...spec, kind }, theme.colors);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
    }
  });
  it("handles an all-zero series and negative values", () => {
    expect(chartSvg({ kind: "column", categories: ["A"], series: [{ name: "S", values: [0] }] }, theme.colors)).toContain("<svg");
    expect(chartSvg({ kind: "line", categories: ["A", "B"], series: [{ name: "S", values: [-2, 3] }] }, theme.colors)).toContain("<svg");
  });
  it("draws the three diagram kinds", () => {
    expect(diagramSvg({ kind: "flow", steps: [{ label: "a" }, { label: "b", detail: "d" }, { label: "c" }, { label: "d" }, { label: "e" }, { label: "f" }] }, theme.colors)).toContain("marker-end");
    expect(diagramSvg({ kind: "timeline", events: [{ when: "2025", label: "x" }, { when: "2026", label: "y" }] }, theme.colors)).toContain("<circle");
    expect(diagramSvg({ kind: "matrix", rows: ["r1"], cols: ["c1", "c2"], cells: [["yes", "no"]] }, theme.colors)).toContain("✓");
  });
});

describe("renderDeckHtml", () => {
  it("produces one document with every slide and the notes", () => {
    const deck: Deck = {
      id: "d", title: "Deck & co", lang: "en", angle: "custom", theme, sources: [], createdAt: "", updatedAt: "",
      slides: [blankSlide("title"), { ...blankSlide("bullets"), notes: "say this" }, blankSlide("closing")],
    };
    const html = renderDeckHtml(deck, ctx.mediaUrl);
    expect(html).toContain("<title>Deck &amp; co</title>");
    expect((html.match(/class="sc-slide/g) ?? []).length).toBe(3);
    expect(html).toContain('"say this"');
    expect(html).toContain("fonts.googleapis.com");
  });
});

describe("normaliseSlide", () => {
  it("drops nulls, empty arrays and fills defaults", () => {
    const s = normaliseSlide({ layout: "chart", title: "t", bullets: [], notes: null, chart: { kind: "bar", categories: ["a"], series: [{ name: "s", values: [1] }], unit: null, source: null }, image: { mediaId: null, url: null, prompt: null } });
    expect(s.bullets).toBeUndefined();
    expect(s.notes).toBeUndefined();
    expect(s.image).toBeUndefined();
    expect(s.chart?.unit).toBeUndefined();
    expect(s.id).toMatch(/^s_/);
    expect(normaliseSlide({ layout: "nope", title: 3 }).layout).toBe("bullets");
  });
});

describe("deck craft: kicker, reading line, cards and verdicts", () => {
  it("draws the kicker and the reading line above a content slide", () => {
    const s: Slide = { id: "a", layout: "bullets", kicker: "AT A GLANCE", title: "3 of 5 claims need a study", subtitle: "Read left to right: claim, evidence, verdict.", bullets: ["b"] };
    const html = renderSlideHtml(s, theme, ctx);
    expect(html).toContain('<span class="sc-kicker">AT A GLANCE</span>');
    expect(html).toContain('<p class="sc-dek">Read left to right');
  });
  it("keeps a title slide's subtitle out of the reading line", () => {
    const s: Slide = { id: "a", layout: "title", title: "T", subtitle: "Board, 3 Oct" };
    expect(renderSlideHtml(s, theme, ctx)).not.toContain("sc-dek");
  });
  it("numbers the cards and colours verdict tags", () => {
    const s: Slide = { id: "a", layout: "cards", title: "T", cards: [{ heading: "Reformulate", detail: "R&D by Q1", tag: "HIGH" }, { heading: "Relabel", tag: "Partly" }, { heading: "Wait", tag: "NO" }, { heading: "Owner", tag: "RA team" }] };
    const html = renderSlideHtml(s, theme, ctx);
    expect(html).toContain("--cols:2");
    expect(html.match(/class="no"/g)?.length).toBe(4);
    expect(html).toContain('sc-badge v-good">HIGH');
    expect(html).toContain('sc-badge v-mid">Partly');
    expect(html).toContain('sc-badge v-bad">NO');
    expect(html).toContain('sc-badge v-plain">RA team');
    expect(html).toContain("R&amp;D by Q1");
  });
  it("reads English and Malay verdicts and ignores ordinary words", () => {
    expect(["YES", "Tinggi", "lulus.", "PASS"].map(verdictTone)).toEqual(["good", "good", "good", "good"]);
    expect(["Sebahagian", "MEDIUM", "pending"].map(verdictTone)).toEqual(["mid", "mid", "mid"]);
    expect(["Tidak", "LOW", "fail"].map(verdictTone)).toEqual(["bad", "bad", "bad"]);
    expect(["Notification", "2%", "", "Not yet reviewed"].map(verdictTone)).toEqual(["", "", "", ""]);
  });
  it("badges verdict cells in a table", () => {
    const s: Slide = { id: "a", layout: "table", title: "T", table: { header: ["Claim", "Supported"], rows: [["Brightening", "PARTLY"], ["Anti-ageing", "2 studies"]] } };
    const html = renderSlideHtml(s, theme, ctx);
    expect(html).toContain('sc-badge v-mid">PARTLY');
    expect(html).not.toContain(">2 studies</span>");
  });
  it("cleans cards and kickers the writer sends with nulls", () => {
    const s = normaliseSlide({ layout: "cards", title: "T", kicker: "   ", cards: [{ heading: "A", detail: null, tag: null }, { heading: "", detail: "x" }, null] } as unknown as Record<string, unknown>);
    expect(s.kicker).toBeUndefined();
    expect(s.cards).toEqual([{ heading: "A" }]);
  });
});

describe("the elements the reference decks use", () => {
  const T = (id: string) => themePreset(id);
  it("keeps the four reference designs as permanent presets, with their own habits", () => {
    for (const id of ["clinical-evidence", "booth-bright", "rose-aesthetic", "audit-report"]) {
      const t = T(id);
      expect(t.id).toBe(id);
      expect(t.series?.length).toBeGreaterThanOrEqual(4);
      expect(t.darkTitle).toBe(true);
      expect(themeGuide(id)).toBeTruthy();
    }
    expect(T("clinical-evidence").fontDisplay).toBe("Cambria");
    expect(T("clinical-evidence").colors.brandDeep).toBe("#0F2B4C");
    expect(T("booth-bright").upperTitles).toBe(true);
    expect(T("booth-bright").kpiStyle).toBe("rings");
    expect(T("rose-aesthetic").colors.brand).toBe("#E4708A");
    expect(T("audit-report").series).toContain("#7A4FD0");
  });

  it("lets a saved theme turn a preset's habit off, and drops bad values", () => {
    const t = sanitizeTheme({ ...T("booth-bright"), upperTitles: false, darkTitle: false, series: ["#123456", "red", "javascript:x"], tag: "<b>HCP ONLY</b>", kpiStyle: "pie" });
    expect(t.upperTitles).toBe(false);
    expect(t.darkTitle).toBe(false);
    expect(t.series).toEqual(["#123456"]);
    expect(t.tag).toBe("bHCP ONLY/b");
    expect(t.kpiStyle).toBe("rings");
  });

  it("draws dark title slides, capital titles, the tag and a hero row", () => {
    const s: Slide = { id: "t", layout: "title", title: "Booth training", subtitle: "Day 1", kpi: [{ label: "doctors", value: "120" }, { label: "cities", value: "4" }] };
    const html = renderSlideHtml(s, { ...T("booth-bright"), tag: "Internal" }, ctx);
    expect(html).toContain("sc-dark");
    expect(html).toContain("sc-upper");
    expect(html).toContain('class="sc-tag">Internal<');
    expect(html).toContain("sc-hero");
    expect(html.match(/class="hs"/g)?.length).toBe(2);
  });

  it("draws a verdict badge, a callout and side panels, and no side panels on two columns", () => {
    const s: Slide = { id: "b", layout: "chart", title: "Ours leads", badge: "PARTIAL", callout: "Only one study is direct.", aside: [{ heading: "Reading", items: ["Ours is highest"] }, { heading: "Watch-outs", items: ["n = 20"] }], chart: { kind: "bar", categories: ["Ours", "B"], series: [{ name: "Score", values: [9, 5] }], highlight: "Ours" } };
    const html = renderSlideHtml(s, T("clinical-evidence"), ctx);
    expect(html).toContain("sc-vbadge v-mid");
    expect(html).toContain("sc-callout");
    expect(html.match(/class="sc-aside a\d"/g)?.length).toBe(2);
    expect(renderSlideHtml({ ...s, layout: "two-column", bullets: ["a"], bulletsRight: ["b"] }, theme, ctx)).not.toContain("sc-aside");
  });

  it("draws the highlighted category in the brand colour and the others grey", () => {
    const c = T("clinical-evidence");
    const svg = chartSvg({ kind: "bar", categories: ["Ours", "Them"], series: [{ name: "S", values: [8, 6] }], highlight: "Ours" }, c.colors, 1400, 640, "Inter", c.series);
    expect(svg).toContain(`fill="${c.series![0]}"`);
    expect(svg).toContain('fill="#A7B0BC"');
    // A highlight that names no category is dropped.
    expect(sanitizeSlide({ layout: "chart", title: "x", chart: { kind: "bar", categories: ["A"], series: [{ name: "s", values: [1] }], highlight: "Z" } }).chart?.highlight).toBeUndefined();
    expect(sanitizeSlide({ layout: "chart", title: "x", chart: { kind: "bar", categories: ["Ours"], series: [{ name: "s", values: [1] }], highlight: "ours" } }).chart?.highlight).toBe("Ours");
  });

  it("draws percentages as rings, and a figure without one as an empty ring", () => {
    expect(ringPercent("+45%")).toBe(45);
    expect(ringPercent("1.25x")).toBeNull();
    expect(ringPercent("140 %")).toBe(100);
    const s: Slide = { id: "k", layout: "kpi", title: "Results", kpi: [{ label: "hydration", value: "+45%" }, { label: "elasticity", value: "1.25x" }] };
    const rings = renderSlideHtml(s, T("rose-aesthetic"), ctx);
    expect(rings).toContain("sc-rings");
    expect(rings.match(/stroke-dasharray/g)?.length).toBe(1);
    expect(renderSlideHtml({ ...s, kpiStyle: "tiles" }, T("rose-aesthetic"), ctx)).toContain("sc-kpis");
  });

  it("draws a fact sheet with its key row shaded and its verdicts coloured", () => {
    const s = sanitizeSlide({ layout: "facts", title: "Study 1", facts: [{ label: "Design", value: "RCT" }, { label: "Rating", value: "HIGH", highlight: true }, { label: "", value: "" }] });
    expect(s.facts?.length).toBe(2);
    const html = renderSlideHtml(s, theme, ctx);
    expect(html).toContain('class="fr hl"');
    expect(html).toContain("sc-badge v-good");
  });

  it("draws a gallery of pictures with captions", () => {
    const s = sanitizeSlide({ layout: "gallery", title: "Audit", gallery: [{ mediaId: "m1", caption: "Wall A" }, { url: "https://x.test/b.jpg", caption: "Wall B" }, { caption: "Wall C" }, null, "x"] });
    expect(s.gallery?.length).toBe(3);
    const html = renderSlideHtml(s, theme, ctx);
    expect(html).toContain('src="/api/media/m1"');
    expect(html).toContain("<figcaption>Wall B</figcaption>");
    expect(html).toContain("--gc:3");
  });

  it("draws a country map from codes or names, coloured by status, with the region's other countries grey", () => {
    const s = sanitizeSlide({ layout: "map", title: "Where it is allowed", map: { region: "asean", areas: [{ code: "Malaysia", status: "ALLOWED 2%", note: "ACD Annex III" }, { code: "SG", status: "YES" }, { code: "Thailand", status: "BANNED" }, { code: "ID", status: "PENDING" }, { code: "Atlantis", status: "YES" }, { code: "MY", status: "dup" }] } });
    expect(s.map?.areas.map((a) => a.code)).toEqual(["MY", "SG", "TH", "ID"]);
    const html = renderSlideHtml(s, theme, ctx);
    expect(html.match(/class="tile /g)?.length).toBe(mapTiles("asean").length);
    expect(html).toContain('class="tile t-good"');
    expect(html).toContain('class="tile t-bad"');
    expect(html).toContain('class="tile t-mid"');
    expect(html).toContain('class="tile t-none"');
    expect(html).toContain("<b>Malaysia</b>: ALLOWED 2%");
    // A country outside the region is still drawn.
    expect(mapTiles("asean", ["UK"]).some((t) => t.code === "UK")).toBe(true);
    expect(mapTone("Restricted to 0.5%")).toBe("mid");
    expect(mapTone("Prohibited")).toBe("bad");
    expect(mapTone("Annex III")).toBe("info");
  });

  it("draws a mechanism map, a funnel with carry-over rates and an equation", () => {
    const hub = sanitizeSlide({ layout: "diagram", title: "How it works", diagram: { kind: "hub", center: "Niacinamide", nodes: [{ label: "Repairs" }, { label: "Hydrates", detail: "TEWL down" }, "Calms"], steps: [], pills: ["+45% hydration"] } });
    expect(hub.diagram).toMatchObject({ kind: "hub", center: "Niacinamide", pills: ["+45% hydration"] });
    const h = renderSlideHtml(hub, theme, ctx);
    expect(h).toContain("sc-hub");
    expect(h).toContain('class="disc">Niacinamide<');
    expect(h.match(/class="node"/g)?.length).toBe(3);
    const fun = sanitizeSlide({ layout: "diagram", title: "Drop-off", diagram: { kind: "funnel", stages: [{ value: "400", label: "visited" }, { value: "120", label: "engaged" }, { value: "30", label: "bought" }] } });
    const f = renderSlideHtml(fun, theme, ctx);
    expect(f).toContain("sc-funnel");
    expect(f).toContain(">30%<");
    expect(f).toContain(">25%<");
    expect(stepRate("50%", "20%")).toBe("");
    const eq = sanitizeSlide({ layout: "diagram", title: "The claim", diagram: { kind: "equation", terms: [{ value: "3", label: "actives" }, { value: "28", label: "days" }], result: { value: "40/40", label: "users improved" } } });
    const e = renderSlideHtml(eq, theme, ctx);
    expect(e.match(/class="op">\+</g)?.length).toBe(1);
    expect(e).toContain('class="op">=<');
    expect(e).toContain("term res");
    // A funnel of one stage is not a funnel.
    expect(sanitizeSlide({ layout: "diagram", title: "x", diagram: { kind: "funnel", stages: [{ value: "1", label: "a" }] } }).diagram).toBeUndefined();
  });

  it("colours each card from the design's series", () => {
    const s: Slide = { id: "c", layout: "cards", title: "Series", cards: [{ heading: "A" }, { heading: "B" }] };
    const html = renderSlideHtml(s, T("booth-bright"), ctx);
    expect(html).toContain(`--cc:${T("booth-bright").series![1]}`);
    expect(renderSlideHtml(s, theme, ctx)).not.toContain("--cc:");
  });
});

describe("the house design system", () => {
  const house = themePreset("house");
  it("is a preset with the house palette, fonts and look", () => {
    expect(house).toMatchObject({ id: "house", fontDisplay: "Arial", fontBody: "Calibri", fontQuote: "Cambria", radius: 22, slideStyle: "bloom", darkTitle: true });
    expect(house.colors).toMatchObject({ ink: "#0B1B3A", brandDeep: "#16305E", brand: "#0D9488", accent: "#D97706", ink2: "#44546A" });
    expect(glowOf("#0D9488")).toBe("#5EEAD4");
    expect(glowOf("#E4708A")).toMatch(/^#[0-9A-F]{6}$/);
    // The fallback preset for an unknown theme is unchanged, so saved designs do not pick up the house habits.
    expect(themePreset("no-such-id").id).toBe("facerinna");
    expect(sanitizeTheme({ ...house, slideStyle: "bloom" }).slideStyle).toBe("bloom");
    expect(fontsUrl(house)).toContain("Caladea");
  });

  it("draws a dark cover with its second line lit, and the closing takeaways as chips", () => {
    const cover = renderSlideHtml({ id: "c", layout: "title", kicker: "WORKSHOP", title: "How a label becomes\ncompliant in five steps" }, house, ctx);
    expect(cover).toContain("sc-style-bloom");
    expect(cover).toContain("sc-dark");
    expect(cover).toContain('How a label becomes<br><span class="l2">compliant in five steps</span>');
    expect(cover).toContain("sc-dots");
    expect(cover.match(/<circle /g)?.length).toBe(40);
    const close = renderSlideHtml({ id: "z", layout: "closing", title: "Notify first,\nsell second", bullets: ["Screen", "Keep the PIF", "Notify", "Label", "extra"] }, house, ctx);
    expect(close.match(/<span>[^<]+<\/span>/g)?.length).toBe(4);
  });

  it("draws the same particle field for a slide every time, and a different one for another slide", () => {
    expect(particles("s_1")).toEqual(particles("s_1"));
    expect(particles("s_1")).not.toEqual(particles("s_2"));
    for (const p of particles("s_1")) {
      expect(p.o).toBeGreaterThanOrEqual(0.05);
      expect(p.o).toBeLessThanOrEqual(0.15);
    }
  });

  it("gives content slides amber eyebrows and the pull-quote band, in the quote font", () => {
    const html = renderSlideHtml({ id: "k", layout: "cards", kicker: "THE PATHWAY", title: "A notification is a form", cards: [{ heading: "A" }, { heading: "B" }], callout: "It is not an approval." }, house, ctx);
    expect(html).toContain("--font-quote:'Cambria','Caladea'");
    expect(html).toContain("--glow:#5EEAD4");
    expect(html).toContain('class="sc-callout">It is not an approval.<');
    expect(SLIDE_CSS).toMatch(/\.sc-style-bloom \.sc-h \.sc-kicker\{color:var\(--accent\)/);
    expect(SLIDE_CSS).toMatch(/\.sc-style-bloom \.sc-callout\{border-radius:999px/);
  });
});

describe("the briefing design", () => {
  const b = themePreset("briefing");
  it("is the default for a new deck, with the navy serif palette", () => {
    expect(DEFAULT_THEME_ID).toBe("briefing");
    expect(b).toMatchObject({ id: "briefing", fontDisplay: "Cambria", fontBody: "Calibri", slideStyle: "briefing", darkTitle: true });
    expect(b.colors).toMatchObject({ brandDeep: "#0B2D63", surface: "#EAF1FB", accent: "#E8174B" });
    expect(sanitizeTheme(b).slideStyle).toBe("briefing");
    expect(sanitizeTheme({ ...themePreset("facerinna"), slideStyle: "briefing" }).slideStyle).toBe("briefing");
    expect(themeGuide("briefing")).toMatch(/source line/);
    expect(SLIDE_CSS).toContain(".sc-slide.sc-style-briefing");
  });

  it("tells a say and don't say pair from two ordinary columns", () => {
    expect(isVersusPair("Say", "Don't say")).toBe(true);
    expect(isVersusPair("What the data can tell us", "What it cannot tell us")).toBe(true);
    expect(isVersusPair("Boleh sebut", "Jangan sebut")).toBe(true);
    expect(isVersusPair("Do", "Avoid")).toBe(true);
    expect(isVersusPair("Before", "After")).toBe(false);
    expect(isVersusPair("Don't", "Don't")).toBe(false);
    expect(isVersusPair(undefined, "Don't say")).toBe(false);
    const html = renderSlideHtml({ id: "v", layout: "two-column", title: "Wording", leftHeading: "Say", rightHeading: "Don't say", bullets: ["SKUs audited"], bulletsRight: ["All <b>pharmacies</b>"] }, b, ctx);
    expect(html).toContain("sc-vs");
    expect(html).toContain("<i>✓</i><span>SKUs audited</span>");
    expect(html).toContain("<i>✗</i><span>All &lt;b&gt;pharmacies&lt;/b&gt;</span>");
    // Any design draws the pair the same way.
    expect(renderSlideHtml({ id: "v", layout: "two-column", title: "W", leftHeading: "Say", rightHeading: "Don't say", bullets: ["a"], bulletsRight: ["b"] }, theme, ctx)).toContain("sc-vs");
    expect(renderSlideHtml({ id: "v", layout: "two-column", title: "W", leftHeading: "Before", rightHeading: "After", bullets: ["a"], bulletsRight: ["b"] }, b, ctx)).not.toContain("sc-vs");
  });

  it("lists a doughnut's shares beside it instead of in the picture", () => {
    const chart = { kind: "doughnut" as const, categories: ["Chain", "Independent", "Online"], series: [{ name: "SKUs", values: [52, 33, 15] }] };
    expect(pieShares(chart).map((x) => x.pct)).toEqual([52, 33, 15]);
    expect(pieShares({ ...chart, series: [{ name: "n", values: [1, 2, 0] }] }).map((x) => x.pct)).toEqual([33.3, 66.7, 0]);
    const html = renderSlideHtml({ id: "p", layout: "chart", title: "Shares", chart }, b, ctx);
    expect(html).toContain("sc-pie");
    expect(html.match(/class="lg"/g)?.length).toBe(3);
    expect(html).toContain('<span class="pc">52%</span>');
    // The svg carries no legend text of its own.
    expect(html).not.toMatch(/<svg[\s\S]*Independent[\s\S]*<\/svg>/);
    // A bar chart is unchanged.
    expect(renderSlideHtml({ id: "q", layout: "chart", title: "Bars", chart: { ...chart, kind: "bar" } }, b, ctx)).not.toContain("sc-pie");
  });

  it("draws closing actions as numbered next steps and short takeaways as chips", () => {
    expect(isStepList(["Screen", "Keep the PIF"])).toBe(false);
    expect(isStepList(["Brief R&D to print the PA grade on every sunscreen."])).toBe(true);
    const steps = renderSlideHtml({ id: "z", layout: "closing", title: "Next steps", bullets: ["Brief R&D to print the PA grade on every sunscreen.", "Re-audit the same 42 pharmacies in Q1 2027."] }, b, ctx);
    expect(steps).toContain('<ol class="sc-next">');
    expect(steps).toContain('<span class="no">2</span>');
    expect(steps).not.toContain("sc-chips");
    const chips = renderSlideHtml({ id: "z", layout: "closing", title: "Close", bullets: ["Screen", "Keep the PIF"] }, b, ctx);
    expect(chips).toContain("sc-chips");
  });

  it("colours each figure, puts the cover's finding in a panel and marks short tables and single card rows", () => {
    const k = renderSlideHtml({ id: "k", layout: "kpi", title: "Who", kpi: [{ label: "a", value: "1" }, { label: "b", value: "2" }] }, b, ctx);
    expect(k).toContain(`--kc:${b.series![0]}`);
    expect(k).toContain(`--kc:${b.series![1]}`);
    expect(renderSlideHtml({ id: "t", layout: "title", title: "T", body: "Main finding" }, b, ctx)).toContain('class="sc-sub sc-lead"');
    expect(renderSlideHtml({ id: "t", layout: "table", title: "T", table: { header: ["a"], rows: [["1"]] } }, b, ctx)).toContain("rows-few");
    expect(renderSlideHtml({ id: "c", layout: "cards", title: "C", cards: [{ heading: "a" }, { heading: "b" }] }, b, ctx)).toContain("sc-cards r1");
    expect(renderSlideHtml({ id: "c", layout: "cards", title: "C", cards: Array.from({ length: 6 }, (_, i) => ({ heading: `h${i}` })) }, b, ctx)).not.toContain("sc-cards r1");
  });
});

describe("Studio outputs and model lists", () => {
  it("keeps what a viewer can draw and drops the rest", async () => {
    const { sanitizeOutputData, isEmptyOutput, outputToMarkdown, tableToCsv, parseModelList, pickModel, sanitizeAnswer } = await import("../src/index.js");
    const q = sanitizeOutputData("quiz", { questions: [{ question: "Q", options: ["a", "b"], answer: "b", explanation: "e" }, { question: "bad", options: ["a"], answer: 0 }, { question: "out of range", options: ["a", "b"], answer: 5 }] }) as { questions: { answer: number }[] };
    expect(q.questions.length).toBe(1);
    expect(q.questions[0].answer).toBe(1);
    const t = sanitizeOutputData("table", { columns: ["A", "B"], rows: [["1"], ["=cmd()", "x,y"], []] }) as { columns: string[]; rows: string[][] };
    expect(t.rows).toEqual([["1", ""], ["=cmd()", "x,y"]]);
    expect(tableToCsv(t)).toBe('A,B\r\n1,\r\n\'=cmd(),"x,y"\r\n');
    expect(isEmptyOutput("flashcards", sanitizeOutputData("flashcards", { cards: [{ front: "x" }] }))).toBe(true);
    expect(outputToMarkdown({ id: "o", deckId: "d", kind: "table", title: "T", data: t, createdAt: "", updatedAt: "" })).toContain("| A | B |");
    expect(parseModelList("claude-opus-5.5=Claude Opus, gpt-6-luna, bad id, gpt-6-luna")).toEqual([{ id: "claude-opus-5.5", label: "Claude Opus" }, { id: "gpt-6-luna", label: "gpt-6-luna" }]);
    const list = parseModelList("a,b");
    expect(pickModel("b", "a", "d", list)).toBe("b");
    expect(pickModel("zzz", "a", "d", list)).toBe("a");
    expect(pickModel("zzz", "zzz", "d", list)).toBe("d");
    expect(pickModel("anything", null, "d", [])).toBe("anything");
    expect(sanitizeAnswer({ answer: "x", citations: [{ source: "s", quote: "" }, { source: "s", quote: "q" }], followUps: ["a", "b", "c", "d"] })).toEqual({ answer: "x", citations: [{ source: "s", quote: "q" }], followUps: ["a", "b", "c"] });
  });
});

describe("bugs found in the review of 1 Oct 2026", () => {
  it("rebuilds a slide's review and caps the lists a slide can carry", () => {
    const s = sanitizeSlide({ id: "a", layout: "bullets", title: "T", review: { ok: "yes", feedback: 5 } });
    expect(s.review).toEqual({ ok: false, feedback: [] });
    const s2 = sanitizeSlide({ id: "a", layout: "bullets", title: "T", review: { ok: true, feedback: [{ text: "fix", at: "2026-10-01" }, { text: 7 }, "x"] } });
    expect(s2.review?.feedback).toEqual([{ text: "fix", at: "2026-10-01" }]);
    const big = Array.from({ length: 60 }, (_, i) => String(i));
    const s3 = sanitizeSlide({ id: "a", layout: "table", title: "T", table: { header: big, rows: big.map(() => big) }, chart: { kind: "bar", categories: big, series: big.map((n) => ({ name: n, values: big.map(Number) })) }, diagram: { kind: "matrix", rows: big, cols: big }, map: { areas: ["MY", "SG", "TH", "ID", "PH", "VN", "BN", "KH", "LA", "MM"].map((code) => ({ code, status: "x" })) } });
    expect(s3.table?.header.length).toBe(12);
    expect(s3.table?.rows.length).toBe(20);
    expect(s3.chart?.categories.length).toBe(24);
    expect(s3.chart?.series.length).toBe(8);
    expect(s3.diagram).toMatchObject({ kind: "matrix" });
    expect((s3.diagram as { rows: string[]; cols: string[] }).rows.length).toBe(12);
    expect((s3.diagram as { rows: string[]; cols: string[] }).cols.length).toBe(8);
  });

  it("keeps a negative bar's number clear of the category names", () => {
    const svg = chartSvg({ kind: "bar", categories: ["Loss making unit", "B"], unit: "RM", series: [{ name: "n", values: [-500, 40] }] }, theme.colors);
    // Category names end at x = 300 (anchored right); the number of the longest negative bar ends where it starts.
    const neg = [...svg.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="end"[^>]*font-size="28"[^>]*>([^<]*)</g)].map((m) => ({ x: Number(m[1]), t: m[2] }));
    expect(neg.length).toBe(1);
    expect(neg[0].x - neg[0].t.length * 17).toBeGreaterThanOrEqual(300);
  });

  it("keeps a quiz answer on the right option when a blank option is dropped", async () => {
    const { sanitizeOutputData } = await import("../src/index.js");
    const q = sanitizeOutputData("quiz", { questions: [{ question: "Q", options: ["", "Right", "Wrong"], answer: 1, explanation: "e" }, { question: "Blank answer", options: ["A", "", "B"], answer: 1, explanation: "e" }] }) as { questions: { options: string[]; answer: number }[] };
    expect(q.questions.length).toBe(1);
    expect(q.questions[0].options[q.questions[0].answer]).toBe("Right");
  });

  it("draws a pie whose one slice is the whole, and bars below zero", () => {
    const pie = chartSvg({ kind: "pie", categories: ["A", "B"], series: [{ name: "n", values: [5, 0] }] }, theme.colors);
    expect(pie).toMatch(/<circle cx="[\d.]+" cy="[\d.]+" r="[\d.]+" fill="/);
    const ring = chartSvg({ kind: "doughnut", categories: ["A"], series: [{ name: "n", values: [5] }] }, theme.colors);
    expect(ring).toMatch(/<circle[^>]*fill="none"[^>]*stroke-width/);
    const bars = chartSvg({ kind: "bar", categories: ["Loss", "Gain"], series: [{ name: "n", values: [-5, 3] }] }, theme.colors);
    const widths = [...bars.matchAll(/<rect x="[\d.-]+" y="[\d.-]+" width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(widths.every((w) => w > 0)).toBe(true);
    expect(chartSvg({ kind: "column", categories: ["a", "b"], series: [{ name: "n", values: [0.25, 0.75] }] }, theme.colors)).toContain(">0.25<");
  });

  it("autoFix keeps number ranges and verdict marks", async () => {
    const { autoFix } = await import("../src/index.js");
    expect(autoFix("SPF 30–50 for 2024—2026 ✓ allowed ✗ banned 🎉")).toBe("SPF 30-50 for 2024-2026 ✓ allowed ✗ banned");
    expect(autoFix("Notify first — sell second")).toBe("Notify first, sell second");
  });

  it("takes forbidden characters out of a theme's footer, tag and name", () => {
    const t = sanitizeTheme({ ...theme, footer: "Acme\u000bLtd", tag: "HCP\u0001", name: "My\u0007look" });
    expect(t.footer).toBe("Acme Ltd");
    expect(t.tag).toBe("HCP");
    expect(t.name).toBe("My look");
  });

  it("caps diagrams and cards at what a slide can hold, and writes CSV and Markdown that stay in shape", async () => {
    const { tableToCsv, outputToMarkdown } = await import("../src/index.js");
    const s = sanitizeSlide({ layout: "diagram", title: "T", diagram: { kind: "flow", steps: Array.from({ length: 40 }, (_, i) => ({ label: `s${i}` })) }, cards: Array.from({ length: 30 }, (_, i) => ({ heading: `c${i}` })) });
    expect((s.diagram as { steps: unknown[] }).steps.length).toBe(12);
    expect(s.cards!.length).toBe(16);
    expect(tableToCsv({ columns: ["a"], rows: [["x\ry"]] })).toBe('a\r\n"x\ry"\r\n');
    const md = outputToMarkdown({ id: "o", deckId: "d", kind: "mindmap", title: "T", data: { root: { label: "Root\nline", children: [{ label: "Kid\nline" }] } }, createdAt: "", updatedAt: "" });
    expect(md).toContain("- Root line");
    expect(md).toContain("  - Kid line");
  });
});
