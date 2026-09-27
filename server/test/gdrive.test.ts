import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import * as XLSX from "xlsx";

// Private Google Drive files through Composio, against a local stand-in whose
// answers copy the shapes the real API returned on 27 Sep 2026; and the
// instructions for every deck set in Settings.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-gd-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "1";
process.env.MOCK_LLM_DELAY_MS = "0";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

const KEY = "ck_test_key_gd_0123456789";
const SHEET = "application/vnd.google-apps.spreadsheet";
const FOLDER = "application/vnd.google-apps.folder";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function xlsxOf(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Limits");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// What the connected account can open, by file id.
const DRIVE: Record<string, { name: string; mimeType: string; body?: Buffer; parent?: string }> = {
  sheet1: { name: "Private limits", mimeType: SHEET, body: xlsxOf([["Ingredient", "Limit"], ["Salicylic acid", "2%"]]) },
  notes1: { name: "notes.txt", mimeType: "text/plain", body: Buffer.from("Private memo: the audit is on Tuesday.\n") },
  fold1: { name: "Client pack", mimeType: FOLDER },
  inA: { name: "brief.txt", mimeType: "text/plain", body: Buffer.from("Brief inside the folder.\n"), parent: "fold1" },
  inB: { name: "Sub", mimeType: FOLDER, parent: "fold1" },
  inC: { name: "drawing", mimeType: "application/vnd.google-apps.drawing", parent: "fold1" },
};

const cz = { calls: [] as { slug: string; args: Record<string, unknown>; account: string }[] };
let server: http.Server;
let base = "";
type App = Awaited<ReturnType<typeof import("../src/index.js")["buildApp"]>>;
let app: App;
let deckId = "";
const J = (r: { json: () => unknown }) => r.json() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

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
      if (req.headers["x-api-key"] !== KEY) return send(401, { error: { message: "Invalid API key" } });
      if (url.pathname === "/api/v3/connected_accounts") {
        return send(200, {
          items: [
            { id: "ca_od", status: "ACTIVE", alias: "OneDrive one", user_id: "pg-1", toolkit: { slug: "one_drive" } },
            { id: "ca_gd", status: "ACTIVE", alias: "info@example.com", user_id: "pg-2", toolkit: { slug: "googledrive" } },
          ].filter((a) => !url.searchParams.get("toolkit_slugs") || a.toolkit.slug === url.searchParams.get("toolkit_slugs")),
        });
      }
      if (url.pathname === "/api/v3/connected_accounts/ca_gd") return send(200, { id: "ca_gd", status: "ACTIVE", user_id: "pg-2", toolkit: { slug: "googledrive" } });
      const m = /^\/api\/v3\/tools\/execute\/([A-Z_]+)$/.exec(url.pathname);
      if (!m || req.method !== "POST") return send(404, { error: { message: "no route" } });
      const body = JSON.parse(raw || "{}");
      if (body.connected_account_id !== "ca_gd" || body.user_id !== "pg-2") return send(400, { error: { message: "connected account does not belong to this user" } });
      const a = body.arguments as Record<string, unknown>;
      cz.calls.push({ slug: m[1], args: a, account: body.connected_account_id });
      const notFound = () => send(200, { successful: false, data: { status_code: 404, message: "File not found" }, error: "File not found: " + a.fileId });
      if (m[1] === "GOOGLEDRIVE_GET_FILE_METADATA") {
        const f = DRIVE[String(a.fileId)];
        if (!f) return notFound();
        return send(200, { successful: true, data: { id: a.fileId, name: f.name, mimeType: f.mimeType, ...(f.body && f.mimeType !== SHEET ? { size: String(f.body.length) } : {}) } });
      }
      if (m[1] === "GOOGLEDRIVE_DOWNLOAD_FILE") {
        const f = DRIVE[String(a.fileId)];
        if (!f?.body) return notFound();
        // A Google Sheet only comes out when an export type is asked for, named without an extension.
        if (f.mimeType === SHEET && a.mime_type !== XLSX_MIME) return send(200, { successful: false, error: "Export requires mime_type" });
        return send(200, { successful: true, data: { downloaded_file_content: { name: f.name, mimetype: a.mime_type ?? f.mimeType, s3url: `https://r2.example/${a.fileId}` } } });
      }
      if (m[1] === "GOOGLEDRIVE_FIND_FILE") {
        const files = Object.entries(DRIVE).filter(([, f]) => f.parent === a.folder_id).map(([id, f]) => ({ id, name: f.name, mimeType: f.mimeType, ...(f.body ? { size: String(f.body.length) } : {}) }));
        return send(200, { successful: true, data: { files } });
      }
      return send(404, { error: { message: "unknown tool" } });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.COMPOSIO_API_BASE = `${base}/api/v3`;
  // Composio's storage host: the bytes of the file the signed link names.
  const gd = await import("../src/gdrive.js");
  gd.gdSigned.get = async (u: string) => {
    const id = u.split("/").pop()!;
    return DRIVE[id].body!;
  };
  // Google itself: every public export is refused, as for a private file.
  const G = await import("../src/ingest/google.js");
  G.google.get = async () => ({ status: 401, type: "", disposition: "", body: Buffer.alloc(0), signIn: true });
  const { buildApp } = await import("../src/index.js");
  app = await buildApp();
  deckId = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "Private" } })).id;
});

afterAll(async () => {
  await app?.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

const link = (url: string) => app.inject({ method: "POST", url: `/api/decks/${deckId}/sources/link`, payload: { url } });

describe("private Google Drive files", () => {
  it("without a connection, a private link says how to connect one", async () => {
    const r = await link("https://docs.google.com/spreadsheets/d/sheet1abcdefghijklmnopqrstu/edit");
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(J(r).message).toMatch(/connect your Google Drive in Settings/);
    expect(cz.calls).toHaveLength(0);
  });

  it("lists only Google Drive accounts, and saves the key and the account", async () => {
    const acc = J(await app.inject({ method: "POST", url: "/api/gdrive/accounts", payload: { key: KEY } }));
    expect(acc.accounts).toEqual([{ id: "ca_gd", label: "info@example.com", status: "ACTIVE" }]);
    let s = J(await app.inject({ method: "PUT", url: "/api/gdrive", payload: { composioKey: KEY } }));
    expect(s).toMatchObject({ connected: false, hasKey: true });
    s = J(await app.inject({ method: "PUT", url: "/api/gdrive", payload: { account: "ca_gd", label: "info@example.com" } }));
    expect(s).toMatchObject({ connected: true, account: "ca_gd", label: "info@example.com" });
    expect(fs.readFileSync(path.join(tmp, "slidecraft.sqlite")).includes(Buffer.from(KEY))).toBe(false);
  });

  it("refuses a value that is not text", async () => {
    const r = await app.inject({ method: "PUT", url: "/api/gdrive", payload: { account: 5 } });
    expect(r.statusCode).toBe(400);
  });

  it("reads a private Google Sheet as the connected account, exported to Excel", async () => {
    // These ids are not real Drive ids; parseGoogleLink takes any id of the right shape.
    DRIVE.sheet1abcdefghijklmnopqrstu = DRIVE.sheet1;
    const r = await link("https://docs.google.com/spreadsheets/d/sheet1abcdefghijklmnopqrstu/edit");
    expect(r.statusCode).toBe(200);
    const src = J(r).added as { name: string; kind: string; check: { level: string; note: string } }[];
    expect(src.map((s) => s.name)).toEqual(["Private limits.xlsx"]);
    expect(src[0].kind).toBe("sheet");
    expect(src[0].check.level).toBe("ok");
    const dl = cz.calls.find((c) => c.slug === "GOOGLEDRIVE_DOWNLOAD_FILE")!;
    expect(dl.args).toMatchObject({ fileId: "sheet1abcdefghijklmnopqrstu", mime_type: XLSX_MIME });
  });

  it("reads a private folder: files in it, not subfolders, and says what it skipped", async () => {
    DRIVE.fold1abcdefghijklmnopqrstuv = DRIVE.fold1;
    for (const k of ["inA", "inB", "inC"]) DRIVE[k].parent = "fold1abcdefghijklmnopqrstuv";
    const r = J(await link("https://drive.google.com/drive/folders/fold1abcdefghijklmnopqrstuv"));
    expect((r.added as { name: string }[]).map((s) => s.name)).toEqual(["brief.txt"]);
    expect(JSON.stringify(r)).toMatch(/drawing \(this kind of Google file \(drawing\) cannot be exported\)/);
  });

  it("a file the account cannot open says which account and what to do", async () => {
    const r = await link("https://drive.google.com/file/d/missingabcdefghijklmnopqrs/view");
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(J(r).message).toMatch(/Your connected Google account \(info@example.com\) cannot open this file/);
  });

  it("disconnecting keeps the key and stops private reads", async () => {
    const s = J(await app.inject({ method: "DELETE", url: "/api/gdrive" }));
    expect(s).toMatchObject({ connected: false, hasKey: true });
    const before = cz.calls.length;
    const r = await link("https://docs.google.com/spreadsheets/d/sheet1abcdefghijklmnopqrstu/edit");
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(cz.calls.length).toBe(before);
  });
});

describe("instructions for every deck", () => {
  it("start as the built-in rules, save the person's own text, and reset", async () => {
    const h0 = J(await app.inject({ method: "GET", url: "/api/settings/house" }));
    expect(h0.custom).toBe(false);
    expect(h0.text).toBe(h0.default);
    expect(h0.text).toMatch(/One idea per slide/);

    const mine = "Always open with the regulation's article number.\nUse teal for every chart.";
    const h1 = J(await app.inject({ method: "PUT", url: "/api/settings/house", payload: { text: mine } }));
    expect(h1).toMatchObject({ custom: true, text: mine });

    // Saving the built-in text again is the same as resetting: later updates to the rules still apply.
    const same = J(await app.inject({ method: "PUT", url: "/api/settings/house", payload: { text: h0.default } }));
    expect(same.custom).toBe(false);

    await app.inject({ method: "PUT", url: "/api/settings/house", payload: { text: mine } });
    const reset = J(await app.inject({ method: "PUT", url: "/api/settings/house", payload: { text: null } }));
    expect(reset).toMatchObject({ custom: false, text: h0.default });
  });

  it("refuses text over the limit or of the wrong type", async () => {
    const h = J(await app.inject({ method: "GET", url: "/api/settings/house" }));
    const long = await app.inject({ method: "PUT", url: "/api/settings/house", payload: { text: "x".repeat(h.max + 1) } });
    expect(long.statusCode).toBe(400);
    expect(J(long).error).toBe("too_long");
    expect((await app.inject({ method: "PUT", url: "/api/settings/house", payload: { text: 7 } })).statusCode).toBe(400);
  });

  it("the person's text goes into the writer, the designer and a rewrite, under the facts rules", async () => {
    const prompts = await import("../src/llm/prompts.js");
    const { designSystem } = await import("../src/llm/design.js");
    const S = await import("@slidecraft/shared");
    const mine = "Always open with the regulation's article number.";
    const sys = prompts.systemPrompt({ prompt: "x", lang: "en", angle: "custom", slides: 8, features: S.DEFAULT_FEATURES, imageMode: "none", houseRules: mine });
    expect(sys).toContain(mine);
    expect(sys).not.toContain("One idea per slide");
    expect(sys.indexOf("FACTS AND SOURCES")).toBeLessThan(sys.indexOf(mine));
    expect(sys).toMatch(/Do not invent a fee, a date, a clause number, a statistic or a study/);
    expect(designSystem(S.DEFAULT_FEATURES, "en", undefined, mine)).toContain(mine);
    expect(prompts.rewriteSystem({ lang: "en", angle: "custom", houseRules: mine })).toContain(mine);
  });

  it("a deck written after saving uses the saved text", async () => {
    const mine = "Every deck closes with a slide titled Next steps.";
    await app.inject({ method: "PUT", url: "/api/settings/house", payload: { text: mine } });
    const { houseFor } = await import("../src/llm/house.js");
    const { LOCAL_USER_ID } = await import("../src/auth.js");
    expect(houseFor(LOCAL_USER_ID)).toBe(mine);
  });
});
