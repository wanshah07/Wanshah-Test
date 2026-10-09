import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { PNG } from "pngjs";

// Backups and Auto: a main endpoint that fails and AfiqStore standing behind it. The deck still
// gets written, the job log names the switch, each key reaches only its own address, uploaded
// pictures go to the model marked +vision, and every deck's instructions carry the deck skill.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-routes-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "0";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "sk-main";
process.env.OPENAI_MODEL = "main-1";
process.env.AFIQ_API_KEY = "sk-afiq";
process.env.AFIQ_MODELS = "kimi-k3, kimi-k2.7+vision";
delete process.env.MIRELD_API_KEY;
delete process.env.AI_ROUTE_ORDER;

type Seen = { key: string; model: string; url: string; system: string; user: string; pictures: boolean };
const main = { status: 404, seen: [] as Seen[] };
const afiq = { failModel: "", seen: [] as Seen[] };
let mainServer: http.Server;
let afiqServer: http.Server;
let app: App;
type App = Awaited<ReturnType<typeof import("../src/index.js")["buildApp"]>>;
const J = (r: { json: () => unknown }) => r.json() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function pngBytes(): Buffer {
  const p = new PNG({ width: 8, height: 8 });
  for (let i = 0; i < 64; i++) p.data.set([10, 20, 30, 255], i * 4);
  return PNG.sync.write(p);
}

function seenOf(req: http.IncomingMessage, body: Record<string, any>): Seen { // eslint-disable-line @typescript-eslint/no-explicit-any
  const msgs = (body.messages ?? []) as { role: string; content: unknown }[];
  const user = msgs.find((m) => m.role === "user")?.content;
  const text = typeof user === "string" ? user : JSON.stringify(user ?? "");
  return { key: String(req.headers.authorization ?? ""), model: String(body.model ?? ""), url: String(req.url), system: String(msgs[0]?.content ?? ""), user: text, pictures: /image_url/.test(text) };
}

async function waitJob(id: string) {
  for (let i = 0; i < 400; i++) {
    const j = J(await app.inject({ method: "GET", url: `/api/jobs/${id}` }));
    if (j.status === "done" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("job did not finish");
}

beforeAll(async () => {
  const { mockDeckJson } = await import("../src/llm/mock.js");
  const { DEFAULT_FEATURES } = await import("@slidecraft/shared");
  const deck = () => JSON.stringify(mockDeckJson({ prompt: "x", lang: "en", angle: "custom", slides: 6, features: DEFAULT_FEATURES, imageMode: "none" }, []));
  const answer = (res: http.ServerResponse, content: string) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }));
  };
  mainServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      main.seen.push(seenOf(req, body));
      if (main.status === 200) return answer(res, deck());
      res.writeHead(main.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: main.status === 404 ? "The model `main-1` does not exist" : "Service unavailable" } }));
    });
  });
  afiqServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      const s = seenOf(req, body);
      afiq.seen.push(s);
      if (afiq.failModel === "*" || (afiq.failModel && s.model === afiq.failModel)) {
        res.writeHead(500, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "upstream error" } }));
      }
      if (s.pictures) return answer(res, /What colour fills/.test(s.user) ? "Red" : "Salicylic acid limit | 2%");
      answer(res, deck());
    });
  });
  await new Promise<void>((r) => mainServer.listen(0, "127.0.0.1", () => r()));
  await new Promise<void>((r) => afiqServer.listen(0, "127.0.0.1", () => r()));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(mainServer.address() as AddressInfo).port}/v1`;
  process.env.AFIQ_BASE_URL = `http://127.0.0.1:${(afiqServer.address() as AddressInfo).port}/v1/`;
  const { buildApp } = await import("../src/index.js");
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  for (const s of [mainServer, afiqServer]) {
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
  }
});

async function newDeck(title: string) {
  return J(await app.inject({ method: "POST", url: "/api/decks", payload: { title } })).id as string;
}

function multipart(name: string, content: Buffer) {
  const boundary = "----vitest" + Math.random().toString(36).slice(2);
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe("the backups the environment sets up", () => {
  it("reads providers, models and order from the environment, skipping one without a key or address", async () => {
    const { envRoutes, parseRouteModels } = await import("../src/llm/routes.js");
    expect(parseRouteModels("kimi-k3, kimi-k2.7+vision, kimi-k3, bad model")).toEqual([
      { model: "kimi-k3", vision: false },
      { model: "kimi-k2.7", vision: true },
    ]);
    const env = { MIRELD_API_KEY: "m", AFIQ_API_KEY: "a", AFIQ_BASE_URL: "https://afiq.example/v1/" };
    expect(envRoutes(env).map((r) => `${r.label}:${r.model}:${r.baseUrl}`)).toEqual([
      "Mireld:deepseek-v4-pro:https://api.mireld.my/v1",
      "AfiqStore:kimi-k3:https://afiq.example/v1",
      "AfiqStore:kimi-k2.7:https://afiq.example/v1",
    ]);
    expect(envRoutes({ ...env, AI_ROUTE_ORDER: "afiq, mireld" })[0].label).toBe("AfiqStore");
    // AfiqStore has no default address: without one it is not a backup, whatever the key.
    expect(envRoutes({ AFIQ_API_KEY: "a" })).toEqual([]);
    expect(envRoutes({ MIRELD_API_KEY: "m", MIRELD_MODELS: "grok-4.7+vision" })).toMatchObject([{ model: "grok-4.7", vision: true }]);
  });

  it("starts on the default model for Auto, and on the backup for a backup's model, with the rest behind", async () => {
    const { resolveAuth } = await import("../src/settings.js");
    const { LOCAL_USER_ID } = await import("../src/auth.js");
    const auto = resolveAuth(LOCAL_USER_ID, "auto")!;
    expect(auto.model).toBe("main-1");
    expect(auto.fallbacks!.map((f) => `${f.label} ${f.model}`)).toEqual(["AfiqStore kimi-k3", "AfiqStore kimi-k2.7"]);
    const kimi = resolveAuth(LOCAL_USER_ID, "kimi-k3")!;
    expect(kimi).toMatchObject({ model: "kimi-k3", apiKey: "sk-afiq", label: "AfiqStore" });
    expect(kimi.fallbacks!.map((f) => f.model)).toEqual(["main-1", "kimi-k2.7"]);
    expect(kimi.fallbacks![0].apiKey).toBe("sk-main");
  });

  it("offers Auto and each backup's model in the model list", async () => {
    const m = J(await app.inject({ method: "GET", url: "/api/models" }));
    expect(m.models[0]).toMatchObject({ id: "auto" });
    expect(m.models.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining(["kimi-k3", "kimi-k2.7"]));
  });
});

describe("a call that fails moves to the next backup", () => {
  it("writes the deck on AfiqStore when the main endpoint refuses the model, and the log says so", async () => {
    main.status = 404;
    main.seen = [];
    afiq.seen = [];
    const id = await newDeck("fallback");
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "A deck about salicylic acid limits" } }));
    const job = await waitJob(jobId);
    expect(job.status, job.error ?? "").toBe("done");
    const log = (job.progress as string[]).join("\n");
    expect(log).toMatch(/Backups if a call fails: AfiqStore kimi-k3, AfiqStore kimi-k2\.7/);
    expect(log).toMatch(/main-1 failed \(the model is not offered there, 404\); switching to AfiqStore kimi-k3/);
    // Each key went only to its own address.
    expect(main.seen.length).toBeGreaterThan(0);
    expect(main.seen.every((s) => s.key === "Bearer sk-main")).toBe(true);
    expect(afiq.seen.length).toBeGreaterThan(0);
    expect(afiq.seen.every((s) => s.key === "Bearer sk-afiq")).toBe(true);
    expect(afiq.seen.some((s) => s.model === "kimi-k3")).toBe(true);
  });

  it("goes on to the third model when the second fails too", async () => {
    main.status = 401;
    afiq.failModel = "kimi-k3";
    afiq.seen = [];
    const id = await newDeck("fallback-2");
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "A deck about salicylic acid limits" } }));
    const job = await waitJob(jobId);
    afiq.failModel = "";
    expect(job.status, job.error ?? "").toBe("done");
    const log = (job.progress as string[]).join("\n");
    expect(log).toMatch(/main-1 failed \(the key was refused, 401\); switching to AfiqStore kimi-k3/);
    expect(log).toMatch(/AfiqStore kimi-k3 failed \(the gateway failed, 500\); switching to AfiqStore kimi-k2\.7/);
  });

  it("fails clearly, naming every model tried, when every route fails", async () => {
    main.status = 401;
    afiq.failModel = "*";
    const { chatText } = await import("../src/llm/client.js");
    const { resolveAuth } = await import("../src/settings.js");
    const { LOCAL_USER_ID } = await import("../src/auth.js");
    const auth = resolveAuth(LOCAL_USER_ID)!;
    await expect(chatText(auth, "s", "u")).rejects.toThrow(/every model was tried: 127\.0\.0\.1:\d+ main-1, AfiqStore kimi-k3, AfiqStore kimi-k2\.7/);
    afiq.failModel = "";
  });

  it("does not move on when no backup is set up: a single endpoint fails as before", async () => {
    const { chatText } = await import("../src/llm/client.js");
    main.status = 401;
    const auth = { apiKey: "sk-main", baseUrl: process.env.OPENAI_BASE_URL!, model: "main-1", imageModel: "" };
    await expect(chatText(auth, "s", "u")).rejects.toThrow(/answered 401/);
  });
});

describe("pictures go to the model marked +vision", () => {
  it("reads an uploaded picture on AfiqStore's kimi-k2.7 when the writer is the main endpoint", async () => {
    main.status = 200;
    afiq.seen = [];
    const id = await newDeck("pictures");
    const up = multipart("poster.png", pngBytes());
    expect((await app.inject({ method: "POST", url: `/api/decks/${id}/sources`, ...up })).statusCode).toBe(200);
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "A deck from the poster" } }));
    const job = await waitJob(jobId);
    expect(job.status, job.error ?? "").toBe("done");
    expect((job.progress as string[]).join("\n")).toMatch(/Reading picture 1 with kimi-k2\.7: poster\.png/);
    const pics = afiq.seen.filter((s) => s.pictures);
    expect(pics.length).toBeGreaterThan(0);
    expect(pics.every((s) => s.model === "kimi-k2.7" && s.key === "Bearer sk-afiq")).toBe(true);
    // The writer never received the picture itself, only what was read from it.
    expect(main.seen.filter((s) => s.pictures)).toEqual([]);
    expect(main.seen.at(-1)!.user).toMatch(/Salicylic acid limit \| 2%/);
  });
});

describe("the deck skill", () => {
  it("is in every deck's instructions, after the house rules, and survives the person's own rules", async () => {
    main.status = 200;
    const sys = main.seen.at(-1)!.system;
    expect(sys).toMatch(/HOUSE DESIGN SYSTEM[\s\S]*DECK SKILL \(Wan's deck-builder house style, built in/);
    expect(sys).toMatch(/Data on file/);
    expect(sys).toMatch(/never write the verdict or a sign-off line/i);
    const prompts = await import("../src/llm/prompts.js");
    const S = await import("@slidecraft/shared");
    const own = prompts.systemPrompt({ prompt: "x", lang: "en", angle: "custom", slides: 8, features: S.DEFAULT_FEATURES, imageMode: "none", houseRules: "Always open with the article number." });
    expect(own).toMatch(/Always open with the article number\.[\s\S]*DECK SKILL/);
    expect(own.indexOf("FACTS AND SOURCES")).toBeLessThan(own.indexOf("DECK SKILL"));
  });

  it("keeps report IDs, n, design, duration and article titles when it condenses a source", async () => {
    const prompts = await import("../src/llm/prompts.js");
    const S = await import("@slidecraft/shared");
    expect(prompts.condensePrompt({ prompt: "x", lang: "en", angle: "custom", slides: 8, features: S.DEFAULT_FEATURES, imageMode: "none" })).toMatch(/the report ID, n, the design and the duration[\s\S]*the full article title/);
  });

  it("reads a skill file without its front matter", async () => {
    const { skillFileText } = await import("@slidecraft/shared");
    expect(skillFileText("﻿---\r\nname: my-skill\r\ndescription: x\r\n---\r\n# My rules\r\n- One\r\n")).toBe("# My rules\n- One");
    expect(skillFileText("# No front matter\n- Two")).toBe("# No front matter\n- Two");
    expect(skillFileText("---\nname: empty\n---\n")).toBe("");
  });
});
