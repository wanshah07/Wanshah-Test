import type { FastifyInstance } from "fastify";
import { LAYOUTS, newId, scanDeck, sahkanCount, themePreset, type Deck, type Slide } from "@slidecraft/shared";
import { getDb, now } from "../db.js";
import { loadDeck, saveDeck } from "../store.js";
import { newDeck } from "../llm/generate.js";
import { readSettings } from "../settings.js";

function validDeck(raw: unknown): raw is Deck {
  if (!raw || typeof raw !== "object") return false;
  const d = raw as Deck;
  if (typeof d.id !== "string" || typeof d.title !== "string") return false;
  if (!Array.isArray(d.slides)) return false;
  for (const s of d.slides as Slide[]) {
    if (!s || typeof s.id !== "string" || typeof s.title !== "string" || !LAYOUTS.includes(s.layout)) return false;
  }
  if (!d.theme || typeof d.theme !== "object" || !d.theme.colors) return false;
  return d.lang === "en" || d.lang === "ms";
}

export async function deckRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/decks", async (req) => {
    const rows = getDb().prepare("SELECT id, title, doc, created_at, updated_at FROM decks WHERE user_id = ? ORDER BY updated_at DESC").all(req.user.id) as { id: string; title: string; doc: string; created_at: string; updated_at: string }[];
    return rows.map((r) => {
      const d = JSON.parse(r.doc) as Deck;
      return { id: r.id, title: r.title, lang: d.lang, angle: d.angle, slides: d.slides.length, themeId: d.theme?.id, createdAt: r.created_at, updatedAt: r.updated_at };
    });
  });

  app.post("/api/decks", async (req) => {
    const b = (req.body ?? {}) as { title?: string; lang?: string; angle?: string; themeId?: string };
    const s = readSettings(req.user.id);
    return newDeck(req.user.id, b.title ?? "", b.lang === "ms" ? "ms" : "en", b.angle ?? "custom", b.themeId ?? s.default_theme ?? "facerinna");
  });

  app.get("/api/decks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = loadDeck(req.user.id, id);
    if (!d) return reply.code(404).send({ error: "not_found" });
    return { deck: d, slop: scanDeck(d), sahkan: sahkanCount(d) };
  });

  app.put("/api/decks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const cur = loadDeck(req.user.id, id);
    if (!cur) return reply.code(404).send({ error: "not_found" });
    const body = req.body;
    if (!validDeck(body) || body.id !== id) return reply.code(400).send({ error: "invalid_deck" });
    const next: Deck = { ...body, createdAt: cur.createdAt, sources: cur.sources };
    saveDeck(req.user.id, next);
    return { deck: next, slop: scanDeck(next), sahkan: sahkanCount(next) };
  });

  app.delete("/api/decks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = getDb().prepare("DELETE FROM decks WHERE id = ? AND user_id = ?").run(id, req.user.id);
    if (!r.changes) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/api/decks/:id/duplicate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = loadDeck(req.user.id, id);
    if (!d) return reply.code(404).send({ error: "not_found" });
    const t = now();
    const copy: Deck = { ...d, id: newId("d"), title: `${d.title} (copy)`, createdAt: t, updatedAt: t, sources: [], slides: d.slides.map((s) => ({ ...s, id: newId() })) };
    saveDeck(req.user.id, copy);
    return copy;
  });

  app.post("/api/decks/:id/theme", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = loadDeck(req.user.id, id);
    if (!d) return reply.code(404).send({ error: "not_found" });
    const b = (req.body ?? {}) as { presetId?: string };
    const keep = { logoMediaId: d.theme.logoMediaId, footer: d.theme.footer };
    d.theme = { ...themePreset(b.presetId ?? "facerinna"), ...keep };
    saveDeck(req.user.id, d);
    return d;
  });
}
