import { describe, expect, it } from "vitest";
import type { Slide } from "@slidecraft/shared";
import { needsDesign, pictureTitle, placePictures, textSlideIndices } from "../src/llm/design.js";
import { extractMany, pdfFigures } from "../src/ingest/extract.js";

const b = (title: string, bullets: string[]): Slide => ({ id: title, layout: "bullets", title, bullets });

/** A one-page PDF carrying one RGB picture (no compression), built by hand so the test needs no tools. */
export function pdfWithPicture(w: number, h: number): Buffer {
  const pixels = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) pixels.set([(i * 7) % 256, (i * 3) % 256, 128], i * 3);
  const content = Buffer.from(`q ${w} 0 0 ${h} 20 20 cm /Im1 Do Q\nBT /F1 12 Tf 20 ${h + 40} Td (Figure 1: redness over 4 weeks) Tj ET`);
  const objs: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w + 40} ${h + 80}] /Resources << /XObject << /Im1 5 0 R >> /Font << /F1 6 0 R >> >> /Contents 4 0 R >>`),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")]),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`), pixels, Buffer.from("\nendstream")]),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ];
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let pos = parts[0].length;
  objs.forEach((o, i) => {
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from("\nendobj\n")]);
    offsets.push(pos);
    parts.push(chunk);
    pos += chunk.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}

describe("pictures from the references go on the slides", () => {
  const pics = [{ mediaId: "m_poster", name: "FACERINNA_B5_UKM_Poster_v4_preview.png", text: "FACERINNA B5 clinical study: redness reduced 32% after 4 weeks of panthenol serum" }];

  it("puts an unused picture beside the points of the slide it matches", () => {
    const deck: Slide[] = [{ id: "t", layout: "title", title: "B5" }, b("Why panthenol calms skin", ["Soothes", "Repairs"]), b("Redness fell 32% in 4 weeks", ["Clinical study result", "Serum used twice daily"]), { id: "c", layout: "closing", title: "Thanks" }];
    expect(placePictures(deck, pics, "en")).toBe(1);
    expect(deck[2].layout).toBe("image");
    expect(deck[2].image).toMatchObject({ mediaId: "m_poster", caption: "FACERINNA B5 UKM Poster" });
    expect(deck[2].bullets).toEqual(["Clinical study result", "Serum used twice daily"]);
    expect(deck).toHaveLength(4);
  });

  it("adds a picture slide before the closing slide when nothing matches and the length is free", () => {
    const deck: Slide[] = [{ id: "t", layout: "title", title: "B5" }, { id: "k", layout: "kpi", title: "Numbers", kpi: [{ label: "a", value: "1" }] }, { id: "c", layout: "closing", title: "Thanks" }];
    expect(placePictures(deck, pics, "ms")).toBe(1);
    expect(deck).toHaveLength(4);
    expect(deck[2]).toMatchObject({ layout: "image", kicker: "DARIPADA SUMBER", image: { mediaId: "m_poster" } });
    expect(deck[3].layout).toBe("closing");
  });

  it("keeps a slide count the user fixed, putting the picture beside the lightest text slide", () => {
    const deck: Slide[] = [{ id: "t", layout: "title", title: "B5" }, b("Unrelated one", ["alpha", "beta", "gamma"]), b("Unrelated two", ["delta"]), { id: "c", layout: "closing", title: "Thanks" }];
    placePictures(deck, pics, "en", 6, 4);
    expect(deck).toHaveLength(4);
    expect(deck[2].layout).toBe("image");
  });

  it("never places the same picture twice or one already on a slide", () => {
    const deck: Slide[] = [{ id: "i", layout: "image", title: "Poster", image: { mediaId: "m_poster" } }, b("Redness fell 32% in 4 weeks", ["x", "y"])];
    expect(placePictures(deck, pics, "en")).toBe(0);
  });

  it("names a picture from its file name", () => {
    expect(pictureTitle("folder/FACERINNA_B5_UKM_Poster_v4_preview.png")).toBe("FACERINNA B5 UKM Poster");
  });
});

describe("when the design pass runs", () => {
  it("runs when fewer than half the content slides are visual, and offers only text slides", () => {
    const deck: Slide[] = [{ id: "t", layout: "title", title: "B5" }, b("a", ["x"]), b("b", ["y"]), { id: "k", layout: "kpi", title: "n", kpi: [{ label: "a", value: "1" }] }];
    expect(needsDesign(deck)).toBe(true);
    expect(textSlideIndices(deck)).toEqual([1, 2]);
    deck[1].layout = "chart";
    expect(needsDesign(deck)).toBe(false);
  });
});

describe("figures inside a PDF", () => {
  it("come out as picture sources beside the PDF's text", async () => {
    const pdf = pdfWithPicture(400, 260);
    const items = await extractMany("study.pdf", pdf, "refs/study.pdf");
    expect(items.map((i) => i.kind)).toEqual(["pdf", "image"]);
    expect(items[0].text).toMatch(/Figure 1: redness over 4 weeks/);
    expect(items[1]).toMatchObject({ name: "study - p1 figure 1.jpg", relPath: "refs/study/p1-figure-1.jpg", image: { mime: "image/jpeg" } });
    expect(items[1].image!.buf.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it("skip logos and icons", async () => {
    expect(await pdfFigures(pdfWithPicture(120, 60))).toEqual([]);
  });
});
