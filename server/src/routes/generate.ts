import type { FastifyInstance } from "fastify";
import { getDb, now, uid } from "../db.js";
import { listSources, loadDeck, saveDeck, unreadPictures } from "../store.js";
import { config } from "../config.js";
import { resolveAuth } from "../settings.js";
import { visionFor } from "../llm/vision.js";
import { pictureAuth, readerSettings } from "../reader.js";
import { AUTO_PROMPT, feedbackInstruction, normaliseParams, rewriteSlide, runApplyFeedback, runGenerate } from "../llm/generate.js";
import { cleanBrief, scanSlide } from "@slidecraft/shared";
import { LlmError } from "../llm/client.js";

export async function generateRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/decks/:id/generate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deck = loadDeck(req.user.id, id);
    if (!deck) return reply.code(404).send({ error: "not_found" });
    const p = normaliseParams((req.body ?? {}) as Record<string, unknown>, deck.angle);
    const typed = p.prompt;
    if (!p.prompt && p.auto) p.prompt = AUTO_PROMPT;
    if (!p.prompt) return reply.code(400).send({ error: "prompt_required" });
    const running = getDb().prepare("SELECT id FROM jobs WHERE deck_id = ? AND status IN ('queued','running')").get(id);
    if (running) return reply.code(409).send({ error: "already_running", jobId: (running as { id: string }).id });
    // Pictures uploaded as sources that the writer model cannot read would be
    // written around blind. Stop and say so, unless the user already chose to go on.
    const allow = !!(req.body as { allowUnreadPictures?: boolean } | undefined)?.allowUnreadPictures;
    const auth = config.mockLlm ? null : resolveAuth(req.user.id);
    const reader = config.mockLlm ? null : pictureAuth(req.user.id);
    if (auth && reader && !allow) {
      const pics = unreadPictures(listSources(id));
      if (pics.length && (await visionFor(req.user.id, reader)) === "no") {
        const names = pics.map((r) => r.rel_path || r.name);
        return reply.code(409).send({
          error: "pictures_unreadable",
          message: `The ${readerSettings(req.user.id).complete ? "picture reader" : "writer"} model (${reader.model}) cannot read pictures. ${names.length} picture source${names.length === 1 ? "" : "s"} (${names.slice(0, 5).join(", ")}${names.length > 5 ? ", …" : ""}) would be used only as slide pictures; any text, table or figure inside them would not reach the deck.`,
          pictures: names,
        });
      }
    }
    // Keep the choices, so Regenerate in the editor starts from them.
    const b = (req.body ?? {}) as { brief?: Record<string, unknown> };
    deck.brief = cleanBrief({ text: typed, ...(b.brief ?? {}), auto: p.auto, slides: p.slides, imageMode: p.imageMode, features: { ...p.features } });
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

  // Feedback on one slide: saved for later, or applied now together with any
  // feedback already waiting on it. Applying reopens the slide for sign-off.
  app.post("/api/decks/:id/slides/:sid/feedback", async (req, reply) => {
    const { id, sid } = req.params as { id: string; sid: string };
    const deck = loadDeck(req.user.id, id);
    if (!deck) return reply.code(404).send({ error: "not_found" });
    const idx = deck.slides.findIndex((s) => s.id === sid);
    if (idx < 0) return reply.code(404).send({ error: "slide_not_found" });
    const b = (req.body ?? {}) as { text?: string; apply?: boolean };
    const text = String(b.text ?? "").trim().slice(0, 4000);
    const slide = deck.slides[idx];
    const review = { ok: false, feedback: [...(slide.review?.feedback ?? [])] };
    if (text) review.feedback.push({ text, at: now() });
    const pending = review.feedback.filter((f) => !f.appliedAt);
    if (!pending.length) return reply.code(400).send({ error: "empty", message: "Write what should change first." });
    if (!b.apply) {
      deck.slides[idx] = { ...slide, review };
      saveDeck(req.user.id, deck);
      return { slide: deck.slides[idx], slop: scanSlide(deck.slides[idx], deck.lang) };
    }
    try {
      const s = await rewriteSlide(req.user.id, deck, { ...slide, review }, feedbackInstruction(pending.map((f) => f.text)));
      const at = now();
      s.review = { ok: false, feedback: review.feedback.map((f) => (f.appliedAt ? f : { ...f, appliedAt: at })) };
      deck.slides[idx] = s;
      saveDeck(req.user.id, deck);
      return { slide: s, slop: scanSlide(s, deck.lang) };
    } catch (e) {
      // The feedback is kept, so nothing typed is lost when the writer fails.
      deck.slides[idx] = { ...slide, review };
      saveDeck(req.user.id, deck);
      const code = e instanceof LlmError ? e.code : "error";
      return reply.code(code === "no_key" ? 400 : 502).send({ error: code, message: `${(e as Error).message} Your feedback is saved on the slide.` });
    }
  });

  app.post("/api/decks/:id/slides/:sid/ok", async (req, reply) => {
    const { id, sid } = req.params as { id: string; sid: string };
    const deck = loadDeck(req.user.id, id);
    if (!deck) return reply.code(404).send({ error: "not_found" });
    const idx = deck.slides.findIndex((s) => s.id === sid);
    if (idx < 0) return reply.code(404).send({ error: "slide_not_found" });
    const ok = (req.body as { ok?: boolean } | undefined)?.ok !== false;
    const cur = deck.slides[idx].review ?? { ok: false, feedback: [] };
    deck.slides[idx] = { ...deck.slides[idx], review: { ...cur, ok, okAt: ok ? now() : undefined } };
    if (!ok) delete deck.slides[idx].review!.okAt;
    saveDeck(req.user.id, deck);
    return { slide: deck.slides[idx], slop: scanSlide(deck.slides[idx], deck.lang) };
  });

  app.post("/api/decks/:id/feedback/apply", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deck = loadDeck(req.user.id, id);
    if (!deck) return reply.code(404).send({ error: "not_found" });
    if (!deck.slides.some((s) => (s.review?.feedback ?? []).some((f) => !f.appliedAt))) return reply.code(400).send({ error: "empty", message: "No slide has feedback waiting." });
    const running = getDb().prepare("SELECT id FROM jobs WHERE deck_id = ? AND status IN ('queued','running')").get(id);
    if (running) return reply.code(409).send({ error: "already_running", jobId: (running as { id: string }).id });
    const jobId = uid("job");
    getDb().prepare("INSERT INTO jobs (id, user_id, deck_id, kind, status, progress, created_at, updated_at) VALUES (?, ?, ?, 'feedback', 'queued', '[]', ?, ?)").run(jobId, req.user.id, id, now(), now());
    void runApplyFeedback(jobId, req.user.id, id);
    return { jobId };
  });
}
