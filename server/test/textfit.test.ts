import { describe, expect, it } from "vitest";
import { fitFont, linesFor, textHeightIn } from "../src/export/textfit.js";

describe("PowerPoint text sizing", () => {
  it("keeps the designed size when the text fits", () => {
    expect(fitFont("Update the labels", 3.3, 0.5, 15, 8, { bold: true })).toBe(15);
    expect(fitFont(["Annex III entry 98 sets the limit", "Leave-on stays at 0.5%", "Mandatory label"], 11.7, 3, 20, 6, { indentPt: 18, paraSpacePt: 8 })).toBe(20);
  });

  it("shrinks long text until its wrapped height fits the box", () => {
    const text = "Salicylic acid in rinse-off products ".repeat(30);
    const size = fitFont(text, 3.3, 1.2, 11);
    expect(size).toBeLessThan(11);
    expect(textHeightIn([text], 3.3, size)).toBeLessThanOrEqual(1.2);
    expect(textHeightIn([text], 3.3, size + 0.5)).toBeGreaterThan(1.2);
  });

  it("wraps more lines at larger sizes and breaks a word longer than the line", () => {
    const t = "evidence ".repeat(40);
    expect(linesFor(t, 200, 12)).toBeGreaterThan(linesFor(t, 200, 8));
    expect(linesFor("x".repeat(400), 100, 12)).toBeGreaterThan(5);
  });

  it("keeps a figure on one line when asked", () => {
    const size = fitFont("RM 1,250,000.00", 2.3, 1.1, 40, 12, { bold: true, maxLines: 1 });
    expect(linesFor("RM 1,250,000.00", (2.3 - 0.2) * 72, size, true)).toBe(1);
    expect(size).toBeLessThan(40);
  });

  it("never overflows: past the preferred floor it keeps shrinking", () => {
    const text = "evidence ".repeat(400);
    const size = fitFont(text, 2, 0.6, 11, 8);
    expect(size).toBeLessThan(8);
  });
});
