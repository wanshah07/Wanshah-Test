import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// The worker against a local stand-in for Supabase: PostgREST filters, inserts,
// updates that return rows, deletes, the updated_at trigger, and Storage.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-worker-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "1";
process.env.MOCK_LLM_DELAY_MS = "0";
process.env.AUTH_MODE = "off";
process.env.SC_WORKER = "1";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const MARK = "PRIVATE-MARKER-7f3a"; // content that must never reach a log line

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { sc_settings: [], sc_decks: [], sc_sources: [], sc_media: [], sc_designs: [], sc_prompts: [], sc_outputs: [], sc_jobs: [] };
const files = new Map<string, Buffer>(); // "bucket/path" -> bytes
const TOUCH = new Set(["sc_settings", "sc_decks", "sc_designs", "sc_prompts", "sc_outputs", "sc_jobs"]);
let clock = Date.parse("2026-09-28T00:00:00Z");
const stamp = () => new Date((clock += 1000)).toISOString().replace("Z", "+00:00");
let beforePatch: ((table: string, row: Row) => void) | null = null;

function unquote(v: string): string {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, "$1") : v;
}
function matches(r: Row, filters: [string, string][]): boolean {
  return filters.every(([col, f]) => {
    const i = f.indexOf(".");
    const op = f.slice(0, i);
    const val = f.slice(i + 1);
    const v = r[col];
    if (op === "eq") return String(v) === val;
    if (op === "is") return val === "null" ? v === null || v === undefined : false;
    if (op === "lt") return String(v) < val;
    if (op === "in") {
      const items = val.slice(1, -1).match(/("([^"\\]|\\.)*"|[^,]+)/g) ?? [];
      return items.map(unquote).includes(String(v));
    }
    throw new Error("filter not in the stand-in: " + op);
  });
}

let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const url = new URL(req.url ?? "/", "http://x");
      const send = (code: number, body?: unknown) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(body === undefined ? "" : JSON.stringify(body));
      };
      if (req.headers.authorization !== "Bearer service-key" || req.headers.apikey !== "service-key") return send(401, { message: "bad key" });
      const st = /^\/storage\/v1\/object\/([^/]+)(?:\/(.*))?$/.exec(url.pathname);
      if (st) {
        const bucket = st[1];
        const p = st[2] ? st[2].split("/").map(decodeURIComponent).join("/") : "";
        if (req.method === "GET") {
          const b = files.get(`${bucket}/${p}`);
          if (!b) return send(404, { message: "not found" });
          res.writeHead(200, { "content-type": "application/octet-stream" });
          return res.end(b);
        }
        if (req.method === "POST") {
          files.set(`${bucket}/${p}`, raw);
          return send(200, { Key: `${bucket}/${p}` });
        }
        if (req.method === "DELETE") {
          for (const x of (JSON.parse(raw.toString()) as { prefixes: string[] }).prefixes) files.delete(`${bucket}/${x}`);
          return send(200, []);
        }
      }
      const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
      if (!m || !db[m[1]]) return send(404, { message: "no table" });
      const table = m[1];
      const filters: [string, string][] = [];
      for (const [k, v] of url.searchParams) if (!["select", "order", "limit", "on_conflict"].includes(k)) filters.push([k, v]);
      const rows = db[table];
      if (req.method === "GET") {
        let out = rows.filter((r) => matches(r, filters));
        const order = url.searchParams.get("order");
        if (order) {
          const [col, dir] = order.split(".");
          out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (dir === "desc" ? -1 : 1));
        }
        const limit = Number(url.searchParams.get("limit") || 0);
        if (limit) out = out.slice(0, limit);
        return send(200, out);
      }
      if (req.method === "POST") {
        for (const r of JSON.parse(raw.toString()) as Row[]) {
          if (rows.some((x) => x.id !== undefined && x.id === r.id)) return send(409, { message: "duplicate key" });
          rows.push({ created_at: stamp(), ...(TOUCH.has(table) ? { updated_at: stamp() } : {}), ...r });
        }
        return send(201);
      }
      if (req.method === "PATCH") {
        const patch = JSON.parse(raw.toString()) as Row;
        // Like PostgREST: the rows the filters matched, after the change.
        const hit = rows.filter((r) => matches(r, filters));
        for (const r of hit) {
          beforePatch?.(table, r);
          Object.assign(r, patch, TOUCH.has(table) ? { updated_at: stamp() } : {});
        }
        return send(200, hit);
      }
      if (req.method === "DELETE") {
        db[table] = rows.filter((r) => !matches(r, filters));
        return send(204);
      }
      send(405);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { buildApp } = await import("../src/index.js");
  const { Supabase } = await import("../src/worker/supabase.js");
  const run = await import("../src/worker/run.js");
  W = { app: await buildApp(), sb: new Supabase({ url: base, serviceKey: "service-key" }), run };
});

afterAll(async () => {
  await W?.app.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let W: { app: any; sb: import("../src/worker/supabase.js").Supabase; run: typeof import("../src/worker/run.js") };
const logs: string[] = [];
let jobN = 0;

/** Queues a job the way the page will, runs the worker, returns the finished job row. */
async function job(owner: string, request: Record<string, unknown>, kind = "api"): Promise<Row> {
  const id = `00000000-0000-4000-8000-${String(++jobN).padStart(12, "0")}`;
  db.sc_jobs.push({ id, user_id: owner, deck_id: null, kind, status: "pending", request, progress: {}, result: null, error: null, attempts: 0, created_at: stamp(), started_at: null, updated_at: stamp() });
  const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")));
  const err = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")));
  try {
    await W.run.drain(W.app, W.sb);
  } finally {
    spy.mockRestore();
    err.mockRestore();
  }
  return db.sc_jobs.find((j) => j.id === id)!;
}
const result = (j: Row) => j.result as { status: number; body?: any; file?: any; work?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

let deckId = "";

describe("the worker", () => {
  it("creates a deck as its owner and writes it to Supabase", async () => {
    const j = await job(A, { method: "POST", path: "/api/decks", body: { title: `Deck ${MARK}` } });
    expect(j.status).toBe("done");
    expect(result(j).status).toBe(200);
    deckId = result(j).body.id;
    const row = db.sc_decks.find((d) => d.id === deckId)!;
    expect(row.user_id).toBe(A);
    expect((row.doc as Row).title).toBe(`Deck ${MARK}`);
    expect(j.attempts).toBe(1);
  });

  it("reads an uploaded source from the owner's inbox and removes it afterwards", async () => {
    files.set(`sc-inbox/${A}/up/notes.txt`, Buffer.from(`Salicylic acid is limited to 2% in rinse-off products. ${MARK}\n`));
    const j = await job(A, { method: "POST", path: `/api/decks/${deckId}/sources`, files: [{ field: "file", name: "notes.txt", path: `${A}/up/notes.txt`, type: "text/plain" }] });
    expect(result(j).status).toBe(200);
    expect(result(j).body.added).toHaveLength(1);
    const src = db.sc_sources.filter((s) => s.deck_id === deckId);
    expect(src).toHaveLength(1);
    expect(src[0].user_id).toBe(A);
    expect(String(src[0].text)).toContain("Salicylic acid");
    expect(files.has(`sc-inbox/${A}/up/notes.txt`)).toBe(false);
  });

  it("writes a deck in the background, passes on progress, and saves the slides", async () => {
    const patches: string[] = [];
    beforePatch = (t, r) => void (t === "sc_jobs" && r.status === "running" && patches.push("p"));
    const j = await job(A, { method: "POST", path: `/api/decks/${deckId}/generate`, body: { prompt: "Explain the limit" } });
    beforePatch = null;
    expect(j.status).toBe("done");
    expect(result(j).status).toBe(200);
    expect(result(j).work).toMatchObject({ kind: "generate", status: "done" });
    expect((j.progress as Row).status).toBeTruthy();
    expect(patches.length).toBeGreaterThan(0);
    const doc = db.sc_decks.find((d) => d.id === deckId)!.doc as { slides: unknown[] };
    expect(doc.slides.length).toBeGreaterThan(3);
  });

  it("uploads a picture to sc-media, and deleting it removes the row and the file", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    files.set(`sc-inbox/${A}/up/pic.png`, png);
    const j = await job(A, { method: "POST", path: `/api/decks/${deckId}/media`, files: [{ name: "pic.png", path: `${A}/up/pic.png`, type: "image/png" }] });
    expect(result(j).status).toBe(200);
    const mid = result(j).body[0].id as string;
    const row = db.sc_media.find((m) => m.id === mid)!;
    expect(row.object_path).toBe(`${A}/${mid}.png`);
    expect(files.get(`sc-media/${A}/${mid}.png`)?.equals(png)).toBe(true);
    const del = await job(A, { method: "DELETE", path: `/api/media/${mid}` });
    expect(result(del).status).toBe(200);
    expect(db.sc_media.some((m) => m.id === mid)).toBe(false);
    expect(files.has(`sc-media/${A}/${mid}.png`)).toBe(false);
  });

  it("deletes a source by its own id, and only its owner's", async () => {
    files.set(`sc-inbox/${A}/up/extra.txt`, Buffer.from("A second source.\n"));
    const up = await job(A, { method: "POST", path: `/api/decks/${deckId}/sources`, files: [{ name: "extra.txt", path: `${A}/up/extra.txt` }] });
    const sid = result(up).body.added[0].id as string;
    expect(result(await job(B, { method: "DELETE", path: `/api/sources/${sid}` })).status).toBe(404);
    expect(db.sc_sources.some((s) => s.id === sid)).toBe(true);
    expect(result(await job(A, { method: "DELETE", path: `/api/sources/${sid}` })).status).toBe(200);
    expect(db.sc_sources.some((s) => s.id === sid)).toBe(false);
  });

  it("builds a PowerPoint into sc-exports under the owner's folder", async () => {
    const j = await job(A, { method: "GET", path: `/api/decks/${deckId}/export.pptx` });
    expect(result(j).status).toBe(200);
    const f = result(j).file;
    expect(f.bucket).toBe("sc-exports");
    expect(f.path.startsWith(`${A}/${j.id}/`)).toBe(true);
    expect(f.name).toMatch(/\.pptx$/);
    expect(files.get(`sc-exports/${f.path}`)!.subarray(0, 2).toString()).toBe("PK");
  });

  it("makes a Studio output in the background and saves it as its owner; answers a question from the sources", async () => {
    const j = await job(A, { method: "POST", path: `/api/decks/${deckId}/studio`, body: { kind: "quiz" } });
    expect(result(j).work).toMatchObject({ kind: "studio", status: "done" });
    const oid = result(j).work.result.outputId as string;
    const row = db.sc_outputs.find((o) => o.id === oid)!;
    expect(row).toMatchObject({ user_id: A, deck_id: deckId, kind: "quiz" });
    expect((row.data as { questions: unknown[] }).questions.length).toBeGreaterThan(0);
    const ask = await job(A, { method: "POST", path: `/api/decks/${deckId}/ask`, body: { question: `What is the limit? ${MARK}` } });
    expect(result(ask).status).toBe(200);
    expect(result(ask).body.answer).toMatch(/2%/);
    // Someone else cannot ask another person's notebook, or delete its outputs.
    expect(result(await job(B, { method: "POST", path: `/api/decks/${deckId}/ask`, body: { question: "x" } })).status).toBe(404);
    expect(result(await job(B, { method: "DELETE", path: `/api/outputs/${oid}` })).status).toBe(404);
    expect(db.sc_outputs.some((o) => o.id === oid)).toBe(true);
    expect(result(await job(A, { method: "DELETE", path: `/api/outputs/${oid}` })).status).toBe(200);
    expect(db.sc_outputs.some((o) => o.id === oid)).toBe(false);
  });

  it("cannot reach another person's deck or files", async () => {
    const before = JSON.stringify(db.sc_decks.find((d) => d.id === deckId));
    const j = await job(B, { method: "POST", path: `/api/decks/${deckId}/generate`, body: { prompt: "steal" } });
    expect(j.status).toBe("done");
    expect(result(j).status).toBe(404);
    expect(JSON.stringify(db.sc_decks.find((d) => d.id === deckId))).toBe(before);
    files.set(`sc-inbox/${A}/up/other.txt`, Buffer.from("A's file"));
    const bdeck = result(await job(B, { method: "POST", path: "/api/decks", body: { title: "B" } })).body.id;
    const f = await job(B, { method: "POST", path: `/api/decks/${bdeck}/sources`, files: [{ name: "x.txt", path: `${A}/up/other.txt` }] });
    expect(f.status).toBe("error");
    expect(db.sc_sources.some((s) => s.user_id === B)).toBe(false);
  });

  it("refuses sign-in routes and anything outside /api", async () => {
    for (const p of ["/api/auth/login", "/index.html", "/api/../etc", "/api/decks/./x", "/api/health"]) {
      const j = await job(A, { method: "POST", path: p, body: {} });
      expect(j.status).toBe("error");
    }
  });

  it("refuses the routes that test, save or sign in with a key", async () => {
    for (const [method, p] of [["POST", "/api/settings/test-key"], ["POST", "/api/settings/reader/test"], ["PUT", "/api/settings/reader"], ["POST", "/api/onedrive/login"], ["PUT", "/api/settings"], ["PUT", "/api/gdrive"], ["DELETE", "/api/onedrive"]]) {
      const j = await job(A, { method, path: p, body: { baseUrl: "https://attacker.example/v1" } });
      expect(j.status, `${method} ${p}`).toBe("error");
    }
    // Reading is fine, and so is finding Google Drive accounts with the team's key.
    expect(W.run.allowedPath("/api/gdrive/accounts", "POST")).toBe(true);
    expect(W.run.allowedPath("/api/onedrive/composio/accounts", "POST")).toBe(true);
    expect(W.run.allowedPath("/api/onedrive/browse?folder=a%2Fb")).toBe(true);
  });

  it("merges a deck the person edited while the worker was writing it", async () => {
    const { load, flush } = await import("../src/worker/mirror.js");
    const { updateDeck } = await import("../src/store.js");
    const { LOCAL_USER_ID } = await import("../src/auth.js");
    const loaded = await load(W.sb, A, { deck: deckId });
    const remote = db.sc_decks.find((d) => d.id === deckId)!;
    const doc = remote.doc as { slides: Row[]; title: string };
    const [s0, s1] = doc.slides;
    // The person edits slide 1 in the browser...
    remote.doc = { ...doc, slides: doc.slides.map((s) => (s.id === s1.id ? { ...s, title: "Edited in the browser" } : s)) };
    remote.updated_at = stamp();
    // ...while the worker rewrites slide 0 and the title.
    updateDeck(LOCAL_USER_ID, deckId, (d) => {
      d.title = "Written by the worker";
      d.slides[0] = { ...d.slides[0], title: "Rewritten by the worker" };
    });
    const wrote = await flush(W.sb, loaded);
    expect(wrote.merged).toBe(1);
    const out = db.sc_decks.find((d) => d.id === deckId)!.doc as { slides: Row[]; title: string };
    expect(out.title).toBe("Written by the worker");
    expect(out.slides.find((s) => s.id === s0.id)!.title).toBe("Rewritten by the worker");
    expect(out.slides.find((s) => s.id === s1.id)!.title).toBe("Edited in the browser");
  });

  it("marks a job a crashed run left running, and gives up after two tries", async () => {
    db.sc_jobs.push({ id: "stale", user_id: A, kind: "api", status: "running", request: {}, attempts: 1, started_at: "2026-01-01T00:00:00+00:00", created_at: stamp(), updated_at: stamp() });
    db.sc_jobs.push({ id: "tired", user_id: A, kind: "api", status: "pending", request: { method: "GET", path: "/api/designs" }, attempts: 2, created_at: stamp(), updated_at: stamp() });
    await job(A, { method: "GET", path: "/api/designs" });
    expect(db.sc_jobs.find((j) => j.id === "stale")!.status).toBe("error");
    expect(db.sc_jobs.find((j) => j.id === "tired")!.status).toBe("error");
  });

  it("never writes content into its logs", () => {
    expect(logs.length).toBeGreaterThan(10);
    const all = logs.join("\n");
    expect(all).not.toContain(MARK);
    expect(all).not.toContain("Salicylic");
    expect(all).not.toContain("notes.txt");
    expect(all).not.toContain("service-key");
    expect(logs.every((l) => l.startsWith("[worker]"))).toBe(true);
  });
});

describe("mergeDoc", () => {
  it("keeps both sides' changes, the worker's where both touched the same slide", async () => {
    const { mergeDoc } = await import("../src/worker/merge.js");
    const base = { title: "T", slides: [{ id: "a", t: 1 }, { id: "b", t: 1 }, { id: "c", t: 1 }] };
    const ours = { title: "T", slides: [{ id: "a", t: 2 }, { id: "b", t: 2 }, { id: "c", t: 1 }] };
    const theirs = { title: "Theirs", slides: [{ id: "a", t: 1 }, { id: "b", t: 3 }, { id: "c", t: 3 }, { id: "d", t: 1 }] };
    const m = mergeDoc(base, ours, theirs) as { title: string; slides: { id: string; t: number }[] };
    expect(m.title).toBe("Theirs");
    expect(m.slides).toEqual([{ id: "a", t: 2 }, { id: "b", t: 2 }, { id: "c", t: 3 }, { id: "d", t: 1 }]);
  });

  it("a slide one side deleted stays deleted when the other side did not touch it", async () => {
    const { mergeDoc } = await import("../src/worker/merge.js");
    const base = { slides: [{ id: "a" }, { id: "b" }, { id: "c", x: 1 }] };
    const ours = { slides: [{ id: "a" }, { id: "c", x: 2 }] };
    const theirs = { slides: [{ id: "a" }, { id: "b" }, { id: "c", x: 1 }, { id: "n" }] };
    expect((mergeDoc(base, ours, theirs).slides as { id: string }[]).map((s) => s.id)).toEqual(["a", "c", "n"]);
  });
});

describe("worker hardening (review of 1 Oct 2026)", () => {
  it("refuses a storage path that climbs out of its folder", async () => {
    const { safeObjectPath } = await import("../src/worker/supabase.js");
    for (const bad of ["a/../b", "a/./b", "/a", "a//b", "..", "a\\b", ""]) expect(() => safeObjectPath(bad)).toThrow("unsafe_path");
    expect(safeObjectPath("u1/job/file.pdf")).toBe("u1/job/file.pdf");
    // A job naming an inbox path that climbs into another bucket is refused before anything is read.
    const j = await job(A, { method: "POST", path: `/api/decks/${deckId}/sources`, files: [{ name: "x.png", path: `${A}/../../sc-media/${B}/m.png` }] });
    expect(j.status).toBe("error");
  });

  it("does not load a picture row that points into another person's folder", async () => {
    files.set(`sc-media/${B}/m_secret.png`, Buffer.from("secret"));
    db.sc_media.push({ id: "m_steal", user_id: A, deck_id: null, name: "x.png", mime: "image/png", bytes: 6, origin: "upload", object_path: `${B}/m_secret.png`, created_at: stamp() });
    const r = await job(A, { method: "GET", path: "/api/media/m_steal" });
    expect(result(r).status).toBe(404);
    db.sc_media = db.sc_media.filter((m) => m.id !== "m_steal");
  });

  it("writes back only the settings a job changed", async () => {
    db.sc_settings = db.sc_settings.filter((x) => x.user_id !== A);
    db.sc_settings.push({ user_id: A, model: "model-before", house_prompt: null, vision_ok: null, vision_for: null, updated_at: stamp() });
    const { load, flush } = await import("../src/worker/mirror.js");
    const { getDb } = await import("../src/db.js");
    const loaded = await load(W.sb, A, {});
    // The person changes their model while the job runs; the job records a picture check.
    db.sc_settings.find((x) => x.user_id === A)!.model = "model-after";
    getDb().prepare("UPDATE settings SET vision_ok = 'yes'").run();
    await flush(W.sb, loaded);
    const row = db.sc_settings.find((x) => x.user_id === A)!;
    expect(row.vision_ok).toBe("yes");
    expect(row.model).toBe("model-after");
  });
});
