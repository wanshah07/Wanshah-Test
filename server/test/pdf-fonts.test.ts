import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { analyseReference } from "../src/design/extract.js";

// pdfjs 6 (needed for GHSA-hq66-cqwq-w95j) no longer hands a font's PDF name to the reader unless the document
// is opened with fontExtraProperties; without it every font reads as its internal id ("g_d0_f1"). These cases
// cover the font kinds slide exports use, with subset prefixes and style suffixes.

function pdf(fonts: string[], content: string): Buffer {
  const res = fonts.map((_, i) => `/F${i + 1} ${5 + i} 0 R`).join(" ");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Resources << /Font << ${res} >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ...fonts,
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

describe("font names from a PDF reference", () => {
  it("runs on a pdfjs past GHSA-hq66-cqwq-w95j", () => {
    const { version } = createRequire(import.meta.url)("pdfjs-dist/package.json") as { version: string };
    const [maj, min, patch] = version.split(".").map(Number);
    expect(maj * 1e6 + min * 1e3 + patch).toBeGreaterThanOrEqual(6_002_108);
  });

  it("reads TrueType subset names, strips the prefix and the style, and ranks by size and by use", async () => {
    const buf = pdf(
      [
        "<< /Type /Font /Subtype /TrueType /BaseFont /QWERTY+PlayfairDisplay-Bold /FirstChar 32 /LastChar 126 >>",
        "<< /Type /Font /Subtype /TrueType /BaseFont /ZXCVBN+Lato-Regular /FirstChar 32 /LastChar 126 >>",
      ],
      "BT /F1 40 Tf 60 460 Td (Big title) Tj ET BT /F2 16 Tf 60 300 Td (A much longer body line of text) Tj 0 -20 Td (And another body line) Tj ET",
    );
    const d = await analyseReference([{ name: "ref.pdf", buf }], "Ref", null);
    expect(d.analysis.fonts.display).toBe("Playfair Display");
    expect(d.analysis.fonts.body).toBe("Lato");
    expect(d.analysis.fonts.found).toEqual(["Lato", "Playfair Display"]);
    expect(d.analysis.fonts.found.join(" ")).not.toMatch(/g_d\d|ZXCVBN|QWERTY/);
  });
});
