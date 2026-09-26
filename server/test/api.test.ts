import { beforeAll, afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

// Whole-API run against a temporary data directory, with the mock writer, so
// it needs no key and no network. Uploads go through the real multipart parser.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-test-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "1";
process.env.MOCK_LLM_DELAY_MS = "200";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

type App = Awaited<ReturnType<typeof import("../src/index.js")["buildApp"]>>;
let app: App;

function multipart(files: { name: string; content: Buffer | string; type?: string }[]): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----vitest" + Math.random().toString(36).slice(2);
  const parts: Buffer[] = [];
  for (const f of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${encodeURIComponent(f.name)}"\r\nContent-Type: ${f.type ?? "application/octet-stream"}\r\n\r\n`));
    parts.push(Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content));
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function waitJob(id: string): Promise<{ status: string; error: string | null; progress: string[] }> {
  for (let i = 0; i < 100; i++) {
    const r = await app.inject({ method: "GET", url: `/api/jobs/${id}` });
    const j = r.json();
    if (j.status === "done" || j.status === "failed") return j;
    await new Promise((res) => setTimeout(res, 50));
  }
  throw new Error("job did not finish");
}

beforeAll(async () => {
  const mod = await import("../src/index.js");
  app = await mod.buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("api", () => {
  let deckId = "";

  it("answers health and creates a deck in single-user mode", async () => {
    const h = await app.inject({ method: "GET", url: "/api/health" });
    expect(h.json().ok).toBe(true);
    const r = await app.inject({ method: "POST", url: "/api/decks", payload: { title: "T", lang: "ms", angle: "training" } });
    expect(r.statusCode).toBe(200);
    deckId = r.json().id;
    expect(r.json().theme.id).toBe("facerinna");
    expect(r.json().angle).toBe("training");
  });

  it("ingests text, csv, a picture and a zip with a folder inside", async () => {
    const zip = new JSZip();
    zip.file("proj/notes/a.txt", "inside the zip");
    zip.file("proj/img/p.png", PNG);
    zip.file("__MACOSX/._junk", "x");
    const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
    const m = multipart([
      { name: "folder/notes.md", content: "# Notes\nAnnex III entry 98 caps salicylic acid at 2%." },
      { name: "data.csv", content: "year,n\n2024,1\n2025,2\n", type: "text/csv" },
      { name: "pic.png", content: PNG, type: "image/png" },
      { name: "bundle.zip", content: zipBuf, type: "application/zip" },
    ]);
    const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/sources`, payload: m.payload, headers: m.headers });
    expect(r.statusCode).toBe(200);
    const added = r.json().added as { name: string; kind: string; chars: number }[];
    const names = added.map((a) => a.name);
    expect(names).toContain("folder/notes.md");
    expect(names).toContain("bundle/proj/notes/a.txt");
    expect(names).toContain("bundle/proj/img/p.png");
    expect(names.some((n) => n.includes("__MACOSX"))).toBe(false);
    expect(added.find((a) => a.name === "data.csv")?.kind).toBe("sheet");
    expect(added.filter((a) => a.kind === "image").length).toBe(2);
    const list = await app.inject({ method: "GET", url: `/api/decks/${deckId}/sources` });
    expect(list.json().length).toBe(5);
  });

  it("reads a pptx and a docx", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide2.xml", '<p:sld><p:txBody><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:txBody></p:sld>');
    zip.file("ppt/slides/slide1.xml", '<p:sld><p:txBody><a:p><a:r><a:t>First &amp; </a:t></a:r><a:r><a:t>title</a:t></a:r></a:p></p:txBody></p:sld>');
    zip.file("ppt/notesSlides/notesSlide1.xml", '<p:notes><a:p><a:r><a:t>say this</a:t></a:r></a:p></p:notes>');
    const pptx = await zip.generateAsync({ type: "nodebuffer" });
    const docx = new JSZip();
    docx.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    docx.file("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word text here</w:t></w:r></w:p></w:body></w:document>');
    const docxBuf = await docx.generateAsync({ type: "nodebuffer" });
    const m = multipart([{ name: "old.pptx", content: pptx }, { name: "memo.docx", content: docxBuf }]);
    const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/sources`, payload: m.payload, headers: m.headers });
    const added = r.json().added as { id: string; name: string; kind: string }[];
    const p = added.find((a) => a.name === "old.pptx")!;
    const d = added.find((a) => a.name === "memo.docx")!;
    expect(p.kind).toBe("pptx");
    expect(d.kind).toBe("docx");
    const pt = (await app.inject({ method: "GET", url: `/api/sources/${p.id}` })).json().text as string;
    expect(pt).toMatch(/\[slide 1\]\nFirst & title\n\[notes\]\nsay this/);
    expect(pt.indexOf("[slide 1]")).toBeLessThan(pt.indexOf("[slide 2]"));
    const dt = (await app.inject({ method: "GET", url: `/api/sources/${d.id}` })).json().text as string;
    expect(dt).toContain("Word text here");
    for (const a of added) await app.inject({ method: "DELETE", url: `/api/sources/${a.id}` });
  });

  it("generates with the mock writer, honours features and places uploaded pictures", async () => {
    const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/generate`, payload: { prompt: "Brief the team on the salicylic acid change", slides: 12, lang: "ms", angle: "regulatory-briefing", features: { images: true, kpis: false }, imageMode: "uploaded" } });
    expect(r.statusCode).toBe(200);
    const j = await waitJob(r.json().jobId);
    expect(j.status, j.error ?? "").toBe("done");
    const d = (await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).json();
    const layouts = d.deck.slides.map((s: { layout: string }) => s.layout);
    expect(d.deck.slides.length).toBe(12);
    expect(layouts).not.toContain("kpi");
    const img = d.deck.slides.find((s: { layout: string }) => s.layout === "image");
    expect(img.image.mediaId).toMatch(/^m_/);
    expect(d.sahkan).toBeGreaterThan(0);
    expect(d.deck.lang).toBe("ms");
    // The mock's dashes were auto-fixed: nothing flagged for dashes.
    const flags = Object.values(d.slop as Record<string, { note: string }[]>).flat();
    expect(flags.some((f) => f.note.startsWith("dash"))).toBe(false);
  });

  it("refuses a second generation while one runs", async () => {
    const body = { prompt: "again please", slides: 12, features: { images: true }, imageMode: "uploaded" };
    const a = await app.inject({ method: "POST", url: `/api/decks/${deckId}/generate`, payload: body });
    const b = await app.inject({ method: "POST", url: `/api/decks/${deckId}/generate`, payload: body });
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    await waitJob(a.json().jobId ?? b.json().jobId);
  });

  it("exports a valid PPTX with one slide per spec slide, native charts and notes", async () => {
    const d = (await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).json().deck;
    const r = await app.inject({ method: "GET", url: `/api/decks/${deckId}/export.pptx` });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toContain("presentationml");
    const zip = await JSZip.loadAsync(r.rawPayload);
    const names = Object.keys(zip.files);
    expect(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length).toBe(d.slides.length);
    expect(names.some((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))).toBe(d.slides.some((s: { layout: string }) => s.layout === "chart"));
    expect(names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).length).toBeGreaterThan(0);
    expect(names.some((n) => n.startsWith("ppt/media/"))).toBe(true);
    const slide1 = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slide1).toContain(d.title.split(" ")[0]);
  });

  it("exports a standalone HTML deck with pictures inlined", async () => {
    const r = await app.inject({ method: "GET", url: `/api/decks/${deckId}/export.html` });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain("data:image/png;base64,");
    expect(r.body).toContain('<mark class="sahkan">');
    expect((r.body.match(/class="sc-slide/g) ?? []).length).toBe(12);
  });

  it("saves edits and rejects a malformed deck", async () => {
    const d = (await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).json().deck;
    d.slides[1].title = "Edited title";
    d.theme.colors.brand = "#123456";
    const ok = await app.inject({ method: "PUT", url: `/api/decks/${deckId}`, payload: d });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().deck.slides[1].title).toBe("Edited title");
    const bad = await app.inject({ method: "PUT", url: `/api/decks/${deckId}`, payload: { ...d, slides: [{ id: "x", layout: "nope", title: "t" }] } });
    expect(bad.statusCode).toBe(400);
    const again = (await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).json().deck;
    expect(again.theme.colors.brand).toBe("#123456");
  });

  it("rewrites one slide and reports its flags", async () => {
    const d = (await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).json().deck;
    const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/slides/${d.slides[1].id}/rewrite`, payload: { instruction: "shorter" } });
    expect(r.statusCode).toBe(200);
    expect(r.json().slide.id).toBe(d.slides[1].id);
    expect(Array.isArray(r.json().slop)).toBe(true);
  });

  it("stores the OpenAI key encrypted and masks it", async () => {
    await app.inject({ method: "PUT", url: "/api/settings", payload: { openaiKey: "sk-test-1234567890abcdef", model: "gpt-4.1-mini" } });
    const s = (await app.inject({ method: "GET", url: "/api/settings" })).json();
    expect(s.key.own).toBe("sk-tes…cdef");
    expect(s.key.active).toBe("own");
    expect(s.model).toBe("gpt-4.1-mini");
    const { getDb } = await import("../src/db.js");
    const row = getDb().prepare("SELECT openai_key_enc FROM settings").get() as { openai_key_enc: string };
    expect(row.openai_key_enc).not.toContain("sk-test");
    await app.inject({ method: "PUT", url: "/api/settings", payload: { openaiKey: null } });
    expect((await app.inject({ method: "GET", url: "/api/settings" })).json().key.active).toBe("none");
  });

  it("applies a theme preset and keeps the footer", async () => {
    const d = (await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).json().deck;
    d.theme.footer = "keep me";
    await app.inject({ method: "PUT", url: `/api/decks/${deckId}`, payload: d });
    const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/theme`, payload: { presetId: "mono" } });
    expect(r.json().theme.id).toBe("mono");
    expect(r.json().theme.footer).toBe("keep me");
  });

  it("duplicates and deletes", async () => {
    const c = await app.inject({ method: "POST", url: `/api/decks/${deckId}/duplicate` });
    expect(c.json().id).not.toBe(deckId);
    const del = await app.inject({ method: "DELETE", url: `/api/decks/${c.json().id}` });
    expect(del.json().ok).toBe(true);
    expect((await app.inject({ method: "GET", url: `/api/decks/${c.json().id}` })).statusCode).toBe(404);
  });
});

describe("endpoint setting", () => {
  it("stores a Mireld endpoint, rejects a malformed one, and never sends the env key to it", async () => {
    const ok = await app.inject({ method: "PUT", url: "/api/settings", payload: { baseUrl: "https://api.mireld.my/v1/" } });
    expect(ok.statusCode).toBe(200);
    const s = (await app.inject({ method: "GET", url: "/api/settings" })).json();
    expect(s.endpoint.baseUrl).toBe("https://api.mireld.my/v1");
    expect(s.endpoint.provider).toBe("mireld");
    expect(s.providers.map((p: { id: string }) => p.id)).toEqual(["openai", "mireld"]);
    const bad = await app.inject({ method: "PUT", url: "/api/settings", payload: { baseUrl: "mireld" } });
    expect(bad.statusCode).toBe(400);
    const { resolveAuth } = await import("../src/settings.js");
    const { config } = await import("../src/config.js");
    const saved = config.openaiKey;
    config.openaiKey = "sk-env-key";
    const a = resolveAuth("u_local")!;
    expect(a.apiKey).toBe("sk-env-key");
    expect(a.baseUrl).toBe(config.openaiBase);
    await app.inject({ method: "PUT", url: "/api/settings", payload: { openaiKey: "mireld-key-123456", baseUrl: "https://api.mireld.my/v1" } });
    const b = resolveAuth("u_local")!;
    expect(b.apiKey).toBe("mireld-key-123456");
    expect(b.baseUrl).toBe("https://api.mireld.my/v1");
    config.openaiKey = saved;
    const t = (await app.inject({ method: "POST", url: "/api/settings/test-key", payload: { baseUrl: "not a url" } })).json();
    expect(t.ok).toBe(false);
    await app.inject({ method: "PUT", url: "/api/settings", payload: { openaiKey: null, baseUrl: null } });
    expect((await app.inject({ method: "GET", url: "/api/settings" })).json().endpoint.provider).toBe("openai");
  });
});
