import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// The AI steps against a stand-in endpoint: condensed notes are cached on the
// source, so a second generate on the same deck with the same brief makes no
// condense call; a changed brief or changed text reads the source again; the
// design pass goes out in parallel batches and nothing is applied when one
// batch fails; pictures are read and generated side by side.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-condense-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "0";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "sk-test-writer";
process.env.OPENAI_MODEL = "writer-1";
// Small enough that one pasted source goes over it; condensing itself only cuts a source of 6,000+ characters.
process.env.SOURCE_BUDGET = "5000";

type App = Awaited<ReturnType<typeof import("../src/index.js")["buildApp"]>>;
let app: App;
let server: http.Server;
const J = (r: { json: () => unknown }) => r.json() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const CONDENSE_OPENING = "You extract the material a slide writer will need";
const STUDIO_CONDENSE_OPENING = "You extract the facts a writer will need";
const gw = {
  condense: [] as string[],
  studioCondense: 0,
  designs: [] as string[],
  designFail: false,
  designReplies: [] as Record<string, unknown>[],
  inFlight: 0,
  mostInFlight: 0,
  delay: 0,
  deckAllText: 0,
  images: 0,
  decks: 0,
  deckSystems: [] as string[],
};

async function waitJob(id: string) {
  for (let i = 0; i < 300; i++) {
    const j = J(await app.inject({ method: "GET", url: `/api/jobs/${id}` }));
    if (j.status === "done" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("job did not finish");
}

const bl = (title: string, bullets: string[]) => ({ layout: "bullets", kicker: null, title, subtitle: null, body: null, bullets, leftHeading: null, rightHeading: null, bulletsRight: [], chart: null, table: null, diagram: null, kpi: [], cards: [], image: null, quote: null, notes: null, citations: [] });

beforeAll(async () => {
  const { mockDeckJson } = await import("../src/llm/mock.js");
  const { DEFAULT_FEATURES } = await import("@slidecraft/shared");
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      gw.inFlight++;
      gw.mostInFlight = Math.max(gw.mostInFlight, gw.inFlight);
      if (gw.delay) await new Promise((r) => setTimeout(r, gw.delay));
      gw.inFlight--;
      const reply = (content: string) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }));
      };
      if (req.url === "/v1/images/generations") {
        gw.images++;
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ data: [{ b64_json: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64") }] }));
      }
      if (req.url === "/v1/models") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ data: [{ id: "writer-1" }] }));
      }
      const body = JSON.parse(raw || "{}");
      const system = String(body.messages?.[0]?.content ?? "");
      const user = String(body.messages?.[1]?.content ?? "");
      if (system.startsWith(CONDENSE_OPENING)) {
        gw.condense.push(user);
        return reply(`Notes: the limit is 2% in rinse-off products. Effective 1 Jan 2027. (${user.length} characters read)`);
      }
      if (system.startsWith(STUDIO_CONDENSE_OPENING)) {
        gw.studioCondense++;
        return reply("Notes: the limit is 2% in rinse-off products.");
      }
      if (body.response_format?.json_schema?.name === "design" || /^You are the designer/.test(system)) {
        gw.designs.push(user);
        // The small batch is refused every time it is asked (a 400 earns one retry in plain JSON mode).
        if (gw.designFail && /SLIDES TO REDESIGN \(4\)/.test(user)) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: { message: "The design request was refused." } }));
        }
        return reply(JSON.stringify(gw.designReplies.shift() ?? { slides: [] }));
      }
      if (body.response_format?.json_schema?.name === "quiz") {
        return reply(JSON.stringify({ title: "Quiz", questions: [{ question: "Limit?", options: ["1%", "2%", "3%", "4%"], answer: 1, explanation: "2% in rinse-off.", source: "notes" }] }));
      }
      gw.decks++;
      gw.deckSystems.push(`${system.slice(0, 20)} msgs=${body.messages.length}`);
      if (gw.deckAllText > 0) {
        gw.deckAllText--;
        return reply(JSON.stringify({ title: "B5", subtitle: null, slides: Array.from({ length: 12 }, (_, i) => bl(`Point ${i + 1}`, ["one fact", "another fact", "a third fact"])) }));
      }
      const d = mockDeckJson({ prompt: "x", lang: "en", angle: "custom", slides: 6, features: DEFAULT_FEATURES, imageMode: "none" }, []);
      if (body.messages?.[0]?.content?.includes("image.prompt describes a photograph")) {
        // Three frames asking for a picture each.
        d.slides = [d.slides[0], ...[1, 2, 3].map((i) => ({ ...bl(`Picture ${i}`, []), layout: "image", image: { prompt: `A clean laboratory bench ${i}`, caption: `Bench ${i}` } })), d.slides[d.slides.length - 1]];
      }
      reply(JSON.stringify(d));
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
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function newDeck(title: string) {
  return J(await app.inject({ method: "POST", url: "/api/decks", payload: { title } })).id as string;
}

const LONG = Array.from({ length: 120 }, (_, i) => `Paragraph ${i + 1}: salicylic acid is limited to 2% in rinse-off products under entry 98 of Annex III.`).join("\n");

async function generate(id: string, prompt: string) {
  const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt, slides: 6 } }));
  return waitJob(jobId);
}

describe("condensed notes are cached on the source", () => {
  let id = "";
  beforeAll(async () => {
    id = await newDeck("cached");
    expect(LONG.length).toBeGreaterThan(6000);
    await app.inject({ method: "POST", url: `/api/decks/${id}/sources/text`, payload: { name: "limits.txt", text: LONG } });
  });

  it("condenses a long source once, and says how many parts were cached", async () => {
    gw.condense = [];
    const job = await generate(id, "What the limit means for rinse-off products");
    expect(job.status).toBe("done");
    expect(gw.condense).toHaveLength(1);
    expect(gw.condense[0]).toMatch(/^### limits\.txt\n/);
    expect(job.progress.join("\n")).toMatch(/0 of 1 part from cache/);
    expect(job.progress.join("\n")).toMatch(/Condensing 1 part of 1 source/);
  });

  it("makes no condense call on a second generate with the same brief", async () => {
    gw.condense = [];
    const before = gw.decks;
    const job = await generate(id, "What the limit means for rinse-off products");
    expect(job.status).toBe("done");
    expect(gw.condense).toHaveLength(0);
    // One fresh writer call (a correction round carries 4 messages, a fresh request 2): the sources went straight to the writer.
    expect(gw.deckSystems.slice(before).filter((x) => x.endsWith("msgs=2"))).toHaveLength(1);
    expect(job.progress.join("\n")).toMatch(/1 of 1 part from cache/);
    expect(job.progress.join("\n")).not.toMatch(/Condensing/);
  });

  it("hands the writer the cached notes, not the raw text", async () => {
    const { listSources } = await import("../src/store.js");
    const row = listSources(id)[0];
    expect(row.condensed).toMatch(/^Notes: the limit is 2%/);
    expect(row.condensed_key).toMatch(/^[0-9a-f]{64}$/);
    const reply = JSON.parse(fs.readFileSync(path.join(tmp, "writer-replies", `${id}.json`), "utf8"));
    expect(reply.slides.length).toBeGreaterThan(0);
  });

  it("reads the source again when the brief changes, because the instruction changed", async () => {
    gw.condense = [];
    const job = await generate(id, "A training deck on the same limit");
    expect(job.status).toBe("done");
    expect(gw.condense).toHaveLength(1);
    expect(job.progress.join("\n")).toMatch(/0 of 1 part from cache/);
  });

  it("reads the source again when its text changes", async () => {
    const { getDb } = await import("../src/db.js");
    const { listSources } = await import("../src/store.js");
    const row = listSources(id)[0];
    getDb().prepare("UPDATE sources SET text = ? WHERE id = ?").run(LONG + "\nParagraph 121: a new line.", row.id);
    gw.condense = [];
    const job = await generate(id, "A training deck on the same limit");
    expect(job.status).toBe("done");
    expect(gw.condense).toHaveLength(1);
  });

  it("caches the Studio's own condensing under its own instruction", async () => {
    const run = async () => waitJob(J(await app.inject({ method: "POST", url: `/api/decks/${id}/studio`, payload: { kind: "quiz" } })).jobId);
    gw.studioCondense = 0;
    expect((await run()).status).toBe("done");
    expect(gw.studioCondense).toBe(1);
    expect((await run()).status).toBe("done");
    expect(gw.studioCondense).toBe(1);
  });

  it("cuts a very long source into parts and condenses them side by side", async () => {
    const { condenseAll } = await import("../src/llm/generate.js");
    const text = "x".repeat(60000 * 3 + 10);
    gw.condense = [];
    gw.delay = 60;
    gw.mostInFlight = 0;
    const lines: string[] = [];
    const auth = { apiKey: "k", model: "writer-1", imageModel: "i", baseUrl: process.env.OPENAI_BASE_URL! };
    const out = await condenseAll([{ name: "big.txt", kind: "text", text }], auth, CONDENSE_OPENING + " (test)", (l) => lines.push(l));
    gw.delay = 0;
    expect(gw.condense).toHaveLength(4);
    expect(gw.mostInFlight).toBeGreaterThanOrEqual(2);
    expect(lines.join("\n")).toMatch(/0 of 4 parts from cache/);
    expect(out[0].text.split("\n\n")).toHaveLength(4);
  });
});

describe("independent model calls run side by side", () => {
  it("sends the design pass in batches at once and applies every batch's answer", async () => {
    gw.deckAllText = 1;
    gw.designs = [];
    gw.designReplies = [
      { slides: [{ index: 1, slide: { layout: "kpi", title: "Point 2", kpi: [{ label: "limit", value: "2%" }, { label: "from", value: "2027" }] } }] },
      { slides: [{ index: 9, slide: { layout: "kpi", title: "Point 10", kpi: [{ label: "limit", value: "2%" }, { label: "from", value: "2027" }] } }] },
    ];
    gw.delay = 80;
    gw.mostInFlight = 0;
    const id = await newDeck("batched-design");
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "A deck about vitamin B5", features: { kpis: true, charts: true } } }));
    const job = await waitJob(jobId);
    gw.delay = 0;
    expect(job.status).toBe("done");
    expect(gw.designs).toHaveLength(2);
    expect(gw.designs[0]).toMatch(/SLIDES TO REDESIGN \(8\)/);
    expect(gw.designs[1]).toMatch(/SLIDES TO REDESIGN \(4\)/);
    expect(gw.mostInFlight).toBeGreaterThanOrEqual(2);
    expect(job.progress.join("\n")).toMatch(/Design: 2 slides redrawn as visuals/);
    const slides = J(await app.inject({ method: "GET", url: `/api/decks/${id}` })).deck.slides as { layout: string; title: string }[];
    expect(slides[1]).toMatchObject({ layout: "kpi", title: "Point 2" });
    expect(slides[9]).toMatchObject({ layout: "kpi", title: "Point 10" });
  });

  it("applies nothing from the design pass when one batch fails, and still delivers the deck", async () => {
    gw.deckAllText = 1;
    gw.designs = [];
    gw.designFail = true;
    gw.designReplies = [{ slides: [{ index: 1, slide: { layout: "kpi", title: "Point 2", kpi: [{ label: "limit", value: "2%" }, { label: "from", value: "2027" }] } }] }];
    const id = await newDeck("design-half-fails");
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "A deck about vitamin B5", features: { kpis: true, charts: true } } }));
    const job = await waitJob(jobId);
    gw.designFail = false;
    expect(job.status).toBe("done");
    expect(job.progress.join("\n")).toMatch(/Design pass skipped: .*refused/);
    const slides = J(await app.inject({ method: "GET", url: `/api/decks/${id}` })).deck.slides as { layout: string; title: string }[];
    // Slide 1 came back from the batch that answered; it is not applied, because the other batch did not.
    expect(slides[1].layout).not.toBe("kpi");
  });

  it("generates the pictures a deck asks for at the same time", async () => {
    gw.images = 0;
    gw.delay = 80;
    gw.mostInFlight = 0;
    const id = await newDeck("pictures");
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${id}/generate`, payload: { prompt: "A deck with pictures", features: { images: true }, imageMode: "generate" } }));
    const job = await waitJob(jobId);
    gw.delay = 0;
    expect(job.status).toBe("done");
    expect(gw.images).toBe(3);
    expect(gw.mostInFlight).toBeGreaterThanOrEqual(2);
    const log = job.progress.join("\n");
    expect(log).toMatch(/Generating picture 1: A clean laboratory bench 1/);
    expect(log).toMatch(/Generating picture 3: A clean laboratory bench 3/);
    const slides = J(await app.inject({ method: "GET", url: `/api/decks/${id}` })).deck.slides as { layout: string; image?: { mediaId?: string } }[];
    expect(slides.filter((s) => s.layout === "image" && s.image?.mediaId)).toHaveLength(3);
  });
});
