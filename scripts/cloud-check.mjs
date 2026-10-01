// The GitHub Pages build end to end, with no real Supabase: the page built
// with VITE_SUPABASE_URL pointing at a stand-in that speaks the parts of
// Supabase the page and the worker use (Auth, PostgREST with the row level
// security of supabase/002_rls.sql, Storage), and the real worker taking jobs.
//
//   npm run build && CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/cloud-check.mjs

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-cloud-"));
const SB_PORT = 8811;
const WEB_PORT = 8812;
const SB = `http://127.0.0.1:${SB_PORT}`;
const ANON = "anon-key";
const SERVICE = "service-key";
// Where the page is served from: "/" by default, "/Wanshah-Test/app/" to check the GitHub Pages layout.
const BASE = process.env.CLOUD_BASE || "/";

let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
};

// ------------------------------------------------------------------ Supabase stand-in

const db = { sc_members: [], sc_settings: [], sc_decks: [], sc_sources: [], sc_media: [], sc_designs: [], sc_prompts: [], sc_outputs: [], sc_jobs: [] };
const TOUCH = new Set(["sc_settings", "sc_decks", "sc_designs", "sc_prompts", "sc_outputs", "sc_jobs"]);
const users = []; // { id, email, password }
const files = new Map(); // "bucket/path" -> Buffer
const signed = new Map(); // token -> "bucket/path"
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tokenFor = (u) => `${b64u({ alg: "none", typ: "JWT" })}.${b64u({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const session = (u) => ({ access_token: tokenFor(u), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r-" + u.id, user: { id: u.id, email: u.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } });
const isMember = (uid) => db.sc_members.some((m) => m.user_id === uid);
let signupOpen = true; // kpi-system has sign-ups switched off; the check turns them off part way

function caller(req) {
  const auth = String(req.headers.authorization || "").replace(/^Bearer /, "");
  if (auth === SERVICE) return { service: true };
  if (auth && auth !== ANON) {
    try {
      const p = JSON.parse(Buffer.from(auth.split(".")[1], "base64url").toString());
      return { uid: p.sub };
    } catch {
      /* fall through */
    }
  }
  return { anon: true };
}

function parseFilters(url) {
  const out = [];
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "on_conflict", "columns"].includes(k)) continue;
    if (k === "or") out.push(["or", v]);
    else out.push([k, v]);
  }
  return out;
}
const unq = (v) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v);
function test(r, col, f) {
  const i = f.indexOf(".");
  const op = f.slice(0, i);
  const val = f.slice(i + 1);
  const v = r[col];
  if (op === "eq") return String(v) === val;
  if (op === "is") return val === "null" ? v === null || v === undefined : String(v) === val;
  if (op === "lt") return String(v) < val;
  if (op === "in") return val.slice(1, -1).split(",").map(unq).includes(String(v));
  throw new Error("stand-in has no filter " + op);
}
function matches(r, filters) {
  return filters.every(([k, v]) => {
    if (k === "or") return v.slice(1, -1).split(",").some((part) => {
      const [col, ...rest] = part.split(".");
      return test(r, col, rest.join("."));
    });
    return test(r, k, v);
  });
}
// supabase/002_rls.sql, as this stand-in understands it.
function visible(table, r, who) {
  if (who.service) return true;
  if (who.anon) return false;
  if (table === "sc_members") return r.user_id === who.uid;
  return r.user_id === who.uid && isMember(who.uid);
}
function mayInsert(table, r, who) {
  if (who.service) return true;
  if (who.anon || !isMember(who.uid) || r.user_id !== who.uid) return false;
  if (table === "sc_members") return false;
  if (table === "sc_jobs") return r.status === "pending" && !r.result && !r.error && !r.attempts;
  if (table === "sc_sources" && r.deck_id) return db.sc_decks.some((d) => d.id === r.deck_id && d.user_id === who.uid);
  // An output hangs off the person's own notebook only (supabase/005_outputs.sql).
  if (table === "sc_outputs") return db.sc_decks.some((d) => d.id === r.deck_id && d.user_id === who.uid);
  return true;
}
function project(rows, select) {
  if (!select || select === "*") return rows;
  const cols = select.split(",").map((c) => c.trim());
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
}
const now = () => new Date().toISOString();

function multipartFile(raw, type) {
  const m = /boundary=(.+)$/.exec(type || "");
  if (!m) return raw;
  const boundary = "--" + m[1];
  for (const part of raw.toString("latin1").split(boundary)) {
    const head = part.indexOf("\r\n\r\n");
    if (head < 0) continue;
    const headers = part.slice(0, head);
    if (!/name=""/.test(headers) && !/filename=/.test(headers)) continue;
    const body = part.slice(head + 4).replace(/\r\n$/, "");
    return Buffer.from(body, "latin1");
  }
  return raw;
}

const sb = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url, "http://x");
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS", "access-control-expose-headers": "*" };
    const send = (code, body, type = "application/json") => {
      res.writeHead(code, { ...cors, "content-type": type });
      res.end(body === undefined ? "" : Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    if (req.method === "OPTIONS") return send(204);
    const who = caller(req);
    const json = () => (raw.length ? JSON.parse(raw.toString()) : {});

    // Auth
    if (url.pathname === "/auth/v1/signup") {
      const b = json();
      // What Supabase answers when "Allow new users to sign up" is off.
      if (!signupOpen) return send(422, { code: 422, error_code: "signup_disabled", msg: "Signups not allowed for this instance" });
      if (users.some((u) => u.email === b.email)) return send(422, { code: 422, msg: "User already registered" });
      const u = { id: crypto.randomUUID(), email: b.email, password: b.password };
      users.push(u);
      return send(200, session(u));
    }
    if (url.pathname === "/auth/v1/token") {
      const b = json();
      const u = users.find((x) => x.email === b.email && x.password === b.password);
      if (!u) return send(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
      return send(200, session(u));
    }
    if (url.pathname === "/auth/v1/logout") return send(204);
    if (url.pathname === "/auth/v1/user" && req.method === "PUT") {
      const u = users.find((x) => x.id === who.uid);
      if (!u) return send(401, { msg: "no user" });
      const b = json();
      if (b.password === u.password) return send(422, { code: 422, error_code: "same_password", msg: "New password should be different from the old password." });
      if (b.password) u.password = b.password;
      return send(200, session(u).user);
    }
    if (url.pathname === "/auth/v1/user") {
      const u = users.find((x) => x.id === who.uid);
      return u ? send(200, session(u).user) : send(401, { msg: "no user" });
    }

    // Storage
    const signedGet = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (signedGet && req.method === "GET") {
      const key = signed.get(url.searchParams.get("token"));
      const want = `${signedGet[1]}/${decodeURIComponent(signedGet[2])}`;
      if (key !== want || !files.has(key)) return send(400, { message: "bad signature" });
      return send(200, files.get(key), "application/octet-stream");
    }
    const sign = /^\/storage\/v1\/object\/sign\/([^/]+)$/.exec(url.pathname);
    if (sign && req.method === "POST") {
      const b = json();
      return send(200, b.paths.map((p) => {
        const own = who.service || (who.uid && p.startsWith(who.uid + "/") && isMember(who.uid));
        if (!own || !files.has(`${sign[1]}/${p}`)) return { path: p, signedURL: null, error: "not found" };
        const t = crypto.randomBytes(8).toString("hex");
        signed.set(t, `${sign[1]}/${p}`);
        return { path: p, signedURL: `/object/sign/${sign[1]}/${p}?token=${t}`, error: null };
      }));
    }
    const obj = /^\/storage\/v1\/object\/([^/]+)(?:\/(.*))?$/.exec(url.pathname);
    if (obj) {
      const bucket = obj[1];
      const p = obj[2] ? obj[2].split("/").map(decodeURIComponent).join("/") : "";
      const own = who.service || (who.uid && p.startsWith(who.uid + "/") && isMember(who.uid));
      if (req.method === "POST" && p) {
        if (!who.service && !(own && bucket === "sc-inbox")) return send(403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
        files.set(`${bucket}/${p}`, multipartFile(raw, req.headers["content-type"]));
        return send(200, { Key: `${bucket}/${p}`, Id: crypto.randomUUID() });
      }
      if (req.method === "GET" && p) {
        if (!own || !files.has(`${bucket}/${p}`)) return send(404, { message: "Object not found" });
        return send(200, files.get(`${bucket}/${p}`), "application/octet-stream");
      }
      if (req.method === "DELETE" && !p) {
        const gone = [];
        for (const x of json().prefixes) if ((who.service || (who.uid && x.startsWith(who.uid + "/"))) && files.delete(`${bucket}/${x}`)) gone.push({ name: x });
        return send(200, gone);
      }
    }

    // PostgREST
    const t = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    if (!t || !db[t[1]]) return send(404, { message: "no route " + url.pathname });
    const table = t[1];
    const filters = parseFilters(url);
    const prefer = String(req.headers.prefer || "");
    const wantObject = String(req.headers.accept || "").includes("vnd.pgrst.object");
    const reply = (rows, code = 200) => {
      const out = project(rows, url.searchParams.get("select"));
      if (wantObject) return out.length === 1 ? send(code, out[0]) : send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      return send(code, out);
    };
    if (req.method === "GET") {
      let rows = db[table].filter((r) => visible(table, r, who) && matches(r, filters));
      const order = url.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(".");
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (dir === "desc" ? -1 : 1));
      }
      const limit = Number(url.searchParams.get("limit") || 0);
      return reply(limit ? rows.slice(0, limit) : rows);
    }
    if (req.method === "POST") {
      const body = json();
      const input = Array.isArray(body) ? body : [body];
      const upsert = prefer.includes("merge-duplicates");
      const key = url.searchParams.get("on_conflict") || "id";
      const out = [];
      for (const r0 of input) {
        const r = { ...r0 };
        if (!who.service && r.user_id === undefined && table !== "sc_members") r.user_id = who.uid;
        if (table === "sc_jobs") Object.assign(r, { id: r.id ?? crypto.randomUUID(), status: r.status ?? "pending", progress: r.progress ?? {}, result: r.result ?? null, error: r.error ?? null, attempts: r.attempts ?? 0 });
        const existing = db[table].find((x) => x[key] !== undefined && x[key] === r[key]);
        if (existing && upsert) {
          if (!visible(table, existing, who) || (!who.service && r.user_id !== who.uid)) return send(403, { message: "new row violates row-level security policy" });
          Object.assign(existing, r, TOUCH.has(table) ? { updated_at: now() } : {});
          out.push(existing);
          continue;
        }
        if (existing) return send(409, { code: "23505", message: "duplicate key value violates unique constraint" });
        if (!mayInsert(table, r, who)) return send(403, { code: "42501", message: "new row violates row-level security policy" });
        const row = { created_at: now(), ...(TOUCH.has(table) ? { updated_at: now() } : {}), ...r };
        db[table].push(row);
        out.push(row);
      }
      if (prefer.includes("return=representation")) return reply(out, 201);
      return send(201);
    }
    if (req.method === "PATCH") {
      const patch = json();
      const hit = db[table].filter((r) => visible(table, r, who) && matches(r, filters));
      if (!who.service && patch.user_id && patch.user_id !== who.uid) return send(403, { message: "new row violates row-level security policy" });
      if (!who.service && table === "sc_jobs") return reply([]); // no update policy for the page
      for (const r of hit) Object.assign(r, patch, TOUCH.has(table) ? { updated_at: now() } : {});
      return prefer.includes("return=representation") ? reply(hit) : send(204);
    }
    if (req.method === "DELETE") {
      const hit = db[table].filter((r) => visible(table, r, who) && matches(r, filters) && (table !== "sc_jobs" || who.service || ["done", "error"].includes(r.status)));
      db[table] = db[table].filter((r) => !hit.includes(r));
      if (table === "sc_decks") db.sc_sources = db.sc_sources.filter((s) => !hit.some((d) => d.id === s.deck_id));
      if (table === "sc_decks") db.sc_outputs = db.sc_outputs.filter((s) => !hit.some((d) => d.id === s.deck_id));
      return prefer.includes("return=representation") ? reply(hit) : send(204);
    }
    send(405, { message: "method" });
  });
});

// ------------------------------------------------------------------ the page, built for Pages

const out = path.join(tmp, "web");
execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { cwd: path.join(root, "web"), env: { ...process.env, VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: ANON, VITE_BASE: BASE }, stdio: "ignore" });
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const web = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // Like Pages: only what is under BASE is the app.
  if (!pathname.startsWith(BASE)) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("not the app");
  }
  const p = path.join(out, pathname.slice(BASE.length - 1));
  const f = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(out, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  res.end(fs.readFileSync(f));
});

// ------------------------------------------------------------------ the worker, as in Actions

process.env.SC_WORKER = "1";
process.env.AUTH_MODE = "off";
process.env.MOCK_LLM = "1";
process.env.DATA_DIR = path.join(tmp, "worker");
process.env.APP_SECRET = crypto.randomBytes(32).toString("hex");
const { buildApp } = await import(path.join(root, "server/dist/index.js"));
const { Supabase } = await import(path.join(root, "server/dist/worker/supabase.js"));
const { drain } = await import(path.join(root, "server/dist/worker/run.js"));
const app = await buildApp();
const workerClient = new Supabase({ url: SB, serviceKey: SERVICE });
let stop = false;
const workerLoop = (async () => {
  while (!stop) {
    const log = console.log;
    console.log = () => {};
    try {
      await drain(app, workerClient, 60_000);
    } catch (e) {
      log("worker error", e.message);
    } finally {
      console.log = log;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
})();

await new Promise((r) => sb.listen(SB_PORT, "127.0.0.1", r));
await new Promise((r) => web.listen(WEB_PORT, "127.0.0.1", r));
const APP = `http://127.0.0.1:${WEB_PORT}${BASE}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--enable-blink-features=ProgrammaticScrollPromise"] });
try {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const missing = [];
  page.on("response", (r) => r.url().startsWith(`http://127.0.0.1:${WEB_PORT}`) && r.status() >= 400 && missing.push(r.url()));

  await page.goto(APP);
  await page.waitForURL(/#\/login/, { timeout: 15000 });
  check("an unsigned visitor lands on sign-in", page.url().includes("#/login"));
  await page.click("text=New here? Create an account");
  await page.fill("input[type=email]", "wan@example.com");
  await page.fill("input[type=password]", "correct horse battery");
  await page.click("button:has-text('Create account')");
  await page.locator("text=has not added you yet").waitFor({ timeout: 15000 }).catch(() => {});
  check("a new account is told it waits for the owner", (await page.locator("text=has not added you yet").count()) === 1);
  const wan = users.find((u) => u.email === "wan@example.com");
  db.sc_members.push({ user_id: wan.id, role: "owner" });
  await page.reload();
  await page.locator("h1", { hasText: "Notebooks" }).waitFor({ timeout: 15000 });
  check("once added, the decks page shows and the notice is gone", (await page.locator("text=has not added you yet").count()) === 0);

  // A deck, written by the worker.
  await page.click("text=New deck");
  await page.click("button:has-text('Continue')");
  fs.writeFileSync(path.join(tmp, "notes.md"), "# Notes\nAnnex III entry 98: 2% rinse-off.");
  await page.locator("input[type=file]").first().setInputFiles(path.join(tmp, "notes.md"));
  await page.waitForSelector(".src", { timeout: 60000 });
  check("a source is uploaded to the inbox and read by the worker", (await page.locator(".src").count()) === 1 && db.sc_sources.length === 1 && db.sc_sources[0].user_id === wan.id);
  check("the worker cleared the inbox afterwards", ![...files.keys()].some((k) => k.startsWith("sc-inbox/")));
  await page.click("button:has-text('Continue')");
  await page.click("button:has-text('Generate (AI decides)')");
  await page.waitForURL(/#\/deck\//, { timeout: 90000 });
  await page.waitForSelector(".thumb", { timeout: 90000 });
  check("the worker writes the deck and the editor shows it", (await page.locator(".thumb").count()) >= 6);
  const deckId = page.url().split("#/deck/")[1];
  check("the deck is stored in Supabase as its owner's", db.sc_decks.some((d) => d.id === deckId && d.user_id === wan.id && d.doc.slides.length >= 6));

  // Editing saves straight to Supabase.
  await page.locator(".thumb").nth(2).click();
  await page.fill(".field textarea >> nth=0", "Edited in the cloud check");
  const saved = async () => JSON.stringify(db.sc_decks.find((d) => d.id === deckId).doc).includes("Edited in the cloud check");
  for (let i = 0; i < 30 && !(await saved()); i++) await page.waitForTimeout(500);
  check("an edit is saved straight to Supabase", await saved());

  // A picture: uploaded through the worker into the private sc-media bucket, shown through a signed link.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  fs.writeFileSync(path.join(tmp, "logo.png"), png);
  await page.locator(".tabs button", { hasText: /^theme$/i }).first().click().catch(async () => page.click("text=theme"));
  await page.locator("input[type=file][accept^='image/png']").first().setInputFiles(path.join(tmp, "logo.png"));
  const logo = page.locator(".field:has(label:text-is('Logo')) img");
  await logo.waitFor({ timeout: 90000 });
  await page.waitForFunction(() => {
    const i = document.querySelector(".field img");
    return i instanceof HTMLImageElement && i.complete && i.naturalWidth > 0;
  }, null, { timeout: 15000 }).catch(() => {});
  const src = await logo.getAttribute("src");
  const media = db.sc_media.find((m) => m.user_id === wan.id);
  check("a picture goes to sc-media under its owner's folder", !!media && media.object_path.startsWith(wan.id + "/") && files.has(`sc-media/${media.object_path}`));
  check("the page shows it through a signed link", !!src && src.startsWith(`${SB}/storage/v1/object/sign/sc-media/`) && (await logo.evaluate((i) => i.naturalWidth)) > 0);

  // Exports: JSON and HTML in the page, PowerPoint by the worker.
  await page.click("text=Export");
  const [json] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click("button:has-text('Deck data (.json)')")]);
  check("the JSON export is built in the page", JSON.parse(fs.readFileSync(await json.path(), "utf8")).id === deckId);
  const [pptx] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click("button:has-text('PowerPoint (.pptx)')")]);
  check("the PowerPoint is built by the worker and downloaded from sc-exports", fs.readFileSync(await pptx.path()).subarray(0, 2).toString() === "PK" && pptx.suggestedFilename().endsWith(".pptx"));
  await page.waitForTimeout(1000);
  check("the downloaded PowerPoint and its finished job are cleared away", ![...files.keys()].some((k) => k.startsWith("sc-exports/")) && !db.sc_jobs.some((j) => j.kind === "api" && j.request.path.endsWith("export.pptx")));

  // Present, built in the page.
  const present = await ctx.newPage();
  await present.goto(`${APP}#/deck/${deckId}/present`);
  const frame = present.frameLocator("iframe[title=Presentation]");
  await frame.locator(".sc-slide.on").waitFor({ timeout: 20000 });
  check("Present shows the deck with no server", await frame.locator(".sc-slide.on").isVisible());
  await present.close();

  // The notebook: the chat and the Studio run on the worker; notes and outputs are read and removed in the page.
  await page.goto(`${APP}#/deck/${deckId}/notebook`);
  await page.locator("[data-testid=notebook]").waitFor({ timeout: 15000 });
  await page.locator("[data-testid=nb-guide] .nb-starters button").first().waitFor({ timeout: 30000 });
  check("the notebook guide is written by the worker and kept on the notebook", !!db.sc_decks.find((d) => d.id === deckId)?.doc.guide?.summary);
  await page.fill("[data-testid=nb-question]", "What is the limit?");
  await page.click("[data-testid=nb-ask]");
  await page.locator(".nb-answer").first().waitFor({ timeout: 30000 });
  check("a question is answered by the worker from the sources", (await page.locator(".nb-answer", { hasText: "2%" }).count()) === 1);
  await page.click(".nb-answer button:has-text('Save to note')");
  await page.locator(".nb-out", { hasText: "What is the limit?" }).waitFor({ timeout: 15000 });
  check("a note is saved straight to Supabase as its owner's", db.sc_outputs.some((o) => o.kind === "note" && o.user_id === wan.id && o.deck_id === deckId));
  await page.click("[data-testid=tile-mindmap]");
  await page.click("[data-testid=studio-generate]");
  await page.locator("[data-testid=output-viewer] .ov-mind").waitFor({ timeout: 40000 });
  check("the worker makes a mind map and the page opens it", db.sc_outputs.some((o) => o.kind === "mindmap" && o.user_id === wan.id) && (await page.locator(".ov-node").count()) >= 3);
  await page.click("[data-testid=output-viewer] button:has-text('Delete')");
  await page.click("[data-testid=output-viewer] button:has-text('Click again')");
  await page.locator("[data-testid=output-viewer]").waitFor({ state: "detached", timeout: 15000 });
  check("deleting an output removes it from Supabase", !db.sc_outputs.some((o) => o.kind === "mindmap"));

  // Settings has no key fields.
  await page.goto(`${APP}#/settings`);
  await page.getByRole("heading", { name: "AI", exact: true }).waitFor({ timeout: 15000 });
  check("Settings says the AI is the owner's and shows no key box", (await page.locator("section:not(:has(h2:text-is('Password'))) input[type=password]").count()) === 0 && (await page.locator("text=/API key|New key/").count()) === 0 && (await page.locator("text=provided by the workspace owner").count()) === 1);

  // Changing the password, then signing in with the new one.
  await page.fill("section:has(h2:text-is('Password')) input >> nth=0", "a brand new password");
  await page.fill("section:has(h2:text-is('Password')) input >> nth=1", "a brand new password");
  await page.click("button:has-text('Change password')");
  await page.locator("text=Password changed").waitFor({ timeout: 15000 }).catch(() => {});
  check("a person can change their own password in Settings", wan.password === "a brand new password");
  await page.click("button:has-text('Sign out')");
  await page.waitForURL(/#\/login/, { timeout: 15000 });
  await page.fill("input[type=email]", "wan@example.com");
  await page.fill("input[type=password]", "a brand new password");
  await page.click("button:has-text('Sign in')");
  // The heading draws before the list arrives: wait for the card itself.
  await page.locator(".deckcard").first().waitFor({ timeout: 15000 }).catch(() => {});
  check("and sign in with the new one", (await page.locator(".deckcard").count()) === 1);

  // A teammate sees none of it.
  const ctx2 = await browser.newContext();
  const mate = await ctx2.newPage();
  await mate.goto(APP);
  await mate.waitForURL(/#\/login/, { timeout: 15000 });
  await mate.click("text=New here? Create an account");
  await mate.fill("input[type=email]", "mate@example.com");
  await mate.fill("input[type=password]", "another good password");
  await mate.click("button:has-text('Create account')");
  const m = users.find((u) => u.email === "mate@example.com");
  await mate.locator("text=has not added you yet").waitFor({ timeout: 15000 }).catch(() => {});
  db.sc_members.push({ user_id: m.id, role: "member" });
  await mate.reload();
  await mate.locator("h1", { hasText: "Notebooks" }).waitFor({ timeout: 15000 });
  await mate.waitForTimeout(1500);
  check("a teammate's deck list does not show the owner's deck", (await mate.locator(".deckcard").count()) === 0);
  await mate.goto(`${APP}#/deck/${deckId}`);
  await mate.locator("text=Back to decks").waitFor({ timeout: 15000 }).catch(() => {});
  check("opening the owner's deck by its address finds nothing", (await mate.locator(".thumb").count()) === 0);
  const token = tokenFor(m);
  const direct = await (await fetch(`${SB}/rest/v1/sc_decks?select=*`, { headers: { apikey: ANON, authorization: `Bearer ${token}` } })).json();
  check("the teammate's own token reads no other deck", Array.isArray(direct) && direct.length === 0);
  const outs = await (await fetch(`${SB}/rest/v1/sc_outputs?select=*`, { headers: { apikey: ANON, authorization: `Bearer ${token}` } })).json();
  check("nor any of the owner's notes or Studio outputs", Array.isArray(outs) && outs.length === 0 && db.sc_outputs.length > 0);
  const forged = await fetch(`${SB}/rest/v1/sc_outputs`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify([{ id: "o_x", user_id: m.id, deck_id: deckId, kind: "note", title: "x", data: {} }]) });
  check("and cannot put one on the owner's notebook", forged.status >= 400 && !db.sc_outputs.some((o) => o.id === "o_x"));
  await ctx2.close();

  // With sign-ups off, as in a shared project: a visitor is told who makes accounts.
  signupOpen = false;
  const ctx3 = await browser.newContext();
  const visitor = await ctx3.newPage();
  await visitor.goto(APP);
  await visitor.waitForURL(/#\/login/, { timeout: 15000 });
  await visitor.click("text=New here? Create an account");
  await visitor.fill("input[type=email]", "someone@example.com");
  await visitor.fill("input[type=password]", "a password here");
  await visitor.click("button:has-text('Create account')");
  await visitor.locator("text=made by the workspace owner").waitFor({ timeout: 15000 }).catch(() => {});
  check("with sign-ups closed, a visitor is told the owner makes accounts", (await visitor.locator("text=made by the workspace owner").count()) === 1 && (await visitor.locator("text=Signups not allowed").count()) === 0);
  await ctx3.close();

  check("every file of the page loads from where it is served", missing.length === 0);
  if (missing.length) console.log(missing);
  check("no page errors", errors.length === 0);
  if (errors.length) console.log(errors);
} finally {
  stop = true;
  await workerLoop;
  await browser.close();
  await app.close();
  sb.close();
  web.close();
}
console.log(failed ? `\n${failed} failed` : "\nall cloud checks passed");
process.exit(failed ? 1 : 0);
