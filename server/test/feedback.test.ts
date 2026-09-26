import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Per-slide feedback: save it for later, apply it now, sign a slide off, and
// apply everything saved in one go.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-fb-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "1";
process.env.MOCK_LLM_DELAY_MS = "0";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

type App = Awaited<ReturnType<typeof import("../src/index.js")["buildApp"]>>;
let app: App;
let deckId = "";
let slides: { id: string; title: string; notes?: string; review?: { ok: boolean; feedback: { text: string; appliedAt?: string }[] } }[] = [];
const J = (r: { json: () => unknown }) => r.json() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function waitJob(id: string) {
  for (let i = 0; i < 100; i++) {
    const j = J(await app.inject({ method: "GET", url: `/api/jobs/${id}` }));
    if (j.status === "done" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("job did not finish");
}
const deck = async () => J(await app.inject({ method: "GET", url: `/api/decks/${deckId}` }));

beforeAll(async () => {
  const { buildApp } = await import("../src/index.js");
  app = await buildApp();
  deckId = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "FB" } })).id;
  const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/generate`, payload: { prompt: "A deck about labels and dates" } }));
  await waitJob(jobId);
  slides = (await deck()).deck.slides;
});

describe("slide feedback", () => {
  it("saves feedback for later without touching the slide", async () => {
    const s = slides[2];
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/slides/${s.id}/feedback`, payload: { text: "Add the effective date" } }));
    expect(r.slide.title).toBe(s.title);
    expect(r.slide.notes).toBe(s.notes);
    expect(r.slide.review.feedback).toHaveLength(1);
    expect(r.slide.review.feedback[0].appliedAt).toBeUndefined();
    expect(r.slide.review.ok).toBe(false);
  });

  it("applies saved and new feedback together, marks both applied and reopens the slide", async () => {
    const s = slides[2];
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/slides/${s.id}/feedback`, payload: { text: "Shorter title", apply: true } }));
    expect(r.slide.notes).toMatch(/mock rewrite: Apply this feedback[\s\S]*Add the effective date[\s\S]*Shorter title/);
    expect(r.slide.review.feedback.map((f: { appliedAt?: string }) => !!f.appliedAt)).toEqual([true, true]);
    expect(r.slide.review.ok).toBe(false);
    const stored = (await deck()).deck.slides[2];
    expect(stored.review.feedback).toHaveLength(2);
  });

  it("never sends the review to the writer as slide content", async () => {
    const s = slides[2];
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/slides/${s.id}/rewrite`, payload: { instruction: "tighten" } }));
    expect(r.slide.notes).not.toMatch(/"review"/);
    expect(r.slide.review.feedback).toHaveLength(2); // kept through a plain rewrite
  });

  it("refuses to apply when there is nothing to apply", async () => {
    const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/slides/${slides[2].id}/feedback`, payload: { apply: true } });
    expect(r.statusCode).toBe(400);
  });

  it("signs a slide off, and reopens it", async () => {
    const s = slides[1];
    const ok = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/slides/${s.id}/ok`, payload: { ok: true } }));
    expect(ok.slide.review).toMatchObject({ ok: true, feedback: [] });
    expect(ok.slide.review.okAt).toBeTruthy();
    const back = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/slides/${s.id}/ok`, payload: { ok: false } }));
    expect(back.slide.review.ok).toBe(false);
    expect(back.slide.review.okAt).toBeUndefined();
  });

  it("feedback given later on an OK slide reopens it", async () => {
    const s = slides[1];
    await app.inject({ method: "POST", url: `/api/decks/${deckId}/slides/${s.id}/ok`, payload: { ok: true } });
    const r = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/slides/${s.id}/feedback`, payload: { text: "Use the 2026 figure" } }));
    expect(r.slide.review.ok).toBe(false);
  });

  it("applies every slide's waiting feedback as one job", async () => {
    await app.inject({ method: "POST", url: `/api/decks/${deckId}/slides/${slides[4].id}/feedback`, payload: { text: "Make it a table" } });
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/feedback/apply` }));
    const job = await waitJob(jobId);
    expect(job.status).toBe("done");
    expect(job.progress.join("\n")).toMatch(/2 slides with feedback waiting/);
    const d = (await deck()).deck;
    expect(d.slides[1].notes).toMatch(/Use the 2026 figure/);
    expect(d.slides[4].notes).toMatch(/Make it a table/);
    const waiting = d.slides.flatMap((x: { review?: { feedback: { appliedAt?: string }[] } }) => (x.review?.feedback ?? []).filter((f) => !f.appliedAt));
    expect(waiting).toHaveLength(0);
    const again = await app.inject({ method: "POST", url: `/api/decks/${deckId}/feedback/apply` });
    expect(again.statusCode).toBe(400);
  });

  it("keeps reviews through an editor save", async () => {
    const d = (await deck()).deck;
    const r = J(await app.inject({ method: "PUT", url: `/api/decks/${deckId}`, payload: d }));
    expect(r.deck.slides[2].review.feedback).toHaveLength(2);
  });
});
