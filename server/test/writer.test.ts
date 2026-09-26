import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { PNG } from "pngjs";

// The real writer path (no mock) against a stand-in endpoint that can see
// pictures or not, and can answer with something that is not JSON:
// the JSON rules are always in the written instructions, a failed reply is
// logged (trimmed), and pictures a model cannot read stop the job until the
// user chooses.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-writer-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "0";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "sk-test-writer";
process.env.OPENAI_MODEL = "writer-1";

const gw = { thinking: false, silent: false, imageBodies: [] as Record<string, unknown>[], vision: false, garbage: false, plans: 0, planUser: "", planProse: 0, planLastMsgs: [] as { role: string; content: string }[], deckProse: 0, systems: [] as string[], formats: [] as string[], users: [] as string[], reads: 0, probes: 0 };
let server: http.Server;
let app: App;
type App = Awaited<ReturnType<typeof import("../src/index.js")["buildApp"]>>;
const J = (r: { json: () => unknown }) => r.json() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function pngBytes(): Buffer {
  const p = new PNG({ width: 8, height: 8 });
  for (let i = 0; i < 64; i++) p.data.set([10, 20, 30, 255], i * 4);
  return PNG.sync.write(p);
}

function multipart(files: { name: string; content: Buffer }[]) {
  const boundary = "----vitest" + Math.random().toString(36).slice(2);
  const parts: Buffer[] = [];
  for (const f of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${encodeURIComponent(f.name)}"\r\nContent-Type: application/octet-stream\r\n\r\n`), f.content, Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function waitJob(id: string) {
  for (let i = 0; i < 200; i++) {
    const j = J(await app.inject({ method: "GET", url: `/api/jobs/${id}` }));
    if (j.status === "done" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("job did not finish");
}

beforeAll(async () => {
  const { mockDeckJson } = await import("../src/llm/mock.js");
  const { DEFAULT_FEATURES } = await import("@slidecraft/shared");
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const reply = (content: string) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }));
      };
      if (req.url === "/v1/images/generations") {
        gw.imageBodies.push(JSON.parse(raw || "{}"));
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ data: [{ b64_json: pngBytes().toString("base64") }] }));
      }
      if (req.url === "/v1/models") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ data: [{ id: "writer-1" }] }));
      }
      const body = JSON.parse(raw || "{}");
      const user = body.messages?.[1]?.content;
      if (Array.isArray(user)) {
        if (!gw.vision) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: { message: "This model does not support image input." } }));
        }
        const text = String(user.find((p: { type: string }) => p.type === "text")?.text ?? "");
        if (/What colour/.test(text)) {
          gw.probes++;
          // A thinking model: the thinking eats the first ~500 tokens, and a smaller cap leaves no answer.
          const cap = Number(body.max_completion_tokens ?? body.max_tokens ?? 0);
          if (gw.silent || (gw.thinking && cap < 500)) {
            res.writeHead(200, { "content-type": "application/json" });
            return res.end(JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "length" }] }));
          }
          return reply("Red");
        }
        gw.reads++;
        return reply("Salicylic acid limit | 2%\nEffective | 1 Jan 2027");
      }
      if (body.response_format?.json_schema?.name === "plan") {
        gw.plans++;
        gw.planUser = String(user ?? "");
        gw.planLastMsgs = body.messages;
        // What a chatty model sent on 26 Sep 2026: a deck in prose instead of the plan.
        if (gw.planProse > 0) {
          gw.planProse--;
          return reply("Here is a professional presentation deck built strictly from the provided source material. ### Deck Strategy: Purpose, Audience, and Core Conclusion");
        }
        return reply(JSON.stringify({ title: "Salicylic acid: 2% cap needs 4 SKUs reformulated", angle: "medical-affairs", audience: "dermatologists", slides: 7, features: { charts: false, tables: true, diagrams: false, kpis: true, sections: false, summary: true, qa: true }, reason: "The sources are clinical and carry no series of numbers." }));
      }
      gw.systems.push(String(body.messages?.[0]?.content ?? ""));
      gw.formats.push(String(body.response_format?.type ?? ""));
      gw.users.push(String(user ?? ""));
      if (gw.deckProse > 0) {
        gw.deckProse--;
        return reply("Sure! Here is the deck you asked for, slide by slide.");
      }
      if (gw.garbage) return reply("Sorry, I can only help with questions about cooking. " + "x".repeat(900));
      reply(JSON.stringify(mockDeckJson({ prompt: "x", lang: "en", angle: "custom", slides: 6, features: DEFAULT_FEATURES, imageMode: "none" }, [])));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const { buildApp } = await import("../src/index.js");
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

async function newDeck(title: string) {
  return J(await app.inject({ method: "POST", url: "/api/decks", payload: { title } })).id as string;
}

describe("the writer's instructions and failures", () => {
  it("writes the JSON rules into the instructions even when strict JSON is accepted", async () => {
    const id = await newDeck("rules");
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "A deck about salicylic acid limits" } }));
    expect((await waitJob(jobId)).status).toBe("done");
    expect(gw.formats.at(-1)).toBe("json_schema");
    expect(gw.systems.at(-1)).toMatch(/OUTPUT FORMAT: answer with one JSON object and nothing else[\s\S]*"slides"/);
  });

  it("logs what the model sent, trimmed to 500 characters, when it is not JSON", async () => {
    gw.garbage = true;
    const id = await newDeck("garbage");
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "A deck about salicylic acid limits" } }));
    const job = await waitJob(jobId);
    gw.garbage = false;
    expect(job.status).toBe("failed");
    const line = (job.progress as string[]).find((l) => l.includes("Model reply (first 500 characters)"))!;
    expect(line).toMatch(/Sorry, I can only help with questions about cooking/);
    const snippet = line.split("Model reply (first 500 characters): ")[1];
    expect(snippet.length).toBe(501); // 500 characters and the ellipsis
  });
});

describe("Auto: the AI chooses the angle, audience, length and layouts", () => {
  it("refuses an empty brief without Auto and accepts it with Auto", async () => {
    const id = await newDeck("auto");
    const bare = await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "" } });
    expect(bare.statusCode).toBe(400);
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "", auto: true, slides: 20, angle: "brand-pitch", features: { charts: true, diagrams: true } } }));
    const job = await waitJob(jobId);
    expect(job.status, job.error ?? "").toBe("done");
    expect(gw.plans).toBe(1);
    expect(gw.planUser).toMatch(/Build the strongest professional deck/);
    const log = job.progress.join("\n");
    expect(log).toMatch(/Auto: Medical affairs \/ HCP education for dermatologists, 7 slides, using tables, kpis\. The sources are clinical/);
    // The writer is told what the planner chose, not what the form carried.
    const sys = gw.systems.at(-1)!;
    expect(sys).toMatch(/ANGLE: Medical affairs \/ HCP education/);
    expect(sys).toMatch(/AUDIENCE: dermatologists/);
    expect(sys).toMatch(/exactly 7 slides/);
    expect(sys).toMatch(/SLIDE LAYOUTS you may use: title, bullets, two-column, cards, quote, closing, table, kpi\./);
    expect(gw.users.at(-1)).toMatch(/DECK TITLE \(use it\): Salicylic acid: 2% cap/);
    const deck = J(await app.inject({ method: "GET", url: `/api/decks/${id}` })).deck;
    expect(deck.angle).toBe("medical-affairs");
    expect(deck.brief).toMatchObject({ auto: true, text: "", slides: 7 });
    expect(deck.brief.features).toMatchObject({ charts: false, diagrams: false, kpis: true, notes: true, citations: true });
  });

  it("writes the deck craft rules into every writer's instructions", () => {
    const sys = gw.systems.at(-1)!;
    expect(sys).toMatch(/DECK CRAFT/);
    expect(sys).toMatch(/`kicker` on every content slide/);
    expect(sys).toMatch(/action titles/);
    expect(sys).toMatch(/YES \/ PARTLY \/ NO/);
    expect(sys).toMatch(/- cards: 2 to 6 numbered cards/);
  });

  it("asks the planner for settings only, and gives a chatty model one more turn", async () => {
    gw.planProse = 1;
    const before = gw.plans;
    const id = await newDeck("auto-retry");
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "", auto: true } }));
    const job = await waitJob(jobId);
    expect(job.status, job.error ?? "").toBe("done");
    expect(gw.plans - before).toBe(2);
    expect(gw.planLastMsgs[1].content).toMatch(/^TASK: choose the settings for a slide deck\. Do NOT write the deck/);
    expect(gw.planLastMsgs.at(-2)).toMatchObject({ role: "assistant" });
    expect(gw.planLastMsgs.at(-1)!.content).toMatch(/That answer is not JSON/);
  });

  it("still writes the deck when the model never gives a plan", async () => {
    gw.planProse = 2;
    const id = await newDeck("auto-noplan");
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "", auto: true, angle: "training" } }));
    const job = await waitJob(jobId);
    expect(job.status, job.error ?? "").toBe("done");
    const log = job.progress.join("\n");
    expect(log).toMatch(/Auto: the model did not return a plan \(The model answered with something that is not JSON\), so standard settings are used/);
    expect(log).toMatch(/Here is a professional presentation deck/);
    expect(gw.systems.at(-1)).toMatch(/exactly 10 slides/);
  });

  it("recovers the deck itself when the first reply is prose", async () => {
    gw.deckProse = 1;
    const id = await newDeck("deck-retry");
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "A deck about salicylic acid limits" } }));
    expect((await waitJob(jobId)).status).toBe("done");
  });

  it("leaves the choices alone without Auto", async () => {
    const before = gw.plans;
    const id = await newDeck("manual");
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "A deck about salicylic acid limits", slides: 8, angle: "training" } }));
    await waitJob(jobId);
    expect(gw.plans).toBe(before);
    expect(gw.systems.at(-1)).toMatch(/exactly 8 slides/);
  });
});

describe("picture generation", () => {
  it("asks Imagen and DALL-E for bytes, and leaves gpt-image alone", async () => {
    const { generateImage } = await import("../src/llm/client.js");
    const auth = { apiKey: "k", baseUrl: process.env.OPENAI_BASE_URL!, model: "writer-1", imageModel: "imagen-4.0-generate-001" };
    expect((await generateImage(auth, "a lab bench")).length).toBeGreaterThan(0);
    await generateImage({ ...auth, imageModel: "gpt-image-1" }, "a lab bench");
    expect(gw.imageBodies.map((b) => b.response_format)).toEqual(["b64_json", undefined]);
  });

  it("Test says a picture model cannot be the writer", async () => {
    const t = J(await app.inject({ method: "POST", url: "/api/settings/test-key", payload: { model: "gemini-2.5-flash-preview-image" } }));
    expect(t.message).toMatch(/gemini-2\.5-flash-preview-image makes pictures or speech, not text, so it cannot write a deck/);
    expect(t.vision).toBe("unknown");
  });

  it("offers Google Gemini as a named endpoint", async () => {
    const s = J(await app.inject({ method: "GET", url: "/api/settings" }));
    expect(s.providers).toContainEqual({ id: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" });
  });
});

describe("pictures the writer may not be able to read", () => {
  let id = "";
  it("stops before writing when the model cannot read an uploaded picture, naming it", async () => {
    id = await newDeck("pictures");
    await app.inject({ method: "POST", url: `/api/decks/${id}/sources`, ...multipart([{ name: "label-table.png", content: pngBytes() }]) });
    const r = await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "What the label table says about limits" } });
    expect(r.statusCode).toBe(409);
    expect(J(r)).toMatchObject({ error: "pictures_unreadable", pictures: ["label-table.png"] });
    expect(J(r).message).toMatch(/writer-1\) cannot read pictures/);
  });

  it("writes when the user chooses to go on, and says the picture was not read", async () => {
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "What the label table says about limits", allowUnreadPictures: true } }));
    const job = await waitJob(jobId);
    expect(job.status).toBe("done");
    expect(job.progress.join("\n")).toMatch(/1 picture source used only as slide pictures: writer-1 cannot read pictures/);
    expect(gw.reads).toBe(0);
  });

  it("Test in Settings rechecks and reports picture reading", async () => {
    gw.vision = true;
    const t = J(await app.inject({ method: "POST", url: "/api/settings/test-key", payload: {} }));
    expect(t.vision).toBe("yes");
    expect(t.message).toMatch(/writer-1 reads pictures/);
    expect(J(await app.inject({ method: "GET", url: "/api/settings" })).vision).toBe("yes");
  });

  it("gives a thinking model room to answer the picture check", async () => {
    gw.thinking = true;
    const t = J(await app.inject({ method: "POST", url: "/api/settings/test-key", payload: {} }));
    gw.thinking = false;
    expect(t.vision).toBe("yes");
  });

  it("does not read a silent answer as 'cannot read pictures'", async () => {
    gw.silent = true;
    const t = J(await app.inject({ method: "POST", url: "/api/settings/test-key", payload: {} }));
    gw.silent = false;
    expect(t.vision).toBe("unknown");
    // Put the remembered answer back for the tests below.
    expect(J(await app.inject({ method: "POST", url: "/api/settings/test-key", payload: {} })).vision).toBe("yes");
  });

  it("reads an uploaded picture once and gives its content to the writer", async () => {
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "What the label table says about limits" } }));
    const job = await waitJob(jobId);
    expect(job.status).toBe("done");
    expect(job.progress.join("\n")).toMatch(/Reading picture 1 with writer-1: label-table.png/);
    expect(gw.users.at(-1)).toMatch(/### Picture: label-table.png[\s\S]*Effective \| 1 Jan 2027/);
    const again = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "Again" } }));
    await waitJob(again.jobId);
    expect(gw.reads).toBe(1);
  });

  it("leaves OneDrive pictures alone: they are slide pictures, not documents", async () => {
    const { unreadPictures } = await import("../src/store.js");
    const rows = [
      { id: "a", name: "photo.jpg", rel_path: null, kind: "image", chars: 0, text: "", media_id: "m", remote_id: "od1" },
      { id: "b", name: "scan.png", rel_path: null, kind: "image", chars: 0, text: "", media_id: "m", remote_id: null },
      { id: "c", name: "read.png", rel_path: null, kind: "image", chars: 0, text: "NONE", media_id: "m", remote_id: null },
    ];
    expect(unreadPictures(rows).map((r) => r.name)).toEqual(["scan.png"]);
  });
});

describe("a picture reader beside a writer that cannot see", () => {
  const rd = { reads: 0, probes: 0, auths: [] as string[] };
  let readerServer: http.Server;
  let readerBase = "";

  beforeAll(async () => {
    readerServer = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        rd.auths.push(String(req.headers.authorization));
        res.writeHead(200, { "content-type": "application/json" });
        if (req.url === "/v1/models") return res.end(JSON.stringify({ data: [{ id: "models/reader-1" }] }));
        const text = String((JSON.parse(raw).messages?.[1]?.content ?? []).find?.((p: { type: string }) => p.type === "text")?.text ?? "");
        if (/What colour/.test(text)) rd.probes++;
        else rd.reads++;
        res.end(JSON.stringify({ choices: [{ message: { content: /What colour/.test(text) ? "Red" : "Poster claim | Reduces acne lesions by 42% in 4 weeks" }, finish_reason: "stop" }] }));
      });
    });
    await new Promise<void>((r) => readerServer.listen(0, "127.0.0.1", () => r()));
    readerBase = `http://127.0.0.1:${(readerServer.address() as AddressInfo).port}/v1`;
  });

  afterAll(async () => {
    readerServer.closeAllConnections();
    await new Promise<void>((r) => readerServer.close(() => r()));
  });

  it("tests the reader on its own endpoint and key", async () => {
    const t = J(await app.inject({ method: "POST", url: "/api/settings/reader/test", payload: { baseUrl: readerBase, key: "rk-reader", model: "reader-1" } }));
    expect(t).toMatchObject({ ok: true, vision: "yes" });
    expect(t.models).toEqual(["reader-1"]);
    expect(t.message).toMatch(/reader-1 reads pictures: it will read uploaded pictures for the writer/);
  });

  it("has the reader read the poster and the writer write from its text", async () => {
    gw.vision = false;
    await app.inject({ method: "PUT", url: "/api/settings/reader", payload: { baseUrl: readerBase, key: "rk-reader", model: "reader-1" } });
    const s = J(await app.inject({ method: "GET", url: "/api/settings" }));
    expect(s.reader).toMatchObject({ baseUrl: readerBase, model: "reader-1", complete: true });
    expect(s.reader.key).not.toContain("rk-reader");
    const id = await newDeck("reader");
    await app.inject({ method: "POST", url: `/api/decks/${id}/sources`, ...multipart([{ name: "poster.png", content: pngBytes() }]) });
    const r = await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "What the poster shows" } });
    expect(r.statusCode).toBe(200); // no "cannot read pictures" stop: the reader can
    const job = await waitJob(J(r).jobId);
    expect(job.status, job.error ?? "").toBe("done");
    expect(job.progress.join("\n")).toMatch(/Reading picture 1 with reader-1: poster.png/);
    expect(rd.reads).toBe(1);
    expect(gw.users.at(-1)).toMatch(/### Picture: poster.png[\s\S]*Reduces acne lesions by 42% in 4 weeks/);
    // Each key goes only to its own endpoint.
    expect(rd.auths.every((a) => a === "Bearer rk-reader")).toBe(true);
  });

  it("forgets the reader's key when its endpoint changes, and turns off", async () => {
    await app.inject({ method: "PUT", url: "/api/settings/reader", payload: { baseUrl: "https://example.org/v1" } });
    expect(J(await app.inject({ method: "GET", url: "/api/settings" })).reader).toMatchObject({ key: "", complete: false });
    await app.inject({ method: "DELETE", url: "/api/settings/reader" });
    expect(J(await app.inject({ method: "GET", url: "/api/settings" })).reader).toMatchObject({ baseUrl: "", model: "", complete: false });
  });
});
