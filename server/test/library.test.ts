import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import JSZip from "jszip";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

// Designs read from reference files, and saved prompts, end to end.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-lib-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "1";
process.env.MOCK_LLM_DELAY_MS = "0";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

type App = Awaited<ReturnType<typeof import("../src/index.js")["buildApp"]>>;
let app: App;
const J = (r: { json: () => unknown }) => r.json() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function multipart(files: { name: string; content: Buffer }[], fields: Record<string, string> = {}) {
  const boundary = "----vitest" + Math.random().toString(36).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const f of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${encodeURIComponent(f.name)}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(f.content, Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

/** A slide picture: navy background, a blue bar, an orange chip, white "text" strokes. */
function slidePixels(w = 480, h = 270): Uint8Array {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c = [0x16, 0x32, 0x4f];
      if (y > 40 && y < 70 && x > 40 && x < 300) c = [0x48, 0x98, 0xd8];
      if (y > 200 && y < 230 && x > 360 && x < 440) c = [0xe8, 0x7a, 0x1e];
      if (y > 100 && y < 180 && x > 40 && x < 320 && y % 12 < 4) c = [0xff, 0xff, 0xff];
      const i = (y * w + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  return d;
}

function pngOf(): Buffer {
  const png = new PNG({ width: 480, height: 270 });
  png.data = Buffer.from(slidePixels());
  return PNG.sync.write(png);
}

function jpegOf(): Buffer {
  return Buffer.from(jpeg.encode({ width: 480, height: 270, data: slidePixels() }, 92).data);
}

/** A minimal PPTX: a theme, a master with its clrMap and a light background, and two slides. */
async function pptxOf(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", `<Relationships><Relationship Id="rId1" Target="../theme/theme1.xml"/></Relationships>`);
  zip.file(
    "ppt/theme/theme1.xml",
    `<a:theme><a:themeElements><a:clrScheme name="x">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="0A3822"/></a:dk2><a:lt2><a:srgbClr val="F4F7F5"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>
    </a:clrScheme><a:fontScheme name="f"><a:majorFont><a:latin typeface="Montserrat"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`,
  );
  zip.file("ppt/slideMasters/slideMaster1.xml", `<p:sldMaster><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg2"/></p:bgRef></p:bg></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"/></p:sldMaster>`);
  const sp = (title: string, lines: string[]) =>
    `<p:sld><p:cSld><p:spTree>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:solidFill><a:srgbClr val="1B7F4B"/></a:solidFill></p:spPr><p:txBody>${lines.map((l) => `<a:p><a:r><a:rPr><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></a:rPr><a:t>${l}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp>
      <p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></p:graphicFrame>
    </p:spTree></p:cSld></p:sld>`;
  zip.file("ppt/slides/slide1.xml", sp("Salicylic acid is capped at two percent", ["one", "two", "three"]));
  zip.file("ppt/slides/slide2.xml", sp("Dates", ["a", "b", "c", "d", "e"]).replace("<p:spTree>", "<p:spTree><p:pic/><a:tbl></a:tbl>"));
  zip.file("docProps/thumbnail.jpeg", jpegOf());
  return zip.generateAsync({ type: "nodebuffer" });
}

/** A one-page slide PDF: navy page, blue bar, white Montserrat title, light Arial body. */
function pdfOf(): Buffer {
  const content = "0.0863 0.1961 0.3098 rg 0 0 960 540 re f 0.2824 0.5961 0.8471 rg 60 400 300 40 re f BT /F1 36 Tf 1 1 1 rg 60 460 Td (Title here now) Tj ET BT /F2 18 Tf 0.9 0.9 0.9 rg 60 300 Td (Body text line one) Tj 0 -24 Td (Body two) Tj ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /ABCDEF+Montserrat-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /ArialMT >>",
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

// A stand-in model that can see pictures.
let seenImage = false;
let refuseImages = false;
let gw: http.Server;
let gwBase = "";

beforeAll(async () => {
  gw = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      const user = body.messages?.[1]?.content;
      const hasImage = Array.isArray(user) && user.some((p: { type: string }) => p.type === "image_url");
      if (hasImage && refuseImages) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "This model does not support image input" } }));
      }
      seenImage = seenImage || hasImage;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ fontDisplay: "Playfair Display", fontBody: "Lato", style: "Titles top left, one chart per slide." }) }, finish_reason: "stop" }] }));
    });
  });
  await new Promise<void>((r) => gw.listen(0, "127.0.0.1", () => r()));
  gwBase = `http://127.0.0.1:${(gw.address() as AddressInfo).port}/v1`;
  const { buildApp } = await import("../src/index.js");
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  gw.closeAllConnections();
  await new Promise<void>((r) => gw.close(() => r()));
});

describe("reference designs", () => {
  it("reads a PowerPoint theme: background through the clrMap, colours the slides use, fonts and density", async () => {
    const r = await app.inject({ method: "POST", url: "/api/designs/analyse", ...multipart([{ name: "Client deck.pptx", content: await pptxOf() }], { name: "Client house style" }) });
    expect(r.statusCode).toBe(200);
    const d = J(r);
    expect(d.name).toBe("Client house style");
    expect(d.theme.colors.bg).toBe("#F4F7F5"); // bg2 -> lt2 via the master's bgRef
    expect(d.theme.colors.brand).toBe("#ED7D31"); // accent2 is what the slides use most
    expect(d.theme.colors.accent).toBe("#1B7F4B");
    expect(d.theme.fontDisplay).toBe("Montserrat");
    expect(d.theme.fontBody).toBe("Calibri");
    expect(d.analysis.stats).toMatchObject({ slides: 2, charts: 2, tables: 1, pictures: 1, longestTitle: 7, titleWords: 4, linesPerSlide: 4 });
    expect(d.notes).toMatch(/2 slides/);
    expect(d.notes).toMatch(/Titles average 4 words/);
    expect(d.previewMediaId).toBeTruthy();
    const pv = await app.inject({ method: "GET", url: `/api/media/${d.previewMediaId}` });
    expect(pv.headers["content-type"]).toBe("image/jpeg");
  });

  it("keeps text readable whatever the reference picked", async () => {
    const d = J(await app.inject({ method: "GET", url: "/api/designs" }))[0] as { theme: { colors: Record<string, string> } };
    const { contrast, parseHex } = await import("../src/design/colour.js");
    const c = d.theme.colors;
    expect(contrast(parseHex(c.ink)!, parseHex(c.bg)!)).toBeGreaterThanOrEqual(7);
    expect(contrast(parseHex(c.brandDeep)!, parseHex(c.bg)!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseHex(c.muted)!, parseHex(c.bg)!)).toBeGreaterThanOrEqual(3);
  });

  it("reads a PDF: page background, text colour, fonts by size and by use", async () => {
    const d = J(await app.inject({ method: "POST", url: "/api/designs/analyse", ...multipart([{ name: "Brochure.pdf", content: pdfOf() }]) }));
    expect(d.name).toBe("Brochure");
    expect(d.theme.colors.bg).toBe("#16324F");
    expect(d.theme.colors.brand).toBe("#4898D8");
    expect(d.theme.fontDisplay).toBe("Montserrat");
    expect(d.theme.fontBody).toBe("Arial");
    expect(d.analysis.stats).toMatchObject({ slides: 1, titleWords: 3 });
  });

  it("reads a PNG screenshot's colours, and says the fonts need a model", async () => {
    const d = J(await app.inject({ method: "POST", url: "/api/designs/analyse", ...multipart([{ name: "slide.png", content: pngOf() }]) }));
    expect(d.theme.colors.bg).toBe("#16324F");
    expect(d.theme.colors.brand).toBe("#4898D8");
    expect(d.theme.colors.accent).toBe("#E87A1E");
    expect(d.theme.colors.ink).toBe("#FFFFFF");
    expect(d.analysis.warnings.join(" ")).toMatch(/Fonts cannot be read from pixels/);
  });

  it("reads a JPEG screenshot within JPEG's colour error", async () => {
    const d = J(await app.inject({ method: "POST", url: "/api/designs/analyse", ...multipart([{ name: "slide.jpg", content: jpegOf() }]) }));
    const { distance, parseHex } = await import("../src/design/colour.js");
    expect(distance(parseHex(d.theme.colors.bg)!, [0x16, 0x32, 0x4f])).toBeLessThan(8);
    expect(distance(parseHex(d.theme.colors.brand)!, [0x48, 0x98, 0xd8])).toBeLessThan(12);
  });

  it("asks a model that sees pictures for the fonts and layout, and copes when it cannot", async () => {
    const { analyseReference } = await import("../src/design/extract.js");
    const auth = { apiKey: "k", baseUrl: gwBase, model: "vision", imageModel: "x" };
    const d = await analyseReference([{ name: "s.png", buf: pngOf() }], "Seen", auth);
    expect(seenImage).toBe(true);
    expect(d.theme.fontDisplay).toBe("Playfair Display");
    expect(d.theme.fontBody).toBe("Lato");
    expect(d.notes).toMatch(/one chart per slide/);
    refuseImages = true;
    const blind = await analyseReference([{ name: "s.png", buf: pngOf() }], "Blind", auth);
    expect(blind.theme.colors.brand).toBe("#4898D8");
    expect(blind.analysis.warnings.join(" ")).toMatch(/could not look at the pictures/);
  });

  it("refuses files it cannot read, naming them", async () => {
    const r = await app.inject({ method: "POST", url: "/api/designs/analyse", ...multipart([{ name: "notes.docx", content: Buffer.from("x") }]) });
    expect(r.statusCode).toBe(400);
    expect(J(r).message).toMatch(/notes.docx/);
    const bad = await app.inject({ method: "POST", url: "/api/designs/analyse", ...multipart([{ name: "broken.pptx", content: Buffer.from("not a zip") }]) });
    expect(J(bad).message).toMatch(/not a readable PowerPoint/);
  });

  it("does not show design previews among a deck's pictures", async () => {
    const deck = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "x" } }));
    const media = J(await app.inject({ method: "GET", url: `/api/decks/${deck.id}/media` })) as unknown as { origin: string }[];
    expect(media.some((m) => m.origin === "design")).toBe(false);
  });

  it("saves a deck's theme as a design, edits and deletes it", async () => {
    const deck = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "x", themeId: "regulab" } }));
    const d = J(await app.inject({ method: "POST", url: "/api/designs", payload: { name: "Regulab copy", theme: { ...deck.theme, footer: "private", logoMediaId: "m_x" }, notes: "Short titles." } }));
    expect(d.theme.colors.brand).toBe("#1B7F4B");
    expect(d.theme.footer).toBeUndefined();
    const e = J(await app.inject({ method: "PUT", url: `/api/designs/${d.id}`, payload: { name: "Regulab v2", notes: "Shorter titles." } }));
    expect(e).toMatchObject({ name: "Regulab v2", notes: "Shorter titles." });
    expect(e.theme.name).toBe("Regulab v2");
    expect((await app.inject({ method: "DELETE", url: `/api/designs/${d.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/designs/${d.id}` })).statusCode).toBe(404);
  });
});

describe("designs and prompts reach the writer", () => {
  let designId = "";
  it("creates a deck from a design, carrying its theme and id", async () => {
    designId = (J(await app.inject({ method: "GET", url: "/api/designs" })) as unknown as { id: string; name: string }[]).find((d) => d.name === "Client house style")!.id;
    const deck = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "From design", designId } }));
    expect(deck.designId).toBe(designId);
    expect(deck.theme.fontDisplay).toBe("Montserrat");
    expect(deck.theme.id).toBe(`design:${designId}`);
  });

  it("keeps saved prompts, with defaults", async () => {
    const a = J(await app.inject({ method: "POST", url: "/api/prompts", payload: { name: "Cite NPRA first", text: "Cite the NPRA guideline before any EU source.", isDefault: true } }));
    const b = J(await app.inject({ method: "POST", url: "/api/prompts", payload: { name: "Malaysian examples", text: "Use Malaysian brands as examples." } }));
    expect(a.id).toMatch(/^p_/);
    expect((await app.inject({ method: "POST", url: "/api/prompts", payload: { name: "", text: "x" } })).statusCode).toBe(400);
    const list = J(await app.inject({ method: "GET", url: "/api/prompts" })) as unknown as { name: string; isDefault: boolean }[];
    expect(list.map((p) => p.name)).toEqual(["Cite NPRA first", "Malaysian examples"]);
    const edited = J(await app.inject({ method: "PUT", url: `/api/prompts/${b.id}`, payload: { name: "Malaysian examples", text: "Use Malaysian brands.", isDefault: false } }));
    expect(edited.text).toBe("Use Malaysian brands.");
  });

  it("puts ticked prompts and the design's notes into the writer's instructions", async () => {
    const { systemPrompt, rewriteSystem } = await import("../src/llm/prompts.js");
    const { promptTexts, getDesign, listPrompts } = await import("../src/library.js");
    const { DEFAULT_FEATURES } = await import("@slidecraft/shared");
    const uid = (J(await app.inject({ method: "GET", url: "/api/auth/me" })).user as { id: string }).id;
    const defaults = promptTexts(uid, undefined);
    expect(defaults.map((p) => p.name)).toEqual(["Cite NPRA first"]);
    const ticked = promptTexts(uid, [listPrompts(uid).find((p) => p.name === "Malaysian examples")!.id]);
    expect(ticked.map((p) => p.name)).toEqual(["Malaysian examples"]);
    expect(promptTexts(uid, [])).toEqual([]);
    const notes = getDesign(uid, designId)!.notes;
    const sys = systemPrompt({ prompt: "x", lang: "en", angle: "custom", slides: 8, features: DEFAULT_FEATURES, imageMode: "none", house: ticked, designNotes: notes });
    expect(sys).toMatch(/HOUSE INSTRUCTIONS[\s\S]*Malaysian examples: Use Malaysian brands\./);
    expect(sys).toMatch(/DESIGN REFERENCE[\s\S]*2 slides/);
    expect(sys.indexOf("HOUSE INSTRUCTIONS")).toBeGreaterThan(sys.indexOf("STYLE, NON-NEGOTIABLE"));
    expect(rewriteSystem({ lang: "en", angle: "custom", house: ticked })).toMatch(/Malaysian examples/);
    expect(systemPrompt({ prompt: "x", lang: "en", angle: "custom", slides: 8, features: DEFAULT_FEATURES, imageMode: "none" })).not.toMatch(/HOUSE INSTRUCTIONS|DESIGN REFERENCE/);
  });

  it("logs the prompts and design a generation used, and stores the ticked prompt ids", async () => {
    const deck = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "Gen", designId } }));
    const pid = (J(await app.inject({ method: "GET", url: "/api/prompts" })) as unknown as { id: string; name: string }[]).find((p) => p.name === "Malaysian examples")!.id;
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${deck.id}/generate`, payload: { prompt: "A deck about labels", brief: { text: "A deck about labels", purposes: [], include: [], audiences: [], prompts: [pid, "p_forged!"] } } }));
    let job: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = 0; i < 100 && !["done", "failed"].includes(job.status); i++) {
      await new Promise((r) => setTimeout(r, 30));
      job = J(await app.inject({ method: "GET", url: `/api/jobs/${jobId}` }));
    }
    expect(job.status).toBe("done");
    const log = (job.progress as string[]).join("\n");
    expect(log).toMatch(/Saved prompts: Malaysian examples/);
    expect(log).toMatch(/Design: Client house style/);
    const after = J(await app.inject({ method: "GET", url: `/api/decks/${deck.id}` })).deck;
    expect(after.brief.prompts).toEqual([pid]);
  });
});
