import type { FastifyInstance } from "fastify";
import { getDb, now, uid } from "../db.js";
import { loadDeck, saveDeck } from "../store.js";
import { normaliseParams, rewriteSlide, runGenerate } from "../llm/generate.js";
import { cleanBrief, scanSlide } from "@slidecraft/shared";
import { LlmError } from "../llm/client.js";

export async function generateRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/decks/:id/generate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deck = loadDeck(req.user.id, id);
    if (!deck) return reply.code(404).send({ error: "not_found" });
    const p = normaliseParams((req.body ?? {}) as Record<string, unknown>, deck.angle);
    if (!p.prompt) return reply.code(400).send({ error: "prompt_required" });
    const running = getDb().prepare("SELECT id FROM jobs WHERE deck_id = ? AND status IN ('queued','running')").get(id);
    if (running) return reply.code(409).send({ error: "already_running", jobId: (running as { id: string }).id });
    // Keep the choices, so Regenerate in the editor starts from them.
    const b = (req.body ?? {}) as { brief?: Record<string, unknown> };
    deck.brief = cleanBrief({ text: p.prompt, ...(b.brief ?? {}), slides: p.slides, imageMode: p.imageMode, features: { ...p.features } });
    saveDeck(req.user.id, deck);
    const jobId = uid("job");
    getDb().prepare("INSERT INTO jobs (id, user_id, deck_id, kind, status, progress, created_at, updated_at) VALUES (?, ?, ?, 'generate', 'queued', '[]', ?, ?)").run(jobId, req.user.id, id, now(), now());
    // Not awaited: the client polls /api/jobs/:id.
    void runGenerate(jobId, req.user.id, id, p);
    return { jobId };
  });

  app.get("/api/jobs/:jid", async (req, reply) => {
    const { jid } = req.params as { jid: string };
    const row = getDb().prepare("SELECT id, deck_id, kind, status, progress, error, result, created_at, updated_at FROM jobs WHERE id = ? AND user_id = ?").get(jid, req.user.id) as
      | { id: string; deck_id: string; kind: string; status: string; progress: string; error: string | null; result: string | null; created_at: string; updated_at: string }
      | undefined;
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { id: row.id, deckId: row.deck_id, kind: row.kind, status: row.status, progress: JSON.parse(row.progress), error: row.error, result: row.result ? JSON.parse(row.result) : null, createdAt: row.created_at, updatedAt: row.updated_at };
  });

  app.post("/api/decks/:id/slides/:sid/rewrite", async (req, reply) => {
    const { id, sid } = req.params as { id: string; sid: string };
    const deck = loadDeck(req.user.id, id);
    if (!deck) return reply.code(404).send({ error: "not_found" });
    const idx = deck.slides.findIndex((s) => s.id === sid);
    if (idx < 0) return reply.code(404).send({ error: "slide_not_found" });
    const b = (req.body ?? {}) as { instruction?: string };
    const instruction = (b.instruction ?? "").trim() || "Rewrite this slide in plain, concrete language. Remove every banned phrase. Keep the facts.";
    try {
      const s = await rewriteSlide(req.user.id, deck, deck.slides[idx], instruction);
      deck.slides[idx] = s;
      saveDeck(req.user.id, deck);
      return { slide: s, slop: scanSlide(s, deck.lang) };
    } catch (e) {
      const code = e instanceof LlmError ? e.code : "error";
      return reply.code(code === "no_key" ? 400 : 502).send({ error: code, message: (e as Error).message });
    }
  });
}
