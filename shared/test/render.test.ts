import { describe, it, expect } from "vitest";
import { verdictTone, renderSlideHtml, renderDeckHtml, chartSvg, diagramSvg, themePreset, blankSlide, normaliseSlide, LAYOUTS } from "../src/index.js";
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
  it("marks SAHKAN markers visibly", () => {
    const s: Slide = { id: "a", layout: "bullets", title: "T", bullets: ["fee RM [SAHKAN: NPRA fee]"] };
    expect(renderSlideHtml(s, theme, ctx)).toContain('<mark class="sahkan">');
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
