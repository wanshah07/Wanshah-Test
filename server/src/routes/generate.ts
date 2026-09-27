import type { FastifyInstance } from "fastify";
import { getDb, now, uid } from "../db.js";
import { listSources, loadDeck, saveDeck, unreadPictures, updateDeck, updateSlide } from "../store.js";
import { config } from "../config.js";
import { resolveAuth } from "../settings.js";
import { visionFor } from "../llm/vision.js";
import { pictureAuth, readerSettings } from "../reader.js";
import { AUTO_PROMPT, feedbackInstruction, normaliseParams, rewriteSlide, runApplyFeedback, runGenerate } from "../llm/generate.js";
import { cleanBrief, scanSlide } from "@slidecraft/shared";
import { LlmError } from "../llm/client.js";

/** The job writing or updating this deck, if one is running. */
function runningJob(deckId: string): string | null {
  return runningJobKind(deckId)?.id ?? null;
}

function runningJobKind(deckId: string): { id: string; kind: string } | null {
  const r = getDb().prepare("SELECT id, kind FROM jobs WHERE deck_id = ? AND status IN ('queued','running')").get(deckId) as { id: string; kind: string } | undefined;
  return r ?? null;
}

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
    // The picture check above waits on the network; a second request may have started a job meanwhile.
    // Checked again and claimed with no await in between, so only one job ever runs on a deck.
    const again = runningJob(id);
    if (again) return reply.code(409).send({ error: "already_running", jobId: again });
    const jobId = uid("job");
    getDb().prepare("INSERT INTO jobs (id, user_id, deck_id, kind, status, progress, created_at, updated_at) VALUES (?, ?, ?, 'generate', 'queued', '[]', ?, ?)").run(jobId, req.user.id, id, now(), now());
    // Keep the choices, so Regenerate in the editor starts from them.
    const b = (req.body ?? {}) as { brief?: Record<string, unknown> };
    const brief = cleanBrief({ text: typed, ...(b.brief ?? {}), auto: p.auto, slides: p.slides, imageMode: p.imageMode, features: { ...p.features } });
    updateDeck(req.user.id, id, (d) => void (d.brief = brief));
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
    const b = (req.body ?? {}) as { instruction?: unknown };
    if (b.instruction !== undefined && typeof b.instruction !== "string") return reply.code(400).send({ error: "invalid", message: "instruction must be text" });
    const busy = runningJob(id);
    if (busy) return reply.code(409).send({ error: "already_running", jobId: busy, message: "The deck is being written or updated. Wait for it to finish, then rewrite." });
    const instruction = (b.instruction ?? "").trim() || "Rewrite this slide in plain, concrete language. Remove every banned phrase. Keep the facts.";
    try {
      const s = await rewriteSlide(req.user.id, deck, deck.slides[idx], instruction);
      // Saved into the deck as it is now, so edits made while the writer worked are kept.
      // Feedback typed while the writer worked stays on the slide; the new content needs a new sign-off.
      const done = updateSlide(req.user.id, id, sid, (cur) => ({ ...s, ...(cur.review ? { review: { ...cur.review, ok: false } } : {}) }));
      if (!done) return reply.code(409).send({ error: "slide_gone", message: "The slide was deleted while it was being rewritten." });
      return { slide: done.slide, slop: scanSlide(done.slide, done.deck.lang) };
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
    const b = (req.body ?? {}) as { text?: unknown; apply?: boolean };
    if (b.text !== undefined && typeof b.text !== "string") return reply.code(400).send({ error: "invalid", message: "text must be text" });
    const text = String(b.text ?? "").trim().slice(0, 4000);
    const slide = deck.slides[idx];
    const review = { ok: false, feedback: [...(slide.review?.feedback ?? [])] };
    if (text) review.feedback.push({ text, at: now() });
    const pending = review.feedback.filter((f) => !f.appliedAt);
    if (!pending.length) return reply.code(400).send({ error: "empty", message: "Write what should change first." });
    // A regeneration replaces every slide: a note written now would vanish with this one.
    const job = runningJobKind(id);
    if (job?.kind === "generate") return reply.code(409).send({ error: "already_running", jobId: job.id, message: "The deck is being regenerated and every slide will be replaced. Write your feedback on the new slides when it finishes." });
    const note = text ? review.feedback[review.feedback.length - 1] : null;
    // The note is saved first, against the slide as stored, so nothing typed is ever lost.
    const saved = updateSlide(req.user.id, id, sid, (cur) => ({ ...cur, review: { ok: false, feedback: [...(cur.review?.feedback ?? []), ...(note ? [note] : [])] } }));
    if (!saved) return reply.code(404).send({ error: "slide_not_found" });
    if (!b.apply) return { slide: saved.slide, slop: scanSlide(saved.slide, saved.deck.lang) };
    const busy = runningJob(id);
    if (busy) return reply.code(409).send({ error: "already_running", jobId: busy, message: "The deck is being written or updated. Your feedback is saved on the slide; apply it when that finishes." });
    const sent = (saved.slide.review?.feedback ?? []).filter((f) => !f.appliedAt);
    try {
      const s = await rewriteSlide(req.user.id, saved.deck, saved.slide, feedbackInstruction(sent.map((f) => f.text)));
      const at = now();
      const done = updateSlide(req.user.id, id, sid, (cur) => ({ ...s, review: { ok: false, feedback: (cur.review?.feedback ?? []).map((f) => (!f.appliedAt && sent.some((x) => x.at === f.at && x.text === f.text) ? { ...f, appliedAt: at } : f)) } }));
      if (!done) return reply.code(409).send({ error: "slide_gone", message: "The slide was deleted while it was being rewritten." });
      return { slide: done.slide, slop: scanSlide(done.slide, done.deck.lang) };
    } catch (e) {
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
    const done = updateSlide(req.user.id, id, sid, (cur) => {
      const r = { ...(cur.review ?? { ok: false, feedback: [] }), ok, okAt: ok ? now() : undefined };
      if (!ok) delete r.okAt;
      return { ...cur, review: r };
    });
    if (!done) return reply.code(404).send({ error: "slide_not_found" });
    return { slide: done.slide, slop: scanSlide(done.slide, done.deck.lang) };
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
