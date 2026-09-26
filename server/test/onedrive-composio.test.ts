import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// OneDrive through Composio, against a local stand-in whose answers copy the
// shapes the real API returned on 26 Sep 2026: data.value[] with
// next_page_token for a listing, data.content.s3url for a download.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-cz-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "1";
process.env.MOCK_LLM_DELAY_MS = "0";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

const KEY = "ck_test_key_0123456789";
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 7, 7, 7, 0xff, 0xd9]);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex").toUpperCase();

const cz = { rejectLatest: false, versions: [] as (string | undefined)[], keyOnS3: 0, calls: [] as { slug: string; args: Record<string, unknown> }[] };
let server: http.Server;
let base = "";

const item = (id: string, name: string, bytes: Buffer, hash = sha(bytes)) => ({ id, name, size: bytes.length, eTag: `"{${id}},1"`, file: { mimeType: "image/jpeg", hashes: { sha256Hash: hash } }, parentReference: { driveId: "d1", id: "F1", path: "/drive/root:/Photos Lab" } });
const BYTES: Record<string, Buffer> = { lab: JPG, label: PNG, deep: JPG };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      const send = (code: number, body: unknown) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (url.pathname.startsWith("/s3/")) {
        if (req.headers["x-api-key"]) cz.keyOnS3++;
        const id = url.pathname.slice(4);
        res.writeHead(200, { "content-type": "application/octet-stream" });
        return res.end(BYTES[id] ?? JPG);
      }
      if (req.headers["x-api-key"] !== KEY) return send(401, { error: { message: "Invalid API key" } });
      if (url.pathname === "/api/v3/connected_accounts") {
        return send(200, { items: [{ id: "ca_od", status: "ACTIVE", alias: "Muhammad-Ridzuan", toolkit: { slug: "one_drive" } }, { id: "ca_gm", status: "ACTIVE", toolkit: { slug: "gmail" } }] });
      }
      const m = /^\/api\/v3\/tools\/execute\/([A-Z_]+)$/.exec(url.pathname);
      if (!m || req.method !== "POST") return send(404, { error: { message: "no route" } });
      const body = JSON.parse(raw || "{}");
      cz.versions.push(body.version);
      if (cz.rejectLatest && body.version === "latest") return send(400, { error: { message: "Unknown toolkit version: latest" } });
      if (body.connected_account_id !== "ca_od") return send(400, { error: { message: "connected account not found" } });
      const a = body.arguments as Record<string, unknown>;
      cz.calls.push({ slug: m[1], args: a });
      if (m[1] === "ONE_DRIVE_LIST_FOLDER_CHILDREN") {
        if (a.folder_item_id === "F2") return send(200, { successful: true, data: { value: [{ ...item("deep", "deep.jpg", JPG), parentReference: { driveId: "d1", id: "F2" } }] } });
        if (a.folder_path !== "/Photos Lab") return send(200, { successful: false, data: {}, error: "itemNotFound: The resource could not be found." });
        if (a.page_token === "p2") return send(200, { successful: true, data: { value: [item("label", "label.png", PNG, "00BAD"), item("big", "huge.jpg", JPG)] } });
        return send(200, {
          successful: true,
          data: {
            value: [item("lab", "lab-01.jpg.jpg", JPG), { id: "doc", name: "notes.docx", size: 5, file: { mimeType: "application/msword" } }, { id: "F2", name: "Sub", folder: { childCount: 1 }, parentReference: { driveId: "d1" } }],
            next_page_token: "p2",
          },
        });
      }
      if (m[1] === "ONE_DRIVE_DOWNLOAD_FILE") {
        if (!a.item_id || !a.file_name) return send(200, { successful: false, error: "item_id and file_name are required" });
        return send(200, { successful: true, data: { content: { name: a.file_name, mimetype: "image/jpeg", s3url: `${base}/s3/${a.item_id}` } } });
      }
      return send(404, { error: { message: "unknown tool" } });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.COMPOSIO_API_BASE = `${base}/api/v3`;
  const { buildApp } = await import("../src/index.js");
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

type App = Awaited<ReturnType<typeof import("../src/index.js")["buildApp"]>>;
let app: App;
let deckId = "";
const J = (r: { json: () => unknown }) => r.json() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("OneDrive through Composio", () => {
  it("refuses a wrong key and lists only OneDrive accounts for a right one", async () => {
    const bad = await app.inject({ method: "POST", url: "/api/onedrive/composio/accounts", payload: { key: "wrong" } });
    expect(bad.statusCode).toBe(400);
    expect(J(bad).error).toBe("composio_key");
    const ok = J(await app.inject({ method: "POST", url: "/api/onedrive/composio/accounts", payload: { key: KEY } }));
    expect(ok.accounts).toEqual([{ id: "ca_od", label: "Muhammad-Ridzuan", status: "ACTIVE" }]);
  });

  it("saves the route, the key encrypted and the account", async () => {
    await app.inject({ method: "PUT", url: "/api/onedrive", payload: { provider: "composio", composioKey: KEY } });
    const s = J(await app.inject({ method: "PUT", url: "/api/onedrive", payload: { composioAccount: "ca_od", composioAccountLabel: "Muhammad-Ridzuan" } }));
    expect(s).toMatchObject({ provider: "composio", connected: true, account: "Muhammad-Ridzuan" });
    expect(s.composio.key).not.toContain("0123456789");
    expect(fs.readFileSync(path.join(tmp, "slidecraft.sqlite")).includes(Buffer.from(KEY))).toBe(false);
  });

  it("browses a folder by path, following pages", async () => {
    const r = J(await app.inject({ method: "GET", url: `/api/onedrive/browse?folder=${encodeURIComponent("Photos Lab")}` }));
    expect(r).toMatchObject({ name: "Photos Lab", folders: ["Sub"], pictures: 3 });
  });

  it("pulls pictures, checks each against OneDrive's SHA-256, and never sends the key to the download link", async () => {
    deckId = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "CZ" } })).id;
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: { folder: "Photos Lab" } }));
    expect(r.report.added).toBe(2); // lab-01.jpg.jpg and huge.jpg
    expect(r.report.skipped).toEqual([{ name: "label.png", reason: "the download was damaged (checksum did not match); pull again" }]);
    expect(r.sources.map((s: { name: string }) => s.name).sort()).toEqual(["huge.jpg", "lab-01.jpg.jpg"]);
    expect(cz.keyOnS3).toBe(0);
    const dl = cz.calls.find((c) => c.slug === "ONE_DRIVE_DOWNLOAD_FILE")!;
    expect(dl.args).toMatchObject({ item_id: "lab", file_name: "lab-01.jpg.jpg", drive_id: "d1" });
  });

  it("skips unchanged pictures on the next pull", async () => {
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: {} }));
    expect(r.report).toMatchObject({ added: 0, unchanged: 2 });
  });

  it("walks subfolders by item id and drive", async () => {
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: { folder: "Photos Lab", subfolders: true } }));
    expect(r.sources.map((s: { name: string }) => s.name)).toContain("Sub/deep.jpg");
    const sub = cz.calls.find((c) => c.args.folder_item_id === "F2")!;
    expect(sub.args).toMatchObject({ drive_id: "d1" });
  });

  it("explains a missing folder and a share link", async () => {
    const missing = await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: { folder: "Nope" } });
    expect(J(missing).message).toMatch(/not found in OneDrive/);
    const link = await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: { folder: "https://1drv.ms/f/s!abc" } });
    expect(J(link).message).toMatch(/type the folder path/);
  });

  it("falls back to Composio's default tool version when 'latest' is refused", async () => {
    cz.rejectLatest = true;
    cz.versions = [];
    const r = await app.inject({ method: "GET", url: `/api/onedrive/browse?folder=${encodeURIComponent("Photos Lab")}` });
    expect(r.statusCode).toBe(200);
    expect(cz.versions.slice(0, 2)).toEqual(["latest", undefined]);
    cz.versions = [];
    await app.inject({ method: "GET", url: `/api/onedrive/browse?folder=${encodeURIComponent("Photos Lab")}` });
    expect(cz.versions[0]).toBeUndefined(); // remembered, no wasted call
  });

  it("forgets the account when the key changes, and disconnects only Composio", async () => {
    await app.inject({ method: "PUT", url: "/api/onedrive", payload: { clientId: "11111111-2222-3333-4444-555555555555" } });
    const s = J(await app.inject({ method: "PUT", url: "/api/onedrive", payload: { composioKey: KEY } }));
    expect(s.composio.account).toBe("");
    expect(s.connected).toBe(false);
    const d = J(await app.inject({ method: "DELETE", url: "/api/onedrive" }));
    expect(d.composio.key).toBe("");
    expect(d.clientId).toBe("11111111-2222-3333-4444-555555555555");
  });
});
