import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import JSZip from "jszip";
import { PNG } from "pngjs";

// Regressions from the 26 Sep 2026 server bug hunt, against the real writer
// path and a stand-in endpoint that can be slow.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-srv-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "0";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";

type App = Awaited<ReturnType<typeof import("../src/index.js")["buildApp"]>>;
let app: App;
const gw = { delay: 0, reply: null as unknown, auths: [] as string[] };
let server: http.Server;
let other: http.Server;
const otherAuths: string[] = [];
const J = (r: { json: () => unknown }) => r.json() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function multipart(files: { name: string; content: Buffer; type?: string }[]) {
  const boundary = "----vitest" + Math.random().toString(36).slice(2);
  const parts: Buffer[] = [];
  for (const f of files) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: ${f.type ?? "application/octet-stream"}\r\n\r\n`), f.content, Buffer.from("\r\n"));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

const slideJson = (title: string) => JSON.stringify({ layout: "bullets", kicker: null, title, subtitle: null, body: null, bullets: ["new point"], leftHeading: null, rightHeading: null, bulletsRight: [], chart: null, table: null, diagram: null, kpi: [], cards: [], image: null, quote: null, notes: null, citations: [] });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      gw.auths.push(String(req.headers.authorization ?? ""));
      if (req.url?.endsWith("/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ data: [{ id: "writer-1" }] }));
      }
      if (gw.delay) await new Promise((r) => setTimeout(r, gw.delay));
      const content = gw.reply === null ? slideJson("Rewritten") : typeof gw.reply === "string" ? gw.reply : JSON.stringify(gw.reply);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }));
    });
  });
  other = http.createServer((req, res) => {
    otherAuths.push(String(req.headers.authorization ?? ""));
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "no" } }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  await new Promise<void>((r) => other.listen(0, "127.0.0.1", () => r()));
  const { buildApp } = await import("../src/index.js");
  app = await buildApp();
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  await app.inject({ method: "PUT", url: "/api/settings", payload: { openaiKey: "sk-SECRET-writer", baseUrl: base, model: "writer-1" } });
});

afterAll(async () => {
  await app?.close();
  for (const s of [server, other]) {
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
  }
});

async function deckWithSlides(): Promise<string> {
  const id = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "race" } })).id as string;
  const d = J(await app.inject({ method: "GET", url: `/api/decks/${id}` })).deck;
  d.slides = [
    { id: "s1", layout: "bullets", title: "One", bullets: ["a"] },
    { id: "s2", layout: "bullets", title: "Two", bullets: ["b"] },
  ];
  await app.inject({ method: "PUT", url: `/api/decks/${id}`, payload: d });
  return id;
}

describe("slow model calls never overwrite what was saved meanwhile", () => {
  it("keeps an edit to another slide made while a rewrite runs", async () => {
    const id = await deckWithSlides();
    gw.delay = 400;
    const pending = app.inject({ method: "POST", url: `/api/decks/${id}/slides/s1/rewrite`, payload: { instruction: "shorter" } });
    await new Promise((r) => setTimeout(r, 100));
    const d = J(await app.inject({ method: "GET", url: `/api/decks/${id}` })).deck;
    d.title = "Renamed meanwhile";
    d.slides[1].title = "Two, edited meanwhile";
    await app.inject({ method: "PUT", url: `/api/decks/${id}`, payload: d });
    const r = await pending;
    gw.delay = 0;
    expect(r.statusCode).toBe(200);
    const after = J(await app.inject({ method: "GET", url: `/api/decks/${id}` })).deck;
    expect(after.title).toBe("Renamed meanwhile");
    expect(after.slides[1].title).toBe("Two, edited meanwhile");
    expect(after.slides[0].title).toBe("Rewritten");
  });

  it("keeps feedback added while earlier feedback is being applied", async () => {
    const id = await deckWithSlides();
    await app.inject({ method: "POST", url: `/api/decks/${id}/slides/s1/feedback`, payload: { text: "first note" } });
    gw.delay = 400;
    const job = J(await app.inject({ method: "POST", url: `/api/decks/${id}/feedback/apply` })).jobId as string;
    await new Promise((r) => setTimeout(r, 100));
    await app.inject({ method: "POST", url: `/api/decks/${id}/slides/s1/feedback`, payload: { text: "second note" } });
    for (let i = 0; i < 100; i++) {
      const j = J(await app.inject({ method: "GET", url: `/api/jobs/${job}` }));
      if (j.status === "done" || j.status === "failed") break;
      await new Promise((r) => setTimeout(r, 30));
    }
    gw.delay = 0;
    const s1 = J(await app.inject({ method: "GET", url: `/api/decks/${id}` })).deck.slides[0];
    expect(s1.review.feedback.map((f: { text: string; appliedAt?: string }) => [f.text, !!f.appliedAt])).toEqual([["first note", true], ["second note", false]]);
  });

  it("refuses a rewrite whose reply has nothing on it, and leaves the slide alone", async () => {
    const id = await deckWithSlides();
    gw.reply = {};
    const r = await app.inject({ method: "POST", url: `/api/decks/${id}/slides/s1/rewrite`, payload: {} });
    gw.reply = null;
    expect(r.statusCode).toBe(502);
    expect(J(await app.inject({ method: "GET", url: `/api/decks/${id}` })).deck.slides[0]).toMatchObject({ title: "One", bullets: ["a"] });
  });

  it("keeps the deck's own title when the writer's title is not text, and still exports", async () => {
    const id = await deckWithSlides();
    gw.reply = { title: 2026, subtitle: { en: "T" }, slides: [JSON.parse(slideJson("Written"))] };
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "x", slides: 1 } }));
    for (let i = 0; i < 200; i++) {
      const j = J(await app.inject({ method: "GET", url: `/api/jobs/${r.jobId}` }));
      if (j.status === "done" || j.status === "failed") break;
      await new Promise((res) => setTimeout(res, 50));
    }
    gw.reply = null;
    const d = J(await app.inject({ method: "GET", url: `/api/decks/${id}` })).deck;
    expect(d.title).toBe("race");
    expect(d.subtitle).toBeUndefined();
    expect((await app.inject({ method: "GET", url: `/api/decks/${id}/export.html` })).statusCode).toBe(200);
  });

  it("reopens a signed-off slide for sign-off when it is rewritten", async () => {
    const id = await deckWithSlides();
    await app.inject({ method: "POST", url: `/api/decks/${id}/slides/s1/ok`, payload: { ok: true } });
    await app.inject({ method: "POST", url: `/api/decks/${id}/slides/s1/feedback`, payload: { text: "x" } });
    await app.inject({ method: "POST", url: `/api/decks/${id}/slides/s1/ok`, payload: { ok: true } });
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${id}/slides/s1/rewrite`, payload: {} }));
    expect(r.slide.review.ok).toBe(false);
  });
});

describe("keys go only where they were saved", () => {
  it("never sends the saved key to an endpoint typed into Test", async () => {
    const base = `http://127.0.0.1:${(other.address() as AddressInfo).port}/v1`;
    const r = J(await app.inject({ method: "POST", url: "/api/settings/test-key", payload: { baseUrl: base } }));
    expect(r.ok).toBe(false);
    expect(otherAuths.some((a) => a.includes("sk-SECRET"))).toBe(false);
  });
});

describe("uploads", () => {
  it("does not hang on a file the picture uploader refuses", async () => {
    const id = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "up" } })).id as string;
    const m = multipart([{ name: "big.pdf", content: Buffer.alloc(300_000, 1), type: "application/pdf" }]);
    const r = await app.inject({ method: "POST", url: `/api/decks/${id}/media`, payload: m.payload, headers: m.headers });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([]);
  });

  it("stores a picture by what its bytes are, and serves an SVG unable to run script", async () => {
    const id = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "svg" } })).id as string;
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const m = multipart([{ name: "x.svg", content: svg, type: "image/svg+xml" }, { name: "fake.png", content: Buffer.alloc(3000, 7), type: "image/png" }]);
    const out = J(await app.inject({ method: "POST", url: `/api/decks/${id}/media`, payload: m.payload, headers: m.headers })) as unknown as { id: string }[];
    expect(out).toHaveLength(1);
    const r = await app.inject({ method: "GET", url: `/api/media/${out[0].id}` });
    expect(r.headers["content-security-policy"]).toMatch(/default-src 'none'.*sandbox/);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect((await app.inject({ method: "DELETE", url: "/api/media/m_nope" })).statusCode).toBe(404);
  });

  it("takes a file name with a % in it, and lists unreadable files as skipped with the reason", async () => {
    const id = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "names" } })).id as string;
    const m = multipart([{ name: "100% sure.txt", content: Buffer.from("hello") }, { name: "empty.pdf", content: Buffer.alloc(0) }, { name: "not-a-picture.png", content: Buffer.from("text") }]);
    const r = await app.inject({ method: "POST", url: `/api/decks/${id}/sources`, payload: m.payload, headers: m.headers });
    expect(r.statusCode).toBe(200);
    const j = r.json() as { added: { name: string }[]; skipped: string[] };
    expect(j.added.map((a) => a.name)).toEqual(["100% sure.txt"]);
    expect(j.skipped).toHaveLength(2);
    expect(j.skipped[0]).toMatch(/^empty\.pdf \(/);
  });

  it("stops unpacking a zip that expands past its limits", async () => {
    const zip = new JSZip();
    zip.file("huge.txt", "a".repeat(70 * 1024 * 1024));
    zip.file("ok.txt", "fine");
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const id = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "zip" } })).id as string;
    const m = multipart([{ name: "bomb.zip", content: buf }]);
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${id}/sources`, payload: m.payload, headers: m.headers }));
    expect(r.added.map((a: { name: string }) => a.name)).toEqual(["bomb/ok.txt"]);
    expect(r.skipped[0]).toMatch(/huge\.txt \(too large/);
  });

  it("answers 400, not 500, to input of the wrong type", async () => {
    const id = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "types" } })).id as string;
    expect((await app.inject({ method: "POST", url: `/api/decks/${id}/sources/text`, payload: { text: 5 } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/api/onedrive", payload: { defaultFolder: 5 } })).statusCode).toBe(400);
  });
});

describe("pictures that would take the server down", () => {
  it("are refused from their header, before any decoding", async () => {
    const { shrinkPicture } = await import("../src/llm/shrink.js");
    const p = new PNG({ width: 1, height: 1 });
    const buf = Buffer.from(PNG.sync.write(p));
    buf.writeUInt32BE(23000, 16);
    buf.writeUInt32BE(23000, 20);
    const padded = Buffer.concat([buf, Buffer.alloc(700 * 1024)]);
    const t0 = Date.now();
    expect(() => shrinkPicture(padded, "image/png")).toThrow(/529 megapixels/);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe("second round: what the re-check found", () => {
  it("keeps feedback typed while a rewrite runs", async () => {
    const id = await deckWithSlides();
    gw.delay = 400;
    const pending = app.inject({ method: "POST", url: `/api/decks/${id}/slides/s1/rewrite`, payload: {} });
    await new Promise((r) => setTimeout(r, 100));
    await app.inject({ method: "POST", url: `/api/decks/${id}/slides/s1/feedback`, payload: { text: "NOTE TYPED DURING REWRITE" } });
    await pending;
    gw.delay = 0;
    const s1 = J(await app.inject({ method: "GET", url: `/api/decks/${id}` })).deck.slides[0];
    expect(s1.title).toBe("Rewritten");
    expect(s1.review.feedback.map((f: { text: string }) => f.text)).toContain("NOTE TYPED DURING REWRITE");
  });

  it("does not let a design's theme write markup", async () => {
    const { themePreset, renderSlideHtml } = await import("@slidecraft/shared");
    const evil = { ...themePreset(""), colors: { ...themePreset("").colors, brand: '#fff"><img src=x onerror=alert(1)>' } };
    const d = J(await app.inject({ method: "POST", url: "/api/designs", payload: { name: "evil", theme: evil } }));
    expect(d.theme.colors.brand).toMatch(/^#[0-9a-f]{3,8}$/i);
    const listed = J(await app.inject({ method: "GET", url: "/api/designs" })) as unknown as { theme: { colors: { brand: string } } }[];
    expect(JSON.stringify(listed)).not.toContain("onerror");
    expect(renderSlideHtml({ id: "a", layout: "bullets", title: "t", bullets: ["x"] }, evil as never, { index: 0, total: 1, mediaUrl: (x: string) => x, lang: "en" })).not.toContain("onerror");
  });

  it("refuses an Office file that would unpack past the limits", async () => {
    const docx = new JSZip();
    docx.file("[Content_Types].xml", "<Types/>");
    docx.file("word/document.xml", "<w:document>" + "a".repeat(120 * 1024 * 1024) + "</w:document>");
    const buf = await docx.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const id = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "docx" } })).id as string;
    const m = multipart([{ name: "bomb.docx", content: buf }]);
    const t0 = Date.now();
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${id}/sources`, payload: m.payload, headers: m.headers }));
    expect(r.added).toEqual([]);
    expect(r.skipped[0]).toMatch(/bomb\.docx \(a part of this file is too large/);
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it("refuses a picture bomb sent to the design analyser from its header", async () => {
    const p = new PNG({ width: 1, height: 1 });
    const buf = Buffer.from(PNG.sync.write(p));
    buf.writeUInt32BE(14000, 16);
    buf.writeUInt32BE(14000, 20);
    const m = multipart([{ name: "huge.png", content: buf, type: "image/png" }]);
    const t0 = Date.now();
    const r = await app.inject({ method: "POST", url: "/api/designs/analyse", payload: m.payload, headers: m.headers });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(r.body).toMatch(/196 megapixels/);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("answers 400 to a deck or a picture reader sent with the wrong types", async () => {
    expect((await app.inject({ method: "POST", url: "/api/decks", payload: { title: 5 } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/api/settings/reader", payload: { key: 5 } })).statusCode).toBe(400);
  });

  it("treats every spelling of a private address as private", async () => {
    const { privateAddress } = await import("../src/export/fetchPicture.js");
    for (const ip of ["::ffff:7f00:1", "::ffff:127.0.0.1", "::1", "fe80::1", "fd00::1", "10.1.2.3", "169.254.169.254", "::ffff:a9fe:a9fe"]) expect(privateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "2606:4700::1111", "::ffff:808:808"]) expect(privateAddress(ip), ip).toBe(false);
  });
});

describe("chart and matrix entries keep their places", () => {
  it("never shifts a value or a row into another's place", async () => {
    const { sanitizeSlide } = await import("@slidecraft/shared");
    const c = sanitizeSlide({ id: "c", layout: "chart", title: "t", chart: { kind: "column", categories: ["A", "", "C", "D"], series: [{ name: "s", values: [1, "x", 3] }] } });
    expect(c.chart).toMatchObject({ categories: ["A", "", "C", "D"], series: [{ values: [1, 0, 3, 0] }] });
    const m = sanitizeSlide({ id: "m", layout: "diagram", title: "t", diagram: { kind: "matrix", rows: ["r1", "", "r3"], cols: ["c1"], cells: [["1"], ["2"], ["3"]] } });
    expect(m.diagram).toEqual({ kind: "matrix", rows: ["r1", "", "r3"], cols: ["c1"], cells: [["1"], ["2"], ["3"]] });
  });
});
