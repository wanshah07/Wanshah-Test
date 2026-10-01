import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

// The studio slide style in native PowerPoint: the brand block on the cover, the faint
// section number, borderless shadowed cards, the corner disc, the brand table header and
// the callout pill, in a file whose every slide is well-formed XML.

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-studio-pptx-"));
process.env.APP_SECRET = "test-secret-test-secret-test-secret";

const { themePreset, sanitizeSlide } = await import("@slidecraft/shared");
const { deckToPptx } = await import("../src/export/pptx.js");

type Theme = import("@slidecraft/shared").Theme;

/** The studio preset when the shared package carries it, else the briefing preset restyled. */
function studioTheme(id: string): Theme {
  const t = themePreset(id);
  if (String(t.slideStyle) === "studio") return t;
  return { ...themePreset("briefing"), id, slideStyle: "studio" as Theme["slideStyle"], darkTitle: id === "graphite-teal" };
}

const SLIDES = [
  { id: "a", layout: "title", kicker: "Field training", title: "Booth training", subtitle: "Day one", kpi: [{ label: "doctors", value: "120" }, { label: "cities", value: "4" }, { label: "products", value: "6" }] },
  { id: "b", layout: "section", kicker: "Part one", title: "What the rule says" },
  { id: "c", layout: "cards", title: "Next steps", cards: [{ heading: "Notify", detail: "File the PIF" }, { heading: "Label", detail: "Check the panel" }, { heading: "Train", detail: "Brief the floor" }] },
  { id: "d", layout: "table", title: "Limits", table: { header: ["Ingredient", "Limit"], rows: [["A", "1%"], ["B", "2%"], ["C", "3%"]] } },
  { id: "e", layout: "kpi", title: "Results", kpi: [{ label: "hydration", value: "+45%", note: "week 4" }, { label: "redness", value: "0%" }] },
  { id: "f", layout: "bullets", title: "Reading", bullets: ["one", "two"], callout: "Only one study compares directly." },
  { id: "g", layout: "closing", title: "Thank you", bullets: ["Notify first", "Label second", "Train the floor"] },
];

function deck(theme: Theme): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  return { id: "d1", title: "Studio", lang: "en", angle: "custom", theme, slides: SLIDES.map((x) => sanitizeSlide(x)), createdAt: "", updatedAt: "" };
}

async function slides(buf: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  return Promise.all(names.map((n) => zip.file(n)!.async("string")));
}

/** Every <p:sp> on a slide, as its own string. */
function shapes(xml: string): string[] {
  return xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
}

/** A shape's own fill colour (the first solid fill in its properties, before any text runs). */
function fillOf(sp: string): string | undefined {
  return sp.match(/<p:spPr>[\s\S]*?<a:solidFill><a:srgbClr val="([0-9A-F]{6})"/)?.[1];
}

/** Whether the shape's border would be drawn: a line with a colour and no zero alpha. */
function visibleLine(sp: string): boolean {
  const ln = sp.match(/<p:spPr>[\s\S]*?<a:ln[^>]*>([\s\S]*?)<\/a:ln>/)?.[1] ?? "";
  return /<a:srgbClr val="[0-9A-F]{6}"\/>/.test(ln);
}

/** Well-formed enough for PowerPoint: every tag closed in order, every attribute quoted. */
function wellFormed(xml: string): boolean {
  const stack: string[] = [];
  const body = xml.replace(/^<\?xml[^>]*\?>/, "");
  const tag = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|<[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(body))) {
    if (m[2] === undefined) return false;
    if (m[1]) {
      if (stack.pop() !== m[2]) return false;
    } else if (!m[4]) stack.push(m[2]);
  }
  return stack.length === 0 && !/[<>]/.test(body.replace(/<[^>]*>/g, ""));
}

describe("the studio style in PowerPoint", () => {
  it("draws the cover block, the section number, borderless cards, the disc, the table header and the pill", async () => {
    const t = studioTheme("studio-green");
    const brand = t.colors.brand.replace("#", "").toUpperCase();
    const surface = t.colors.surface.replace("#", "").toUpperCase();
    const xs = await slides(await deckToPptx(deck(t), "u1"));
    expect(xs.length).toBe(SLIDES.length);
    for (const x of xs) expect(wellFormed(x)).toBe(true);

    // The cover: a rounded brand block, the hero figures in white inside it.
    const block = shapes(xs[0]).find((sp) => /prst="roundRect"/.test(sp) && fillOf(sp) === brand);
    expect(block).toBeDefined();
    expect(xs[0]).toContain(">120<");
    expect(xs[0]).toContain(">FIELD TRAINING<");

    // The section slide carries its own number, two digits.
    expect(xs[1]).toContain(">02<");
    expect(xs[1]).toContain(">What the rule says<");

    // Cards: at least one surface panel per card, none with a border, each with a shadow.
    const cards = shapes(xs[2]).filter((sp) => /prst="roundRect"/.test(sp) && fillOf(sp) === surface);
    expect(cards.length).toBeGreaterThanOrEqual(3);
    for (const sp of cards) {
      expect(visibleLine(sp)).toBe(false);
      expect(sp).toContain("<a:outerShdw");
    }
    // No stripe along the top of a card.
    expect(shapes(xs[2]).filter((sp) => /prst="rect"/.test(sp) && fillOf(sp) === brand).length).toBe(0);

    // Every content slide: the faint brand disc (8% on a light canvas) and the accent bar above the title.
    for (const x of xs.slice(2, 6)) {
      const disc = shapes(x).find((sp) => /prst="ellipse"/.test(sp) && fillOf(sp) === brand && /<a:alpha val="8000"\/>/.test(sp));
      expect(disc).toBeDefined();
      expect(shapes(x).some((sp) => /prst="roundRect"/.test(sp) && fillOf(sp) === brand && !visibleLine(sp))).toBe(true);
    }

    // The table: a brand header row and no rules in the theme's line colour.
    expect(xs[3]).toMatch(new RegExp(`<a:tcPr[^>]*>[\\s\\S]*?<a:solidFill><a:srgbClr val="${brand}"`));
    expect(xs[3]).not.toContain(t.colors.line.replace("#", "").toUpperCase());

    // The callout: a full-radius brand pill.
    // (The accent bar is a full-radius brand shape too, so the pill is the one carrying the words.)
    const pill = shapes(xs[5]).find((sp) => /prst="roundRect"/.test(sp) && /<a:gd name="adj" fmla="val 50000"\/>/.test(sp) && fillOf(sp) === brand && sp.includes("Only one study"));
    expect(pill).toBeDefined();
    expect(pill).toContain('<a:srgbClr val="FFFFFF"');

    // The close: white pills carrying the brand colour in their text.
    const chips = shapes(xs[6]).filter((sp) => /prst="roundRect"/.test(sp) && fillOf(sp) === "FFFFFF");
    expect(chips.length).toBe(3);
    for (const sp of chips) expect(sp).toContain(`<a:srgbClr val="${brand}"`);
  });

  it("puts the dark preset's cover on the deep brand colour and the disc at 14%", async () => {
    const t = studioTheme("graphite-teal");
    const brand = t.colors.brand.replace("#", "").toUpperCase();
    const deep = t.colors.brandDeep.replace("#", "").toUpperCase();
    const xs = await slides(await deckToPptx(deck(t), "u1"));
    for (const x of xs) expect(wellFormed(x)).toBe(true);
    expect(xs[0]).toMatch(new RegExp(`<p:bg>[\\s\\S]*?<a:srgbClr val="${deep}"`));
    expect(shapes(xs[0]).some((sp) => /prst="roundRect"/.test(sp) && fillOf(sp) === brand)).toBe(true);
    expect(shapes(xs[2]).some((sp) => /prst="ellipse"/.test(sp) && fillOf(sp) === brand && /<a:alpha val="14000"\/>/.test(sp))).toBe(true);
  });

  it("leaves the other styles as they were", async () => {
    const t = themePreset("briefing");
    const xs = await slides(await deckToPptx(deck(t), "u1"));
    const brand = t.colors.brand.replace("#", "").toUpperCase();
    expect(xs[1]).not.toContain(">02<");
    expect(shapes(xs[2]).some((sp) => /prst="ellipse"/.test(sp) && fillOf(sp) === brand && /<a:alpha val="8000"\/>/.test(sp))).toBe(false);
  });
});
