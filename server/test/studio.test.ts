import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The Studio and the chat, end to end through the API with the mock writer:
// every output kind is made, listed, renamed, read and deleted; a notebook
// with no sources is refused; a chat answer cites only sources that exist.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-studio-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "1";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";
process.env.AI_MODELS = "model-a=Model A, model-b";

type App = Awaited<ReturnType<typeof import("../src/index.js")["buildApp"]>>;
let app: App;
const J = (r: { json: () => any }) => r.json(); // eslint-disable-line @typescript-eslint/no-explicit-any

async function waitJob(id: string) {
  for (let i = 0; i < 200; i++) {
    const j = J(await app.inject({ method: "GET", url: `/api/jobs/${id}` }));
    if (j.status === "done" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("job did not finish");
}

let deckId = "";
beforeAll(async () => {
  app = await (await import("../src/index.js")).buildApp();
  await app.ready();
  deckId = J(await app.inject({ method: "POST", url: "/api/decks", payload: { title: "Salicylic acid" } })).id;
});
afterAll(async () => {
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("the Studio", () => {
  it("refuses to make anything from a notebook with no sources", async () => {
    const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/studio`, payload: { kind: "quiz" } });
    expect(r.statusCode).toBe(409);
    expect(J(r).error).toBe("no_sources");
    const g = await app.inject({ method: "POST", url: `/api/decks/${deckId}/guide` });
    expect(g.statusCode).toBe(409);
  });

  it("makes every kind of output from the sources, and keeps each one", async () => {
    await app.inject({ method: "POST", url: `/api/decks/${deckId}/sources/text`, payload: { name: "annex.txt", text: "Salicylic acid: 2% rinse-off, 0.5% leave-on. Not for children under 3." } });
    expect((await app.inject({ method: "POST", url: `/api/decks/${deckId}/studio`, payload: { kind: "podcast" } })).statusCode).toBe(400);
    for (const kind of ["report", "flashcards", "quiz", "mindmap", "table", "infographic"]) {
      const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/studio`, payload: { kind, amount: "fewer", difficulty: "hard", format: "faq" } }));
      const job = await waitJob(jobId);
      expect(job.status, `${kind}: ${job.error}`).toBe("done");
      const o = J(await app.inject({ method: "GET", url: `/api/outputs/${job.result.outputId}` }));
      expect(o.kind).toBe(kind);
      expect(o.sourceCount).toBe(1);
    }
    const list = J(await app.inject({ method: "GET", url: `/api/decks/${deckId}/outputs` }));
    expect(list.map((o: { kind: string }) => o.kind).sort()).toEqual(["flashcards", "infographic", "mindmap", "quiz", "report", "table"]);
    const mind = list.find((o: { kind: string }) => o.kind === "mindmap");
    expect(mind.data.root.label).toBe("Salicylic acid");
    expect(mind.data.root.children.map((c: { label: string }) => c.label)).toEqual(["Limits", "Labelling"]);
    expect(list.find((o: { kind: string }) => o.kind === "report").data.format).toBe("faq");
  });

  it("does not hold up a deck being written", async () => {
    const { jobId } = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/studio`, payload: { kind: "flashcards" } }));
    const gen = await app.inject({ method: "POST", url: `/api/decks/${deckId}/generate`, payload: { prompt: "A deck" } });
    expect(gen.statusCode).toBe(200);
    await waitJob(jobId);
    await waitJob(J(gen).jobId);
  });

  it("saves, renames and deletes a note, and refuses an empty one", async () => {
    expect((await app.inject({ method: "POST", url: `/api/decks/${deckId}/outputs`, payload: { data: { text: " " } } })).statusCode).toBe(400);
    const n = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/outputs`, payload: { data: { text: "Rinse-off is 2%", question: "What is the limit?", citations: [{ source: "annex.txt", quote: "2%" }] } } }));
    expect(n.kind).toBe("note");
    expect(n.title).toBe("Rinse-off is 2%");
    expect(J(await app.inject({ method: "PUT", url: `/api/outputs/${n.id}`, payload: { title: "Limit" } })).title).toBe("Limit");
    expect(J(await app.inject({ method: "DELETE", url: `/api/outputs/${n.id}` })).ok).toBe(true);
    expect((await app.inject({ method: "GET", url: `/api/outputs/${n.id}` })).statusCode).toBe(404);
  });

  it("answers from the sources with a citation, and writes the notebook guide once until the sources change", async () => {
    const a = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/ask`, payload: { question: "What is the limit?", history: [{ role: "user", text: "hi" }] } }));
    expect(a.answer).toMatch(/2%/);
    expect(a.citations[0].source).toBe("annex.txt");
    expect(a.followUps.length).toBe(3);
    expect((await app.inject({ method: "POST", url: `/api/decks/${deckId}/ask`, payload: { question: "" } })).statusCode).toBe(400);
    const g1 = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/guide` }));
    expect(g1.questions.length).toBe(3);
    const g2 = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/guide` }));
    expect(g2.at).toBe(g1.at);
    await app.inject({ method: "POST", url: `/api/decks/${deckId}/sources/text`, payload: { name: "more.txt", text: "More." } });
    const g3 = J(await app.inject({ method: "POST", url: `/api/decks/${deckId}/guide` }));
    expect(g3.sourceKey).not.toBe(g1.sourceKey);
    // An editor autosave does not wipe the guide.
    const deck = J(await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).deck;
    await app.inject({ method: "PUT", url: `/api/decks/${deckId}`, payload: { ...deck, guide: undefined } });
    expect(J(await app.inject({ method: "GET", url: `/api/decks/${deckId}` })).deck.guide.at).toBe(g3.at);
  });

  it("lists the models the owner allows, and the outputs go when the notebook does", async () => {
    const m = J(await app.inject({ method: "GET", url: "/api/models" }));
    expect(m.models.map((x: { id: string }) => x.id)).toContain("model-a");
    expect(m.models.find((x: { id: string }) => x.id === "model-a").label).toBe("Model A");
    expect(m.open).toBe(false);
    await app.inject({ method: "DELETE", url: `/api/decks/${deckId}` });
    const { getDb } = await import("../src/db.js");
    expect((getDb().prepare("SELECT count(*) AS n FROM outputs").get() as { n: number }).n).toBe(0);
  });
});
