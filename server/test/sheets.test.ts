import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractMany } from "../src/ingest/extract.js";

// SheetJS comes from its own CDN build (server/package.json), not the npm `xlsx` package, which stopped at
// 0.18.5 with two high advisories: prototype pollution on read (fixed in 0.19.3) and a ReDoS (fixed in 0.20.2).
// The expected text below is what 0.18.5 produced for the same workbook, so a SheetJS change that alters what
// the writer is given shows up here.

function workbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(
    [
      ["Item", "RM", "Date", "Pct", "Bool", "Formula"],
      ["Lab, test", 900.5, new Date(Date.UTC(2026, 0, 15)), 0.125, true, null],
      [],
      ['Quote "x"', -12, new Date(Date.UTC(2025, 11, 31, 13, 30)), 1, false, null],
      ["Melayu: ubat", 1e21, "", "", "", ""],
    ],
    { cellDates: true },
  );
  ws["F2"] = { t: "n", v: 900.5, f: "B2" };
  ws["D2"].z = "0.0%";
  ws["C2"].z = "yyyy-mm-dd";
  XLSX.utils.book_append_sheet(wb, ws, "Budget");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Array.from({ length: 2500 }, (_, i) => [i, `r${i}`])), "Long");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "Empty");
  return wb;
}

const BUDGET = '[sheet: Budget]\nItem,RM,Date,Pct,Bool,Formula\n"Lab, test",900.5,2026-01-15,12.5%,TRUE,900.5\n"Quote ""x""",-12,12/31/25,1,FALSE,\nMelayu: ubat,1E+21,,,,\n\n[sheet: Long]\n0,r0\n1,r1\n';
const LONG_END = "398,r398\n399,r399\n[… 1600 more rows]\n\n[sheet: Empty]\n";

describe("spreadsheets", () => {
  it("uses a SheetJS build past both advisories", () => {
    const [maj, min, patch] = XLSX.version.split(".").map(Number);
    expect(maj * 1e6 + min * 1e3 + patch).toBeGreaterThanOrEqual(20002);
  });

  for (const [bookType, name] of [["xlsx", "a.xlsx"], ["xlsm", "a.xlsm"], ["biff8", "a.xls"]] as const) {
    it(`reads ${name} to the same text as before: quoting, dates, number formats, formulas, blank rows, the row cap`, async () => {
      const buf = XLSX.write(workbook(), { type: "buffer", bookType }) as Buffer;
      const [out] = await extractMany(name, buf, name);
      expect(out.kind).toBe("sheet");
      expect(out.text.startsWith(BUDGET)).toBe(true);
      expect(out.text.endsWith(LONG_END)).toBe(true);
      expect(out.text).not.toContain("400,r400");
      expect(out.text.length).toBe(3581);
    });
  }
});
