import { describe, expect, it } from "vitest";
import { cleanBrief, composeAudience, composeBrief } from "../src/brief.js";
import { checkSource, sheetTabs } from "../src/index.js";

describe("tick-box brief", () => {
  it("turns ticks into writer lines, with typed text after them", () => {
    const b = composeBrief({ purposes: ["reg-change"], include: ["dates"], text: "Our toner has 2% salicylic acid." });
    expect(b).toBe("- Explain what the regulation or guideline changes, from when, and who it affects.\n- Give every effective date, transition period and deadline, with its source.\n\nOur toner has 2% salicylic acid.");
  });
  it("is just the typed text when nothing is ticked", () => {
    expect(composeBrief({ purposes: [], include: [], text: "  plain brief  " })).toBe("plain brief");
  });
  it("joins ticked audiences and typed ones", () => {
    expect(composeAudience(["hcp", "management"], "KOL dermatologists")).toBe("healthcare professionals; senior management; KOL dermatologists");
    expect(composeAudience([], "")).toBe("");
  });
  it("keeps only known ids when stored", () => {
    const c = cleanBrief({ purposes: ["reg-change", "<script>"], include: ["nope"], audiences: ["hcp"], text: 5 as unknown as string, imageMode: "bogus" as never, features: { images: true, x: "y" as unknown as boolean } });
    expect(c).toEqual({ text: "", purposes: ["reg-change"], include: [], audiences: ["hcp"], slides: undefined, imageMode: undefined, features: { images: true } });
  });
});


describe("what was read from a source", () => {
  it("counts a sheet's rows per tab and names the empty ones out", () => {
    const t = "[sheet: Sales]\nMonth,Units\nJan,120\n\n[sheet: Empty]\n,,\n\n[sheet: Notes]\nNote\nQ1";
    expect(sheetTabs(t).map((x) => [x.name, x.rows])).toEqual([["Sales", 2], ["Empty", 0], ["Notes", 2]]);
    const c = checkSource("sheet", t);
    expect(c).toMatchObject({ level: "ok", note: "Read 4 rows in 2 tabs: Sales (2 rows), Notes (2 rows)." });
    expect(c.preview).toBe("Tab: Sales\nMonth,Units\nJan,120\nTab: Empty\nTab: Notes\nNote");
  });
  it("fails a sheet with no data, and warns when rows were cut", () => {
    expect(checkSource("sheet", "[sheet: A]\n\n[sheet: B]\n,,,")).toMatchObject({ level: "fail", note: "The sheet has 2 tabs and no data in any of them." });
    expect(checkSource("sheet", "[sheet: A]\n,,")).toMatchObject({ level: "fail", note: "The sheet has no data in it." });
    const big = `[sheet: Big]\n${Array.from({ length: 400 }, (_, i) => `r${i},1`).join("\n")}\n[… 250 more rows]`;
    const w = checkSource("sheet", big);
    expect(w.level).toBe("warn");
    expect(w.note).toMatch(/^Read 650 rows in 1 tab: Big \(650 rows\)\. Only the first 400 rows of Big go to the writer/);
  });
  it("fails a document with no text, warns on a near-empty PDF, and passes a picture", () => {
    expect(checkSource("pdf", "")).toMatchObject({ level: "fail" });
    expect(checkSource("pdf", "")!.note).toMatch(/scanned PDF/);
    expect(checkSource("docx", "  ")).toMatchObject({ level: "fail", note: "No text could be read from this file." });
    expect(checkSource("pdf", "Page 1 Page 2")).toMatchObject({ level: "warn" });
    expect(checkSource("docx", "Salicylic acid is capped at 2% in rinse-off products across the region.")).toMatchObject({ level: "ok", note: "Read 12 words." });
    expect(checkSource("image", "")).toMatchObject({ level: "ok" });
  });
});
