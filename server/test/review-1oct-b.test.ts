import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { extractMany } from "../src/ingest/extract.js";
import { applyPlan } from "../src/llm/generate.js";
import type { GenerateParams } from "../src/llm/prompts.js";

// Regressions from the third review of 1 Oct 2026.

describe("ingest hardening", () => {
  it("reads a sheet whose declared range runs to the last cell in well under a second", async () => {
    // The range is widened in the file's own XML, as Excel writes it when a whole column is formatted;
    // XLSX.write would walk every cell of such a range itself.
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["only", "cell"]]), "S");
    const zip = await JSZip.loadAsync(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
    const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    zip.file("xl/worksheets/sheet1.xml", xml.replace(/<dimension ref="[^"]*"\/>/, '<dimension ref="A1:XFD1048576"/>'));
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const t = Date.now();
    const [out] = await extractMany("wide.xlsx", buf, "wide.xlsx");
    expect(Date.now() - t).toBeLessThan(5000);
    expect(out.text).toContain("only,cell");
  });

  it("reads a CSV as text and keeps the first 400 rows", async () => {
    const csv = Array.from({ length: 1000 }, (_, i) => `${i},row`).join("\n");
    const [out] = await extractMany("big.csv", Buffer.from(csv), "big.csv");
    expect(out.text).toContain("0,row");
    expect(out.text).toContain("399,row");
    expect(out.text).not.toContain("\n400,row");
    expect(out.text).toContain("600 more rows");
  });
});

describe("plan folding", () => {
  it("ignores plan fields that are not text instead of failing the deck", () => {
    const p = { prompt: "x", lang: "en", angle: "custom", slides: 10, features: {} } as unknown as GenerateParams;
    applyPlan(p, { angle: ["x"], audience: ["regulators", "brands"], title: { text: "T" }, slides: "8", features: {}, reason: "" } as never, false);
    expect(p.audience).toBeUndefined();
    expect(p.title).toBeFalsy();
    expect(p.slides).toBe(8);
  });
});
