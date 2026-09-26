import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// A local stand-in for Microsoft's sign-in and Graph, so the whole OneDrive
// path runs with no account and no network: device code sign-in, paging,
// pre-authorised downloads, share links, token renewal, and a pull inside a
// generation.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-od-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "1";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";
process.env.MAX_UPLOAD_MB = "1";
process.env.MS_CLIENT_ID = "11111111-2222-3333-4444-555555555555";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const ms = {
  pollsBeforeGrant: 1,
  polls: 0,
  access: new Set<string>(),
  refresh: new Set<string>(),
  issued: 0,
  refreshCalls: 0,
  authOnDownload: 0,
  graphDown: false,
  labEtag: "v1",
  labBytes: JPG,
  extraInRoot: [] as { id: string; name: string; bytes: Buffer }[],
};

let server: http.Server;
let base = "";

function send(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function rootChildren(page: number) {
  const b = () => base;
  if (page === 1)
    return {
      value: [
        { id: "lab", name: "lab-01.jpg", size: ms.labBytes.length, eTag: ms.labEtag, file: { mimeType: "image/jpeg" }, "@microsoft.graph.downloadUrl": `${b()}/dl/lab` },
        { id: "doc", name: "notes.docx", size: 10, eTag: "d", file: { mimeType: "application/msword" } },
        { id: "heic", name: "IMG_0001.HEIC", size: 10, eTag: "h", file: { mimeType: "image/heic" } },
        { id: "F2", name: "Sub", folder: { childCount: 1 } },
      ],
      "@odata.nextLink": `${b()}/v1.0/drives/D1/items/F1/children?page=2`,
    };
  return {
    value: [
      { id: "big", name: "big.png", size: 2 * 1024 * 1024, eTag: "b", file: { mimeType: "image/png" } },
      { id: "label", name: "label.png", size: PNG.length, eTag: "l1", file: { mimeType: "image/png" } },
      ...ms.extraInRoot.map((x) => ({ id: x.id, name: x.name, size: x.bytes.length, eTag: "x1", file: { mimeType: "image/jpeg" }, "@microsoft.graph.downloadUrl": `${b()}/dl/${x.id}` })),
    ],
  };
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      const p = url.pathname;
      const formBody = Object.fromEntries(new URLSearchParams(raw));
      // Sign-in
      if (p === "/common/oauth2/v2.0/devicecode") {
        if (formBody.client_id !== process.env.MS_CLIENT_ID) return send(res, 400, { error: "unauthorized_client", error_description: "AADSTS700016: Application not found.\r\nTrace ID: x" });
        return send(res, 200, { device_code: "DC", user_code: "ABCD-1234", verification_uri: "https://microsoft.com/devicelogin", expires_in: 900, interval: 1 });
      }
      if (p === "/common/oauth2/v2.0/token") {
        const grant = () => {
          ms.issued++;
          const a = `AT${ms.issued}`;
          const r = `RT${ms.issued}`;
          ms.access.add(a);
          ms.refresh.add(r);
          return send(res, 200, { access_token: a, refresh_token: r, expires_in: 3600, token_type: "Bearer" });
        };
        if (formBody.grant_type === "urn:ietf:params:oauth:grant-type:device_code") {
          if (ms.polls++ < ms.pollsBeforeGrant) return send(res, 400, { error: "authorization_pending" });
          return grant();
        }
        if (formBody.grant_type === "refresh_token") {
          ms.refreshCalls++;
          if (!ms.refresh.has(formBody.refresh_token)) return send(res, 400, { error: "invalid_grant", error_description: "AADSTS70000: expired" });
          ms.refresh.delete(formBody.refresh_token);
          return grant();
        }
      }
      // Pre-authorised downloads: a bearer token here is a bug.
      if (p.startsWith("/dl/")) {
        if (req.headers.authorization) ms.authOnDownload++;
        const id = p.slice(4);
        const extra = ms.extraInRoot.find((x) => x.id === id);
        res.writeHead(200, { "content-type": "application/octet-stream" });
        return res.end(id === "lab" ? ms.labBytes : extra ? extra.bytes : JPG);
      }
      // Graph
      if (!p.startsWith("/v1.0/")) return send(res, 404, {});
      const tok = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
      if (!ms.access.has(tok)) return send(res, 401, { error: { code: "InvalidAuthenticationToken", message: "expired" } });
      if (ms.graphDown) return send(res, 503, { error: { message: "Service unavailable" } });
      const g = decodeURIComponent(p.slice(5));
      if (g === "/me/drive") return send(res, 200, { owner: { user: { displayName: "Wan", email: "wan@example.com" } } });
      if (g === "/me/drive/root") return send(res, 200, { id: "ROOT", name: "root", folder: {}, parentReference: { driveId: "D1" } });
      if (g === "/me/drive/root:/Photos Lab") return send(res, 200, { id: "F1", name: "Photos Lab", folder: {}, parentReference: { driveId: "D1" } });
      if (g === "/me/drive/root:/Photos Lab/Sub") return send(res, 200, { id: "F2", name: "Sub", folder: {}, parentReference: { driveId: "D1" } });
      if (g === "/me/drive/root:/Photos Lab/lab-01.jpg") return send(res, 200, { id: "lab", name: "lab-01.jpg", file: {}, parentReference: { driveId: "D1" } });
      if (g.startsWith("/me/drive/root:/")) return send(res, 404, { error: { code: "itemNotFound", message: "not found" } });
      if (g === "/drives/D1/items/F1/children") return send(res, 200, rootChildren(url.searchParams.get("page") === "2" ? 2 : 1));
      if (g === "/drives/D1/items/F2/children") return send(res, 200, { value: [{ id: "deep", name: "deep.jpg", size: JPG.length, eTag: "e", file: { mimeType: "image/jpeg" }, "@microsoft.graph.downloadUrl": `${base}/dl/deep` }] });
      if (g === "/drives/D1/items/label/content") {
        res.writeHead(200, { "content-type": "image/png" });
        return res.end(PNG);
      }
      if (g.startsWith("/shares/u!")) {
        const link = Buffer.from(g.slice("/shares/u!".length).replace("/driveItem", "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        if (link === "https://1drv.ms/f/s!shared-sub") return send(res, 200, { id: "F2", name: "Sub", folder: {}, parentReference: { driveId: "D1" } });
        return send(res, 404, { error: { message: "not found" } });
      }
      return send(res, 404, { error: { message: `stand-in has no ${g}` } });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.MS_LOGIN_BASE = base;
  process.env.MS_GRAPH_BASE = `${base}/v1.0`;
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitJob(id: string) {
  for (let i = 0; i < 100; i++) {
    const j = J(await app.inject({ method: "GET", url: `/api/jobs/${id}` }));
    if (j.status === "done" || j.status === "failed") return j;
    await sleep(50);
  }
  throw new Error("job did not finish");
}

describe("OneDrive sign-in", () => {
  it("reports the server's client id and no connection", async () => {
    const s = J(await app.inject({ method: "GET", url: "/api/onedrive" }));
    expect(s.clientIdFrom).toBe("server");
    expect(s.connected).toBe(false);
  });

  it("refuses a client id that is not a GUID", async () => {
    const r = await app.inject({ method: "PUT", url: "/api/onedrive", payload: { clientId: "my-app" } });
    expect(r.statusCode).toBe(400);
    expect(J(r).error).toBe("bad_client_id");
  });

  it("refuses to import before sign-in, saying so", async () => {
    deckId = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "OD" } })).id;
    const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: { folder: "Photos Lab" } });
    expect(r.statusCode).toBe(400);
    expect(J(r).error).toBe("not_connected");
  });

  it("signs in with a device code, waiting while the user types it", async () => {
    const start = J(await app.inject({ method: "POST", url: "/api/onedrive/login" }));
    expect(start.userCode).toBe("ABCD-1234");
    expect(J(await app.inject({ method: "POST", url: "/api/onedrive/login/poll" })).state).toBe("waiting");
    // Polling again inside Microsoft's interval must not call the token endpoint.
    const before = ms.polls;
    expect(J(await app.inject({ method: "POST", url: "/api/onedrive/login/poll" })).state).toBe("waiting");
    expect(ms.polls).toBe(before);
    await sleep(1100);
    const done = J(await app.inject({ method: "POST", url: "/api/onedrive/login/poll" }));
    expect(done.state).toBe("connected");
    expect(done.account).toBe("wan@example.com");
    const s = J(await app.inject({ method: "GET", url: "/api/onedrive" }));
    expect(s.connected).toBe(true);
    expect(s.account).toBe("wan@example.com");
  });

  it("stores the refresh token encrypted, never in plain text", () => {
    const db = fs.readFileSync(path.join(tmp, "slidecraft.sqlite"));
    expect(db.includes(Buffer.from("RT1"))).toBe(false);
  });
});

describe("OneDrive import", () => {
  it("browses a folder: subfolders and a picture count", async () => {
    const r = J(await app.inject({ method: "GET", url: `/api/onedrive/browse?folder=${encodeURIComponent("/Photos Lab/")}` }));
    expect(r.folders).toEqual(["Sub"]);
    expect(r.pictures).toBe(3); // lab-01.jpg, big.png, label.png across both pages
  });

  it("pulls the pictures across pages, names what it skipped, and links the folder", async () => {
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: { folder: "Photos Lab", subfolders: false } }));
    expect(r.report.added).toBe(2);
    expect(r.report.skipped.map((s: { name: string }) => s.name).sort()).toEqual(["IMG_0001.HEIC", "big.png"]);
    expect(r.report.skipped.find((s: { name: string }) => s.name === "big.png").reason).toMatch(/larger than 1 MB/);
    expect(r.link).toMatchObject({ folder: "Photos Lab", subfolders: false });
    const names = r.sources.map((s: { name: string }) => s.name).sort();
    expect(names).toEqual(["lab-01.jpg", "label.png"]);
    expect(ms.authOnDownload).toBe(0);
  });

  it("stores the bytes as downloaded", async () => {
    const src = J(await app.inject({ method: "GET", url: `/api/decks/${deckId}/sources` })) as unknown as { id: string; name: string }[];
    const label = src.find((s) => s.name === "label.png")!;
    const row = J(await app.inject({ method: "GET", url: `/api/sources/${label.id}` }));
    const media = await app.inject({ method: "GET", url: `/api/media/${row.media_id}` });
    expect(Buffer.from(media.rawPayload).equals(PNG)).toBe(true);
  });

  it("skips what has not changed on a second pull", async () => {
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: {} }));
    expect(r.report).toMatchObject({ added: 0, updated: 0, unchanged: 2 });
  });

  it("replaces a changed picture in place, keeping its media id", async () => {
    const src = J(await app.inject({ method: "GET", url: `/api/decks/${deckId}/sources` })) as unknown as { id: string; name: string }[];
    const lab = src.find((s) => s.name === "lab-01.jpg")!;
    const mid = J(await app.inject({ method: "GET", url: `/api/sources/${lab.id}` })).media_id;
    ms.labEtag = "v2";
    ms.labBytes = Buffer.concat([JPG, Buffer.from([9, 9, 9])]);
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: {} }));
    expect(r.report).toMatchObject({ added: 0, updated: 1, unchanged: 1 });
    expect(J(await app.inject({ method: "GET", url: `/api/sources/${lab.id}` })).media_id).toBe(mid);
    const media = await app.inject({ method: "GET", url: `/api/media/${mid}` });
    expect(Buffer.from(media.rawPayload).equals(ms.labBytes)).toBe(true);
  });

  it("walks subfolders when asked, keeping the folder in the name", async () => {
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: { folder: "Photos Lab", subfolders: true } }));
    expect(r.report.added).toBe(1);
    expect(r.sources.map((s: { name: string }) => s.name)).toContain("Sub/deep.jpg");
  });

  it("reads a share link", async () => {
    const d = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "Share" } })).id;
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${d}/onedrive`, payload: { folder: "https://1drv.ms/f/s!shared-sub" } }));
    expect(r.report.added).toBe(1);
    expect(r.report.folder).toBe("Sub");
  });

  it("explains a missing folder, a file, and a link that is not a share link", async () => {
    const missing = await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: { folder: "Nope" } });
    expect(missing.statusCode).toBe(400);
    expect(J(missing).message).toMatch(/not found/);
    const file = await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: { folder: "Photos Lab/lab-01.jpg" } });
    expect(J(file).error).toBe("not_a_folder");
    const badLink = await app.inject({ method: "POST", url: `/api/decks/${deckId}/onedrive`, payload: { folder: "https://onedrive.live.com/?id=abc" } });
    expect(J(badLink).message).toMatch(/not a OneDrive share link/);
  });

  it("renews a revoked access token once and carries on", async () => {
    ms.access.clear();
    const before = ms.refreshCalls;
    const r = await app.inject({ method: "GET", url: `/api/onedrive/browse?folder=${encodeURIComponent("Photos Lab")}` });
    expect(r.statusCode).toBe(200);
    expect(ms.refreshCalls).toBe(before + 1);
  });
});

describe("OneDrive inside a generation", () => {
  it("keeps the link and the brief when the editor saves the deck", async () => {
    const d = J(await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).deck;
    expect(d.onedrive.folder).toBe("Photos Lab");
    const { onedrive: _o, ...withoutLink } = d;
    await app.inject({ method: "PUT", url: `/api/decks/${deckId}`, payload: { ...withoutLink, title: "Renamed" } });
    const after = J(await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).deck;
    expect(after.title).toBe("Renamed");
    expect(after.onedrive.folder).toBe("Photos Lab");
  });

  it("pulls new pictures before writing and stores the ticked brief", async () => {
    ms.extraInRoot.push({ id: "new1", name: "kilang-lini.jpg", bytes: JPG });
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/generate`, payload: { prompt: "- Explain what the regulation changes.", imageMode: "uploaded", features: { images: true }, brief: { text: "", purposes: ["reg-change", "made-up"], include: ["dates"], audiences: ["hcp"] } } }));
    const job = await waitJob(jobId);
    expect(job.status).toBe("done");
    expect(job.progress.join("\n")).toMatch(/OneDrive "Photos Lab": 1 new/);
    const deck = J(await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).deck;
    expect(deck.sources.map((s: { name: string }) => s.name)).toContain("kilang-lini.jpg");
    expect(deck.brief).toMatchObject({ purposes: ["reg-change"], include: ["dates"], audiences: ["hcp"], imageMode: "uploaded" });
  });

  it("still writes the deck when OneDrive is down", async () => {
    ms.graphDown = true;
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/generate`, payload: { prompt: "A deck about labels and dates", imageMode: "uploaded", features: { images: true } } }));
    const job = await waitJob(jobId);
    ms.graphDown = false;
    expect(job.status).toBe("done");
    expect(job.progress.join("\n")).toMatch(/OneDrive not read .*Using the pictures already pulled/);
  });

  it("does not touch OneDrive when pictures are not from sources", async () => {
    const before = ms.issued + ms.refreshCalls;
    ms.access.clear();
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/generate`, payload: { prompt: "A deck about labels and dates", imageMode: "none" } }));
    const job = await waitJob(jobId);
    expect(job.progress.join("\n")).not.toMatch(/OneDrive/);
    expect(ms.issued + ms.refreshCalls).toBe(before);
  });
});

describe("OneDrive sign-out", () => {
  it("drops a sign-in Microsoft no longer honours", async () => {
    ms.access.clear();
    ms.refresh.clear();
    const r = await app.inject({ method: "GET", url: `/api/onedrive/browse?folder=${encodeURIComponent("Photos Lab")}` });
    expect(J(r).error).toBe("not_connected");
    expect(J(await app.inject({ method: "GET", url: "/api/onedrive" })).connected).toBe(false);
  });

  it("stops a deck pulling, keeping its pictures", async () => {
    const n = (J(await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).deck.sources as unknown[]).length;
    await app.inject({ method: "DELETE", url: `/api/decks/${deckId}/onedrive` });
    const d = J(await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).deck;
    expect(d.onedrive).toBeUndefined();
    expect(d.sources.length).toBe(n);
  });
});
