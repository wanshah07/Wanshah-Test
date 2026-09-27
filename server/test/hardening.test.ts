import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

// Regressions from the 26 Sep 2026 bug hunt: exports and the present page must
// survive whatever a model or an old deck put in a slide or a theme.

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-harden-"));
process.env.APP_SECRET = "test-secret-test-secret-test-secret";

const { renderDeckHtml, themePreset, sanitizeSlide, sanitizeTheme } = await import("@slidecraft/shared");
const { deckToPptx } = await import("../src/export/pptx.js");

function deck(slides: Record<string, unknown>[], theme: Record<string, unknown> = themePreset("")): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  return { id: "d1", title: "t", lang: "en", angle: "custom", theme, slides, createdAt: "", updatedAt: "" };
}

async function slideXml(buf: Buffer, n = 1): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return zip.file(`ppt/slides/slide${n}.xml`)!.async("string");
}

describe("the present page and HTML export", () => {
  it("cannot be broken out of by speaker notes", () => {
    const html = renderDeckHtml(deck([{ id: "a", layout: "title", title: "x", notes: "</script><script>alert('notes')</script>" }]), (id) => id);
    expect(html).not.toContain("</script><script>alert");
    expect(html).toContain("\\u003c/script\\u003e");
  });

  it("does not let a theme value write markup", () => {
    const t = { ...themePreset(""), colors: { ...themePreset("").colors, brand: '#fff"><img src=x onerror=alert(1)>' }, radius: "9px;}" as unknown, slideStyle: 'x" onmouseover="alert(1)' };
    const html = renderDeckHtml(deck([{ id: "a", layout: "bullets", title: "x", bullets: ["a"] }], t), (id) => id);
    expect(html).not.toContain("onerror=alert");
    expect(html).not.toContain("onmouseover");
    expect(sanitizeTheme(t).colors.brand).toBe(themePreset("").colors.brand);
  });
});

describe("the PowerPoint export", () => {
  it("never reads a local file named as a picture address, and does not crash on an unreachable host", async () => {
    const t0 = Date.now();
    const buf = await deckToPptx(deck([
      { id: "a", layout: "image", title: "local", image: { url: path.resolve("package.json") } },
      { id: "b", layout: "image", title: "file", image: { url: "file:///etc/passwd" } },
      { id: "c", layout: "image", title: "gone", image: { url: "https://nonexistent-host-zzz.invalid/x.png" } },
      { id: "d", layout: "image", title: "loop", image: { url: "https://127.0.0.1/x.png" } },
    ]), "u1");
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).filter((n) => n.startsWith("ppt/media/") && !n.endsWith("/"))).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(15000);
  });

  it("opens with a chart that named no categories, a ragged table and control characters", async () => {
    const buf = await deckToPptx(deck([
      { id: "a", layout: "chart", title: "t", chart: { kind: "column", categories: [], series: [{ name: "s", values: [5, 6] }] } },
      { id: "b", layout: "table", title: "t", table: { header: ["H1", "H2"], rows: [["a"], ["a", "b", "c", "d", "e"]] } },
      { id: "c", layout: "bullets", title: "a\u000bb", bullets: ["x\u0001y"], notes: "n\u0001" },
    ]), "u1");
    const zip = await JSZip.loadAsync(buf);
    const chartXml = await zip.file(Object.keys(zip.files).find((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))!)!.async("string");
    expect(chartXml).toContain('<c:ptCount val="2"/>');
    const table = await slideXml(buf, 2);
    expect((table.match(/<a:gridCol /g) ?? []).length).toBe(5);
    for (const [name, f] of Object.entries(zip.files)) {
      if (!name.endsWith(".xml")) continue;
      expect(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(await f.async("string")), name).toBe(false);
    }
  });

  it("draws every number tile, in rows of four", async () => {
    const kpi = Array.from({ length: 8 }, (_, i) => ({ label: `L${i}`, value: String(i) }));
    const xml = await slideXml(await deckToPptx(deck([{ id: "a", layout: "kpi", title: "t", kpi }]), "u1"));
    for (let i = 0; i < 8; i++) expect(xml).toContain(`>L${i}<`);
  });

  it("strips markdown from matrix row and column names", async () => {
    const xml = await slideXml(await deckToPptx(deck([{ id: "a", layout: "diagram", title: "t", diagram: { kind: "matrix", rows: ["r1", "r2 **b**"], cols: ["c **x**"], cells: [["yes"]] } }]), "u1"));
    expect(xml).not.toContain("**");
  });
});

describe("slides are squared up", () => {
  it("pads a matrix, a table and chart categories; turns a signed pie into columns", () => {
    const m = sanitizeSlide({ id: "a", layout: "diagram", title: "t", diagram: { kind: "matrix", rows: ["r1", "r2"], cols: ["c1", "c2"], cells: [["x"]] } });
    expect(m.diagram).toEqual({ kind: "matrix", rows: ["r1", "r2"], cols: ["c1", "c2"], cells: [["x", ""], ["", ""]] });
    const c = sanitizeSlide({ id: "b", layout: "chart", title: "t", chart: { kind: "pie", categories: ["a"], series: [{ name: "s", values: [3, -1] }] } });
    expect(c.chart).toMatchObject({ kind: "column", categories: ["a", "2"] });
  });
});
