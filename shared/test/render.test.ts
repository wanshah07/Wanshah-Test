import { describe, it, expect } from "vitest";
import { verdictTone, renderSlideHtml, renderDeckHtml, chartSvg, diagramSvg, themePreset, blankSlide, normaliseSlide, LAYOUTS, sanitizeSlide, sanitizeTheme, themeGuide, ringPercent, mapTiles, mapTone, stepRate, glowOf, particles, fontsUrl, SLIDE_CSS } from "../src/index.js";
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
